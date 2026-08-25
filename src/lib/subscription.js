/**
 * subscription.js - Trial & subscription layer for StudyEdge AI
 *
 * 3-tier model:
 *  Free      → permanent, capped per feature
 *  Trial     → 7-day Pro via Stripe Checkout. Card required upfront; charged $2.99/wk after 7 days unless cancelled.
 *  Pro       → Stripe paid (weekly/monthly/annual), 5 courses, 100 AI actions/month
 *  Unlimited → Stripe paid (weekly/monthly/annual), unlimited everything + tutor memory & advanced analytics
 */

// Trial duration: 7 days. Single source of truth for all trial checks.
export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000
export const TRIAL_DURATION_DAYS = 7

import { supabase, getAccessToken } from './supabase'
import { track } from './analytics'

// ── Plan limits ───────────────────────────────────────────────────────────────

// Free is a one-time preview tier: most premium features are limited to a
// single lifetime use so users see what each tool does, then hit a real wall
// that drives them into the 7-day Pro trial.
//
// The AI action pool is the exception, and it resets monthly. Three places used
// to disagree about this: the server enforced a monthly reset, this file said
// 'total' (five actions for life), and the user-facing copy said "this month".
// The server was the only one users actually felt, and monthly is what the copy
// has always promised, so monthly is the model everywhere now.
//
// AI_ACTION_PERIOD is the single source of truth. Copy that describes the free
// AI allowance must be generated from AI_PERIOD_LABEL rather than hard-coded,
// and subscription.aiQuota.test.js fails the build if the two drift apart.
export const AI_ACTION_PERIOD = 'month'
export const AI_PERIOD_LABEL = 'this month'

export const FREE_LIMITS = {
  courses:             1,
  aiTutor:             { count: 5,  period: AI_ACTION_PERIOD },
  blueprint:           { count: 1,  period: 'total' },
  coachPlan:           { count: 1,  period: 'total' },
  practiceExam:        { count: 1,  period: 'total' },
  focusMode:           { minutes: 30, period: 'day' },
  brainDump:           { count: 1,  period: 'total' },
  quizBurst:           { count: 1,  period: 'total' },
  examRescue:          { count: 1,  period: 'total' },
  flashcardDecks:      1,
  flashcardCardsPerDeck: 10,
}

export const PRO_LIMITS = {
  courses:             5,
  aiActions:           { count: 100, period: 'month' },
  focusMode:           { minutes: Infinity, period: null },
  flashcardDecks:      Infinity,
  flashcardCardsPerDeck: Infinity,
}

export const UNLIMITED_LIMITS = {
  courses:               Infinity,
  aiActions:             { count: Infinity, period: 'month' },
  focusMode:             { minutes: Infinity, period: null },
  flashcardDecks:        Infinity,
  flashcardCardsPerDeck: Infinity,
  tutorMemory:           true,
  practiceExamAnalytics: true,
}

export const TRIAL_LIMITS = PRO_LIMITS

// Legacy - kept for backwards compatibility
export const PLAN_LIMITS = {
  free:      { courses: 1,        aiQueries: 5,        aiResetPeriod: AI_ACTION_PERIOD },
  pro:       { courses: 5,        aiQueries: 100,      aiResetPeriod: 'month' },
  unlimited: { courses: Infinity, aiQueries: Infinity, aiResetPeriod: 'month' },
}

// Feature names that are gated to Unlimited only.
const UNLIMITED_ONLY_FEATURES = new Set(['tutorMemory', 'practiceExamAnalytics'])

