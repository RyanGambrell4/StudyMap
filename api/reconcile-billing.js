/**
 * Nightly reconcile: does public.user_billing agree with Stripe?
 *
 * Every expensive bug found this month was silent. The plan column was
 * writable by the user for months, fourteen accounts carried an Unlimited
 * plan Stripe had never heard of, and the way that surfaced was somebody
 * reading the table by hand. "The database says unlimited and Stripe
 * disagrees" has to be a condition something watches, not a discovery.
 *
 * This job compares both directions and reports. It deliberately CHANGES
 * NOTHING. An automatic corrector that gets its own logic wrong would revoke
 * paid accounts overnight, and the failure it is guarding against is rare
 * enough that a human should look at each one. It writes to PostHog and to the
 * logs, and it returns the drift in its response body.
 *
 * Comped accounts are not drift. Thirteen accounts have a plan with no Stripe
 * subscription behind them on purpose; they carry granted_by and are counted
 * separately. Reporting them every night is how a monitor gets muted.
 */

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { posthogCapture } from '../lib/server/posthog.js'
import { reportQueryError } from '../lib/server/supabaseErrors.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export const config = { maxDuration: 60 }

const ACTIVE_STRIPE = new Set(['active', 'trialing', 'past_due'])

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(200).json({ ok: true, skipped: 'no_stripe_key' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // ── 1. Everything Stripe thinks it is billing ─────────────────────────────
  // Keyed by the user_id we stamp into subscription metadata at checkout. A
  // subscription without that metadata cannot be matched to an account, which
  // is itself worth reporting rather than skipping quietly.
  const stripeByUser = new Map()
  const unmatchable = []
  try {
    for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
      const userId = sub.metadata?.user_id
      if (!userId) {
        if (ACTIVE_STRIPE.has(sub.status)) unmatchable.push({ subId: sub.id, customer: sub.customer, status: sub.status })
        continue
      }
      const existing = stripeByUser.get(userId)
      // Keep the live one when an account has several (six do, from repeated
      // checkout attempts); otherwise the newest.
      if (!existing || (ACTIVE_STRIPE.has(sub.status) && !ACTIVE_STRIPE.has(existing.status))) {
        stripeByUser.set(userId, { subId: sub.id, status: sub.status, created: sub.created })
      }
    }
  } catch (err) {
    console.error('[reconcile-billing] Stripe list failed:', err?.message ?? err)
    return res.status(502).json({ error: 'Stripe unreachable', detail: err?.message })
  }

  // ── 2. Everything our database thinks it is entitled to ───────────────────
  const { data: rows, error } = await supabaseAdmin
    .from('user_billing')
    .select('user_id, plan, status, stripe_subscription_id, stripe_customer_id, granted_by')
    .or('plan.neq.free,stripe_subscription_id.not.is.null')

  if (error) {
    reportQueryError(error, { table: 'user_billing', context: 'reconcile-billing' })
    return res.status(500).json({ error: 'Failed to read user_billing' })
  }

  const drift = []
  const comped = []
  const seen = new Set()

  for (const row of rows ?? []) {
    seen.add(row.user_id)
    const stripeSub = stripeByUser.get(row.user_id)
    const dbPaid = row.plan !== 'free' && ACTIVE_STRIPE.has(row.status)

    if (row.granted_by) {
      // Deliberate comp. Only interesting if Stripe has since started billing
      // them, which means the marker is stale and they are polluting the
      // "excluded from analytics" set while actually paying.
      if (stripeSub && ACTIVE_STRIPE.has(stripeSub.status)) {
        drift.push({ type: 'comp_now_paying', userId: row.user_id, dbPlan: row.plan, grantedBy: row.granted_by, stripeStatus: stripeSub.status })
      } else {
        comped.push({ userId: row.user_id, plan: row.plan, grantedBy: row.granted_by })
      }
      continue
    }

    if (dbPaid && !stripeSub) {
      // The one that matters: a paid plan with nothing behind it and no comp
      // marker. This is what an exploited plan column would look like.
      drift.push({ type: 'db_paid_stripe_absent', userId: row.user_id, dbPlan: row.plan, dbStatus: row.status })
    } else if (dbPaid && !ACTIVE_STRIPE.has(stripeSub.status)) {
      drift.push({ type: 'db_paid_stripe_inactive', userId: row.user_id, dbPlan: row.plan, dbStatus: row.status, stripeStatus: stripeSub.status })
    } else if (!dbPaid && stripeSub && ACTIVE_STRIPE.has(stripeSub.status)) {
      // Revenue-affecting in the other direction: they are paying and we are
      // not giving them what they bought.
      drift.push({ type: 'stripe_active_db_free', userId: row.user_id, dbPlan: row.plan, dbStatus: row.status, stripeStatus: stripeSub.status })
    }
  }

  // A payer with no user_billing row at all never appears in the loop above.
  for (const [userId, sub] of stripeByUser) {
    if (seen.has(userId)) continue
    if (!ACTIVE_STRIPE.has(sub.status)) continue
    drift.push({ type: 'stripe_active_db_missing', userId, stripeStatus: sub.status, subId: sub.subId })
  }

  // ── 3. Report ─────────────────────────────────────────────────────────────
  const summary = {
    checked: rows?.length ?? 0,
    stripeSubscriptions: stripeByUser.size,
    driftCount: drift.length,
    compedCount: comped.length,
    unmatchableCount: unmatchable.length,
    byType: drift.reduce((acc, d) => ({ ...acc, [d.type]: (acc[d.type] ?? 0) + 1 }), {}),
  }

  if (drift.length) {
    // console.error, not warn: this should be findable in the runtime logs
    // without knowing to look for it.
    console.error('[reconcile-billing] DRIFT', JSON.stringify({ summary, drift }))
    for (const d of drift) {
      await posthogCapture('billing_drift_detected', d.userId, { ...d, source: 'reconcile_cron' })
    }
  } else {
    console.log('[reconcile-billing]', JSON.stringify(summary))
  }

  if (unmatchable.length) {
    console.error('[reconcile-billing] Stripe subscriptions with no user_id metadata', JSON.stringify(unmatchable))
  }

  // Always emitted, drift or not, so a dashboard can alert on the job going
  // quiet as well as on the number going up.
  await posthogCapture('billing_reconcile_completed', 'system', summary)

  return res.status(200).json({ ok: true, summary, drift, comped, unmatchable })
}
