/**
 * androidPurchaseGate.test.js — the Play build must not be able to sell.
 *
 * Google Play's Payments policy bans both processing a digital subscription
 * outside Play Billing and linking users out to an external purchase flow.
 * The UI hides every upgrade entry point, but UI gating is exactly the kind of
 * thing that rots: someone adds a new upsell banner in six months, forgets the
 * flag, and the violation ships silently.
 *
 * So the guarantee is enforced at the choke point instead. Every purchase in
 * this app funnels through createCheckoutSession (activateTrial calls it too),
 * and these tests assert it refuses when the build cannot purchase. If someone
 * adds a new CTA and forgets the flag, the request still dies here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// subscription.js imports supabase at module scope, which throws when the env
// vars are absent. Same stubs the existing subscription suites use.
vi.mock('./supabase', () => ({ supabase: {}, getAccessToken: async () => null }))
vi.mock('./analytics', () => ({ track: vi.fn(), identify: vi.fn() }))

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  vi.resetModules()
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve({ url: 'https://checkout.stripe.com/pay/evil' }) })
  )
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('purchase gate on a no-purchase build', () => {
  it('createCheckoutSession never reaches the network', async () => {
    vi.doMock('./platform', () => ({ CAN_PURCHASE_IN_APP: false, IS_ANDROID_BUILD: true }))
    const { createCheckoutSession } = await import('./subscription')

    const result = await createCheckoutSession('pro', 'monthly', 'a@b.com', 'uid')

    expect(result).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('activateTrial cannot start a paid trial either', async () => {
    vi.doMock('./platform', () => ({ CAN_PURCHASE_IN_APP: false, IS_ANDROID_BUILD: true }))
    const sub = await import('./subscription')
    sub.initSubscription('uid', {
      plan: 'free', status: 'active', trial_activated: false, trial_start_date: null,
    })

    const result = await sub.activateTrial('uid', 'a@b.com')

    // Null rather than a URL is what the callers check before assigning
    // window.location.href, so a null here is what stops the navigation.
    expect(result).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns null rather than throwing, so callers do not navigate to "null"', async () => {
    vi.doMock('./platform', () => ({ CAN_PURCHASE_IN_APP: false, IS_ANDROID_BUILD: true }))
    const { createCheckoutSession } = await import('./subscription')

    // DashboardView, AccountView and App.jsx all guard with `if (!url) return`.
    // A thrown error would skip that guard in the non-try paths, and a truthy
    // sentinel would navigate somewhere wrong. Null is the contract.
    await expect(createCheckoutSession('pro', 'monthly', 'a@b.com', 'uid')).resolves.toBeNull()
  })
})

describe('purchase gate on the web build', () => {
  it('createCheckoutSession still reaches the network', async () => {
    vi.doMock('./platform', () => ({ CAN_PURCHASE_IN_APP: true, IS_ANDROID_BUILD: false }))
    const { createCheckoutSession } = await import('./subscription')

    await createCheckoutSession('pro', 'monthly', 'a@b.com', 'uid')

    // The point of the gate is that it is target-specific, not a global kill
    // switch. If this ever fails, the web build has stopped being able to sell.
    expect(globalThis.fetch).toHaveBeenCalled()
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/stripe')
  })
})