export function canUseUnlimitedFeature(featureName) {
  if (!UNLIMITED_ONLY_FEATURES.has(featureName)) return true
  return getActivePlan() === 'unlimited'
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let _sub = null
let _uid = null

const DEFAULT_SUB = {
  plan: 'free',
  status: 'active',
  aiQueriesUsed: 0,
  aiQueriesResetAt: null,
  stripeSubId: null,
  stripeCustomerId: null,
  billingPeriod: null,
  currentPeriodEnd: null,
  trial_activated: false,
  trial_start_date: null,
  feature_usage: {},
}

// ── Init / clear ──────────────────────────────────────────────────────────────

export function initSubscription(uid, subFromDb) {
  _uid = uid
  _sub = subFromDb ?? { ...DEFAULT_SUB }
}

export function clearSubscription() {
  _sub = null
  _uid = null
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function getCachedSubscription() {
  return _sub ?? { ...DEFAULT_SUB }
}

// ── Trial helpers ─────────────────────────────────────────────────────────────

export function isTrialActive() {
  const sub = getCachedSubscription()
  // Stripe-backed trial
  if (sub?.status === 'trialing' && sub?.stripeSubId) return true
  // Legacy DB-only trial (backwards compat for accounts that activated before this fix)
  if (!sub?.trial_activated || !sub?.trial_start_date) return false
  if (sub?.status === 'cancelled') return false
  const start = new Date(sub.trial_start_date)
  const diffMs = Date.now() - start.getTime()
  return diffMs < TRIAL_DURATION_MS
}

export function hasUsedTrial() {
  const sub = getCachedSubscription()
  // trialUsedAt is stamped by the Stripe webhook on subscription.created (trialing).
  // trial_activated is the legacy DB-only flag from the no-card flow (backwards compat).
  return !!(sub?.trialUsedAt || sub?.trial_activated)
}

export function getTrialDaysRemaining() {
  const sub = getCachedSubscription()
  // Stripe-backed trial: use currentPeriodEnd (the trial_end Stripe reports)
  if (sub?.status === 'trialing' && sub?.stripeSubId && sub?.currentPeriodEnd) {
    const end = new Date(sub.currentPeriodEnd)
    const msLeft = end.getTime() - Date.now()
    return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
  }
  // Legacy DB-only trial
  if (!sub?.trial_activated || !sub?.trial_start_date) return 0
  const start = new Date(sub.trial_start_date)
  const elapsed = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.ceil(TRIAL_DURATION_DAYS - elapsed))
}

// REVENUE-CRITICAL. The 7-day free trial is always Pro/weekly ($2.99/wk after).
// Single source of truth for every trial CTA in the app — do not pass a plan in
// at the call site, and do not change these values without also updating the
// trial copy in PrePaywall, PaywallModal, DashboardView, AccountView, Onboarding
// and PaywallExitGift. Trial entitlements are PRO_LIMITS (see TRIAL_LIMITS above)
// and getActivePlan() returns 'pro' while trialing, so billing the Unlimited
// price here would charge users for a tier they never had access to.
export const TRIAL_PLAN = 'pro'
export const TRIAL_BILLING_PERIOD = 'weekly'

// activateTrial routes through Stripe Checkout so a card is collected upfront.
// Returns the checkout URL on success, or null on failure.
// Pass userId and userEmail from the calling component.
export async function activateTrial(userId, userEmail) {
  const uid = userId ?? _uid
  if (!uid) return null
  if (hasUsedTrial()) return null
  track('trial_cta_clicked', { source: 'activateTrial', plan: TRIAL_PLAN, billing_period: TRIAL_BILLING_PERIOD })
  const url = await createCheckoutSession(TRIAL_PLAN, TRIAL_BILLING_PERIOD, userEmail, uid, { trial: true })
  return url ?? null
}

// ── Plan resolution ───────────────────────────────────────────────────────────

export function getActivePlan() {
  const sub = getCachedSubscription()

  // Stripe paid subscription
  const paidStatuses = ['active', 'past_due']
  if (paidStatuses.includes(sub?.status) && sub?.plan === 'unlimited') return 'unlimited'
  if (paidStatuses.includes(sub?.status) && sub?.plan === 'pro') return 'pro'

  // Active trial (Stripe trialing or legacy DB-only)
  if (isTrialActive()) return 'pro'

  // Stripe trialing belt-and-suspenders
  if (sub?.status === 'trialing' && sub?.plan) return sub.plan

  return 'free'
}

export function getPlanLimits() {
  return PLAN_LIMITS[getActivePlan()] ?? PLAN_LIMITS.free
}

export function canAddCourse(currentCount) {
  const plan = getActivePlan()
  if (plan === 'unlimited') return true
  if (plan === 'pro') return currentCount < PRO_LIMITS.courses
  return currentCount < FREE_LIMITS.courses
}

// ── Period helpers ────────────────────────────────────────────────────────────

function isNewDay(isoString) {
  if (!isoString) return true
  return new Date().toDateString() !== new Date(isoString).toDateString()
}

function isNewWeek(isoString) {
  if (!isoString) return true
  const getMonday = (d) => {
    const copy = new Date(d)
    const day = copy.getDay()
    copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1))
    copy.setHours(0, 0, 0, 0)
    return copy.getTime()
  }
  return getMonday(new Date()) !== getMonday(new Date(isoString))
}

