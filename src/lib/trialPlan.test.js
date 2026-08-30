import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// REVENUE-CRITICAL REGRESSION GUARD.
//
// The 7-day free trial silently shipped on the Unlimited price ($4.99/wk) while
// the trial only ever granted PRO_LIMITS and getActivePlan() reported 'pro'.
// Users were being billed for a tier they never had access to, and every trial
// CTA in the app said "Pro" while sending them to a Stripe page titled
// "StudyEdge Unlimited". These tests lock the trial to Pro/monthly.
//
// Monthly, not weekly: the trial used to convert to Pro WEEKLY at $2.99, and
// Stripe's own hosted page said "7 days free, then $2.99 per week". A weekly
// charge against a student debit card is what killed the only real
// subscription this product has had - $2.99 cleared once, then three declines
// inside two minutes. Weekly is retired as a sellable period.
//
// If one of these fails, do NOT relax the assertion — fix the caller.

vi.mock('./supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
  getAccessToken: async () => 'test-token',
}))
vi.mock('./analytics', () => ({ track: vi.fn() }))

describe('trial plan invariants', () => {
  let subscription

  beforeEach(async () => {
    vi.resetModules()
    subscription = await import('./subscription')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('bills the trial on Pro, never Unlimited', () => {
    expect(subscription.TRIAL_PLAN).toBe('pro')
  })

  it('bills the trial monthly, never weekly', () => {
    expect(subscription.TRIAL_BILLING_PERIOD).toBe('monthly')
  })

  it('grants exactly the Pro limits during the trial', () => {
    // The tier the user is billed for must match the tier they actually get.
    expect(subscription.TRIAL_LIMITS).toBe(subscription.PRO_LIMITS)
    expect(subscription.TRIAL_LIMITS).not.toBe(subscription.UNLIMITED_LIMITS)
  })

  it('runs for 7 days', () => {
    expect(subscription.TRIAL_DURATION_DAYS).toBe(7)
    expect(subscription.TRIAL_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('activateTrial POSTs plan=pro, billingPeriod=monthly, trial=true', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const url = await subscription.activateTrial(
      '00000000-0000-4000-8000-000000000000',
      'student@example.com',
    )

    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test_123')

    const checkoutCall = fetchMock.mock.calls.find(([endpoint]) => String(endpoint).includes('/api/stripe'))
    expect(checkoutCall, 'activateTrial should call /api/stripe').toBeTruthy()

    const body = JSON.parse(checkoutCall[1].body)
    expect(body.plan).toBe('pro')
    expect(body.billingPeriod).toBe('monthly')
    expect(body.trial).toBe(true)
  })
})


/**
 * Retired billing periods convert; they do not fail.
 *
 * Weekly and semester are no longer sold, but they are still all over the
 * estate: 85 files carried `billing=weekly` links, every lifecycle email ever
 * sent carries one, and cached PWA bundles keep sending them for days after a
 * deploy. Rejecting a retired period would turn a pricing change into a broken
 * checkout for exactly the people most likely to buy, so it is coerced to
 * monthly and flagged instead.
 */
describe('retired billing periods', () => {
  let resolveCheckoutPlan

  beforeEach(async () => {
    ;({ resolveCheckoutPlan } = await import('../../lib/server/trialPlan.js'))
  })

  it('converts weekly to monthly rather than rejecting it', () => {
    const r = resolveCheckoutPlan({ plan: 'pro', billingPeriod: 'weekly', trial: false })
    expect(r.billingPeriod).toBe('monthly')
    expect(r.coerced, 'a converted period must be reported').toBe(true)
  })

  it('converts semester to monthly too', () => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'semester', trial: false })
    expect(r.billingPeriod).toBe('monthly')
    expect(r.coerced).toBe(true)
  })

  it('still maps the legacy annual alias to yearly', () => {
    const r = resolveCheckoutPlan({ plan: 'pro', billingPeriod: 'annual', trial: false })
    expect(r.billingPeriod).toBe('yearly')
  })

  it('leaves a period we actually sell alone', () => {
    for (const period of ['monthly', 'yearly']) {
      const r = resolveCheckoutPlan({ plan: 'pro', billingPeriod: period, trial: false })
      expect(r.billingPeriod).toBe(period)
      expect(r.coerced).toBe(false)
    }
  })

  it('a weekly trial request still lands on Pro monthly', () => {
    const r = resolveCheckoutPlan({ plan: 'unlimited', billingPeriod: 'weekly', trial: true })
    expect(r.plan).toBe('pro')
    expect(r.billingPeriod).toBe('monthly')
    expect(r.wantsTrial).toBe(true)
    expect(r.coerced).toBe(true)
  })
})
