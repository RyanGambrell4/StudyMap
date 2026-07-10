/**
 * subscription.js - Trial & subscription layer for StudyEdge AI
 *
 * 3-tier model:
 *  Free      → permanent, capped per feature
 *  Trial     → 3-day Pro via Stripe Checkout. Card required upfront; charged after 3 days unless cancelled.
 *  Pro       → Stripe paid (weekly/monthly/annual), 5 courses, 100 AI actions/month
 *  Unlimited → Stripe paid (weekly/monthly/annual), unlimited everything + tutor memory & advanced analytics
 */

// Trial duration: 3 days (was 7). Single source of truth for all trial checks.
export const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000
export const TRIAL_DURATION_DAYS = 3

import { supabase } from './supabase'
import { track } from './analytics'

// ── Plan limits ───────────────────────────────────────────────────────────────

// Free is a one-time preview tier: most premium features are limited to a
// single lifetime use so users see what each tool does, then hit a real wall
// that drives them into the 3-day trial.
export const FREE_LIMITS = {
  courses:             1,
  aiTutor:             { count: 5,  period: 'total' },
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
  free:      { courses: 1,        aiQueries: 2,        aiResetPeriod: 'day'   },
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
  if (!sub?.trial_activated || !sub?.trial_start_date) return 0
  const start = new Date(sub.trial_start_date)
  const elapsed = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.ceil(TRIAL_DURATION_DAYS - elapsed))
}

// activateTrial routes through Stripe Checkout so a card is collected upfront.
// Returns the checkout URL on success, or null on failure.
// Pass userId and userEmail from the calling component.
export async function activateTrial(userId, userEmail) {
  const uid = userId ?? _uid
  if (!uid) return null
  if (hasUsedTrial()) return null
  track('trial_cta_clicked', { source: 'activateTrial' })
  const url = await createCheckoutSession('pro', 'weekly', userEmail, uid, { trial: true })
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

// ── AI helpers (backwards-compat wrappers) ────────────────────────────────────

export function canUseAI() {
  return canUseFeature('aiTutor').allowed
}

export function getAIQueriesUsed() {
  const usage = getFeatureUsage('aiTutor')
  if (isNewDay(usage.resetAt)) return 0
  return usage.count ?? (_sub?.aiQueriesUsed ?? 0)
}

export function getAIQueriesLimit() {
  const plan = getActivePlan()
  if (plan === 'pro' || plan === 'unlimited') return PRO_LIMITS.aiActions.count
  return FREE_LIMITS.aiTutor.count
}

export function incrementAIQuery() {
  incrementFeatureUsage('aiTutor')

  if (!_sub) return
  const now = new Date().toISOString()
  const plan = getActivePlan()

  // getFeatureUsage only tracks free-plan counts; for paid users it returns
  // { count: 0 } since incrementFeatureUsage is a no-op for them.
  if (plan === 'free') {
    const usage = getFeatureUsage('aiTutor')
    const newCount = usage.count ?? 0
    _sub = { ..._sub, aiQueriesUsed: newCount, aiQueriesResetAt: now }
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

// ── Stripe checkout session creator ──────────────────────────────────────────
// Used for paid plan signups and card-required trials.
// Pass opts.trial: true to create a 3-day Stripe trial (card collected upfront).

export async function createCheckoutSession(plan, billingPeriod, userEmail, userId, opts = {}) {
  track('checkout_started', { plan, billingPeriod, trial: !!opts.trial, has_promo: !!opts.promo })
  try {
    const res = await fetch('/api/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, billingPeriod, userEmail, userId, trial: !!opts.trial, promo: opts.promo ?? null }),
    })

    const data = await res.json()

    if (res.status === 409 && data.alreadySubscribed) {
      console.warn('[subscription] User already subscribed - skipping checkout')
      return { alreadySubscribed: true }
    }

    if (!res.ok || !data.url) {
      console.error('[subscription] Checkout session error:', data.error)
      track('checkout_error', { plan, billingPeriod, trial: !!opts.trial, reason: data.error ?? 'api_error', status: res.status })
      return null
    }

    return data.url
  } catch (err) {
    console.error('[subscription] Failed to create checkout session:', err)
    track('checkout_error', { plan, billingPeriod, trial: !!opts.trial, reason: err.message ?? 'network_error' })
    return null
  }
}