function isNewMonth(isoString) {
  if (!isoString) return true
  const now = new Date()
  const then = new Date(isoString)
  return now.getMonth() !== then.getMonth() || now.getFullYear() !== then.getFullYear()
}

// ── Per-feature usage ─────────────────────────────────────────────────────────

export function getFeatureUsage(featureName) {
  const sub = getCachedSubscription()
  return sub?.feature_usage?.[featureName] ?? { count: 0, resetAt: null }
}

/**
 * canUseFeature(name) → { allowed: bool, remaining: number|null, resetIn: string|null }
 *
 * For pro/trial/unlimited: always allowed (returns remaining: null).
 * For free: checks per-feature caps with period reset logic.
 */
/**
 * Remaining free AI actions, from the number the SERVER actually enforces.
 *
 * `subscription.aiQueriesUsed` is written by lib/server/usage.js with the
 * service key, so it is the only usage figure in this file that is actually accurate.
 *
 * The obvious-looking alternative, `feature_usage.aiTutor`, is not usable:
 * `subscription` is guarded by a trigger that reverts every non-service-role
 * write, so the browser has never persisted that key on any of 810 production
 * rows. Reading it always returns { count: 0 }, which is why the counter in the
 * chat footer read "5 free AI questions left" no matter how many the user had
 * spent. See docs/subscription-column-writes.md.
 */
export function getAiActionsUsed() {
  const sub = getCachedSubscription()
  // Same monthly boundary the server applies in reserveAiUsage.
  if (isNewMonth(sub?.aiQueriesResetAt)) return 0
  return Number(sub?.aiQueriesUsed) || 0
}

export function getAiActionsLimit() {
  const plan = getActivePlan()
  if (plan === 'unlimited') return Infinity
  if (plan === 'pro' || plan === 'trial') return PRO_LIMITS.aiActions.count
  const sub = getCachedSubscription()
  // Bonus actions from the paywall-exit gift are server-written and real.
  return FREE_LIMITS.aiTutor.count + (Number(sub?.bonusAiActions) || 0)
}

export function getAiActionsRemaining() {
  const limit = getAiActionsLimit()
  if (limit === Infinity) return null
  return Math.max(0, limit - getAiActionsUsed())
}

export function canUseFeature(featureName) {
  const plan = getActivePlan()

  if (plan === 'pro' || plan === 'unlimited') {
    return { allowed: true, remaining: null, resetIn: null }
  }

  const limit = FREE_LIMITS[featureName]
  if (!limit) return { allowed: true, remaining: null, resetIn: null }

  const { count: max, period, minutes } = typeof limit === 'object'
    ? limit
    : { count: limit, period: null, minutes: undefined }

  // Focus mode is handled separately via minutesUsed
  if (minutes !== undefined) {
    return { allowed: true, remaining: minutes, resetIn: period === 'day' ? 'tomorrow' : null }
  }

  // aiTutor is the one feature whose counter is server-authoritative. Everything
  // else still reads feature_usage, which has never persisted, and is therefore
  // unenforced across sessions. That is a separate decision, documented in
  // docs/free-tier-enforcement.md, not something to silently change here.
  if (featureName === 'aiTutor') {
    const remaining = getAiActionsRemaining()
    return {
      allowed: remaining === null || remaining > 0,
      remaining,
      resetIn: AI_ACTION_PERIOD === 'month' ? 'next month' : null,
    }
  }

  const usage = getFeatureUsage(featureName)

  let hasReset = false
  if (period === 'day')   hasReset = isNewDay(usage.resetAt)
  if (period === 'week')  hasReset = isNewWeek(usage.resetAt)
  if (period === 'month') hasReset = isNewMonth(usage.resetAt)
  if (period === 'total') hasReset = false

  const currentCount = hasReset ? 0 : (usage.count ?? 0)
  const allowed = currentCount < max
  const remaining = Math.max(0, max - currentCount)

  const resetLabels = { day: 'tomorrow', week: 'next Monday', month: 'next month', total: null }
  const resetIn = period ? resetLabels[period] ?? null : null

  return { allowed, remaining, resetIn }
}

