import { readBilling, BILLING_TABLE } from './billing.js'
import { isMissingRelation, reportQueryError } from './supabaseErrors.js'
import { posthogCapture } from './posthog.js'

/**
 * The grant that pays for the plan onboarding seeds.
 *
 * Onboarding generates a study plan for every new account the moment the course
 * is named. That generation goes through reserveAiUsage like any other, and
 * COACH_PLAN_AI_COST is 5, which is exactly the free tier's monthly allowance.
 * Left alone, a student would finish onboarding holding a plan they did not ask
 * for and zero actions of their own, and the next thing they touched would be a
 * paywall. That is the opposite of what the seeded plan is for.
 *
 * So the seed draws from a grant instead. bonus_ai_actions raises the ceiling
 * (lib/server/usage.js: limit = baseLimit + bonus, free plan only), the seeded
 * generation spends the grant, and the student's own five are untouched.
 *
 * Deliberately NOT done by lowering COACH_PLAN_AI_COST. That number belongs to
 * the spend-control work and is contested pending its own telemetry; routing
 * around it leaves their policy exactly where they set it.
 */

// Must cover one coach plan. firstPlanBonus.test.js reads COACH_PLAN_AI_COST
// out of api/generate-study-coach-plan.js and fails if the two drift, so if
// that number moves this one is not silently left behind.
export const FIRST_PLAN_BONUS_ACTIONS = 5

/**
 * Idempotent. Grants once, to a free account that has never generated anything
 * and holds no bonus already. Those two conditions are the whole guard: even if
 * a caller asked repeatedly, or lied about why, the most it can obtain is the
 * single seeded plan it was always going to be given.
 *
 * Returns { ok, granted, reason }. `ok:false` means the caller must NOT go on to
 * generate - spending the student's own allowance on the seed is the failure
 * this exists to prevent, so the correct response to a failed grant is to skip
 * the seed entirely, not to charge them for it.
 */
export async function grantFirstPlanBonus(supabase, userId) {
  if (!userId) return { ok: false, granted: false, reason: 'no_user' }

  const read = await readBilling(supabase, userId)
  if (!read.ok) {
    return { ok: false, granted: false, reason: 'billing_unreadable' }
  }

  const b = read.billing ?? {}

  if (b.plan && b.plan !== 'free') {
    // Pro is 100/mo and Unlimited never binds, so there is nothing to protect.
    return { ok: true, granted: false, reason: 'not_free' }
  }
  if (b.firstGenerationAt) {
    return { ok: true, granted: false, reason: 'already_activated' }
  }
  if ((Number(b.bonusAiActions) || 0) > 0) {
    return { ok: true, granted: true, reason: 'already_granted' }
  }

  const { error } = await supabase
    .from(BILLING_TABLE)
    .update({ bonus_ai_actions: FIRST_PLAN_BONUS_ACTIONS, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (error) {
    // The table not existing is the one failure worth shouting about. readBilling
    // degrades to the legacy blob on a read, which is right for a read, but there
    // is no write path to the legacy blob here on purpose: quietly granting
    // nothing and generating anyway would spend the student's whole month, and
    // quietly granting nothing and skipping would look like the feature is off.
    // Neither should be inferred from silence.
    if (isMissingRelation(error)) {
      console.error(
        `[firstPlanBonus] ${BILLING_TABLE} does not exist — cannot grant the seeded plan's ` +
        'allowance, so the seeded generation will be SKIPPED rather than billed to the ' +
        'student. Apply migrations/20260903_user_billing.sql.'
      )
      await posthogCapture('first_plan_bonus_unavailable', userId, {
        reason: 'billing_table_missing',
        table: BILLING_TABLE,
        migration: 'migrations/20260903_user_billing.sql',
      }).catch(() => {})
      return { ok: false, granted: false, reason: 'billing_table_missing' }
    }

    reportQueryError(error, { table: BILLING_TABLE, context: 'grantFirstPlanBonus' })
    await posthogCapture('first_plan_bonus_unavailable', userId, {
      reason: 'write_failed',
      code: error.code ?? null,
    }).catch(() => {})
    return { ok: false, granted: false, reason: 'write_failed' }
  }

  return { ok: true, granted: true, reason: 'granted', actions: FIRST_PLAN_BONUS_ACTIONS }
}
