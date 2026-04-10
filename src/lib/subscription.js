/**
 * subscription.js — Lemon Squeezy subscription layer for StudyEdge
 *
 * Tracks plan, limits, and AI query usage in memory (mirrored to Supabase).
 *
 * SETUP: After your Lemon Squeezy account is approved and products are created,
 * replace the REPLACE_* placeholder strings below with real variant IDs from
 * your LS dashboard (Product → Variants → copy the numeric ID).
 */

import { supabase } from './supabase'

// ── Plan limits ───────────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free:      { courses: 7,        aiQueries: 10 },
  pro:       { courses: 5,        aiQueries: 50 },
  unlimited: { courses: Infinity, aiQueries: Infinity },
}

// ── Lemon Squeezy config ──────────────────────────────────────────────────────

// Your Lemon Squeezy store slug (the subdomain of your store URL)
// e.g. if your store is at studyedge.lemonsqueezy.com, slug is 'studyedge'
export const LS_STORE_SLUG = 'studyedge'

// Replace these with real variant IDs from your LS dashboard once your account
// is approved. Go to: Store → Products → click product → Variants → copy ID.
export const LS_VARIANTS = {
  pro: {
    monthly:  'REPLACE_PRO_MONTHLY_VARIANT_ID',
    semester: 'REPLACE_PRO_SEMESTER_VARIANT_ID',
    yearly:   'REPLACE_PRO_YEARLY_VARIANT_ID',
  },
  unlimited: {
    monthly:  'REPLACE_UNLIMITED_MONTHLY_VARIANT_ID',
    semester: 'REPLACE_UNLIMITED_SEMESTER_VARIANT_ID',
    yearly:   'REPLACE_UNLIMITED_YEARLY_VARIANT_ID',
  },
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let _sub = null
let _uid = null

const DEFAULT_SUB = {
  plan: 'free',
  status: 'active',
  aiQueriesUsed: 0,
  aiQueriesResetAt: null,
  lsSubscriptionId: null,
  lsCustomerId: null,
  billingPeriod: null,
  currentPeriodEnd: null,
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

export function getActivePlan() {
  const sub = getCachedSubscription()
  const activeStatuses = ['active', 'trialing', 'past_due']
  if (!activeStatuses.includes(sub?.status)) return 'free'
  return sub?.plan ?? 'free'
}

export function getPlanLimits() {
  return PLAN_LIMITS[getActivePlan()] ?? PLAN_LIMITS.free
}

export function canAddCourse(currentCount) {
  const { courses } = getPlanLimits()
  return currentCount < courses
}

function isNewMonth(isoString) {
  if (!isoString) return true
  const now = new Date()
  const then = new Date(isoString)
  return now.getMonth() !== then.getMonth() || now.getFullYear() !== then.getFullYear()
}

export function canUseAI() {
  const sub = getCachedSubscription()
  const { aiQueries } = getPlanLimits()
  if (aiQueries === Infinity) return true
  if (isNewMonth(sub?.aiQueriesResetAt)) return true
  return (sub?.aiQueriesUsed ?? 0) < aiQueries
}

export function getAIQueriesUsed() {
  const sub = getCachedSubscription()
  if (isNewMonth(sub?.aiQueriesResetAt)) return 0
  return sub?.aiQueriesUsed ?? 0
}

export function getAIQueriesLimit() {
  return getPlanLimits().aiQueries
}

// ── AI query increment ────────────────────────────────────────────────────────

export async function incrementAIQuery() {
  if (!_uid) return

  const now = new Date()
  const current = getCachedSubscription()
  const newMonth = isNewMonth(current?.aiQueriesResetAt)
  const newCount = newMonth ? 1 : (current?.aiQueriesUsed ?? 0) + 1

  const updated = {
    ...current,
    aiQueriesUsed: newCount,
    aiQueriesResetAt: newMonth ? now.toISOString() : current?.aiQueriesResetAt,
  }

  _sub = updated

  const { error } = await supabase
    .from('user_data')
    .upsert(
      { user_id: _uid, subscription: updated, updated_at: now.toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) console.error('[subscription] increment AI query error', error)
}

// ── Checkout URL builder ──────────────────────────────────────────────────────

export function buildCheckoutUrl(plan, billingPeriod, userEmail, userId) {
  const variantId = LS_VARIANTS[plan]?.[billingPeriod]

  if (!variantId || variantId.startsWith('REPLACE')) {
    console.warn('[subscription] LS variant ID not configured for', plan, billingPeriod)
    return null
  }

  const base = `https://${LS_STORE_SLUG}.lemonsqueezy.com/checkout/buy/${variantId}`
  const params = new URLSearchParams()
  if (userEmail) params.set('checkout[email]', userEmail)
  if (userId)    params.set('checkout[custom][user_id]', userId)
  params.set('embed', '1')

  return `${base}?${params.toString()}`
}