export function getFocusMinutesUsed() {
  const usage = getFeatureUsage('focusMode')
  if (isNewDay(usage.resetAt)) return 0
  return usage.count ?? 0 // stored as minutes
}

export function canUseFocusMinutes(additionalMinutes = 1) {
  const plan = getActivePlan()
  if (plan === 'pro' || plan === 'unlimited') return true
  const used = getFocusMinutesUsed()
  return used + additionalMinutes <= FREE_LIMITS.focusMode.minutes
}

export async function incrementFeatureUsage(featureName, amount = 1) {
  if (!_sub) return

  const plan = getActivePlan()
  // For pro/trial: don't track per-feature (AI pool tracked server-side)
  if (plan !== 'free') return

  const usage = getFeatureUsage(featureName)
  const limit = FREE_LIMITS[featureName]
  const period = typeof limit === 'object' ? limit.period : null

  let hasReset = false
  if (period === 'day')   hasReset = isNewDay(usage.resetAt)
  if (period === 'week')  hasReset = isNewWeek(usage.resetAt)
  if (period === 'month') hasReset = isNewMonth(usage.resetAt)

  const now = new Date().toISOString()
  const newCount = hasReset ? amount : (usage.count ?? 0) + amount

  const updatedUsage = {
    ...(_sub.feature_usage ?? {}),
    [featureName]: {
      count: newCount,
      resetAt: hasReset || !usage.resetAt ? now : usage.resetAt,
    },
  }

  _sub = { ..._sub, feature_usage: updatedUsage }

  if (_uid) {
    const snapshot = { ..._sub }
    supabase
      .from('user_data')
      .upsert({ user_id: _uid, subscription: snapshot, updated_at: now }, { onConflict: 'user_id' })
      .then(({ error }) => {
        if (error) console.error('[subscription] incrementFeatureUsage error:', error)
      })
  }
}

// ── First successful generation ──────────────────────────────────────────────
// The card ask is not allowed to fire until the user has had one AI generation
// actually succeed against their own course material. 13 of 24 trials were
// cancelled the same day the card was entered, which is what asking before any
// value has landed produces.
//
// This is stamped once, on the first success, and persists in the subscription
// row so it survives a reload and a new device. It is deliberately NOT derived
// from feature_usage: those counters increment when a generation STARTS, and
// counting attempts as wins is the whole bug this build exists to fix.

export function hasSuccessfulGeneration() {
  return !!getCachedSubscription()?.firstGenerationAt
}

export function getFirstGenerationAt() {
  return getCachedSubscription()?.firstGenerationAt ?? null
}

/**
 * Call ONLY from a path where an AI generation returned usable output to the
 * user. Idempotent: the first call wins and later calls are no-ops.
 *
 * IMPORTANT: the supabase upsert below DOES NOT PERSIST. `subscription` is
 * guarded by user_data_guard_subscription_trg, which reverts any write from a
 * non-service role, silently and without an error. Verified in production:
 * `feature_usage`, written the same way, is absent on all 810 rows.
 *
 * The rule still works, for a different reason than this code suggests. The
 * durable stamp is written server-side by commitReservation() in
 * lib/server/usage.js on the success path of every AI call, using the service
 * key. What this function actually buys is the IN-MEMORY update and the event,
 * which is what gates the card ask for the rest of the current session.
 *
 * See docs/subscription-column-writes.md.
 */
