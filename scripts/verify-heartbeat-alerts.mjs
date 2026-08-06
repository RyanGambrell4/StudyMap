// Verifies the funnel alert thresholds in api/daily-revenue-heartbeat.js.
//
// Run: node scripts/verify-heartbeat-alerts.mjs
//
// The decide() function below mirrors the cron's alert logic so the thresholds can be
// exercised against real scenarios without hitting PostHog or Stripe. If you change the
// alert conditions in the cron, change them here too and re-run — the scenarios encode
// why each threshold is where it is, including the 2026-08-06 cry-wolf incident where a
// fixed 20% conversion target fired every morning against a product whose true rate is ~5%.
const MIN_FUNNEL_DENOM = 20
const MIN_CLICKS_TO_TRUST = 3
const REGRESSION_FACTOR = 0.5

function decide({ phClicks, phCheckout, phOnboarded7d, phCheckout7d, phOnboarded28d, phCheckout28d }) {
  const phOnboardRate7d = phOnboarded7d > 0 ? phCheckout7d / phOnboarded7d : null
  const phPrevOnboarded = phOnboarded28d - phOnboarded7d
  const phPrevCheckout = phCheckout28d - phCheckout7d
  const phBaselineRate = phPrevOnboarded > 0 ? phPrevCheckout / phPrevOnboarded : null

  const checkoutBroken =
    phClicks !== null && phClicks >= MIN_CLICKS_TO_TRUST &&
    phCheckout !== null && phCheckout === 0

  const funnelZero =
    !checkoutBroken &&
    phOnboarded7d !== null && phOnboarded7d >= MIN_FUNNEL_DENOM &&
    phCheckout7d === 0

  const funnelRegression =
    !checkoutBroken && !funnelZero &&
    phOnboarded7d !== null && phOnboarded7d >= MIN_FUNNEL_DENOM &&
    phPrevOnboarded !== null && phPrevOnboarded >= MIN_FUNNEL_DENOM &&
    phBaselineRate !== null && phBaselineRate > 0 &&
    phOnboardRate7d !== null && phOnboardRate7d < phBaselineRate * REGRESSION_FACTOR

  return { checkoutBroken, funnelZero, funnelRegression, paged: checkoutBroken || funnelZero || funnelRegression }
}

const cases = [
  {
    name: "This morning's alert: steady ~5% conversion, quiet 24h",
    input: { phClicks: 0, phCheckout: 0, phOnboarded7d: 21, phCheckout7d: 1, phOnboarded28d: 84, phCheckout28d: 4 },
    expectPaged: false,
    why: '5% is this product\'s normal rate, not a failure; nothing changed week over week',
  },
  {
    name: 'Trial-bypass incident: users click CTA, no Stripe session created',
    input: { phClicks: 12, phCheckout: 0, phOnboarded7d: 60, phCheckout7d: 0, phOnboarded28d: 240, phCheckout28d: 9 },
    expectPaged: true,
    why: 'clicks producing zero sessions is never normal - must still page',
  },
  {
    name: 'Trial-bypass at LOW volume (3 clicks, 0 sessions)',
    input: { phClicks: 3, phCheckout: 0, phOnboarded7d: 8, phCheckout7d: 0, phOnboarded28d: 30, phCheckout28d: 1 },
    expectPaged: true,
    why: 'breakage detection is deliberately volume-independent',
  },
  {
    name: 'Silent breakage: a whole week with traffic and zero checkouts',
    input: { phClicks: 0, phCheckout: 0, phOnboarded7d: 40, phCheckout7d: 0, phOnboarded28d: 160, phCheckout28d: 6 },
    expectPaged: true,
    why: 'never happened before at this volume; 0/40 against a 5% baseline is real',
  },
  {
    name: 'Conversion collapses from 8% to 2% (regression)',
    input: { phClicks: 5, phCheckout: 1, phOnboarded7d: 50, phCheckout7d: 1, phOnboarded28d: 200, phCheckout28d: 13 },
    expectPaged: true,
    why: '2% vs 8% baseline is a halving and then some',
  },
  {
    name: 'Healthy steady state at a modest but stable rate',
    input: { phClicks: 6, phCheckout: 2, phOnboarded7d: 50, phCheckout7d: 3, phOnboarded28d: 200, phCheckout28d: 12 },
    expectPaged: false,
    why: '6% vs 6% baseline - flat, nothing to report',
  },
  {
    name: 'Conversion IMPROVES week over week',
    input: { phClicks: 9, phCheckout: 3, phOnboarded7d: 50, phCheckout7d: 8, phOnboarded28d: 200, phCheckout28d: 17 },
    expectPaged: false,
    why: 'good news must never page',
  },
  {
    name: 'Low weekly volume, zero conversions (below denominator gate)',
    input: { phClicks: 1, phCheckout: 0, phOnboarded7d: 12, phCheckout7d: 0, phOnboarded28d: 50, phCheckout28d: 2 },
    expectPaged: false,
    why: '0/12 cannot distinguish a 5% funnel from a broken one',
  },
  {
    name: 'OLD BEHAVIOR REGRESSION CHECK: 0/3 onboards in 24h',
    input: { phClicks: 0, phCheckout: 0, phOnboarded7d: 3, phCheckout7d: 0, phOnboarded28d: 12, phCheckout28d: 1 },
    expectPaged: false,
    why: 'this is the exact sample that paged every morning',
  },
  {
    name: 'Brand new project, no baseline history yet',
    input: { phClicks: 2, phCheckout: 1, phOnboarded7d: 25, phCheckout7d: 1, phOnboarded28d: 25, phCheckout28d: 1 },
    expectPaged: false,
    why: 'no prior period to compare against - must not page on a null baseline',
  },
]

let failed = 0
for (const c of cases) {
  const r = decide(c.input)
  const ok = r.paged === c.expectPaged
  if (!ok) failed++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  paged=${String(r.paged).padEnd(5)} ` +
    `(broken=${String(r.checkoutBroken).padEnd(5)} zero=${String(r.funnelZero).padEnd(5)} regr=${String(r.funnelRegression).padEnd(5)})  ${c.name}`
  )
  if (!ok) console.log(`      expected paged=${c.expectPaged} because ${c.why}`)
}
console.log(failed === 0 ? '\nAll scenarios behave as intended.' : `\n${failed} scenario(s) FAILED.`)
process.exit(failed === 0 ? 0 : 1)
