import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// REVENUE-CRITICAL REGRESSION GUARD.
//
// The 7-day free trial silently shipped on the Unlimited price ($4.99/wk) while
// the trial only ever granted PRO_LIMITS and getActivePlan() reported 'pro'.
// Users were being billed for a tier they never had access to, and every trial
// CTA in the app said "Pro" while sending them to a Stripe page titled
// "StudyEdge Unlimited". These tests lock the trial to Pro/weekly.
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

  it('bills the trial weekly', () => {
    expect(subscription.TRIAL_BILLING_PERIOD).toBe('weekly')
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

  it('activateTrial POSTs plan=pro, billingPeriod=weekly, trial=true', async () => {
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
    expect(body.billingPeriod).toBe('weekly')
    expect(body.trial).toBe(true)

    // REVENUE-CRITICAL. /api/stripe rejects any request carrying a userId that
    // does not present a matching Bearer token, so a checkout call that forgets
    // this header is not a degraded experience, it is a 401 on every upgrade.
    expect(checkoutCall[1].headers.Authorization).toBe('Bearer test-token')
  })
})
