#!/usr/bin/env node
// Verifies the trial -> Stripe Checkout flow in production.
//
// What this PROVES:
//   - /api/stripe accepts a trial:true POST and returns a real
//     Stripe Checkout URL.
//   - That URL is reachable and renders with trial language.
//
// What this DOES NOT PROVE:
//   - That the React app actually calls /api/stripe when a user lands
//     on /app?signup=1&plan=pro&billing=monthly&trial=1 after signup.
//     The fix in src/App.jsx (commit 3e785a4) is what makes that
//     happen; only a real signup in an incognito browser exercises it.
//
// Usage:
//   node scripts/verify-trial-flow.mjs
//   node scripts/verify-trial-flow.mjs --base=https://getstudyedge.com
//   node scripts/verify-trial-flow.mjs --base=http://localhost:3000

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? true]
}))
const BASE = args.base || 'https://getstudyedge.com'
const TEST_EMAIL = args.email || `trial-verify+${Date.now()}@getstudyedge.com`
const TEST_USER_ID = args.userId || crypto.randomUUID()

// ── This script transacts. Treat it accordingly. ────────────────────────────
//
// Every run POSTs twice to /api/stripe, and that endpoint holds sk_live_. So
// every run creates two REAL Stripe Checkout Sessions in LIVE MODE. There is
// no test-mode path here and there never was: production has one Stripe key.
//
// Between 2026-06-09 and 2026-09-06 a GitHub Actions schedule ran this four to
// six times a day, 464 times, creating roughly 906 live sessions. Nothing was
// charged, because nobody completes them, but they became 85% of recent
// checkout volume and silently poisoned every conversion rate computed from
// Stripe.
//
// The guard below is the thing that was missing. A script that spends money,
// or that manufactures records indistinguishable from customer behaviour, has
// to be hard to run by accident. Pointing it at localhost is free; pointing it
// at production now requires saying so out loud.
const IS_LIVE = /getstudyedge\.com/.test(BASE)
const FORCED = process.env.ALLOW_LIVE_CHECKOUT === 'CREATE-LIVE-SESSIONS' || args.allowLive === true

if (IS_LIVE && !FORCED) {
  console.error(`
Refusing to run against ${BASE}.

This creates two REAL Stripe Checkout Sessions in LIVE MODE, one per POST, using
the email ${TEST_EMAIL}. It ran on a 6-hourly schedule from
2026-06-09 to 2026-09-06 and produced ~906 of them, which is most of the
checkout volume in that period and the reason every funnel number from Stripe
was wrong.

If you genuinely need this against production:
  ALLOW_LIVE_CHECKOUT=CREATE-LIVE-SESSIONS node scripts/verify-trial-flow.mjs

and afterwards exclude trial-verify+*@getstudyedge.com from any analysis.

Against a local server, no confirmation needed:
  node scripts/verify-trial-flow.mjs --base=http://localhost:3000
`)
  process.exit(2)
}

const c = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', reset: '\x1b[0m' }
const pass = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`)
const fail = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`)
const dim  = (msg) => console.log(`${c.dim}${msg}${c.reset}`)

async function postCheckout({ plan, billingPeriod, trial }) {
  const res = await fetch(`${BASE}/api/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, billingPeriod, userEmail: TEST_EMAIL, userId: TEST_USER_ID, trial }),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function main() {
  console.log(`\nVerifying trial -> Stripe flow against ${BASE}\n`)
  dim(`Test email:   ${TEST_EMAIL}`)
  dim(`Test user id: ${TEST_USER_ID}\n`)

  // 1) Trial checkout should return a Stripe URL
  console.log('1) POST /api/stripe with trial=true')
  const t = await postCheckout({ plan: 'pro', billingPeriod: 'monthly', trial: true })
  if (t.status !== 200 || !t.data.url) {
    fail(`Expected 200 + checkout URL, got ${t.status} ${JSON.stringify(t.data)}`)
    fail('Trial checkout endpoint is broken. This is the #1 thing to fix.')
    process.exit(1)
  }
  if (!t.data.url.startsWith('https://checkout.stripe.com/')) {
    fail(`Endpoint returned a non-Stripe URL: ${t.data.url}`)
    process.exit(1)
  }
  pass(`Trial checkout URL created: ${t.data.url}`)

  // 2) The URL actually loads + mentions trial language
  console.log('\n2) Fetching the Stripe Checkout URL')
  const page = await fetch(t.data.url, { redirect: 'follow' })
  if (page.status !== 200) {
    fail(`Stripe page returned ${page.status}`)
    process.exit(1)
  }
  pass(`Stripe page loaded (${page.status})`)
  const html = await page.text()
  if (/trial|free for|3.day|3-day/i.test(html)) pass('Page mentions trial language')
  else fail('Page did NOT mention trial — Stripe may not be applying trial_period_days')

  // 3) Paid (non-trial) checkout baseline
  console.log('\n3) POST /api/stripe with trial=false (baseline)')
  const p = await postCheckout({ plan: 'pro', billingPeriod: 'monthly', trial: false })
  if (p.status !== 200 || !p.data.url) {
    fail(`Paid checkout broken: ${p.status} ${JSON.stringify(p.data)}`)
    process.exit(1)
  }
  pass(`Paid checkout URL: ${p.data.url}`)

  console.log(`\n${c.green}All API checks passed.${c.reset} The backend is wired up correctly.`)
  console.log(`\nStill required to fully verify the funnel:`)
  console.log(`  1. Open ${BASE}/app?signup=1&plan=pro&billing=monthly&trial=1 in an incognito window`)
  console.log(`  2. Sign up with a throwaway email`)
  console.log(`  3. Confirm the browser auto-redirects to checkout.stripe.com`)
  console.log(`  4. Watch Stripe -> Payments -> Checkout for the session in the next 24h\n`)
}

main().catch(err => {
  console.error('Script failed:', err)
  process.exit(1)
})
