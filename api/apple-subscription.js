/**
 * POST /api/apple-subscription
 *
 * The iOS app calls this with the StoreKit 2 signed transaction for its
 * current entitlement after a purchase, a restore, and on launch. The JWS is
 * verified against Apple's root certificate, mapped to a plan, and written to
 * public.user_billing (the table every AI quota is enforced from) with the
 * same precedence rules as the Stripe webhook. See
 * lib/server/appleSubscription.js for the why.
 *
 * Body: { signedTransaction: string }
 * 200:  { ok: true, plan, status, currentPeriodEnd, environment, action }
 * 400:  the JWS did not verify or is not one of our subscriptions
 */
import { recordPaid } from '../lib/server/referrals.js'
import { notifyReward } from './referral.js'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../lib/server/usage.js'
import { readBilling, commitAppleBilling } from '../lib/server/billing.js'
import {
  verifySignedTransaction,
  deriveAppleBilling,
  mergeAppleIntoBilling,
} from '../lib/server/appleSubscription.js'

/** A signed transaction is a few KB; anything larger is not one. */
const MAX_JWS_BYTES = 16 * 1024

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Email confirmation is not required: a paid purchase on a verified Apple
  // ID is stronger evidence of a real person than a clicked link, and the
  // quota gate must honour the purchase whether or not the link was clicked.
  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const signedTransaction = body?.signedTransaction
  if (typeof signedTransaction !== 'string'
      || signedTransaction.length === 0
      || signedTransaction.length > MAX_JWS_BYTES) {
    return res.status(400).json({ error: 'signedTransaction is required' })
  }

  const verified = await verifySignedTransaction(signedTransaction)
  if (!verified.ok) {
    console.warn('[apple-subscription] verification failed', {
      userId: auth.userId, status: verified.status, error: verified.error,
    })
    return res.status(400).json({ error: 'Transaction could not be verified' })
  }

  const derived = deriveAppleBilling(verified.payload)
  if (!derived.ok) {
    console.warn('[apple-subscription] rejected payload', { userId: auth.userId, reason: derived.reason })
    return res.status(400).json({ error: `Unsupported transaction (${derived.reason})` })
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const read = await readBilling(supabase, auth.userId)
  if (!read.ok) return res.status(500).json({ error: 'Billing read failed' })

  const decision = mergeAppleIntoBilling(read.billing, derived)
  if (decision.action === 'write') {
    const written = await commitAppleBilling(supabase, auth.userId, decision.fields)
    if (!written.ok) return res.status(500).json({ error: 'Billing write failed' })
  }

  // Referral: the friend's first paid App Store period (not the free trial).
  if (derived.status === 'active') {
    try {
      await recordPaid(supabase, { referredId: auth.userId, via: 'apple' }, { notify: notifyReward })
    } catch (e) {
      console.error('[apple-subscription] referral reward failed (non-fatal)', e)
    }
  }

  console.log('[apple-subscription] synced', {
    userId: auth.userId,
    action: decision.action,
    reason: decision.reason,
    productId: derived.productId,
    status: derived.status,
    environment: derived.environment,
  })

  const effective = decision.action === 'write' ? decision.fields : read.billing
  return res.status(200).json({
    ok: true,
    action: decision.action,
    reason: decision.reason,
    plan: effective.plan,
    status: effective.status,
    currentPeriodEnd: effective.currentPeriodEnd ?? null,
    environment: derived.environment,
  })
}
