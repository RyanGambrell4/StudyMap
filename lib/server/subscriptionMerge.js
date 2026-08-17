/**
 * Ownership rules for the shared `user_data.subscription` JSON column.
 *
 * That one column has several writers: the AI usage gate (lib/server/usage.js),
 * the Stripe webhook, the lifecycle email crons, and the browser
 * (src/lib/subscription.js, which records per-feature usage in `feature_usage`).
 *
 * They all used to write the WHOLE column from a snapshot read earlier in the
 * request, so whichever wrote last silently erased the others' keys. The
 * observable damage: `feature_usage` did not exist on a single one of 777 user
 * rows, which meant every non-AI free limit (practice exams, blueprints, quiz
 * bursts, brain dumps, exam rescue, coach plans) was both unenforced and
 * unmeasured for the entire life of the product.
 *
 * Kept in its own module because lib/server/usage.js constructs a Resend client
 * at import time and therefore cannot be loaded in a unit test.
 */

/**
 * The only `subscription` keys the AI usage writer may author.
 * Everything else belongs to somebody else and must pass through untouched.
 */
export const SERVER_USAGE_KEYS = Object.freeze([
  'plan',
  'status',
  'aiQueriesUsed',
  'aiQueriesResetAt',
  'lastAiCallAt',
])

/**
 * Apply only the server-owned keys onto the freshest subscription JSON.
 *
 * Unknown keys pass through untouched. That is the whole point: a patch must
 * never be able to drop `feature_usage`, Stripe ids, or email flags just because
 * this writer did not know about them.
 *
 * @param {object|null|undefined} latest current subscription JSON from the DB
 * @param {object} patch                 proposed server-owned values
 * @returns {object}
 */
export function applyServerUsagePatch(latest, patch) {
  const base = (latest && typeof latest === 'object' && !Array.isArray(latest)) ? latest : {}
  const out = { ...base }
  for (const key of SERVER_USAGE_KEYS) {
    if (key in patch && patch[key] !== undefined) out[key] = patch[key]
  }
  return out
}
