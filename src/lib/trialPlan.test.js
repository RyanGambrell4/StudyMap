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

  it('treats the first 401 as recoverable rather than a dead button', async () => {
    // The endpoint 401s the checkout path only when no Authorization header was
    // sent; an invalid one returns 403. So this fires on a current bundle whose
    // session expired or had not hydrated — one reload is the right answer.
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { track } = await import('./analytics')
    const result = await subscription.createCheckoutSession(
      'pro',
      'weekly',
      'student@example.com',
      '00000000-0000-4000-8000-000000000000',
    )

    // Not null: null is the generic-error contract and would render
    // "Checkout failed" at the exact moment we are fixing it for them.
    expect(result).toBe(subscription.STALE_BUNDLE)
    expect(result.staleBundle).toBe(true)

    const staleEvent = track.mock.calls.find(
      ([name, props]) => name === 'checkout_error' && props?.reason === 'stale_bundle_401',
    )
    expect(staleEvent, 'a 401 must be reported as stale_bundle_401').toBeTruthy()

    // sendBeacon, or the reload cancels the batched XHR and the event that
    // tells us how often this happens is the one we never receive.
    expect(staleEvent[2]).toMatchObject({ transport: 'sendBeacon' })
  })

  it('does not reload twice: a second 401 surfaces the error instead of looping', async () => {
    // Reloading cannot mint a session that does not exist. Without this guard an
    // expired user would spin the page on every upgrade click, forever.
    const store = new Map()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => store.set(k, String(v)),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    })))

    const { track } = await import('./analytics')
    const args = ['pro', 'weekly', 'student@example.com', '00000000-0000-4000-8000-000000000000']

    const first = await subscription.createCheckoutSession(...args)
    expect(first).toBe(subscription.STALE_BUNDLE)

    const second = await subscription.createCheckoutSession(...args)
    expect(second, 'the second 401 must fall through to the normal error path').toBeNull()

    const repeat = track.mock.calls.find(
      ([name, props]) => name === 'checkout_error' && props?.reason === 'stale_bundle_401_repeat',
    )
    expect(repeat, 'a repeat 401 must be distinguishable in analytics').toBeTruthy()
  })
})
