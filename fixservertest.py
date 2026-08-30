import io, sys

p = "lib/server/trialPlan.test.js"
s = io.open(p, encoding="utf-8").read()

E = [
 ("  it('bills the trial as Pro weekly, never Unlimited', () => {",
  "  it('bills the trial as Pro monthly, never Unlimited', () => {"),
 ("    expect(TRIAL_BILLING_PERIOD).toBe('weekly')",
  "    expect(TRIAL_BILLING_PERIOD).toBe('monthly')"),

 # A stale unlimited/weekly trial request: both the plan AND the retired period
 # get corrected, so the expected result is pro/monthly.
 ("  it('forces a stale unlimited/weekly trial request to pro/weekly', () => {\n"
  "    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'weekly', trial: true })\n"
  "    expect(r).toEqual({ plan: 'pro', billingPeriod: 'weekly', wantsTrial: true, coerced: true })",
  "  it('forces a stale unlimited/weekly trial request to pro/monthly', () => {\n"
  "    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'weekly', trial: true })\n"
  "    expect(r).toEqual({ plan: 'pro', billingPeriod: 'monthly', wantsTrial: true, coerced: true })"),

 ("])('forces a %s/%s trial request to pro/weekly', (plan, billingPeriod) => {",
  "])('forces a %s/%s trial request to pro/monthly', (plan, billingPeriod) => {"),
 ("    expect(r.billingPeriod).toBe('weekly')\n  })\n\n  it('leaves an already-correct",
  "    expect(r.billingPeriod).toBe('monthly')\n  })\n\n  it('leaves an already-correct"),

 ("  it('leaves an already-correct pro/weekly trial untouched and flags no coercion', () => {\n"
  "    const r = resolveCheckoutPlan({ plan: 'pro', billingPeriod: 'weekly', trial: true })\n"
  "    expect(r).toEqual({ plan: 'pro', billingPeriod: 'weekly', wantsTrial: true, coerced: false })",
  "  it('leaves an already-correct pro/monthly trial untouched and flags no coercion', () => {\n"
  "    const r = resolveCheckoutPlan({ plan: 'pro', billingPeriod: 'monthly', trial: true })\n"
  "    expect(r).toEqual({ plan: 'pro', billingPeriod: 'monthly', wantsTrial: true, coerced: false })"),

 ("  it('forces pro/weekly even when the plan is garbage or missing', () => {",
  "  it('forces pro/monthly even when the plan is garbage or missing', () => {"),
 ("      const r = resolveCheckoutPlan({ plan, billingPeriod: 'weekly', trial: true })",
  "      const r = resolveCheckoutPlan({ plan, billingPeriod: 'monthly', trial: true })"),
 ("      expect(r.billingPeriod).toBe('weekly')",
  "      expect(r.billingPeriod).toBe('monthly')"),

 # A non-trial request naming a retired period is now converted, not passed
 # through untouched. That is the whole point of the change.
 ("    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'weekly', trial: false })\n"
  "    expect(r).toEqual({ plan: 'unlimited', billingPeriod: 'weekly', wantsTrial: false, coerced: false })",
  "    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'monthly', trial: false })\n"
  "    expect(r).toEqual({ plan: 'unlimited', billingPeriod: 'monthly', wantsTrial: false, coerced: false })"),
]

bad = []
for old, new in E:
    if s.count(old) != 1:
        bad.append(f"{s.count(old)} matches: {old[:70]!r}")
        continue
    s = s.replace(old, new, 1)
if bad:
    print("FAILED:", *bad, sep="\n  "); sys.exit(1)

s += '''

/**
 * A retired period on a NON-trial purchase is converted, not honoured.
 *
 * Weekly is no longer sold. Old links, old emails and cached bundles still ask
 * for it, so the server rewrites the request to monthly rather than either
 * selling a retired price or failing the checkout outright.
 */
describe('resolveCheckoutPlan — retired periods on direct purchases', () => {
  it('converts a weekly Unlimited purchase to monthly and flags it', () => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'weekly', trial: false })
    expect(r).toEqual({ plan: 'unlimited', billingPeriod: 'monthly', wantsTrial: false, coerced: true })
  })

  it('converts semester too', () => {
    const r = resolveCheckoutPlan({ plan: 'pro', billingPeriod: 'semester', trial: false })
    expect(r.billingPeriod).toBe('monthly')
    expect(r.coerced).toBe(true)
  })

  it('leaves yearly alone', () => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'yearly', trial: false })
    expect(r).toEqual({ plan: 'unlimited', billingPeriod: 'yearly', wantsTrial: false, coerced: false })
  })
})
'''
io.open(p, "w", encoding="utf-8").write(s)
print(f"server trial test: {len(E)} edits + retired-period coverage")
