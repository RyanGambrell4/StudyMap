/**
 * stripe.js - Unified Stripe handler
 *
 * Routes requests based on presence of Stripe-Signature header:
 *   - With Stripe-Signature → webhook event handler
 *   - Without (POST with JSON body) → create checkout session
 *
 * Required environment variables (set in Vercel):
 *   STRIPE_SECRET_KEY       - from Stripe dashboard → Developers → API keys
 *   STRIPE_WEBHOOK_SECRET   - from Stripe dashboard → Developers → Webhooks → signing secret
 *   SUPABASE_URL            - same value as VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY    - Service Role key from Supabase → Settings → API
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { onTrialEndingSoon, onUpgraded, onChurned } from '../lib/server/loops.js'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'
import { sendFounderCancellationEmail } from '../lib/server/founderOutreach.js'
import { createTrialCancelOffer, userHasExistingOffer } from '../lib/server/oneTimeOffer.js'
import { sendProWelcomeEmail } from '../lib/server/proWelcomeEmail.js'

// Disable Vercel's default body parsing - required for Stripe signature verification
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

// ── Stripe price IDs ──────────────────────────────────────────────────────────
// 6 new price IDs (Pro/Unlimited × Weekly/Monthly/Annual). Created manually in
// the Stripe dashboard - env vars override the placeholder strings below.
//
// Legacy semester/old-monthly IDs are intentionally NOT in the lookup map.
// Existing subscribers on those prices are still resolved correctly via
// PRICE_TO_PLAN (grandfathered) but no new checkout sessions can target them.
const PRICE_IDS = {
  pro: {
    weekly:  process.env.STRIPE_PRICE_PRO_WEEKLY  || 'price_pro_weekly',
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly',
    yearly:  process.env.STRIPE_PRICE_PRO_ANNUAL  || 'price_pro_annual',
  },
  unlimited: {
    weekly:  process.env.STRIPE_PRICE_UNLIMITED_WEEKLY  || 'price_unlimited_weekly',
    monthly: process.env.STRIPE_PRICE_UNLIMITED_MONTHLY || 'price_unlimited_monthly',
    yearly:  process.env.STRIPE_PRICE_UNLIMITED_ANNUAL  || 'price_unlimited_annual',
  },
}

const PRICE_TO_PLAN = {
  // New price IDs (env-driven, with placeholder fallbacks for local dev)
  [PRICE_IDS.pro.weekly]:        { plan: 'pro',       billingPeriod: 'weekly'  },
  [PRICE_IDS.pro.monthly]:       { plan: 'pro',       billingPeriod: 'monthly' },
  [PRICE_IDS.pro.yearly]:        { plan: 'pro',       billingPeriod: 'yearly'  },
  [PRICE_IDS.unlimited.weekly]:  { plan: 'unlimited', billingPeriod: 'weekly'  },
  [PRICE_IDS.unlimited.monthly]: { plan: 'unlimited', billingPeriod: 'monthly' },
  [PRICE_IDS.unlimited.yearly]:  { plan: 'unlimited', billingPeriod: 'yearly'  },

  // Grandfathered: existing subscribers on legacy price IDs still resolve.
  // These prices are archived in Stripe - no new checkout sessions target them.
  'price_1TMEqQKCY4pCgrHv5F0n5XSz': { plan: 'pro',       billingPeriod: 'monthly'  },
  'price_1TMaQxKCY4pCgrHvB2uE3ZhB': { plan: 'pro',       billingPeriod: 'semester' },
  'price_1TMEqPKCY4pCgrHvbhffsA2M': { plan: 'pro',       billingPeriod: 'yearly'   },
  'price_1TMEqPKCY4pCgrHv65bsDflq': { plan: 'unlimited', billingPeriod: 'monthly'  },
  'price_1TMaOgKCY4pCgrHvPXqOb30f': { plan: 'unlimited', billingPeriod: 'semester' },
  'price_1TMEqPKCY4pCgrHvymo8ytBO': { plan: 'unlimited', billingPeriod: 'yearly'   },
}

// ── PostHog server-side capture ──────────────────────────────────────────────
// Fires events from this server (e.g. checkout_success) so funnel data isn't
// lost when the browser navigates away before posthog-js can flush.
async function posthogCapture(event, distinctId, properties = {}) {
  const key = process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_KEY
  if (!key || !distinctId) return
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'
  try {
    await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'server', source: 'stripe_webhook' },
        timestamp: new Date().toISOString(),
      }),
    })
  } catch (err) {
    console.error('[posthog] capture failed (non-fatal):', err.message)
  }
}

async function sendWinBackEmail(toEmail) {
  if (!process.env.RESEND_API_KEY) return
  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@mail.getstudyedge.com>',
      to: toEmail,
      subject: "You still have Pro until your billing period ends",
      headers: listUnsubscribeHeaders(toEmail),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pro cancellation confirmed</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader("Your Pro subscription is cancelled. You keep full access until the end of your billing period.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Cancellation confirmed</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          You still have Pro until your period ends.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Your Pro subscription has been cancelled. You keep full access until the end of your current billing period. After that, your account moves to the Free plan.
        </p>
        <p style="margin:18px 0 10px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">What Free is missing</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${[
            ['5 courses', 'Free drops you to 1'],
            ['100 AI boosts / month', 'Free gives you 2 total'],
            ['AI Study Coach', 'Multi-week personalized plans'],
            ['Session Blueprints', 'Minute-by-minute session plans'],
            ['Flashcards and quizzes', 'Built into every session'],
          ].map(([feat, sub], i, arr) => `
          <tr>
            <td style="padding:10px 0;${i < arr.length - 1 ? 'border-bottom:1px solid #F0EDE8;' : ''}">
              <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
              <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${sub}</div>
            </td>
          </tr>`).join('')}
        </table>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Cancelled by mistake or want another shot at it? Reactivate any time before your access ends and nothing changes.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1"
               style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">
              Reactivate Pro
            </a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">Pro is $2.99/wk. Cancel anytime.</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because you cancelled your StudyEdge AI Pro subscription.<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
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
      from: 'StudyEdge AI <support@mail.getstudyedge.com>',
      to: toEmail,
      subject: 'Your trial ends tomorrow. Keep Pro for $2.99/wk.',
      headers: listUnsubscribeHeaders(toEmail),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your free trial ends tomorrow</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader("Trial ends tomorrow. Your card gets charged $2.99/wk unless you cancel in your account.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#3B61C4;text-transform:uppercase;">Trial ending soon</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          Your Pro trial ends tomorrow.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Tomorrow your card is charged <strong style="color:#111111;">$2.99/week</strong> and Pro continues automatically. If you don't want to keep it, cancel in Settings before then.
        </p>
        <p style="margin:18px 0 10px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">What you keep with Pro</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${[
            ['5 courses', 'Free drops you to 1'],
            ['100 AI study boosts / month', 'Free gives you 2 total'],
            ['AI Study Coach', 'Personalized multi-week plans'],
            ['Session Blueprints', 'Minute-by-minute session plans'],
            ['Flashcards and quizzes', 'Built into every session'],
          ].map(([feat, sub], i, arr) => `
          <tr>
            <td style="padding:10px 0;${i < arr.length - 1 ? 'border-bottom:1px solid #F0EDE8;' : ''}">
              <table cellpadding="0" cellspacing="0" style="width:100%;">
                <tr>
                  <td style="width:24px;vertical-align:top;padding-top:1px;">
                    <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:rgba(59,97,196,0.12);text-align:center;line-height:18px;color:#3B61C4;font-size:11px;font-weight:700;">✓</span>
                  </td>
                  <td>
                    <div style="font-size:14px;font-weight:600;color:#111111;line-height:1.4;">${feat}</div>
                    <div style="font-size:13px;color:#9B9B9B;margin-top:2px;line-height:1.5;">${sub}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`).join('')}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:8px;">
            <a href="https://getstudyedge.com/app"
               style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">
              Keep Pro and study today
            </a>
          </td></tr>
          <tr><td align="center" style="padding-top:10px;">
            <span style="font-size:12px;color:#9B9B9B;">Don't want to keep it? Cancel anytime in <strong>Settings</strong> before tomorrow.</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because your StudyEdge AI Pro trial is ending soon.<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    })
    console.log(`[stripe webhook] Trial expiry email sent to ${toEmail}`)
  } catch (err) {
    console.error('[stripe webhook] Failed to send trial expiry email:', err)
  }
}

async function sendTrialStartedEmail(toEmail, trialEndTs) {
  if (!process.env.RESEND_API_KEY) return
  const endDate = trialEndTs
    ? new Date(trialEndTs * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null
  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@mail.getstudyedge.com>',
      to: toEmail,
      subject: 'Your 3-day Pro trial has started.',
      headers: listUnsubscribeHeaders(toEmail),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your trial has started</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader("You have full Pro access. Here is everything that is now unlocked.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#3B61C4;text-transform:uppercase;">Trial started</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          You have full Pro access.
        </h1>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Your 3-day free trial is active.${endDate ? ` It ends on <strong style="color:#111111;">${endDate}</strong>.` : ''} After that, your card is charged $2.99/week unless you cancel. Here's everything you can use right now:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['5 courses', 'Track every class you are taking, each with its own plan'],
            ['100 AI study boosts / month', 'Enough for daily use all semester'],
            ['AI Study Coach', 'Multi-week plan built around your exam dates'],
            ['Session Blueprints', 'Minute-by-minute plan before every study block'],
            ['Flashcards and quizzes', 'Built into every session automatically'],
          ].map(([feat, detail], i, arr) => `
          <tr>
            <td style="padding:11px 0;${i < arr.length - 1 ? 'border-bottom:1px solid #F0EDE8;' : ''}">
              <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
              <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${detail}</div>
            </td>
          </tr>`).join('')}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:8px;">
            <a href="https://getstudyedge.com/app" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Start studying</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">Cancel anytime before ${endDate ?? 'the trial ends'} in Settings to avoid being charged.</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because you started a StudyEdge AI Pro trial.<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    })
    console.log(`[stripe webhook] Trial started email sent to ${toEmail}`)
  } catch (err) {
    console.error('[stripe webhook] Failed to send trial started email:', err)
  }
}

async function sendTrialCancelledEmail(toEmail) {
  if (!process.env.RESEND_API_KEY) return
  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@mail.getstudyedge.com>',
      to: toEmail,
      subject: 'Trial cancelled. You will not be charged.',
      headers: listUnsubscribeHeaders(toEmail),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trial cancelled</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader("Your trial was cancelled. Your card will not be charged. Your account is on the free plan.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Confirmed</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          Your trial was cancelled. No charge.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Your 3-day trial has been cancelled and your card will not be billed. Your account is now on the free plan.
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          You can still use StudyEdge on free. If you change your mind, you can start a new trial anytime.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${[
            ['1 course', 'Add one course with full session planning'],
            ['10 AI study boosts', 'Use AI features up to 10 times total'],
            ['Grade tracker', 'Track your progress and target grade'],
          ].map(([feat, detail], i, arr) => `
          <tr>
            <td style="padding:9px 0;${i < arr.length - 1 ? 'border-bottom:1px solid #F0EDE8;' : ''}">
              <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
              <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${detail}</div>
            </td>
          </tr>`).join('')}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Restart trial anytime</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">3-day trial, then $2.99/wk. Cancel before day 4 and you won't be charged.</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because you cancelled your StudyEdge AI Pro trial.<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    })
    console.log(`[stripe] Trial cancelled confirmation sent to ${toEmail}`)
  } catch (err) {
    console.error('[stripe] Failed to send trial cancelled email:', err)
  }
}

/**
 * One-time comeback offer email. Sent right after the trial cancellation
 * confirmation with a time-limited (24h) promotion code embedded. The
 * discount percentage is set by OFFER_DISCOUNT_PCT in lib/server/oneTimeOffer.js
 * (currently 50%). The Stripe checkout page has `allow_promotion_codes: true`
 * so the user pastes the code at checkout, or the app auto-applies it via
 * the `?promo=CODE` URL param embedded in the email link.
 */
