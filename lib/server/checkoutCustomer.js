/**
 * One Stripe customer per person.
 *
 * Passing `customer_email` to Checkout creates a BRAND NEW Customer object on
 * every session. In production that produced 2 customer records for one user and
 * 4 for another (same email, same billing address), and the duplicates billed
 * independently: one user was charged $12.99 twice on the same day across two
 * customer IDs, and both charges had to be refunded.
 *
 * Extracted from the api/stripe.js handler so the decision is unit-testable
 * without standing up Stripe and Supabase. Mirrors the shape of trialPlan.js.
 */

/**
 * Validate a stored customer id. Anything that is not a real `cus_` string is
 * treated as absent, because a malformed id passed as `customer` makes Stripe
 * reject the whole session, which would block a paying user.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeCustomerId(value) {
  return typeof value === 'string' && value.startsWith('cus_') && value.length > 4
    ? value
    : null
}

/**
 * Pick the customer id to attach to a checkout session.
 *
 * @param {object} input
 * @param {unknown} input.storedId    stripeCustomerId already on the user row
 * @param {unknown} input.lookupId    id found by searching Stripe for the email
 * @returns {{customerId: string|null, source: 'stored'|'lookup'|'none'}}
 */
export function resolveCheckoutCustomer({ storedId, lookupId }) {
  const stored = normalizeCustomerId(storedId)
  if (stored) return { customerId: stored, source: 'stored' }

  const looked = normalizeCustomerId(lookupId)
  if (looked) return { customerId: looked, source: 'lookup' }

  return { customerId: null, source: 'none' }
}

/**
 * Build the mutually exclusive customer args for checkout.sessions.create.
 *
 * Stripe errors if a session sets both `customer` and `customer_email`, so this
 * returns exactly one of them, never both.
 *
 * @param {object} input
 * @param {string|null} input.customerId
 * @param {string|null|undefined} input.userEmail
 * @returns {{customer: string}|{customer_email: string|undefined}}
 */
export function customerSessionArgs({ customerId, userEmail }) {
  const id = normalizeCustomerId(customerId)
  if (id) return { customer: id }
  return { customer_email: userEmail || undefined }
}