export function markSuccessfulGeneration(source) {
  if (!_sub) return false
  if (_sub.firstGenerationAt) return false

  const now = new Date().toISOString()
  _sub = { ..._sub, firstGenerationAt: now }

  if (_uid) {
    const snapshot = { ..._sub }
    supabase
      .from('user_data')
      .upsert({ user_id: _uid, subscription: snapshot, updated_at: now }, { onConflict: 'user_id' })
      .then(({ error }) => {
        if (error) console.error('[subscription] markSuccessfulGeneration error:', error)
      })
  }

  track('first_generation_succeeded', { source: source ?? null, plan: getActivePlan() })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('studyedge:first-win', { detail: { source: source ?? null } }))
  }
  return true
}

// ── AI helpers (backwards-compat wrappers) ────────────────────────────────────

export function canUseAI() {
  return canUseFeature('aiTutor').allowed
}

export function getAIQueriesUsed() {
  const usage = getFeatureUsage('aiTutor')
  // Must use the same boundary as FREE_LIMITS.aiTutor.period and as the server
  // in lib/server/usage.js. This read used a daily boundary against a limit
  // that was never daily, so the count the user saw drifted from the count
  // that was actually enforced.
  if (isNewMonth(usage.resetAt)) return 0
  return usage.count ?? (_sub?.aiQueriesUsed ?? 0)
}

export function getAIQueriesLimit() {
  const plan = getActivePlan()
  if (plan === 'pro' || plan === 'unlimited') return PRO_LIMITS.aiActions.count
  return FREE_LIMITS.aiTutor.count
}

export function incrementAIQuery(source) {
  incrementFeatureUsage('aiTutor')

  // Every caller invokes this after its response has come back clean, so this
  // is the app's de facto "a generation just worked" signal. Stamping the first
  // win here is what unlocks the card ask; see hasSuccessfulGeneration.
  markSuccessfulGeneration(source ?? 'ai_action')

  if (!_sub) return
  const now = new Date().toISOString()
  const plan = getActivePlan()

  // getFeatureUsage only tracks free-plan counts; for paid users it returns
  // { count: 0 } since incrementFeatureUsage is a no-op for them.
  if (plan === 'free') {
    // Advance the server-authoritative counter, not the feature_usage one.
    // feature_usage never persists, so deriving from it reset the display to 1
    // on every fresh session.
    const newCount = (Number(_sub.aiQueriesUsed) || 0) + 1
    _sub = { ..._sub, aiQueriesUsed: newCount, aiQueriesResetAt: _sub.aiQueriesResetAt ?? now }
    window.dispatchEvent(new CustomEvent('studyedge:ai-query-used', { detail: { count: newCount } }))

    const limit = getAIQueriesLimit()
    if (limit !== Infinity && newCount >= limit) {
      track('ai_limit_reached', { plan, count: newCount })
      // Peak intent: free user just hit their last AI action — pop the paywall
      // immediately rather than waiting for the next blocked attempt.
      window.dispatchEvent(new CustomEvent('studyedge:open-paywall', { detail: { trigger: 'ai-exhausted' } }))
    }
  }
}

// Returned by createCheckoutSession when /api/stripe rejects this bundle as
// unauthenticated. Callers must treat it as "a reload is already in flight" —
// not as an error to render, and emphatically not as a URL to navigate to.
export const STALE_BUNDLE = Object.freeze({ staleBundle: true })

/**
 * Force the service worker onto the current deploy, then reload.
 *
 * sw.js already calls skipWaiting() on install and clients.claim() on activate,
 * so update() is enough — there is no waiting worker left to nudge. The reload
 * is what actually swaps the JavaScript this tab is running.
 */
// One-shot guard, per tab. sessionStorage rather than module scope because the
// reload wipes module scope — the whole point is to survive it.
const STALE_RELOAD_KEY = 'se_checkout_stale_reload'

