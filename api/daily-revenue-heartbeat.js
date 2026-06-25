// REVENUE-CRITICAL OBSERVABILITY - DO NOT DISABLE WITHOUT REPLACING.
//
// Daily cron that checks two things and pages via email when either looks broken:
//   1. Stripe: new customers in last 24h / 7d. If 0 in 48h AND 7d_avg > 0 -> red alert.
//   2. PostHog: signup_completed -> checkout_started conversion rate (last 24h).
//      If signups > 5 AND rate < 30% -> red alert.
//
// Background: on 2026-05-25 a one-line change in src/App.jsx skipped Stripe Checkout
// for trial signups. The bug shipped silently and produced ZERO new customers for 9
// days before being noticed by eyeballing the Stripe dashboard. This cron exists so
// that never happens again.

import Stripe from 'stripe'
import { Resend } from 'resend'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

const ALERT_TO = 'ryan@olunix.com'
const ALERT_FROM = 'StudyEdge Heartbeat <heartbeat@mail.getstudyedge.com>'

const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '412740'
const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY

const DAY_MS = 24 * 60 * 60 * 1000

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY not set - cron is a no-op' })
  }

  const now = Math.floor(Date.now() / 1000)
  const last24h = now - 24 * 60 * 60
  const last48h = now - 48 * 60 * 60
  const last7d = now - 7 * 24 * 60 * 60

  // ── Stripe: new customers in window ──────────────────────────────────────
  // Note: customer.created fires when Stripe makes the customer object, which
  // for Checkout sessions happens at session creation, not at trial conversion.
  // For "did the trial flow actually work", we ALSO count new subscriptions.
  let customersLast24h = 0
  let customersLast48h = 0
  let customersLast7d = 0
  let trialsStartedLast24h = 0
  let trialsStartedLast7d = 0
  let stripeErr = null

  try {
    const customers = await listAll(starting_after =>
      stripe.customers.list({ created: { gte: last7d }, limit: 100, starting_after })
    )
    for (const c of customers) {
      if (c.created >= last24h) customersLast24h++
      if (c.created >= last48h) customersLast48h++
      customersLast7d++
    }

    const subs = await listAll(starting_after =>
      stripe.subscriptions.list({ created: { gte: last7d }, status: 'all', limit: 100, starting_after })
    )
    for (const s of subs) {
      if (s.created >= last24h) trialsStartedLast24h++
      trialsStartedLast7d++
    }
  } catch (err) {
    stripeErr = err.message || String(err)
    console.error('[heartbeat] Stripe error:', err)
  }

  const sevenDayCustomerAvg = customersLast7d / 7

  // ── PostHog: signup -> checkout_started conversion ───────────────────────
  let phSignups24h = null
  let phCheckoutStarted24h = null
  let phRate = null
  let phErr = null
  if (POSTHOG_PERSONAL_API_KEY) {
    try {
      ;[phSignups24h, phCheckoutStarted24h] = await Promise.all([
        posthogEventCount('signup_completed', last24h),
        posthogEventCount('checkout_started', last24h),
      ])
      if (phSignups24h > 0) phRate = phCheckoutStarted24h / phSignups24h
    } catch (err) {
      phErr = err.message || String(err)
      console.error('[heartbeat] PostHog error:', err)
    }
  }

  // ── Decide: red alert or green status? ───────────────────────────────────
  const reasons = []
  const isStripeOutage = customersLast48h === 0 && sevenDayCustomerAvg > 0
  if (isStripeOutage) {
    reasons.push(
      `ZERO new Stripe customers in 48h, but 7-day average is ${sevenDayCustomerAvg.toFixed(1)}/day. ` +
      `This is the same shape as the 2026-05-25 trial-bypass incident. Check /app?signup=1&plan=pro&billing=weekly&trial=1 end-to-end immediately.`
    )
  }
  const isFunnelDrop = phSignups24h !== null && phSignups24h > 5 && phRate !== null && phRate < 0.30
  if (isFunnelDrop) {
    reasons.push(
      `Funnel drop: ${phSignups24h} signups in 24h but only ${phCheckoutStarted24h} reached checkout (${(phRate * 100).toFixed(0)}%). ` +
      `Threshold is 30%. Check Stripe is being called on the post-signup redirect.`
    )
  }
  if (stripeErr) reasons.push(`Stripe API error: ${stripeErr}`)

  const isRed = reasons.length > 0
  const subject = isRed
    ? `[StudyEdge ALERT] ${reasons.length} revenue signal(s) failing`
    : `[StudyEdge OK] ${customersLast24h} new customers today (7d avg ${sevenDayCustomerAvg.toFixed(1)})`

  const html = renderEmail({
    isRed,
    reasons,
    customersLast24h,
    customersLast48h,
    customersLast7d,
    sevenDayCustomerAvg,
    trialsStartedLast24h,
    trialsStartedLast7d,
    phSignups24h,
    phCheckoutStarted24h,
    phRate,
    phErr,
    generatedAt: new Date().toISOString(),
  })

  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({ from: ALERT_FROM, to: ALERT_TO, subject, html })
    } catch (err) {
      console.error('[heartbeat] Resend error:', err)
    }
  } else {
    console.warn('[heartbeat] RESEND_API_KEY not set - would have sent:', subject)
  }

  return res.status(200).json({
    ok: true,
    red: isRed,
    reasons,
    customersLast24h,
    customersLast48h,
    customersLast7d,
    sevenDayCustomerAvg,
    trialsStartedLast24h,
    trialsStartedLast7d,
    phSignups24h,
    phCheckoutStarted24h,
    phRate,
  })
}

