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

/**
 * Stripe subscription statuses that mean "this is the record actually being
 * billed". `past_due` and `unpaid` count: the subscription still exists and
 * still owns the payment method, it just needs attention. A customer whose only
 * subscription is `canceled` or `incomplete_expired` is a dead record.
 */
export const LIVE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
])

/**
 * @param {Array<{status?: string}>|undefined} subscriptions
 * @returns {boolean}
 */
export function hasLiveSubscription(subscriptions) {
  return (Array.isArray(subscriptions) ? subscriptions : [])
    .some((sub) => LIVE_SUBSCRIPTION_STATUSES.has(sub?.status))
}

/**
 * Choose between duplicate Stripe customers sharing one email.
 *
 * `stripe.customers.list` returns most-recently-created first, so taking
 * `data[0]` takes the NEWEST duplicate — and the newest duplicate is the one
 * minted by the most recent abandoned checkout, which is precisely the empty
 * record. Armend Demiri has four; only one of them is worth attaching to.
 *
 * Prefer whichever record holds a live subscription. Fall back to the newest
 * only when none of them do, which is the old behaviour and the right answer
 * when every record is equally empty.
 *
 * @param {Array<{id?: unknown, hasLiveSubscription?: boolean}>} candidates
 * @returns {string|null}
 */
export function selectPreferredCustomer(candidates) {
  const valid = (Array.isArray(candidates) ? candidates : [])
    .map((c) => ({ id: normalizeCustomerId(c?.id), live: c?.hasLiveSubscription === true }))
    .filter((c) => c.id !== null)

  return valid.find((c) => c.live)?.id ?? valid[0]?.id ?? null
}

/**
 * Build the subscription patch that records the resolved customer id, or null
 * when writing one would do more harm than leaving it alone.
 *
 * The client does `initSubscription(uid, subFromDb)` → `subFromDb ?? DEFAULT_SUB`.
 * It takes the stored object WHOLE; it never merges the defaults in. So writing
 * `{ stripeCustomerId }` over a missing or null subscription is strictly worse
 * than writing nothing: NULL reads back as the complete DEFAULT_SUB (plan
 * 'free', status 'active', feature_usage {}), whereas a partial object reads
 * back as plan: undefined and feature_usage: undefined, and every gate in the
 * app then sees a user with no plan at all.
 *
 * When there is no object to patch we leave the first write to the
 * checkout.session.completed webhook, which writes the whole subscription.
 *
 * @param {unknown} subscription  the subscription JSON already on the row
 * @param {unknown} customerId
 * @returns {object|null}
 */
export function buildCustomerPatch(subscription, customerId) {
  const id = normalizeCustomerId(customerId)
  if (!id) return null

  const isPlainObject = !!subscription
    && typeof subscription === 'object'
    && !Array.isArray(subscription)
  if (!isPlainObject) return null

  return { ...subscription, stripeCustomerId: id }
}
