/**
 * POST /api/claim-paywall-exit-gift
 *
 * Grants a one-time bonus of 5 AI actions to a free user who's about to
 * abandon the paywall. The whole point is to convert the freeloader cohort
 * (the ones who normally bounce with a 1-star review) into engaged users
 * who might come back — same pattern that took an app from 0.4% → 4.5%
 * install-to-paid on that cohort in the reference material.
 *
 * Guards:
 *   - Only free users (paid users already have plenty of AI actions)
 *   - Only ever once per user (subscription.paywallExitGiftAt is the flag)
 *   - Auth required (bearer token → verifyAuth)
 */

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../lib/server/usage.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const BONUS_AI_ACTIONS = 5

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { data: row, error: readErr } = await supabaseAdmin
    .from('user_data')
    .select('subscription')
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (readErr) {
    console.error('[claim-paywall-exit-gift] read error:', readErr)
    return res.status(500).json({ error: 'Failed to check eligibility' })
  }

  const sub = row?.subscription ?? {}
  const activeStatuses = ['active', 'trialing', 'past_due']
  const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'

  // Paid users don't need this — they already have Pro/Unlimited limits.
  if (plan !== 'free') {
    return res.status(409).json({ error: 'Not eligible on your current plan', code: 'not_free' })
  }

  // One-shot: if we already granted this once, never again.
  if (sub.paywallExitGiftAt) {
    return res.status(409).json({ error: 'Already claimed', code: 'already_claimed' })
  }

  const updatedSub = {
    ...sub,
    bonusAiActions:      (Number(sub.bonusAiActions) || 0) + BONUS_AI_ACTIONS,
    paywallExitGiftAt:   new Date().toISOString(),
  }

  const { error: writeErr } = await supabaseAdmin
    .from('user_data')
    .upsert(
      { user_id: auth.userId, subscription: updatedSub, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (writeErr) {
    console.error('[claim-paywall-exit-gift] write error:', writeErr)
    return res.status(500).json({ error: 'Failed to grant bonus' })
  }

  return res.status(200).json({
    ok: true,
    granted: BONUS_AI_ACTIONS,
    newLimit: 5 + updatedSub.bonusAiActions, // base free (5) + bonus, informational only
  })
}