async function listAll(fetchPage) {
  const all = []
  let starting_after
  for (let i = 0; i < 20; i++) {
    const page = await fetchPage(starting_after)
    all.push(...page.data)
    if (!page.has_more) break
    starting_after = page.data[page.data.length - 1].id
  }
  return all
}

async function posthogEventCount(event, sinceUnixSec) {
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`
  const sinceIso = new Date(sinceUnixSec * 1000).toISOString()
  const body = {
    query: {
      kind: 'HogQLQuery',
      query: `SELECT count() FROM events WHERE event = '${event}' AND timestamp >= toDateTime('${sinceIso}')`,
    },
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`PostHog ${r.status}: ${await r.text()}`)
  const json = await r.json()
  return Number(json?.results?.[0]?.[0] ?? 0)
}

function renderEmail(d) {
  const tone = d.isRed ? '#B91C1C' : '#059669'
  const bg = d.isRed ? '#FEF2F2' : '#F0FDF4'
  const banner = d.isRed ? 'REVENUE SIGNAL FAILING' : 'Revenue heartbeat: healthy'
  const reasonRows = d.reasons.length
    ? `<div style="background:${bg};border:1px solid ${tone}33;border-radius:8px;padding:14px 16px;margin:16px 0">
         <strong style="color:${tone};font-size:14px">Action needed</strong>
         <ul style="margin:8px 0 0 18px;padding:0;color:#111;font-size:14px;line-height:1.5">
           ${d.reasons.map(r => `<li style="margin:6px 0">${escapeHtml(r)}</li>`).join('')}
         </ul>
       </div>`
    : ''
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F7F6F3;margin:0;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:12px;padding:24px">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${tone};font-weight:700">${banner}</div>
    <h1 style="font-size:20px;margin:6px 0 16px;color:#111">StudyEdge daily revenue check</h1>
    ${reasonRows}
    <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6B6B;margin:20px 0 8px">Stripe (live)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111">
      <tr><td style="padding:6px 0;color:#6B6B6B">New customers (24h)</td><td style="text-align:right;font-weight:600">${d.customersLast24h}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6B6B">New customers (48h)</td><td style="text-align:right;font-weight:600">${d.customersLast48h}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6B6B">New customers (7d)</td><td style="text-align:right;font-weight:600">${d.customersLast7d}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6B6B">7-day avg / day</td><td style="text-align:right;font-weight:600">${d.sevenDayCustomerAvg.toFixed(2)}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6B6B">New subscriptions (24h)</td><td style="text-align:right;font-weight:600">${d.trialsStartedLast24h}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6B6B">New subscriptions (7d)</td><td style="text-align:right;font-weight:600">${d.trialsStartedLast7d}</td></tr>
    </table>
    <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6B6B;margin:24px 0 8px">PostHog funnel (24h)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111">
      <tr><td style="padding:6px 0;color:#6B6B6B">signup_completed</td><td style="text-align:right;font-weight:600">${d.phSignups24h ?? '-'}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6B6B">checkout_started</td><td style="text-align:right;font-weight:600">${d.phCheckoutStarted24h ?? '-'}</td></tr>
      <tr><td style="padding:6px 0;color:#6B6B6B">Conversion rate</td><td style="text-align:right;font-weight:600">${d.phRate !== null ? (d.phRate * 100).toFixed(0) + '%' : '-'}</td></tr>
    </table>
    ${d.phErr ? `<p style="color:#B91C1C;font-size:12px;margin:8px 0 0">PostHog query failed: ${escapeHtml(d.phErr)}. Set POSTHOG_PERSONAL_API_KEY to enable funnel checks.</p>` : ''}
    <p style="color:#9B9B9B;font-size:11px;margin-top:24px;border-top:1px solid rgba(0,0,0,0.07);padding-top:12px">
      Generated ${d.generatedAt}. Source: api/daily-revenue-heartbeat.js. Edit thresholds inline.
    </p>
  </div></body></html>`
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
