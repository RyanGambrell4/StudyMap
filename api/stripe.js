/**
 * stripe.js — Unified Stripe handler
 *
 * Routes requests based on presence of Stripe-Signature header:
 *   - With Stripe-Signature → webhook event handler
 *   - Without (POST with JSON body) → create checkout session
 *
 * Required environment variables (set in Vercel):
 *   STRIPE_SECRET_KEY       — from Stripe dashboard → Developers → API keys
 *   STRIPE_WEBHOOK_SECRET   — from Stripe dashboard → Developers → Webhooks → signing secret
 *   SUPABASE_URL            — same value as VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY    — Service Role key from Supabase → Settings → API
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

const PRICE_IDS = {
  pro: {
    monthly:  'price_1TMEKzGSTLwztvCdnzrGrQVI',
    semester: 'price_1TMERpGSTLwztvCdga2icqKk',
    yearly:   'price_1TMERpGSTLwztvCdcRPNJbgY',
  },
  unlimited: {
    monthly:  'price_1TMEORGSTLwztvCdCYKocq1h',
    semester: 'price_1TMEQfGSTLwztvCdVffhIKJt',
    yearly:   'price_1TMEQfGSTLwztvCdXknR14sR',
  },
}

const PRICE_TO_PLAN = {
  'price_1TMEKzGSTLwztvCdnzrGrQVI': { plan: 'pro',       billingPeriod: 'monthly'  },
  'price_1TMERpGSTLwztvCdga2icqKk': { plan: 'pro',       billingPeriod: 'semester' },
  'price_1TMERpGSTLwztvCdcRPNJbgY': { plan: 'pro',       billingPeriod: 'yearly'   },
  'price_1TMEORGSTLwztvCdCYKocq1h': { plan: 'unlimited', billingPeriod: 'monthly'  },
  'price_1TMEQfGSTLwztvCdVffhIKJt': { plan: 'unlimited', billingPeriod: 'semester' },
  'price_1TMEQfGSTLwztvCdXknR14sR': { plan: 'unlimited', billingPeriod: 'yearly'   },
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
  const stripeSignature = req.headers['stripe-signature']

  // ── Webhook path (Stripe sends Stripe-Signature header) ────────────────────
  if (stripeSignature) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) {
      console.error('[stripe] STRIPE_WEBHOOK_SECRET not set')
      return res.status(500).json({ error: 'Webhook not configured' })
    }

    let event
    try {
      event = stripe.webhooks.constructEvent(rawBody, stripeSignature, secret)
    } catch (err) {
      console.warn('[stripe] Invalid webhook signature:', err.message)
      return res.status(400).json({ error: 'Invalid signature' })
    }

    console.log(`[stripe webhook] ${event.type}`)

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object
      const userId = sub.metadata?.user_id
      if (!userId) {
        console.warn('[stripe webhook] No user_id in metadata — skipping')
        return res.status(200).json({ received: true })
      }

      const priceId = sub.items?.data?.[0]?.price?.id
      const planInfo = PRICE_TO_PLAN[priceId] ?? { plan: 'free', billingPeriod: null }
      const isActive = ['active', 'trialing'].includes(sub.status)

      const newSubData = {
        plan:             isActive ? planInfo.plan : 'free',
        status:           sub.status ?? 'cancelled',
        stripeSubId:      sub.id ?? null,
        stripeCustomerId: sub.customer ?? null,
        billingPeriod:    isActive ? planInfo.billingPeriod : null,
        currentPeriodEnd: sub.current_period_end
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
        console.log(`[stripe webhook] Updated user ${userId} → ${mergedSub.plan} (${mergedSub.status})`)
      } catch (err) {
        console.error('[stripe webhook] DB error:', err)
        return res.status(500).json({ error: 'DB update failed' })
      }
    }

    return res.status(200).json({ received: true })
  }

  // ── Checkout session path ──────────────────────────────────────────────────
  let body
  try {
    body = JSON.parse(rawBody.toString())
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { plan, billingPeriod, userEmail, userId } = body
  const priceId = PRICE_IDS[plan]?.[billingPeriod]

  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan or billing period' })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail || undefined,
      subscription_data: {
        metadata: { user_id: userId },
      },
      metadata: { user_id: userId },
      success_url: 'https://getstudyedge.com?checkout=success',
      cancel_url: 'https://getstudyedge.com?checkout=cancelled',
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[stripe checkout] Error:', err)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
