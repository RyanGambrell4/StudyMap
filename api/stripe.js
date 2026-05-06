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
import { Resend } from 'resend'

// Disable Vercel's default body parsing — required for Stripe signature verification
export const config = {
  api: { bodyParser: false },
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

// ── Basic in-memory rate limit for checkout (per IP, 5 req / 60s) ─────────────
const _checkoutRateMap = new Map()
function checkoutRateLimit(ip) {
  const now = Date.now()
  const window = 60_000
  const limit = 5
  const entry = _checkoutRateMap.get(ip) ?? { count: 0, resetAt: now + window }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + window }
  entry.count++
  _checkoutRateMap.set(ip, entry)
  return entry.count > limit
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const PRICE_IDS = {
  pro: {
    monthly:  'price_1TMEqQKCY4pCgrHv5F0n5XSz',
    semester: 'price_1TMaQxKCY4pCgrHvB2uE3ZhB',
    yearly:   'price_1TMEqPKCY4pCgrHvbhffsA2M',
  },
  unlimited: {
    monthly:  'price_1TMEqPKCY4pCgrHv65bsDflq',
    semester: 'price_1TMaOgKCY4pCgrHvPXqOb30f',
    yearly:   'price_1TMEqPKCY4pCgrHvymo8ytBO',
  },
}

const PRICE_TO_PLAN = {
  'price_1TMEqQKCY4pCgrHv5F0n5XSz': { plan: 'pro',       billingPeriod: 'monthly'  },
  'price_1TMaQxKCY4pCgrHvB2uE3ZhB': { plan: 'pro',       billingPeriod: 'semester' },
  'price_1TMEqPKCY4pCgrHvbhffsA2M': { plan: 'pro',       billingPeriod: 'yearly'   },
  'price_1TMEqPKCY4pCgrHv65bsDflq': { plan: 'unlimited', billingPeriod: 'monthly'  },
  'price_1TMaOgKCY4pCgrHvPXqOb30f': { plan: 'unlimited', billingPeriod: 'semester' },
  'price_1TMEqPKCY4pCgrHvymo8ytBO': { plan: 'unlimited', billingPeriod: 'yearly'   },
}

async function sendWinBackEmail(toEmail) {
  if (!process.env.RESEND_API_KEY) return
  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@getstudyedge.com>',
      to: toEmail,
      subject: "You still have access until your period ends — here's what you'll miss",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            We're sorry to see you go.
          </h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Your Pro access has been cancelled. You'll keep your full access until the end of your current billing period — after that your account moves to the Free plan.
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Here's what you'll lose when it expires:
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              '5 courses (drops to 1)',
              '75 study boosts/month (drops to 10)',
              'AI-generated study plans',
              'Session Blueprints & Study Coach',
              'Flashcards & quizzes',
            ].map(f => `
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#64748b;">✕</td>
              <td style="padding:6px 0 6px 10px;font-size:14px;color:#CBD5E1;">${f}</td>
            </tr>`).join('')}
          </table>
          <p style="margin:0;font-size:15px;color:#94A3B8;line-height:1.7;">
            If you cancelled by mistake, or want to give it another shot — we've got you. Just click below to reactivate.
          </p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Reactivate Pro →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            You're receiving this because you cancelled your StudyEdge AI Pro subscription.<br/>
            <a href="https://getstudyedge.com/app" style="color:#475569;">Log in</a> ·
            <a href="mailto:support@getstudyedge.com" style="color:#475569;">Contact support</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(`[stripe webhook] Win-back email sent to ${toEmail}`)
  } catch (err) {
    console.error('[stripe webhook] Failed to send win-back email:', err)
  }
}

