/**
 * The tokenless checkout path, and the one thing it is never allowed to do.
 *
 * Background. `subscription.stripeCustomerId` is a capability key:
 * create-portal-session opens a Stripe Billing Portal for whatever id sits on
 * the user row, and the referral path credits money to it. Writing that field
 * from an unauthenticated request is therefore an unauthenticated read of
 * someone else's invoices, billing address and card last-4.
 *
 * The first attempt to close that hole rejected every tokenless checkout with a
 * 401. It worked, and it also broke a revenue path that demonstrably takes
 * money: this app serves navigations from a service-worker precache, ships
 * several deploys a day, and students leave tabs open for days, so a large share
 * of high-intent clicks arrive from bundles that predate the deploy and send no
 * Authorization header. Those are customers, not attackers.
 *
 * So the rule is degrade, not reject:
 *
 *   a tokenless request MAY create a checkout session
 *   a tokenless request MAY NOT read, reuse, or write a Stripe customer id
 *
 * The second line is the security guarantee. These tests exist to make it fail
 * loudly if anyone later relaxes it, including by accident while refactoring
 * the customer-resolution block.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { customerSessionArgs, buildCustomerPatch } from '../lib/server/checkoutCustomer.js'

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')

describe('tokenless checkout: what it is allowed to do', () => {
  it('still produces a usable Stripe session, so the sale is not lost', () => {
    // No customer id resolved (that is the whole point), so the session falls
    // back to customer_email exactly as it did before the customer fix landed.
    const args = customerSessionArgs({ customerId: null, userEmail: 'student@example.com' })
    expect(args.customer_email).toBe('student@example.com')
    expect(args.customer).toBeUndefined()
  })
})

describe('tokenless checkout: what it must never do', () => {
  it('never attaches the session to a customer it has not proven ownership of', () => {
    // Even if a stored id existed on the row, the handler forces existingCustomerId
    // to null when tokenless, so nothing can reach `customer`. Attaching would
    // prefill a stranger's details on Stripe's hosted page: a read by another route.
    const args = customerSessionArgs({ customerId: null, userEmail: 'student@example.com' })
    expect(args).not.toHaveProperty('customer')
  })

  it('never sets both customer and customer_email, which Stripe rejects outright', () => {
    const attached = customerSessionArgs({ customerId: 'cus_live123', userEmail: 'student@example.com' })
    expect(attached.customer).toBe('cus_live123')
    expect(attached.customer_email).toBeUndefined()
  })

  it('buildCustomerPatch refuses to invent a subscription row', () => {
    // The persist block is skipped entirely when tokenless. This is the second
    // line of defence: even if it were reached with no subscription object, it
    // must not create one holding only a customer id.
    expect(buildCustomerPatch(null, 'cus_live123')).toBeNull()
    expect(buildCustomerPatch(undefined, 'cus_live123')).toBeNull()
  })

  it('buildCustomerPatch refuses a malformed customer id', () => {
    expect(buildCustomerPatch({ plan: 'free' }, 'not_a_customer')).toBeNull()
  })
})

describe('the guards are still wired into api/stripe.js', () => {
  const src = read('./stripe.js')

  it('a tokenless checkout is accepted, not rejected with a 401', () => {
    expect(src, 'the tokenless degrade was removed; stale tabs will 401 again')
      .toContain('tokenlessCheckout = true')
    const guard = src.slice(src.indexOf('let tokenlessCheckout'), src.indexOf('const { plan: rawPlan'))
    expect(guard, 'checkout is 401ing tokenless requests again').not.toContain("status(401)")
  })

  it('a token that is present but wrong is still a hard 403', () => {
    expect(src, 'an invalid or mismatched token must never be treated as tokenless')
      .toContain("return res.status(403).json({ error: 'Forbidden' })")
  })

  it('SECURITY: a tokenless request cannot reuse the stored customer id', () => {
    expect(src, 'existingCustomerId is no longer forced to null when tokenless')
      .toContain('existingCustomerId = tokenlessCheckout')
  })

  it('SECURITY: the email lookup requires a verified user', () => {
    expect(src, 'the Stripe customer email lookup is no longer gated on verifiedUser')
      .toContain('if (!existingCustomerId && verifiedUser?.email)')
  })

  it('SECURITY: persisting stripeCustomerId requires a verified user', () => {
    expect(src, 'the stripeCustomerId write is no longer gated on verifiedUser')
      .toContain('if (resolvedCustomerId && !existingCustomerId && verifiedUser && userId)')
  })

  it('the tokenless path is observable in the runtime log', () => {
    // A stale bundle cannot report itself from the client, so this warning is
    // the only way to count how often the degrade is actually used.
    expect(src, 'the tokenless_checkout log line is gone; the path is now invisible')
      .toContain('tokenless_checkout')
  })
})

describe('the client still reports the tokenless case it can see', () => {
  const src = read('../src/lib/subscription.js')

  it('fires checkout_tokenless when it has no access token', () => {
    expect(src).toContain("track('checkout_tokenless'")
    expect(src).toContain("reason: 'no_access_token'")
  })

  it('keeps the stale-bundle recovery for the case it does handle', () => {
    expect(src, 'recoverFromStaleBundle was deleted').toContain('async function recoverFromStaleBundle()')
    expect(src, 'the honest note about what it cannot rescue was deleted')
      .toContain('does NOT rescue the stale-tab cohort')
  })
})
