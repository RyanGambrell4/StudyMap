/**
 * db.js — Cloud storage layer for StudyEdge
 *
 * Keeps an in-memory cache of the current user's data so components can
 * read synchronously (just like they did with localStorage), while writes
 * are persisted to Supabase in the background.
 */

import { supabase } from './supabase'
import { initSubscription, clearSubscription } from './subscription'

let _cache = null   // all user data
let _userId = null  // current user's id

// ── Init ──────────────────────────────────────────────────────────────────────

/** Called once after login. Fetches all data and fills the cache. */
export async function initUserData(uid) {
  _userId = uid
  const { data, error } = await supabase
    .from('user_data')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle()

  if (error) console.error('[db] initUserData error', error)

  _cache = data ?? {
    user_id: uid,
    plan: null,
    syllabus_events: [],
    manual_sessions: [],
    coach_plans: {},
    study_tools: null,
    session_notes: {},
    session_recalls: [],
    subscription: null,
  }

  // Initialise subscription cache from DB data
  initSubscription(uid, _cache.subscription ?? null)

  return _cache
}

/** Re-fetch subscription from DB and refresh in-memory cache */
export async function refreshSubscription(uid) {
  const { data, error } = await supabase
    .from('user_data')
    .select('subscription')
    .eq('user_id', uid)
    .maybeSingle()
  if (error) { console.error('[db] refreshSubscription error', error); return }
  const sub = data?.subscription ?? null
  if (_cache) _cache.subscription = sub
  initSubscription(uid, sub)
}

/** Clear cache on sign-out */
export function clearUserData() {
  _cache = null
  _userId = null
  clearSubscription()
}

// ── Reads (synchronous, from cache) ───────────────────────────────────────────

export function getCachedPlan()            { return _cache?.plan            ?? null }
export function getCachedSyllabusEvents()  { return _cache?.syllabus_events ?? [] }
export function getCachedManualSessions()  { return _cache?.manual_sessions ?? [] }
export function getCachedStudyTools() {
  const tools = _cache?.study_tools ?? null
  if (!tools) return null
  // eslint-disable-next-line no-unused-vars
  const { _streak, ...rest } = tools
  return Object.keys(rest).length ? rest : null
}

export function getCachedStreak() {
  return _cache?.study_tools?._streak ?? null
}
export function getCachedSessionRecalls()  { return _cache?.session_recalls ?? [] }

export function getCachedCoachPlan(courseId) {
  return _cache?.coach_plans?.[courseId] ?? null
}

export function getCachedNotes(courseId, dateStr) {
  const key = `${courseId}_${dateStr}`
  return _cache?.session_notes?.[key] ?? null
}

// ── Writes (async, updates cache + Supabase) ──────────────────────────────────

async function _upsert(fields) {
  if (!_userId) return
  const { error } = await supabase
    .from('user_data')
    .upsert({ user_id: _userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) console.error('[db] upsert error', error)
}

export async function savePlan(plan) {
  if (_cache) _cache.plan = plan
  await _upsert({ plan })
}

export async function saveSyllabusEvents(events) {
  if (_cache) _cache.syllabus_events = events
  await _upsert({ syllabus_events: events })
}

export async function saveManualSessions(sessions) {
  if (_cache) _cache.manual_sessions = sessions
  await _upsert({ manual_sessions: sessions })
}

export async function saveStudyTools(data) {
  const streak = _cache?.study_tools?._streak
  const updated = streak !== undefined ? { ...data, _streak: streak } : data
  if (_cache) _cache.study_tools = updated
  await _upsert({ study_tools: updated })
}

export async function saveStreak(streakData) {
  const existing = _cache?.study_tools ?? {}
  const updated = { ...existing, _streak: streakData }
  if (_cache) _cache.study_tools = updated
  await _upsert({ study_tools: updated })
}

export async function saveCoachPlan(courseId, plan, formData) {
  const existing = _cache?.coach_plans ?? {}
  const prev = existing[courseId] ?? {}
  const updated = {
    ...existing,
    [courseId]: { ...prev, plan, formData, savedAt: Date.now(), sessionIndex: 0 },
  }
  if (_cache) _cache.coach_plans = updated
  await _upsert({ coach_plans: updated })
}

export async function saveCoachPlanStruggles(courseId, struggles) {
  const existing = _cache?.coach_plans ?? {}
  const updated = {
    ...existing,
    [courseId]: { ...(existing[courseId] ?? {}), struggles },
  }
  if (_cache) _cache.coach_plans = updated
  await _upsert({ coach_plans: updated })
}

export async function saveNotes(courseId, dateStr, notes) {
  const key = `${courseId}_${dateStr}`
  const existing = _cache?.session_notes ?? {}
  const updated = { ...existing, [key]: { ...notes, savedAt: Date.now() } }
  if (_cache) _cache.session_notes = updated
  await _upsert({ session_notes: updated })
}

export async function appendSessionRecall(entry) {
  const existing = _cache?.session_recalls ?? []
  const updated = [...existing, entry].slice(-50)
  if (_cache) _cache.session_recalls = updated
  await _upsert({ session_recalls: updated })
}