async function sendTrialExpiryEmail(toEmail) {
  if (!process.env.RESEND_API_KEY) return
  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@getstudyedge.com>',
      to: toEmail,
      subject: 'Your free trial ends in 3 days — keep your Pro access',
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <!-- Urgency badge -->
        <tr><td style="padding-bottom:16px;">
          <div style="display:inline-block;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;color:#fbbf24;letter-spacing:0.3px;">
            ⏱ 3 DAYS LEFT
          </div>
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            Your Pro trial ends soon.
          </h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Your 7-day free trial expires in <strong style="color:#fbbf24;">3 days</strong>. After that, your account
            drops to the Free plan and you'll lose access to everything below.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              ['5 courses', 'Free drops you to 1'],
              ['75 AI study boosts/month', 'Free gives you 10'],
              ['AI Study Coach', 'Personalized study plans'],
              ['Session Blueprints', 'Minute-by-minute session plans'],
              ['Flashcards & quizzes', 'Built into every session'],
            ].map(([feat, sub]) => `
            <tr>
              <td style="padding:7px 0;">
                <span style="color:#34d399;font-size:13px;margin-right:10px;">✓</span>
                <strong style="font-size:14px;color:#CBD5E1;">${feat}</strong>
                <span style="font-size:13px;color:#475569;margin-left:8px;">— ${sub}</span>
              </td>
            </tr>`).join('')}
          </table>
          <p style="margin:0;font-size:15px;color:#94A3B8;line-height:1.7;">
            If you want to keep going — do nothing. Your card on file will be charged
            <strong style="color:#c7d2fe;">$12.99</strong> when the trial ends and you'll stay on Pro.
            If you want to cancel, you can do it any time before the trial ends.
          </p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding-bottom:8px;text-align:center;">
          <a href="https://getstudyedge.com/app"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Open my study plan →
          </a>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="font-size:12px;color:#334155;">Cancel before day 7 and you won't be charged.</span>
        </td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            You're receiving this because your StudyEdge AI Pro trial is ending soon.<br/>
            <a href="https://getstudyedge.com/app" style="color:#475569;">Open the app</a> ·
            <a href="mailto:support@getstudyedge.com" style="color:#475569;">Contact support</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })
    console.log(`[stripe webhook] Trial expiry email sent to ${toEmail}`)
  } catch (err) {
    console.error('[stripe webhook] Failed to send trial expiry email:', err)
  }
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

    // ── Trial expiry warning (fires 3 days before trial ends) ─────────────────
    if (event.type === 'customer.subscription.trial_will_end') {
      const sub = event.data.object
      const userId = sub.metadata?.user_id
      if (userId) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
        const email = authUser?.user?.email
        if (email) await sendTrialExpiryEmail(email)
      }
      return res.status(200).json({ received: true })
    }

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

        // ── Win-back email on cancellation/downgrade ─────────────────────────
        const wasDowngraded =
          event.type === 'customer.subscription.deleted' ||
          (event.type === 'customer.subscription.updated' && !isActive)
        if (wasDowngraded) {
          // Fetch user email from Supabase Auth
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
          const email = authUser?.user?.email
          if (email) await sendWinBackEmail(email)
        }
      } catch (err) {
        console.error('[stripe webhook] DB error:', err)
        return res.status(500).json({ error: 'DB update failed' })
      }
    }

    return res.status(200).json({ received: true })
  }

  // ── Checkout session path ──────────────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown'
  if (checkoutRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  let body
  try {
    body = JSON.parse(rawBody.toString())
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { plan, billingPeriod, userEmail, userId, trial } = body
  const priceId = PRICE_IDS[plan]?.[billingPeriod]

  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan or billing period' })
  }

  // Only allow trials on Pro monthly (the FinalCTA "Get Started Free" offer).
  const wantsTrial = !!trial && plan === 'pro' && billingPeriod === 'monthly'

  const subscriptionData = {
    metadata: { user_id: userId },
    ...(wantsTrial && {
      trial_period_days: 7,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    }),
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail || undefined,
      // For trials we must collect the card up front so billing starts after day 7
      payment_method_collection: wantsTrial ? 'always' : undefined,
      subscription_data: subscriptionData,
      metadata: { user_id: userId, trial: wantsTrial ? '1' : '0' },
      allow_promotion_codes: true,
      success_url: 'https://getstudyedge.com/app?checkout=success',
      cancel_url: 'https://getstudyedge.com/app?checkout=cancelled',
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[stripe checkout] Error:', err)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
