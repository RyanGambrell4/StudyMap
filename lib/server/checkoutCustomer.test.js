import { describe, it, expect } from 'vitest'
import {
  normalizeCustomerId,
  resolveCheckoutCustomer,
  customerSessionArgs,
  hasLiveSubscription,
  selectPreferredCustomer,
  buildCustomerPatch,
} from './checkoutCustomer.js'

/**
 * Regression guard for the duplicate-customer bug. Checkout passed
 * `customer_email`, which makes Stripe create a new Customer per session:
 * Tyler Venegas ended up with 2 customer records and was double-billed $12.99
 * on the same day; Armend Demiri ended up with 4.
 */
describe('normalizeCustomerId', () => {
  it('accepts a real customer id', () => {
    expect(normalizeCustomerId('cus_UsAmdhCTmjdguJ')).toBe('cus_UsAmdhCTmjdguJ')
  })

  it('rejects anything that is not a cus_ string', () => {
    for (const bad of [null, undefined, '', 'cus_', 'sub_123', 'acct_1', 42, {}, []]) {
      expect(normalizeCustomerId(bad)).toBeNull()
    }
  })
})

describe('resolveCheckoutCustomer', () => {
  it('prefers the id already stored on the user row', () => {
    const r = resolveCheckoutCustomer({ storedId: 'cus_stored', lookupId: 'cus_lookup' })
    expect(r).toEqual({ customerId: 'cus_stored', source: 'stored' })
  })

  it('falls back to an email lookup when nothing is stored', () => {
    const r = resolveCheckoutCustomer({ storedId: null, lookupId: 'cus_lookup' })
    expect(r).toEqual({ customerId: 'cus_lookup', source: 'lookup' })
  })

  it('ignores a malformed stored id rather than passing it to Stripe', () => {
    // A bad `customer` value makes Stripe reject the session outright, which
    // would block a paying user. Falling through is strictly safer.
    const r = resolveCheckoutCustomer({ storedId: 'garbage', lookupId: 'cus_lookup' })
    expect(r).toEqual({ customerId: 'cus_lookup', source: 'lookup' })
  })

  it('reports none when there is nothing to reuse (genuine first checkout)', () => {
    expect(resolveCheckoutCustomer({ storedId: null, lookupId: null }))
      .toEqual({ customerId: null, source: 'none' })
  })
})

describe('customerSessionArgs', () => {
  it('never sets both customer and customer_email', () => {
    for (const args of [
      customerSessionArgs({ customerId: 'cus_x', userEmail: 'a@b.com' }),
      customerSessionArgs({ customerId: null, userEmail: 'a@b.com' }),
      customerSessionArgs({ customerId: null, userEmail: null }),
    ]) {
      const keys = Object.keys(args)
      expect(keys).toHaveLength(1)
      expect(keys).not.toEqual(expect.arrayContaining(['customer', 'customer_email']))
    }
  })

  it('attaches to the existing customer when we have one', () => {
    expect(customerSessionArgs({ customerId: 'cus_x', userEmail: 'a@b.com' }))
      .toEqual({ customer: 'cus_x' })
  })

  it('this is the exact call shape that caused the bug, and it now only happens with no known customer', () => {
    expect(customerSessionArgs({ customerId: null, userEmail: 'venegas.tyler@gmail.com' }))
      .toEqual({ customer_email: 'venegas.tyler@gmail.com' })
  })

  it('a repeat checkout for a known customer no longer mints a new record', () => {
    // The scenario that double-billed Tyler: second checkout, same email.
    const first = customerSessionArgs({ customerId: null, userEmail: 'venegas.tyler@gmail.com' })
    expect(first).toEqual({ customer_email: 'venegas.tyler@gmail.com' })

    const { customerId } = resolveCheckoutCustomer({ storedId: null, lookupId: 'cus_USXvN3kE3CtB8J' })
    const second = customerSessionArgs({ customerId, userEmail: 'venegas.tyler@gmail.com' })
    expect(second).toEqual({ customer: 'cus_USXvN3kE3CtB8J' })
    expect(second.customer_email).toBeUndefined()
  })
})

describe('hasLiveSubscription', () => {
  it('counts the statuses that are still billing', () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid']) {
      expect(hasLiveSubscription([{ status }])).toBe(true)
    }
  })

  it('does not count dead records', () => {
    expect(hasLiveSubscription([{ status: 'canceled' }, { status: 'incomplete_expired' }])).toBe(false)
  })

  it('survives an empty or missing list', () => {
    for (const bad of [[], null, undefined, 'nope']) {
      expect(hasLiveSubscription(bad)).toBe(false)
    }
  })
})

describe('selectPreferredCustomer', () => {
  it('prefers the record that actually holds a live subscription', () => {
    // Stripe returns newest first, so this is the ordering the API gives us:
    // the empty record minted by the latest abandoned checkout comes first.
    const chosen = selectPreferredCustomer([
      { id: 'cus_newest_empty', hasLiveSubscription: false },
      { id: 'cus_older_paying', hasLiveSubscription: true },
    ])
    expect(chosen).toBe('cus_older_paying')
  })

  it('falls back to newest when none of the duplicates are billing', () => {
    // Armend Demiri: four records, same email, none with a live subscription.
    const chosen = selectPreferredCustomer([
      { id: 'cus_a', hasLiveSubscription: false },
      { id: 'cus_b', hasLiveSubscription: false },
      { id: 'cus_c', hasLiveSubscription: false },
      { id: 'cus_d', hasLiveSubscription: false },
    ])
    expect(chosen).toBe('cus_a')
  })

  it('skips malformed ids rather than handing one to Stripe', () => {
    expect(selectPreferredCustomer([{ id: 'garbage' }, { id: 'cus_real' }])).toBe('cus_real')
  })

  it('returns null when there is nothing usable', () => {
    for (const bad of [[], null, undefined, [{ id: null }]]) {
      expect(selectPreferredCustomer(bad)).toBeNull()
    }
  })
})

describe('buildCustomerPatch', () => {
  it('adds the customer id to an existing subscription without dropping fields', () => {
    const patch = buildCustomerPatch(
      { plan: 'free', status: 'active', feature_usage: { ai: 3 } },
      'cus_x',
    )
    expect(patch).toEqual({
      plan: 'free',
      status: 'active',
      feature_usage: { ai: 3 },
      stripeCustomerId: 'cus_x',
    })
  })

  it('refuses to write a partial row when there is no subscription yet', () => {
    // initSubscription does `subFromDb ?? DEFAULT_SUB` and never merges, so
    // { stripeCustomerId } alone would read back as plan: undefined. NULL reads
    // back as the full defaults, so writing nothing is the safer answer.
    for (const empty of [null, undefined, 'string', 42, []]) {
      expect(buildCustomerPatch(empty, 'cus_x')).toBeNull()
    }
  })

  it('refuses a malformed customer id', () => {
    expect(buildCustomerPatch({ plan: 'free' }, 'garbage')).toBeNull()
    expect(buildCustomerPatch({ plan: 'free' }, null)).toBeNull()
  })

  it('overwrites a stale customer id rather than keeping both', () => {
    const patch = buildCustomerPatch({ plan: 'pro', stripeCustomerId: 'cus_old' }, 'cus_new')
    expect(patch.stripeCustomerId).toBe('cus_new')
  })
})
