/**
 * lemon-webhook.js — Lemon Squeezy webhook handler
 *
 * Listens for subscription events from Lemon Squeezy and updates the
 * user's subscription status in Supabase.
 *
 * Required environment variables (set in Vercel):
 *   LEMONSQUEEZY_WEBHOOK_SECRET  — from LS dashboard: Settings → Webhooks
 *   SUPABASE_URL                 — same value as VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY         — Service Role key from Supabase → Settings → API
 */

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Disable Vercel's default body parsing so we can read the raw body
// (required for HMAC signature verification)
export const config = {
  api: { bodyParser: false },
}

// Admin Supabase client — bypasses Row Level Security
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function determinePlan(productName = '', variantName = '') {
  const pn = productName.toLowerCase()
  const vn = variantName.toLowerCase()

  let plan = 'free'
  if (pn.includes('unlimited')) plan = 'unlimited'
  else if (pn.includes('pro')) plan = 'pro'

  let billingPeriod = 'monthly'
  if (vn.includes('semester') || vn.includes('six') || vn.includes('6 month')) billingPeriod = 'semester'
  else if (vn.includes('year') || vn.includes('annual')) billingPeriod = 'yearly'

  return { plan, billingPeriod }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // ── Read raw body ──────────────────────────────────────────────────────────
  const rawBody = await getRawBody(req)

  // ── Verify signature ───────────────────────────────────────────────────────
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  const signature = req.headers['x-signature']

  if (secret && signature) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')

    if (expected !== signature) {
      console.warn('[webhook] Invalid signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }
  }

  // ── Parse event ────────────────────────────────────────────────────────────
  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const eventName  = event.meta?.event_name
  const userId     = event.meta?.custom_data?.user_id
  const data       = event.data ?? {}
  const attrs      = data.attributes ?? {}

  console.log(`[webhook] ${eventName} | user: ${userId} | status: ${attrs.status}`)

  // We need a user_id to update the right row — if missing, log and return 200
  // so Lemon Squeezy doesn't keep retrying
  if (!userId) {
    console.warn('[webhook] No user_id in custom_data — skipping DB update')
    return res.status(200).json({ received: true, warning: 'no user_id' })
  }

  // ── Determine new subscription state ──────────────────────────────────────
  const { plan, billingPeriod } = determinePlan(attrs.product_name, attrs.variant_name)
  const activeStatuses = ['active', 'trialing']
  const isActive = activeStatuses.includes(attrs.status)

  const newSubData = {
    plan:             isActive ? plan : 'free',
    status:           attrs.status ?? 'cancelled',
    lsSubscriptionId: data.id ?? null,
    lsCustomerId:     attrs.customer_id ?? null,
    billingPeriod:    isActive ? billingPeriod : null,
    currentPeriodEnd: attrs.renews_at ?? attrs.ends_at ?? null,
    updatedAt:        new Date().toISOString(),
  }

  // ── Merge with existing row (preserve AI query counts) ────────────────────
  try {
    const { data: existing } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle()

    const mergedSub = {
      ...newSubData,
      aiQueriesUsed:    existing?.subscription?.aiQueriesUsed    ?? 0,
      aiQueriesResetAt: existing?.subscription?.aiQueriesResetAt ?? null,
    }

    const { error } = await supabaseAdmin
      .from('user_data')
      .upsert(
        { user_id: userId, subscription: mergedSub, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    if (error) throw error

    console.log(`[webhook] Updated user ${userId} → plan: ${mergedSub.plan} (${mergedSub.status})`)
    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('[webhook] DB error:', err)
    return res.status(500).json({ error: 'DB update failed' })
  }
}
