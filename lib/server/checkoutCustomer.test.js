import { describe, it, expect } from 'vitest'
import {
  normalizeCustomerId,
  resolveCheckoutCustomer,
  customerSessionArgs,
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
