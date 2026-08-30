/**
 * REVENUE-CRITICAL. The single server-side rule for what the 7-day free trial bills.
 *
 * The trial is ALWAYS Pro/monthly ($9.99/mo after). This is enforced on the server
 * because the client cannot be trusted to be current: the app ships a service
 * worker, so open tabs and cached PWA bundles keep running old JS for days after a
 * deploy, and lifecycle emails and bookmarked `?plan=unlimited&trial=1` links live
 * forever. On 2026-08-15 a stale client created a live $4.99/wk Unlimited trial
 * hours after the frontend had already shipped the Pro fix.
 *
 * An Unlimited trial is always a billing bug, never a legitimate request: trial
 * entitlements are PRO_LIMITS and getActivePlan() reports 'pro' while trialing, so
 * it charged users $4.99/wk for a tier they never actually received.
 *
 * Mirrors TRIAL_PLAN / TRIAL_BILLING_PERIOD in src/lib/subscription.js.
 */
export const TRIAL_PLAN = 'pro'
export const TRIAL_BILLING_PERIOD = 'monthly'
export const TRIAL_PERIOD_DAYS = 7

/**
 * Resolve the plan/billing period a checkout session should actually use.
 *
 * @param {object} input
 * @param {string} input.plan          plan the caller asked for
 * @param {string} input.billingPeriod billing period the caller asked for
 * @param {boolean} input.trial        whether the caller asked for a trial
 * @returns {{plan: string, billingPeriod: string, wantsTrial: boolean, coerced: boolean}}
 */
// Periods we no longer sell. They are not rejected, they are converted.
//
// 85 files in this repo still carried `billing=weekly` links, plus every lifecycle
// email ever sent and every cached PWA bundle. If a retired period 400'd, all of
// that traffic would hit a broken checkout — turning a pricing change into an
// outage for the people most likely to buy. Coercing to monthly means an old
// link sells the current price instead.
const RETIRED_BILLING_PERIODS = new Set(['weekly', 'semester'])
const DEFAULT_BILLING_PERIOD = 'monthly'

function normalizeBillingPeriod(billingPeriod) {
  // 'annual' is a legacy alias still present in old links and emails.
  if (billingPeriod === 'annual') return 'yearly'
  if (RETIRED_BILLING_PERIODS.has(billingPeriod)) return DEFAULT_BILLING_PERIOD
  return billingPeriod
}

export function resolveCheckoutPlan({ plan, billingPeriod, trial }) {
  const normalizedBillingPeriod = normalizeBillingPeriod(billingPeriod)
  const wantsTrial = !!trial

  if (!wantsTrial) {
    return {
      plan,
      billingPeriod: normalizedBillingPeriod,
      wantsTrial: false,
      // A retired period that got converted is worth logging at the call site,
      // the same as a coerced trial: it means something stale is still in
      // circulation and pointing customers at a price we no longer sell.
      coerced: normalizedBillingPeriod !== billingPeriod,
    }
  }

  return {
    plan: TRIAL_PLAN,
    billingPeriod: TRIAL_BILLING_PERIOD,
    wantsTrial: true,
    // Compare against what the caller actually ASKED for, not the normalized
    // value. Normalizing first would quietly launder a `weekly` trial request
    // into "no coercion needed", which is the one case most worth logging: it
    // means a stale client or an old link is still pointing customers at a
    // price we retired.
    coerced: plan !== TRIAL_PLAN || billingPeriod !== TRIAL_BILLING_PERIOD,
  }
}
