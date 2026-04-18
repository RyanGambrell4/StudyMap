/**
 * subscription.js — Stripe subscription layer for StudyEdge
 *
 * Tracks plan, limits, and study boost usage in memory (mirrored to Supabase).
 */

import { supabase } from './supabase'

// ── Plan limits ───────────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free:      { courses: 1,        aiQueries: 10 },
  pro:       { courses: 5,        aiQueries: 30 },
  unlimited: { courses: Infinity, aiQueries: Infinity },
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

// ── Stripe checkout session creator ──────────────────────────────────────────

export async function createCheckoutSession(plan, billingPeriod, userEmail, userId, opts = {}) {
  try {
    const res = await fetch('/api/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, billingPeriod, userEmail, userId, trial: !!opts.trial }),
    })

    const data = await res.json()

    if (!res.ok || !data.url) {
      console.error('[subscription] Checkout session error:', data.error)
      return null
    }

    return data.url
  } catch (err) {
    console.error('[subscription] Failed to create checkout session:', err)
    return null
  }
}
