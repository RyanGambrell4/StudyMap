/**
 * stripe-webhook.js — Stripe webhook handler
 *
 * Listens for subscription events from Stripe and updates the
 * user's subscription status in Supabase.
 *
 * Required environment variables (set in Vercel):
 *   STRIPE_SECRET_KEY        — from Stripe dashboard → Developers → API keys
 *   STRIPE_WEBHOOK_SECRET    — from Stripe dashboard → Developers → Webhooks → signing secret
 *   SUPABASE_URL             — same value as VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY     — Service Role key from Supabase → Settings → API
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Disable Vercel's default body parsing — required for Stripe signature verification
export const config = {
  api: { bodyParser: false },
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const PRICE_TO_PLAN = {
  'price_1TMEqQKCY4pCgrHv5F0n5XSz': { plan: 'pro',       billingPeriod: 'monthly'  },
  'price_1TMEqOKCY4pCgrHvxJvJVAYP': { plan: 'pro',       billingPeriod: 'semester' },
  'price_1TMEqPKCY4pCgrHvbhffsA2M': { plan: 'pro',       billingPeriod: 'yearly'   },
  'price_1TMEqPKCY4pCgrHv65bsDflq': { plan: 'unlimited', billingPeriod: 'monthly'  },
  'price_1TMEqPKCY4pCgrHvo2uSLhgo': { plan: 'unlimited', billingPeriod: 'semester' },
  'price_1TMEqPKCY4pCgrHvymo8ytBO': { plan: 'unlimited', billingPeriod: 'yearly'   },
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const sig = req.headers['stripe-signature']
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set')
    return res.status(500).json({ error: 'Webhook not configured' })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    console.warn('[stripe-webhook] Invalid signature:', err.message)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  console.log(`[stripe-webhook] ${event.type}`)

  // ── Handle subscription events ─────────────────────────────────────────────
  const sub = event.data.object

  if (event.type === 'checkout.session.completed') {
    // Session completed — subscription is now active
    // The subscription.updated event will handle the actual plan update
    return res.status(200).json({ received: true })
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const userId = sub.metadata?.user_id
    if (!userId) {
      console.warn('[stripe-webhook] No user_id in metadata — skipping')
      return res.status(200).json({ received: true, warning: 'no user_id' })
    }

    const priceId = sub.items?.data?.[0]?.price?.id
    const planInfo = PRICE_TO_PLAN[priceId] ?? { plan: 'free', billingPeriod: null }

    const isActive = ['active', 'trialing'].includes(sub.status)

    const newSubData = {
      plan:              isActive ? planInfo.plan : 'free',
      status:            sub.status ?? 'cancelled',
      stripeSubId:       sub.id ?? null,
      stripeCustomerId:  sub.customer ?? null,
      billingPeriod:     isActive ? planInfo.billingPeriod : null,
      currentPeriodEnd:  sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      updatedAt: new Date().toISOString(),
    }

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

      console.log(`[stripe-webhook] Updated user ${userId} → plan: ${mergedSub.plan} (${mergedSub.status})`)
      return res.status(200).json({ received: true })
    } catch (err) {
      console.error('[stripe-webhook] DB error:', err)
      return res.status(500).json({ error: 'DB update failed' })
    }
  }

  // Acknowledge any other events
  return res.status(200).json({ received: true })
}