function readStaleBundleFlag() {
  try { return window.sessionStorage.getItem(STALE_RELOAD_KEY) === '1' } catch { return false }
}

function writeStaleBundleFlag() {
  try { window.sessionStorage.setItem(STALE_RELOAD_KEY, '1') } catch { /* private mode */ }
}

async function recoverFromStaleBundle() {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.update().catch(() => {})))
    }
  } catch {
    // Best effort. Even if the worker cannot be updated we still reload, which
    // re-requests the HTML and usually breaks the loop on its own.
  }
  try { window.location.reload() } catch { /* non-browser context */ }
}

// ── Stripe checkout session creator ──────────────────────────────────────────
// Used for paid plan signups and card-required trials.
// Pass opts.trial: true to create a 7-day Stripe trial (card collected upfront).

export async function createCheckoutSession(plan, billingPeriod, userEmail, userId, opts = {}) {
  // checkout_button_clicked = honest name for what happened (CTA was clicked, API call is starting).
  // checkout_started fires server-side from api/stripe.js only when the Stripe session is created.
  track('checkout_button_clicked', { plan, billingPeriod, trial: !!opts.trial, has_promo: !!opts.promo })
  try {
    // The server requires a Bearer token for any request carrying a userId, and
    // derives the checkout email from that token rather than from this body.
    // Without the header the request is rejected 401, so this is not optional.
    const accessToken = await getAccessToken()
    const res = await fetch('/api/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify({ plan, billingPeriod, userEmail, userId, trial: !!opts.trial, promo: opts.promo ?? null }),
    })

    const data = await res.json()

    // /api/stripe returns 401 on the checkout path in exactly one case: no
    // Authorization header at all. A header that is present but invalid returns
    // 403. So reaching here means this bundle sent no token.
    //
    // Read that carefully, because it bounds what this handler can do. A tab
    // still running pre-deploy JavaScript never executes this code — the old
    // bundle does not contain it — so this does NOT rescue the stale-tab cohort.
    // The only way to protect them is server side, by not rejecting a tokenless
    // checkout outright. What reaches here is a current bundle whose
    // getAccessToken() came back empty: a session that expired or had not
    // finished hydrating when the user clicked.
    //
    // One reload is still the right move for that — it re-hydrates the session
    // and picks up any waiting service worker. But only one. Reloading cannot
    // mint a session that does not exist, so an unconditional reload would spin
    // the page every time an expired user clicked upgrade. After the first
    // attempt we fall through to the normal error path and let them see it.
    //
    // sendBeacon because the reload cancels a batched XHR, and the event that
    // tells us how often this happens is the one we would never receive.
    if (res.status === 401) {
      const alreadyTried = readStaleBundleFlag()
      track('checkout_error', {
        plan, billingPeriod, trial: !!opts.trial,
        reason: alreadyTried ? 'stale_bundle_401_repeat' : 'stale_bundle_401',
        status: 401,
        had_access_token: !!accessToken,
      }, { transport: 'sendBeacon', send_instantly: true })

      if (alreadyTried) return null // second time: real auth failure, show the error

      writeStaleBundleFlag()
      await recoverFromStaleBundle()
      return STALE_BUNDLE
    }

    if (res.status === 409 && data.alreadySubscribed) {
      console.warn('[subscription] User already subscribed - skipping checkout')
      return { alreadySubscribed: true }
    }

    if (!res.ok || !data.url) {
      console.error('[subscription] Checkout session error:', data.error)
      track('checkout_error', {
        plan, billingPeriod, trial: !!opts.trial,
        reason: data.error ?? 'api_error',
        status: res.status,
        stripe_error_code: data.stripe_error_code ?? null,
        stripe_error_type: data.stripe_error_type ?? null,
        stripe_decline_code: data.stripe_decline_code ?? null,
      })
      return null
    }

    return data.url
  } catch (err) {
    console.error('[subscription] Failed to create checkout session:', err)
    track('checkout_error', { plan, billingPeriod, trial: !!opts.trial, reason: err.message ?? 'network_error' })
    return null
  }
}
