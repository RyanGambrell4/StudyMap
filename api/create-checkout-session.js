/**
 * create-checkout-session.js — Stripe checkout session creator
 *
 * Called by the frontend paywall when a student selects a plan.
 * Creates a Stripe Checkout session and returns the redirect URL.
 *
 * Required environment variables (set in Vercel):
 *   STRIPE_SECRET_KEY — from Stripe dashboard → Developers → API keys
 */

import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const PRICE_IDS = {
  pro: {
    monthly:  'price_1TMEqQKCY4pCgrHv5F0n5XSz',
    semester: 'price_1TMEqOKCY4pCgrHvxJvJVAYP',
    yearly:   'price_1TMEqPKCY4pCgrHvbhffsA2M',
  },
  unlimited: {
    monthly:  'price_1TMEqPKCY4pCgrHv65bsDflq',
    semester: 'price_1TMEqPKCY4pCgrHvo2uSLhgo',
    yearly:   'price_1TMEqPKCY4pCgrHvymo8ytBO',
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { plan, billingPeriod, userEmail, userId } = req.body

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
    console.error('[checkout] Stripe error:', err)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
