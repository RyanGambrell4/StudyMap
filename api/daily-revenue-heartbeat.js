// REVENUE-CRITICAL OBSERVABILITY - DO NOT DISABLE WITHOUT REPLACING.
//
// Daily cron that checks two things and pages via email when either looks broken:
//   1. Stripe: new customers + subscriptions + MRR. Alert fires only if:
//      a) 7d avg >= 0.5/day AND 0 customers in 48h (statistically unusual), OR
//      b) 7d avg >= 0.1/day AND 0 customers in 7d (definitely broken).
//      At low volume (avg < 0.5/day) a single dry 48h period is normal; don't cry wolf.
//   2. PostHog: signup → onboarding_completed → checkout_button_clicked → checkout_started.
//      email_confirmed is NOT part of the funnel — email gate is soft (users bypass it).
//      Three distinct alerts, because "nobody clicked" and "clicks go nowhere" need
//      opposite responses (CRO work vs. page-someone-now):
//        a) Checkout broken: >= 3 checkout_button_clicked but 0 checkout_started in 24h.
//           Volume-independent — clicks that never produce a Stripe session are never
//           normal. This is the signature of the 2026-05-25 incident.
//        b) Funnel zero: a full 7d with >= 20 onboards and not one checkout.
//        c) Funnel regression: the 7d onboard→checkout rate fell below half its own
//           preceding-21d baseline.
//      Note what is deliberately absent: a fixed conversion target. Until 2026-08-06 this
//      cron paged whenever onboarding→checkout came in under 20%, gated on signups >= 10 —
//      a gate on the wrong variable, since 20% is a rate whose denominator is *onboards*.
//      Worse, the real steady-state rate is ~5%, so the condition was permanently true and
//      the alert fired every morning regardless of app health. An alert that is always on
//      is not an alert. These three test for change and breakage instead; the absolute rate
//      is still reported in the email body as a number worth watching.
//
// Background: on 2026-05-25 a one-line change in src/App.jsx skipped Stripe Checkout
// for trial signups. The bug shipped silently for 9 days. This cron prevents that.

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

// Minimum sample sizes before a rate is worth paging on. The funnel gate applies to
// 7d onboarding_completed (the denominator of the onboarded→checkout rate), not to signups.
// At a true 20% conversion rate, 0 successes in 20 trials has p ≈ 1.2% — low enough that
// tripping the alert means something. The same test over a single day (n ≈ 3-8) is coin-flip
// noise, which is why this cron paged every morning while nothing was actually wrong.
const MIN_FUNNEL_DENOM    = 20
const MIN_CLICKS_TO_TRUST = 3
// How far the 7d conversion rate must fall below its own 21d baseline to count as a
// regression rather than week-to-week wobble.
const REGRESSION_FACTOR   = 0.5

