/**
 * REVENUE-CRITICAL. The single server-side rule for what the 7-day free trial bills.
 *
 * The trial is ALWAYS Pro/weekly ($2.99/wk after). This is enforced on the server
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
export const TRIAL_BILLING_PERIOD = 'weekly'
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
export function resolveCheckoutPlan({ plan, billingPeriod, trial }) {
  // 'annual' is a legacy alias still present in old links and emails.
  const normalizedBillingPeriod = billingPeriod === 'annual' ? 'yearly' : billingPeriod
  const wantsTrial = !!trial

  if (!wantsTrial) {
    return {
      plan,
      billingPeriod: normalizedBillingPeriod,
      wantsTrial: false,
      coerced: false,
    }
  }

  return {
    plan: TRIAL_PLAN,
    billingPeriod: TRIAL_BILLING_PERIOD,
    wantsTrial: true,
    coerced: plan !== TRIAL_PLAN || normalizedBillingPeriod !== TRIAL_BILLING_PERIOD,
  }
}