async function sendOneTimeOfferEmail(toEmail, offer) {
  if (!process.env.RESEND_API_KEY || !offer?.code) return
  const expiresLabel = offer.expiresAt.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York', timeZoneName: 'short',
  })
  const checkoutUrl = `https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&promo=${encodeURIComponent(offer.code)}&utm_source=email&utm_medium=lifecycle&utm_campaign=trial_cancel_offer`
  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@mail.getstudyedge.com>',
      to: toEmail,
      subject: `Before you go: ${offer.discountPct}% off your first month.`,
      headers: listUnsubscribeHeaders(toEmail),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>One-time comeback offer</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader(`One-time ${offer.discountPct}% off code inside. Expires in 24 hours.`)}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#E8531A;text-transform:uppercase;">One-time offer · 24h</p>
        <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.25;">
          ${offer.discountPct}% off your first month.
        </h1>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          You just cancelled your trial. Not every product clicks in three days. Before you go, here's one thing: a one-time <strong style="color:#111111;">${offer.discountPct}% off your first month of Pro</strong>. Paste the code below at checkout.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 22px;">
          <tr><td align="center" style="background:#FFF6F0;border:2px dashed #E8531A;border-radius:12px;padding:22px 24px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9B6B4A;text-transform:uppercase;margin-bottom:6px;">Your code</div>
            <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:28px;font-weight:700;color:#E8531A;letter-spacing:0.15em;">${offer.code}</div>
            <div style="font-size:12px;color:#9B6B4A;margin-top:8px;">Expires ${expiresLabel} · one-time use</div>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${checkoutUrl}" style="display:inline-block;background:#E8531A;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Redeem ${offer.discountPct}% off</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">Applies to first month of Pro. Cancel anytime.</span>
          </td></tr>
        </table>
        <p style="margin:22px 0 0;font-size:13px;color:#9B9B9B;line-height:1.6;">
          If you're set on skipping Pro entirely, no worries. This offer will quietly expire.
        </p>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because your StudyEdge AI Pro trial was cancelled.
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
          &nbsp;&middot;&nbsp;
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(toEmail)}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    })
    console.log(`[stripe] One-time offer email sent to ${toEmail} (code=${offer.code})`)
  } catch (err) {
    console.error('[stripe] Failed to send one-time offer email:', err)
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

    // ── Idempotency check - skip duplicate event deliveries ───────────────────
    const eventId = event.id
    const { data: existingEvent } = await supabaseAdmin
      .from('stripe_idempotency')
      .select('event_id')
      .eq('event_id', eventId)
      .maybeSingle()
    if (existingEvent) {
      console.log(`[stripe] Duplicate event ${eventId} - skipping`)
      return res.status(200).json({ ok: true, duplicate: true })
    }

    // ── Trial expiry warning (Stripe fires this 3 days before trial ends) ───────
    // For a 3-day trial this fires at the start — skip it here if more than 36h remain
    // and let the daily cron (trial-warning.js) send the email on the actual last day.
    // Only send if the trial genuinely ends within 36 hours so the copy is right.
    if (event.type === 'customer.subscription.trial_will_end') {
      const sub = event.data.object
      const hoursLeft = sub.trial_end
        ? (sub.trial_end - Math.floor(Date.now() / 1000)) / 3600
        : 999
      if (hoursLeft <= 36) {
        const userId = sub.metadata?.user_id
        if (userId) {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
          const email = authUser?.user?.email
          if (email) {
            await sendTrialExpiryEmail(email)
            await Promise.allSettled([
              onTrialEndingSoon({ email, userId, daysLeft: 1 }),
            ])
          }
        }
      } else {
        console.log(`[stripe webhook] trial_will_end skipped — ${Math.round(hoursLeft)}h left, letting cron handle it`)
      }
      // Always record idempotency so this event isn't reprocessed on Stripe retry.
      await supabaseAdmin
        .from('stripe_idempotency')
        .insert({ event_id: eventId, processed_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.error('[stripe] Failed to record trial_will_end event', error) })
      return res.status(200).json({ received: true })
    }

    // ── Abandoned checkout recovery ──────────────────────────────────────────
    // Fires when a Stripe Checkout session expires (default 24h) without completion.
    // Send a one-time nudge email while intent is still warm.
    if (event.type === 'checkout.session.expired') {
      const session = event.data.object
      const userId = session.metadata?.user_id
      const email = session.customer_details?.email ?? session.customer_email
      const wasTrial = session.metadata?.trial === '1'

      if (userId && email && process.env.RESEND_API_KEY) {
        try {
          await resend.emails.send({
            from: 'Ryan at StudyEdge <ryan@getstudyedge.com>',
            to: email,
            subject: 'You left before finishing. Your trial spot is still open.',
            headers: listUnsubscribeHeaders(userId),
            html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader('You started signing up for Pro but didn\'t finish. Your spot is still open.')}
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:#fff;border-radius:16px;padding:36px 32px;border:1px solid #e5e7eb;">
    <img src="https://getstudyedge.com/favicon.png" alt="StudyEdge AI" style="width:36px;height:36px;border-radius:9px;margin-bottom:20px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#111;letter-spacing:-0.03em;">
      You were one step away.
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
      You started ${wasTrial ? 'your 3-day free trial' : 'signing up for Pro'} but didn't finish. Your spot is still open. It takes about 30 seconds to complete.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13.5px;color:#166534;line-height:1.6;">
        ${wasTrial
          ? '<strong>Try Pro free for 3 days.</strong> Enter your card to start. You won\'t be charged until day 4. Cancel anytime before then.'
          : '<strong>Pro is $2.99/week.</strong> 5 courses, 100 AI actions/month, unlimited blueprints and focus sessions. Cancel anytime.'
        }
      </p>
    </div>
    <a href="https://getstudyedge.com/app?plan=pro&billing=weekly${wasTrial ? '&trial=1' : ''}" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">
      ${wasTrial ? 'Complete your free trial →' : 'Complete signup →'}
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
      Any questions? Just reply. I read every message.
    </p>
    <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— Ryan, StudyEdge AI</p>
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
      StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a>
    </p>
  </div>
</div>
</body>
</html>`,
          })
          console.log(`[stripe webhook] Abandoned checkout email sent to ${email} userId=${userId}`)
        } catch (e) {
          console.error('[stripe webhook] Failed to send abandoned checkout email:', e.message)
        }
      }

      await supabaseAdmin
        .from('stripe_idempotency')
        .insert({ event_id: eventId, processed_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.error('[stripe] Failed to record checkout.session.expired event', error) })
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
        console.warn('[stripe webhook] No user_id in metadata - skipping')
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
          referredBy:       existing?.subscription?.referredBy       ?? null,
          referralRewarded: existing?.subscription?.referralRewarded ?? false,
          referralCount:    existing?.subscription?.referralCount    ?? 0,
          // Preserve existing trialUsedAt; stamp it on first trialing activation so
          // hasUsedTrial() in the client correctly blocks a second free trial.
          trialUsedAt: existing?.subscription?.trialUsedAt
            ?? (sub.status === 'trialing' && event.type === 'customer.subscription.created'
                ? new Date().toISOString()
                : null),
        }

        const { error } = await supabaseAdmin
          .from('user_data')
          .upsert(
            { user_id: userId, subscription: mergedSub, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          )

        if (error) throw error
        console.log(`[stripe webhook] Updated user ${userId} → ${mergedSub.plan} (${mergedSub.status})`)

        // ── Referral reward ───────────────────────────────────────────────────
        // Fire when a referred user's subscription becomes active (trial→paid or direct).
        // Applies a $9.99 Stripe credit to both the new subscriber and their referrer.
        if (
          sub.status === 'active' &&
          mergedSub.referredBy &&
          !mergedSub.referralRewarded
        ) {
          try {
            const referrerId = mergedSub.referredBy
            const { data: referrerRow } = await supabaseAdmin
              .from('user_data')
              .select('subscription')
              .eq('user_id', referrerId)
              .maybeSingle()

            const referrerCustomerId = referrerRow?.subscription?.stripeCustomerId
            const newCustomerId = sub.customer

            const CREDIT_CENTS = 999 // $9.99 - 1 month Pro at new pricing

            if (referrerCustomerId) {
              await stripe.customers.createBalanceTransaction(referrerCustomerId, {
                amount: -CREDIT_CENTS,
                currency: 'usd',
                description: 'Referral reward - friend upgraded to Pro',
              })
              // Increment referrer's count
              const referrerMerged = {
                ...(referrerRow?.subscription ?? {}),
                referralCount: (referrerRow?.subscription?.referralCount ?? 0) + 1,
              }
              await supabaseAdmin.from('user_data').upsert(
                { user_id: referrerId, subscription: referrerMerged, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' }
              )
            }

            if (newCustomerId) {
              await stripe.customers.createBalanceTransaction(newCustomerId, {
                amount: -CREDIT_CENTS,
                currency: 'usd',
                description: 'Referral signup bonus - 1 month free',
              })
            }

            // Mark as rewarded so it never fires twice
            await supabaseAdmin.from('user_data').upsert(
              {
                user_id: userId,
                subscription: { ...mergedSub, referralRewarded: true },
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' }
            )
            console.log(`[stripe webhook] Referral reward applied - referrer: ${referrerId}, new: ${userId}`)
          } catch (refErr) {
            console.error('[stripe webhook] Referral reward failed (non-fatal):', refErr)
          }
        }

        // ── Win-back email on cancellation/downgrade ─────────────────────────
        const wasDowngraded =
          event.type === 'customer.subscription.deleted' ||
          (event.type === 'customer.subscription.updated' && !isActive)
        // Skip win-back if this was a trial cancellation via the in-app cancel
        // button — that path already sent a confirmation email and setting
        // cancelled_via metadata prevents a double churn sequence here.
        const isTrialCancellation = sub?.metadata?.cancelled_via === 'trial_cancel'
        if (wasDowngraded && !isTrialCancellation) {
          // Fetch user email from Supabase Auth
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
          const email = authUser?.user?.email
          if (email) {
            await sendWinBackEmail(email)
            // Loops.so - fire churned automation
            await Promise.allSettled([
              onChurned({ email, userId }),
            ])
          }
        }

        // ── Loops.so - fire upgraded_to_pro on active (non-trial) activation ─
        if (sub.status === 'active' && (
          event.type === 'customer.subscription.created' ||
          event.type === 'customer.subscription.updated'
        )) {
          try {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
            const email = authUser?.user?.email
            if (email) {
              await Promise.allSettled([
                onUpgraded({ email, userId, plan: planInfo.plan, billingPeriod: planInfo.billingPeriod }),
              ])
            }
          } catch (loopsErr) {
            console.error('[stripe webhook] Loops upgrade trigger failed (non-fatal):', loopsErr)
          }
        }

        // ── PostHog - fire checkout_success on first paid activation ─────────
        // Only on `customer.subscription.created` so renewals don't double-count.
        //
        // $revenue + $revenue_currency are PostHog's native revenue-tracking
        // properties: they let us compute realized LTV per acquisition source
        // (utm_source, utm_campaign) using PostHog's Revenue insight — which
        // is the input to sane paid-ad CAC math. Pulling from the Stripe
        // subscription item itself (not a hardcoded map) means pricing
        // changes flow through automatically.
        const priceItem = sub?.items?.data?.[0]?.price
        const revenueCents = typeof priceItem?.unit_amount === 'number' ? priceItem.unit_amount : null
        const revenueDollars = revenueCents !== null ? revenueCents / 100 : null
        const revenueCurrency = priceItem?.currency ? priceItem.currency.toUpperCase() : 'USD'

        if (sub.status === 'active' && event.type === 'customer.subscription.created') {
          await posthogCapture('checkout_success', userId, {
            plan: planInfo.plan,
            billing_period: planInfo.billingPeriod,
            stripe_sub_id: sub.id,
            stripe_customer_id: sub.customer,
            source: 'direct',
            ...(revenueDollars !== null && {
              $revenue: revenueDollars,
              $revenue_currency: revenueCurrency,
            }),
          })
        }

        // Trial → paid conversion. Stripe fires `customer.subscription.updated`
        // with `previous_attributes.status === 'trialing'` when the trial ends
        // and the first invoice is paid. This is the actual moment of realized
        // revenue for trial users — without this, PostHog's LTV curve would
        // never include any user who came through the trial (which is ~all of
        // them). We fire checkout_success (not a new event name) so a single
        // insight in PostHog captures both flows.
        const previousStatus = event.data?.previous_attributes?.status
        if (
          sub.status === 'active' &&
          event.type === 'customer.subscription.updated' &&
          previousStatus === 'trialing'
        ) {
          await posthogCapture('checkout_success', userId, {
            plan: planInfo.plan,
            billing_period: planInfo.billingPeriod,
            stripe_sub_id: sub.id,
            stripe_customer_id: sub.customer,
            source: 'trial_conversion',
            ...(revenueDollars !== null && {
              $revenue: revenueDollars,
              $revenue_currency: revenueCurrency,
            }),
          })
          // Send pro welcome email on trial → paid conversion.
          try {
            const { data: conversionUser } = await supabaseAdmin.auth.admin.getUserById(userId)
            if (conversionUser?.user?.email) {
              const meta = conversionUser.user.user_metadata ?? {}
              const firstName = (meta.first_name ?? meta.full_name ?? meta.name ?? '').split(' ')[0] || null
              await sendProWelcomeEmail(conversionUser.user.email, {
                firstName,
                plan: planInfo.plan,
                billingPeriod: planInfo.billingPeriod,
                userId,
              })
            }
          } catch (err) {
            console.error('[stripe] Pro welcome email failed:', err)
          }
        }
        // Also fire trial_activated on `trialing` so funnel reconciles with iOS StoreKit trials.
        // We attach revenue as `expected_revenue` here (not $revenue) — Stripe
        // has not billed yet, so counting it as realized revenue would inflate
        // LTV. $revenue only fires on the paid conversion (checkout_success or
        // the `trialing → active` transition below).
        if (sub.status === 'trialing' && event.type === 'customer.subscription.created') {
          await posthogCapture('trial_activated', userId, {
            plan: planInfo.plan,
            billing_period: planInfo.billingPeriod,
            stripe_sub_id: sub.id,
            source: 'stripe',
            ...(revenueDollars !== null && {
              expected_revenue: revenueDollars,
              revenue_currency: revenueCurrency,
            }),
          })
          // Send trial started confirmation - tells user what's unlocked and when they'll be charged.
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
          if (authUser?.user?.email) {
            await sendTrialStartedEmail(authUser.user.email, sub.trial_end ?? null)
          }
        }
      } catch (err) {
        console.error('[stripe webhook] DB error:', err)
        return res.status(500).json({ error: 'DB update failed' })
      }
    }

    // Record processed event for idempotency
    await supabaseAdmin
      .from('stripe_idempotency')
      .insert({ event_id: eventId, processed_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.error('[stripe] Failed to record event', error) })

    return res.status(200).json({ received: true })
  }

  // ── Checkout / cancel-trial path ──────────────────────────────────────────
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

  // ── Cancel trial path ──────────────────────────────────────────────────────
  if (body.action === 'cancel-trial') {
    // Verify the request comes from the authenticated user.
    const token = req.headers['authorization']?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !authUser) return res.status(401).json({ error: 'Unauthorized' })

    const { userId } = body
    if (!userId || userId !== authUser.id) return res.status(403).json({ error: 'Forbidden' })

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
      // Tag the subscription before cancelling so the customer.subscription.deleted
      // webhook can distinguish trial cancellation from paid churn and skip win-back.
      await stripe.subscriptions.update(stripeSubId, { metadata: { cancelled_via: 'trial_cancel' } })
      await stripe.subscriptions.cancel(stripeSubId)
    } catch (stripeErr) {
      console.error('[cancel-trial] Stripe error:', stripeErr)
      return res.status(500).json({ error: 'Failed to cancel with Stripe' })
    }

    // Keep trial_activated: true so hasUsedTrial() stays true - prevents a second free trial.
    // status: 'cancelled' is what isTrialActive() checks to block re-activation.
    const updated = { ...sub, plan: 'free', status: 'cancelled', stripeSubId: null, currentPeriodEnd: null }
    const { error: upsertErr } = await supabaseAdmin
      .from('user_data')
      .upsert({ user_id: userId, subscription: updated, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

    if (upsertErr) {
      console.error('[cancel-trial] DB upsert failed after Stripe cancel:', upsertErr)
      return res.status(500).json({ error: 'Subscription cancelled in Stripe but failed to update database. Contact support.' })
    }

    // Send cancellation confirmation - stops "was I charged?" support tickets.
    // Then run two save-the-conversion emails in parallel (best-effort, non-blocking):
    //   1. Personal founder email asking "why did you cancel?" — highest reply
    //      rate of any email in this flow, drives direct product feedback and
    //      sometimes recovers the sale.
    //   2. One-time 24h comeback offer with percentage discount defined by
    //      OFFER_DISCOUNT_PCT in lib/server/oneTimeOffer.js — recovers
    //      price-sensitive cancellations. Guarded so a user who already got
    //      an offer once (e.g. trial → offer → convert → cancel → trial →
    //      cancel) does not get repeatedly discounted.
    if (authUser?.email) {
      sendTrialCancelledEmail(authUser.email).catch(e =>
        console.error('[cancel-trial] Failed to send confirmation email:', e)
      )

      // Pull first name from auth metadata if we have it — makes the founder
      // email read as a real personal message instead of "Hey there".
      const firstName = authUser?.user_metadata?.first_name
        ?? authUser?.user_metadata?.full_name
        ?? authUser?.user_metadata?.name
        ?? null

      sendFounderCancellationEmail(authUser.email, { firstName }).catch(e =>
        console.error('[cancel-trial] Failed to send founder email:', e)
      )

      // Fire-and-forget: coupon creation + email. Even if it fails, the
      // user's cancellation still succeeds.
      ;(async () => {
        try {
          if (await userHasExistingOffer(userId)) {
            console.log(`[cancel-trial] Skipping one-time offer — user ${userId} already has one`)
            return
          }
          const offer = await createTrialCancelOffer({ userId })
          if (offer) await sendOneTimeOfferEmail(authUser.email, offer)
        } catch (e) {
          console.error('[cancel-trial] one-time offer flow failed:', e)
        }
      })()
    }

    return res.status(200).json({ success: true, subscription: updated })
  }

  // ── Customer Portal path ───────────────────────────────────────────────────
  if (body.action === 'create-portal-session') {
    const token = req.headers['authorization']?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: { user: authUser }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !authUser) return res.status(401).json({ error: 'Unauthorized' })

    const { userId } = body
    if (!userId || userId !== authUser.id) return res.status(403).json({ error: 'Forbidden' })

    const { data, error: dbErr } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle()

    if (dbErr || !data) return res.status(404).json({ error: 'User not found' })

    const stripeCustomerId = data.subscription?.stripeCustomerId
    if (!stripeCustomerId) return res.status(400).json({ error: 'No billing account found' })

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: 'https://getstudyedge.com/app?tab=account',
      })
      return res.status(200).json({ url: portalSession.url })
    } catch (stripeErr) {
      console.error('[create-portal-session] Stripe error:', stripeErr)
      return res.status(500).json({ error: 'Failed to open billing portal' })
    }
  }

  // If the request includes a Bearer token, verify it matches the userId in the body.
  // This blocks an attacker who knows a victim's UUID from creating a checkout on their behalf.
  const checkoutToken = req.headers['authorization']?.replace('Bearer ', '').trim()
  if (checkoutToken && body.userId) {
    const { data: { user: checkoutUser }, error: checkoutAuthErr } = await supabaseAdmin.auth.getUser(checkoutToken)
    if (checkoutAuthErr || !checkoutUser || checkoutUser.id !== body.userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
  }

  const { plan, billingPeriod: rawBillingPeriod, userEmail, userId, trial, promo } = body

  // Normalize billing period aliases: 'annual' → 'yearly'.
  const billingPeriod = rawBillingPeriod === 'annual' ? 'yearly' : rawBillingPeriod

  const priceId = PRICE_IDS[plan]?.[billingPeriod]

  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan or billing period' })
  }
  // Real Stripe price IDs always start with 'price_1'. Placeholder fallbacks
  // like 'price_pro_weekly' mean the env var is missing — fail loudly instead
  // of sending a bad price ID to Stripe and getting a cryptic 400 back.
  if (!priceId.startsWith('price_1')) {
    console.error(`[stripe checkout] Missing STRIPE_PRICE env var for ${plan}/${billingPeriod} — got placeholder "${priceId}"`)
    return res.status(500).json({ error: 'Checkout not configured. Please contact support.' })
  }

  // REVENUE-CRITICAL.
  // Trial is available on Pro or Unlimited (all three billing periods). It is a
  // CARD-REQUIRED 3-day trial: `payment_method_collection: 'always'` below
  // forces Stripe Checkout to collect a card before the trial starts, and
  // Stripe auto-bills after 3 days unless the user cancels. There is no
  // "no-card trial" path anywhere in this product anymore - earlier copy
  // and an old commit (2af08aa, 2026-05-25) assumed otherwise and silently
  // produced 0 new customers for 9 days. Verify with
  // `node scripts/verify-trial-flow.mjs` after any change to this block.
  // Trial now defaults to Unlimited/weekly — 100% of paying users chose Unlimited,
  // so we align the trial with revealed user preference. Pro trial still works.
  const wantsTrial = !!trial && (plan === 'pro' || plan === 'unlimited')

  const subscriptionData = {
    metadata: { user_id: userId },
    ...(wantsTrial && {
      trial_period_days: 3,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    }),
  }

  // Guard: if this user already has an active or trialing subscription, block the duplicate
  if (userId) {
    try {
      const { data: existingUser } = await supabaseAdmin
        .from('user_data')
        .select('subscription')
        .eq('user_id', userId)
        .maybeSingle()

      const existingSub = existingUser?.subscription
      // Only block if the user already has a real Stripe-backed paid/trialing sub.
      // Free users default to { plan: 'free', status: 'active' } so checking status
      // alone was rejecting every signup; require an actual stripeSubId + paid plan.
      const hasRealPaidSub = !!existingSub?.stripeSubId
        && ['active', 'trialing', 'past_due'].includes(existingSub?.status)
        && ['pro', 'unlimited'].includes(existingSub?.plan)
      if (hasRealPaidSub) {
        console.warn(`[stripe checkout] Blocked duplicate checkout for user ${userId} - already ${existingSub.status} on ${existingSub.plan}`)
        return res.status(409).json({
          error: 'You already have an active subscription.',
          alreadySubscribed: true,
        })
      }
    } catch (dbErr) {
      console.error('[stripe checkout] Error checking existing subscription:', dbErr)
      // Non-fatal - allow checkout to proceed if the check itself fails
    }
  }

  // If the client passed a `promo` code (from the trial-cancel comeback-offer
  // email link), resolve it to a Stripe promotion_code ID and attach it as a
  // discount so the user does not have to paste anything. If the code is bad,
  // invalid, or expired, we fall back to a codeless checkout instead of
  // failing — the promo is a bonus, not a hard requirement.
  //
  // Stripe rejects sessions that pass BOTH `discounts` and
  // `allow_promotion_codes: true`, so when a valid promo is auto-applied we
  // drop `allow_promotion_codes`.
  let promoDiscounts
  if (promo && typeof promo === 'string' && /^[A-Z0-9]{6,24}$/.test(promo)) {
    try {
      const list = await stripe.promotionCodes.list({ code: promo, active: true, limit: 1 })
      const promotionCode = list.data?.[0]
      if (promotionCode?.id) {
        promoDiscounts = [{ promotion_code: promotionCode.id }]
        console.log(`[stripe checkout] Auto-applying promo ${promo} (${promotionCode.id})`)
      } else {
        console.warn(`[stripe checkout] Promo ${promo} not found or inactive — falling back`)
      }
    } catch (promoErr) {
      console.error('[stripe checkout] Promo lookup failed, continuing without discount:', promoErr?.message ?? promoErr)
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      // Explicitly card-only. Stripe would otherwise auto-include Apple Pay
      // on iOS Safari, which Apple App Review flags as IAP products being
      // "mislabeled as Apple Pay" (Guideline 1.1.6).
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail || undefined,
      // For trials we must collect the card up front so billing starts after the trial ends.
      payment_method_collection: wantsTrial ? 'always' : undefined,
      subscription_data: subscriptionData,
      metadata: { user_id: userId, trial: wantsTrial ? '1' : '0', promo: promoDiscounts ? promo : '' },
      // discounts and allow_promotion_codes are mutually exclusive in Stripe.
      ...(promoDiscounts
        ? { discounts: promoDiscounts }
        : { allow_promotion_codes: true }
      ),
      // Reassurance copy directly under the Start trial button - the moment of
      // highest abandonment anxiety on the trial path. Price varies by plan.
      custom_text: wantsTrial
        ? { submit: { message: plan === 'unlimited'
            ? "Free for 3 days, then $4.99/week. Cancel anytime in your account before day 4 and you won't be charged."
            : "Free for 3 days, then $2.99/week. Cancel anytime in your account before day 4 and you won't be charged." } }
        : undefined,
      success_url: 'https://getstudyedge.com/app?checkout=success',
      cancel_url: 'https://getstudyedge.com/app?checkout=cancelled',
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[stripe checkout] Error:', err)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