export const config = { maxDuration: 60 }

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
  const last24h = now - 86400
  const last48h = now - 86400 * 2
  const last7d  = now - 86400 * 7
  const last14d = now - 86400 * 14
  const last28d = now - 86400 * 28

  // ── Stripe ────────────────────────────────────────────────────────────────
  let customersLast24h = 0
  let customersLast48h = 0
  let customersLast7d  = 0
  let customersLast14d = 0
  let trialsLast24h    = 0
  let trialsLast7d     = 0
  let activeSubCount   = 0
  let trialingSubCount = 0
  let mrr              = 0
  let revenueLast24h   = 0
  let stripeErr        = null

  try {
    // New customers
    const customers14d = await listAll(sa =>
      stripe.customers.list({ created: { gte: last14d }, limit: 100, starting_after: sa })
    )
    for (const c of customers14d) {
      if (c.created >= last24h) customersLast24h++
      if (c.created >= last48h) customersLast48h++
      if (c.created >= last7d)  customersLast7d++
      customersLast14d++
    }

    // New subscriptions (trials started)
    const subs7d = await listAll(sa =>
      stripe.subscriptions.list({ created: { gte: last7d }, status: 'all', limit: 100, starting_after: sa })
    )
    for (const s of subs7d) {
      if (s.created >= last24h) trialsLast24h++
      trialsLast7d++
    }

    // MRR + active/trialing sub counts
    const activeSubs = await listAll(sa =>
      stripe.subscriptions.list({ status: 'active', limit: 100, starting_after: sa })
    )
    for (const s of activeSubs) {
      activeSubCount++
      for (const item of s.items.data) {
        const cents   = item.price?.unit_amount ?? 0
        const interval = item.price?.recurring?.interval ?? 'month'
        const count   = item.price?.recurring?.interval_count ?? 1
        if (interval === 'week')  mrr += (cents / 100) * (4.33 / count)
        else if (interval === 'month') mrr += (cents / 100) / count
        else if (interval === 'year')  mrr += (cents / 100) / (12 * count)
      }
    }

    const trialingSubs = await listAll(sa =>
      stripe.subscriptions.list({ status: 'trialing', limit: 100, starting_after: sa })
    )
    trialingSubCount = trialingSubs.length

    // Revenue collected in last 24h (successful charges)
    const charges = await listAll(sa =>
      stripe.charges.list({ created: { gte: last24h }, limit: 100, starting_after: sa })
    )
    for (const ch of charges) {
      if (ch.paid && !ch.refunded) revenueLast24h += ch.amount / 100
    }
  } catch (err) {
    stripeErr = err.message || String(err)
    console.error('[heartbeat] Stripe error:', err)
  }

  const avg7d  = customersLast7d  / 7
  const avg14d = customersLast14d / 14

  // ── PostHog ───────────────────────────────────────────────────────────────
  let phSignups        = null
  let phEmailConfirmed = null
  let phOnboarded      = null
  let phTrialSkipped   = null
  let phClicks         = null   // checkout_button_clicked (client, CTA press)
  let phCheckoutErr    = null   // checkout_error (client, session creation failed)
  let phCheckout       = null   // checkout_started (server, Stripe session exists)
  let phActiveUsers    = null
  let phRate           = null   // signup → checkout
  let phOnboardRate    = null   // onboarding → checkout (the real funnel), 24h
  let phReachRate      = null   // signup → onboarding (the top-of-funnel leak), 24h
  let phOnboarded7d    = null
  let phCheckout7d     = null
  let phOnboardRate7d  = null   // onboarding → checkout over 7d — what the CRO alert tests
  let phOnboarded28d   = null
  let phCheckout28d    = null
  let phPrevOnboarded  = null
  let phPrevCheckout   = null
  let phBaselineRate   = null   // same rate over the preceding 21d (28d minus the last 7d)
  let phErr            = null

  if (POSTHOG_PERSONAL_API_KEY) {
    try {
      ;[phSignups, phEmailConfirmed, phOnboarded, phTrialSkipped, phClicks, phCheckoutErr, phCheckout, phActiveUsers,
        phOnboarded7d, phCheckout7d, phOnboarded28d, phCheckout28d] =
        await Promise.all([
          posthogCount('signup_completed', last24h),
          posthogCount('email_confirmed', last24h),
          posthogCount('onboarding_completed', last24h),
          posthogCount('trial_skipped', last24h),
          posthogCount('checkout_button_clicked', last24h),
          posthogCount('checkout_error', last24h),
          posthogCount('checkout_started', last24h),
          posthogDistinctCount(last24h),
          // 7-day window: the CRO rate needs a denominator big enough to mean
          // something. A single day yields ~3-8 onboards, where 0 conversions is
          // ordinary luck rather than evidence of a broken offer.
          posthogCount('onboarding_completed', last7d),
          posthogCount('checkout_started', last7d),
          // 28-day window, used only to derive the preceding-21d baseline below.
          posthogCount('onboarding_completed', last28d),
          posthogCount('checkout_started', last28d),
        ])
      if (phSignups > 0) phRate = phCheckout / phSignups
      if (phSignups > 0) phReachRate = phOnboarded / phSignups
      if (phOnboarded > 0) phOnboardRate = phCheckout / phOnboarded
      if (phOnboarded7d > 0) phOnboardRate7d = phCheckout7d / phOnboarded7d
      // Baseline = the 21 days BEFORE the current 7d window, so the two never overlap.
      phPrevOnboarded = (phOnboarded28d ?? 0) - (phOnboarded7d ?? 0)
      phPrevCheckout  = (phCheckout28d  ?? 0) - (phCheckout7d  ?? 0)
      if (phPrevOnboarded > 0) phBaselineRate = phPrevCheckout / phPrevOnboarded
    } catch (err) {
      phErr = err.message || String(err)
      console.error('[heartbeat] PostHog error:', err)
    }
  }

  // ── Alert logic ───────────────────────────────────────────────────────────
  const reasons = []

  // Stripe: only alert when statistically meaningful
  const stripeAlert =
    (avg7d >= 0.5 && customersLast48h === 0) ||   // normally see 1+ every 2d → 0 is suspicious
    (avg14d >= 0.1 && customersLast7d === 0)       // whole week dry despite history → almost certainly broken
  if (stripeAlert && !stripeErr) {
    reasons.push(
      `ZERO new Stripe customers in 48h (7-day avg: ${avg7d.toFixed(2)}/day). ` +
      `This mirrors the 2026-05-25 trial-bypass incident. Check /app?signup=1&plan=pro&billing=weekly&trial=1 end-to-end immediately.`
    )
  }
  if (stripeErr) reasons.push(`Stripe API error: ${stripeErr}`)

  // Checkout breakage: the CTA is being pressed but no Stripe session is coming out.
  // Deliberately volume-independent — a handful of clicks that produce zero sessions is
  // never normal, and this is exactly how the 2026-05-25 trial-bypass presented.
  const checkoutBroken =
    phClicks !== null && phClicks >= MIN_CLICKS_TO_TRUST &&
    phCheckout !== null && phCheckout === 0
  if (checkoutBroken) {
    reasons.push(
      `Checkout is not starting: ${phClicks} checkout_button_clicked but 0 checkout_started in 24h` +
      (phCheckoutErr ? ` (${phCheckoutErr} checkout_error)` : '') +
      `. Users are pressing the button and no Stripe session is being created. ` +
      `Check /api/stripe logs, STRIPE_SECRET_KEY, and the price IDs. ` +
      `Note: checkout_started is emitted server-side and needs POSTHOG_API_KEY set in Vercel — ` +
      `if that env var is missing this count reads 0 even when checkout works.`
    )
  }

  // Funnel: onboarding → checkout, NOT email_confirmed (email gate is soft — bypassed by design).
  //
  // This deliberately does NOT test the rate against a fixed target. The previous version paged
  // whenever onboarded→checkout came in under 20%, but StudyEdge's actual steady-state rate is
  // nearer 5% (roughly 1 checkout per 20 onboards). A threshold the product has never met is a
  // condition that is permanently true, which makes it a KPI, not an alert — it fired every
  // morning and taught the reader to ignore the whole email. What follows tests for CHANGE:
  //   - funnelZero:       a full week with adequate traffic and not one checkout.
  //   - funnelRegression: the 7d rate collapsed to under half the preceding 21d baseline.
  // Both are suppressed when checkoutBroken already fired — same symptom, and that alert names
  // the actual cause. Absolute conversion is still reported in the email as a number to watch.
  const funnelZero =
    !checkoutBroken &&
    phOnboarded7d !== null && phOnboarded7d >= MIN_FUNNEL_DENOM &&
    phCheckout7d === 0
  if (funnelZero) {
    reasons.push(
      `Zero checkouts in 7 days: ${phOnboarded7d} users completed onboarding and not one reached ` +
      `Stripe Checkout. Walk /app?signup=1&plan=pro&billing=weekly&trial=1 end-to-end.`
    )
  }

  const funnelRegression =
    !checkoutBroken && !funnelZero &&
    phOnboarded7d !== null && phOnboarded7d >= MIN_FUNNEL_DENOM &&
    phPrevOnboarded !== null && phPrevOnboarded >= MIN_FUNNEL_DENOM &&
    phBaselineRate !== null && phBaselineRate > 0 &&
    phOnboardRate7d !== null && phOnboardRate7d < phBaselineRate * REGRESSION_FACTOR
  if (funnelRegression) {
    let hint = 'Check that Stripe Checkout is being called after the trial offer step.'
    if (phTrialSkipped !== null && phOnboarded > 0 && phTrialSkipped / phOnboarded > 0.60) {
      hint = `${Math.round(phTrialSkipped / phOnboarded * 100)}% of users who finished onboarding skipped the trial (24h) — look at the trial offer step.`
    }
    reasons.push(
      `Onboard→checkout conversion halved: ${(phOnboardRate7d * 100).toFixed(1)}% over the last 7d ` +
      `(${phCheckout7d}/${phOnboarded7d}) vs ${(phBaselineRate * 100).toFixed(1)}% over the prior 21d ` +
      `(${phPrevCheckout}/${phPrevOnboarded}). ${hint}`
    )
  }

  // ── Send email ────────────────────────────────────────────────────────────
  const isRed = reasons.length > 0
  const subject = isRed
    ? `[StudyEdge ALERT] ${reasons.length} revenue signal${reasons.length > 1 ? 's' : ''} failing`
    : `[StudyEdge OK] ${customersLast24h} new customer${customersLast24h !== 1 ? 's' : ''} today · MRR $${mrr.toFixed(0)} · ${phActiveUsers ?? '?'} DAU`

  const html = renderEmail({
    isRed, reasons,
    customersLast24h, customersLast48h, customersLast7d,
    avg7d, avg14d,
    trialsLast24h, trialsLast7d,
    activeSubCount, trialingSubCount,
    mrr, revenueLast24h,
    phSignups, phEmailConfirmed, phOnboarded, phTrialSkipped, phCheckout,
    phClicks, phCheckoutErr,
    phActiveUsers, phRate, phOnboardRate, phReachRate,
    phOnboarded7d, phCheckout7d, phOnboardRate7d,
    phPrevOnboarded, phPrevCheckout, phBaselineRate,
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
    ok: true, isRed, reasons,
    customersLast24h, customersLast48h, customersLast7d,
    avg7d, avg14d, mrr, revenueLast24h,
    trialsLast24h, trialsLast7d, activeSubCount, trialingSubCount,
    phSignups, phEmailConfirmed, phOnboarded, phTrialSkipped, phCheckout,
    phClicks, phCheckoutErr,
    phActiveUsers, phRate, phOnboardRate, phReachRate,
    phOnboarded7d, phCheckout7d, phOnboardRate7d,
    phPrevOnboarded, phPrevCheckout, phBaselineRate,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────

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

async function posthogQuery(sql) {
  const r = await fetch(`${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}` },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } }),
  })
  if (!r.ok) throw new Error(`PostHog ${r.status}: ${await r.text()}`)
  return (await r.json())?.results?.[0]?.[0] ?? 0
}

