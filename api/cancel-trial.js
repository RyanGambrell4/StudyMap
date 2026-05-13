/**
 * cancel-trial.js — Immediately cancels a trialing Stripe subscription
 * POST { userId }
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId } = req.body ?? {}
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  // Look up subscription record
  const { data, error: dbErr } = await supabaseAdmin
    .from('user_data')
    .select('subscription')
    .eq('user_id', userId)
    .maybeSingle()

  if (dbErr || !data) return res.status(404).json({ error: 'User not found' })

  const sub = data.subscription
  if (sub?.status !== 'trialing') {
    return res.status(400).json({ error: 'No active trial to cancel' })
  }

  const stripeSubId = sub?.stripeSubId
  if (!stripeSubId) return res.status(400).json({ error: 'No Stripe subscription found' })

  try {
    // Cancel immediately — user is still in trial so no charge has occurred
    await stripe.subscriptions.cancel(stripeSubId)
  } catch (stripeErr) {
    console.error('[cancel-trial] Stripe error:', stripeErr)
    return res.status(500).json({ error: 'Failed to cancel with Stripe' })
  }

  // Update Supabase record
  const updated = { ...sub, plan: 'free', status: 'cancelled', stripeSubId: null, currentPeriodEnd: null }
  await supabaseAdmin
    .from('user_data')
    .upsert({ user_id: userId, subscription: updated, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

  return res.status(200).json({ success: true })
}
