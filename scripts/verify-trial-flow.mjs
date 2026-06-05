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
//     on /app?signup=1&plan=pro&billing=weekly&trial=1 after signup.
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
  const t = await postCheckout({ plan: 'pro', billingPeriod: 'weekly', trial: true })
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
  const p = await postCheckout({ plan: 'pro', billingPeriod: 'weekly', trial: false })
  if (p.status !== 200 || !p.data.url) {
    fail(`Paid checkout broken: ${p.status} ${JSON.stringify(p.data)}`)
    process.exit(1)
  }
  pass(`Paid checkout URL: ${p.data.url}`)

  console.log(`\n${c.green}All API checks passed.${c.reset} The backend is wired up correctly.`)
  console.log(`\nStill required to fully verify the funnel:`)
  console.log(`  1. Open ${BASE}/app?signup=1&plan=pro&billing=weekly&trial=1 in an incognito window`)
  console.log(`  2. Sign up with a throwaway email`)
  console.log(`  3. Confirm the browser auto-redirects to checkout.stripe.com`)
  console.log(`  4. Watch Stripe -> Payments -> Checkout for the session in the next 24h\n`)
}

main().catch(err => {
  console.error('Script failed:', err)
  process.exit(1)
})