function isoSince(unixSec) {
  return new Date(unixSec * 1000).toISOString()
}

async function posthogCount(event, sinceUnixSec) {
  return Number(await posthogQuery(
    `SELECT count() FROM events WHERE event = '${event}' AND timestamp >= toDateTime('${isoSince(sinceUnixSec)}')`
  ))
}

async function posthogDistinctCount(sinceUnixSec) {
  return Number(await posthogQuery(
    `SELECT count(DISTINCT distinct_id) FROM events WHERE timestamp >= toDateTime('${isoSince(sinceUnixSec)}')`
  ))
}

// ── Email renderer ─────────────────────────────────────────────────────────

function renderEmail(d) {
  const red   = '#B91C1C'
  const green = '#059669'
  const amber = '#D97706'
  const tone  = d.isRed ? red : green
  const banner = d.isRed ? 'REVENUE SIGNAL FAILING' : 'Revenue heartbeat: healthy'

  const alertBox = d.reasons.length
    ? `<div style="background:#FEF2F2;border:1px solid #FCA5A533;border-radius:8px;padding:14px 18px;margin:16px 0 20px">
         <strong style="color:${red};font-size:14px">Action needed</strong>
         <ul style="margin:8px 0 0 18px;padding:0;color:#111;font-size:14px;line-height:1.6">
           ${d.reasons.map(r => `<li style="margin:6px 0">${escHtml(r)}</li>`).join('')}
         </ul>
       </div>`
    : ''

  const fmt = (n, dec = 0) => n == null ? '-' : typeof n === 'number' ? n.toFixed(dec) : n
  const pct = n => n == null ? '-' : `${Math.round(n * 100)}%`
  const money = n => n == null ? '-' : `$${n.toFixed(2)}`
  const color = (n, good, warn) => n == null ? '#6B6B6B' : n >= good ? green : n >= warn ? amber : red

  const row = (label, value, valueColor = '#111', indent = false) =>
    `<tr>
      <td style="padding:5px 0${indent ? ';padding-left:18px' : ''};color:${indent ? '#9B9B9B' : '#6B6B6B'};font-size:${indent ? '13px' : '14px'}">${label}</td>
      <td style="text-align:right;font-weight:${indent ? '500' : '600'};color:${valueColor};font-size:${indent ? '13px' : '14px'}">${value}</td>
    </tr>`

  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F7F6F3;margin:0;padding:24px;color:#111">
<div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:12px;padding:28px">

  <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${tone};font-weight:700;margin-bottom:4px">${banner}</div>
  <h1 style="font-size:22px;margin:4px 0 6px;color:#111;font-weight:700;letter-spacing:-0.01em">StudyEdge daily revenue check</h1>

  <!-- Hero metrics -->
  <div style="display:flex;gap:12px;margin:16px 0 20px;flex-wrap:wrap">
    <div style="flex:1;min-width:120px;background:#F9F8F5;border-radius:8px;padding:14px 16px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9B9B9B;font-weight:600">MRR</div>
      <div style="font-size:26px;font-weight:700;color:#111;margin-top:4px">$${d.mrr.toFixed(0)}</div>
    </div>
    <div style="flex:1;min-width:120px;background:#F9F8F5;border-radius:8px;padding:14px 16px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9B9B9B;font-weight:600">Active subs</div>
      <div style="font-size:26px;font-weight:700;color:#111;margin-top:4px">${d.activeSubCount}</div>
      <div style="font-size:12px;color:#9B9B9B;margin-top:2px">${d.trialingSubCount} trialing</div>
    </div>
    <div style="flex:1;min-width:120px;background:#F9F8F5;border-radius:8px;padding:14px 16px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9B9B9B;font-weight:600">DAU (24h)</div>
      <div style="font-size:26px;font-weight:700;color:#111;margin-top:4px">${d.phActiveUsers ?? '-'}</div>
    </div>
    <div style="flex:1;min-width:120px;background:#F9F8F5;border-radius:8px;padding:14px 16px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9B9B9B;font-weight:600">Revenue (24h)</div>
      <div style="font-size:26px;font-weight:700;color:#111;margin-top:4px">$${d.revenueLast24h.toFixed(0)}</div>
    </div>
  </div>

  ${alertBox}

  <h2 style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6B6B;font-weight:700;margin:24px 0 8px;border-top:1px solid rgba(0,0,0,0.07);padding-top:16px">Stripe (live)</h2>
  <table style="width:100%;border-collapse:collapse">
    ${row('New customers (24h)', fmt(d.customersLast24h), color(d.customersLast24h, 1, 0))}
    ${row('New customers (48h)', fmt(d.customersLast48h))}
    ${row('New customers (7d)', fmt(d.customersLast7d))}
    ${row('7-day avg / day', fmt(d.avg7d, 2))}
    ${row('New trials started (24h)', fmt(d.trialsLast24h), color(d.trialsLast24h, 1, 0))}
    ${row('New trials started (7d)', fmt(d.trialsLast7d))}
  </table>

  <h2 style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6B6B6B;font-weight:700;margin:24px 0 8px;border-top:1px solid rgba(0,0,0,0.07);padding-top:16px">PostHog funnel (24h)</h2>
  <table style="width:100%;border-collapse:collapse">
    ${row('signup_completed', fmt(d.phSignups))}
    ${row('↳ email_confirmed (informational — soft gate)', fmt(d.phEmailConfirmed), '#9B9B9B', true)}
    ${row('↳ onboarding_completed', fmt(d.phOnboarded), '#6B6B6B', true)}
    ${row('↳ trial_skipped', fmt(d.phTrialSkipped), '#6B6B6B', true)}
    ${row('checkout_button_clicked', fmt(d.phClicks), color(d.phClicks, 1, 0))}
    ${row('↳ checkout_error', fmt(d.phCheckoutErr), d.phCheckoutErr ? red : '#6B6B6B', true)}
    ${row('checkout_started', fmt(d.phCheckout), color(d.phCheckout, 1, 0))}
    ${row(
      'Conversion: signup → onboarded',
      pct(d.phReachRate),
      d.phReachRate == null ? '#6B6B6B' : d.phReachRate >= 0.50 ? green : d.phReachRate >= 0.30 ? amber : red
    )}
    ${row(
      'Conversion: signup → checkout',
      pct(d.phRate),
      d.phRate == null ? '#6B6B6B' : d.phRate >= 0.20 ? green : d.phRate >= 0.10 ? amber : red
    )}
    ${row(
      'Conversion: onboarded → checkout',
      pct(d.phOnboardRate),
      d.phOnboardRate == null ? '#6B6B6B' : d.phOnboardRate >= 0.30 ? green : d.phOnboardRate >= 0.15 ? amber : red
    )}
    ${row(
      `Conversion: onboarded → checkout (7d, ${fmt(d.phCheckout7d)}/${fmt(d.phOnboarded7d)})`,
      pct(d.phOnboardRate7d),
      '#111'
    )}
    ${row(
      `↳ baseline, prior 21d (${fmt(d.phPrevCheckout)}/${fmt(d.phPrevOnboarded)}) — alert compares against this`,
      pct(d.phBaselineRate),
      '#9B9B9B',
      true
    )}
  </table>

  <p style="font-size:12px;color:#9B9B9B;margin-top:6px;line-height:1.5">
    ℹ️ email_confirmed is shown for reference only. The app uses a soft email gate — users reach onboarding without confirming, so this count is intentionally low.
    <br>Conversion is reported, not alerted on against a fixed target — the funnel alert fires only when a full 7d with ${MIN_FUNNEL_DENOM}+ onboards produces zero checkouts, or when the 7d rate falls below half its prior-21d baseline.
    Breakage is caught separately and immediately: ${MIN_CLICKS_TO_TRUST}+ checkout_button_clicked with 0 checkout_started pages regardless of volume.
  </p>

  ${d.phErr ? `<p style="color:${red};font-size:12px;margin:8px 0 0">PostHog query failed: ${escHtml(d.phErr)}</p>` : ''}

  <p style="color:#9B9B9B;font-size:11px;margin-top:20px;border-top:1px solid rgba(0,0,0,0.07);padding-top:12px">
    Generated ${d.generatedAt} · api/daily-revenue-heartbeat.js
  </p>
</div>
</body></html>`
}

function escHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
