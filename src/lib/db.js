/**
 * db.js - Cloud storage layer for StudyEdge AI
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
    completed_sessions: [],
    subscription: null,
  }

  // Backfill missing field for existing rows
  if (_cache && !_cache.completed_sessions) _cache.completed_sessions = []

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
export function getCachedCompletedSessions() { return _cache?.completed_sessions ?? [] }

export function getCachedCoachPlan(courseId) {
  return _cache?.coach_plans?.[courseId] ?? null
}

export function getCachedNotes(courseId, dateStr) {
  const key = `${courseId}_${dateStr}`
  return _cache?.session_notes?.[key] ?? null
}

export function getCachedAllNotes() {
  return _cache?.session_notes ?? {}
}

// ── Writes (async, updates cache + Supabase) ──────────────────────────────────

async function _upsert(fields) {
  if (!_userId) return
  const { error } = await supabase
    .from('user_data')
    .upsert({ user_id: _userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) console.error('[db] upsert error', error)
}

/**
 * Whether the plan_version column exists. Null until we find out, then latched
 * so we log the fallback once rather than on every save.
 */
let _planVersioningAvailable = null

/**
 * Save the plan, refusing to overwrite a newer version written by another tab.
 *
 * savePlan is not read-modify-write against the database, so it is not the race
 * commitReservation has. It is last-write-wins across CLIENTS: two tabs open,
 * each holding its own `courses` array, and the second to save overwrites the
 * first tab's course with a blob that never contained it.
 *
 * The write is now conditional on the version we last read. If another tab has
 * saved since, the update matches zero rows, and rather than pretend it worked
 * we re-read, hand the caller the winning plan, and report the conflict so it
 * can reapply its change onto fresh state.
 *
 * Returns { ok, conflict, plan }:
 *   { ok: true,  conflict: false }              our write landed
 *   { ok: false, conflict: true, plan }         another tab won; `plan` is theirs
 *   { ok: false, conflict: false }              the write failed for another reason
 *
 * Falls back to the old unguarded write while user_data.plan_version does not
 * exist, logging once. That fallback is deliberate. Shipping a client that hard
 * depends on a column nobody has applied is exactly how email_suppression,
 * feature_usage, email_digest and user_data.courses each became a dead feature,
 * and this is not going to be the fifth.
 */
export async function savePlan(plan) {
  if (_cache) _cache.plan = plan
  if (!_userId) return { ok: false, conflict: false }

  const now = new Date().toISOString()

  if (_planVersioningAvailable !== false) {
    const expected = _cache?.plan_version
    if (typeof expected === 'number') {
      const { data, error } = await supabase
        .from('user_data')
        .update({ plan, updated_at: now })
        .eq('user_id', _userId)
        .eq('plan_version', expected)
        .select('plan, plan_version')

      if (!error) {
        _planVersioningAvailable = true
        if (data?.length) {
          if (_cache) _cache.plan_version = data[0].plan_version
          return { ok: true, conflict: false }
        }
        // Zero rows matched: either the row's version moved on, or there is no
        // row yet. Re-read to tell those apart.
        const { data: fresh, error: rereadErr } = await supabase
          .from('user_data')
          .select('plan, plan_version')
          .eq('user_id', _userId)
          .maybeSingle()
        if (rereadErr) {
          // We know our guarded write did not land and we cannot see why.
          // Falling through to the unguarded upsert here would perform exactly
          // the blind overwrite this function exists to prevent, on a row we
          // have just been told we are out of date with. Refuse instead.
          console.error('[db] plan write refused: guarded write matched nothing and the re-read failed', rereadErr)
          return { ok: false, conflict: false }
        }
        if (fresh) {
          console.warn(
            `[db] plan write refused: another session saved version ${fresh.plan_version} ` +
            `while this one held ${expected}. Not overwriting it.`
          )
          if (_cache) { _cache.plan = fresh.plan; _cache.plan_version = fresh.plan_version }
          return { ok: false, conflict: true, plan: fresh.plan }
        }
        // No row at all yet: fall through to the upsert below to create it.
      } else if (isMissingPlanVersion(error)) {
        if (_planVersioningAvailable === null) {
          console.warn(
            '[db] user_data.plan_version does not exist, so concurrent tabs can still ' +
            'overwrite each other. Apply migrations/20260825_plan_version_optimistic_lock.sql.'
          )
        }
        _planVersioningAvailable = false
      } else {
        console.error('[db] plan write error', error)
        return { ok: false, conflict: false }
      }
    }
  }

  // Either versioning is unavailable, or there is no row to guard yet.
  await _upsert({ plan })
  return { ok: true, conflict: false }
}

function isMissingPlanVersion(error) {
  const code = error?.code
  return code === '42703' || code === 'PGRST204' ||
    /plan_version/.test(error?.message ?? '')
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

/**
 * Replaces the stored plan object for a course, leaving formData, struggles
 * and everything else in the envelope untouched.
 *
 * The stored plan is canonical: session completion, catch-up rescheduling and
 * regeneration all land here, and every surface that shows plan or session
 * information reads back from here. Nothing else may keep its own copy.
 */
export async function saveCoachPlanObject(courseId, plan) {
  const existing = _cache?.coach_plans ?? {}
  const prev = existing[courseId] ?? {}
  const updated = { ...existing, [courseId]: { ...prev, plan, savedAt: Date.now() } }
  if (_cache) _cache.coach_plans = updated
  await _upsert({ coach_plans: updated })
}

/**
 * Records that this plan's sessions are on the calendar (or clears it).
 * Persisted so the header's pushed state survives a reload, which it did not
 * when it lived in component state.
 */
export async function saveCoachPlanPushedAt(courseId, pushedAt) {
  const existing = _cache?.coach_plans ?? {}
  const prev = existing[courseId] ?? {}
  const updated = { ...existing, [courseId]: { ...prev, pushedAt } }
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

export async function saveCoachPlanHardNote(courseId, note, sessionLabel) {
  const existing = _cache?.coach_plans ?? {}
  const prev = existing[courseId] ?? {}
  const prevNotes = Array.isArray(prev.pendingHardNotes) ? prev.pendingHardNotes : []
  const newNote = { note, sessionLabel, dateStr: new Date().toISOString().split('T')[0] }
  const updated = {
    ...existing,
    [courseId]: { ...prev, pendingHardNotes: [...prevNotes, newNote].slice(-5) },
  }
  if (_cache) _cache.coach_plans = updated
  await _upsert({ coach_plans: updated })
}

export async function clearCoachPlanHardNotes(courseId) {
  const existing = _cache?.coach_plans ?? {}
  const prev = existing[courseId] ?? {}
  const updated = { ...existing, [courseId]: { ...prev, pendingHardNotes: [] } }
  if (_cache) _cache.coach_plans = updated
  await _upsert({ coach_plans: updated })
}

export function getCachedPracticeExams(courseId) {
  return _cache?.coach_plans?.[courseId]?.practice_exams ?? []
}

export async function savePracticeExam(courseId, exam) {
  const existing = _cache?.coach_plans ?? {}
  const prev = existing[courseId] ?? {}
  const prevExams = Array.isArray(prev.practice_exams) ? prev.practice_exams : []
  const trimmed = [exam, ...prevExams].slice(0, 20) // keep most recent 20
  const updated = {
    ...existing,
    [courseId]: { ...prev, practice_exams: trimmed },
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

export async function saveCompletedSession(record) {
  const existing = _cache?.completed_sessions ?? []
  const filtered = existing.filter(s => s.id !== record.id)
  const updated = [...filtered, record].slice(-500)
  if (_cache) _cache.completed_sessions = updated
  await _upsert({ completed_sessions: updated })
}

export async function removeCompletedSession(id) {
  const existing = _cache?.completed_sessions ?? []
  const updated = existing.filter(s => s.id !== id)
  if (_cache) _cache.completed_sessions = updated
  await _upsert({ completed_sessions: updated })
}

// ── Exam context (stored inside coach_plans to avoid new DB column) ───────────

export function getCachedExamContext() {
  return _cache?.coach_plans?.__exam_context ?? null
}

export async function saveExamContext(context) {
  const existing = _cache?.coach_plans ?? {}
  const updated = { ...existing, __exam_context: context }
  if (_cache) _cache.coach_plans = updated
  await _upsert({ coach_plans: updated })
}

// ── Practice scores (stored inside study_tools to avoid new DB column) ────────

export function getCachedPracticeScores() {
  return _cache?.study_tools?.__practice_scores ?? []
}

export async function savePracticeScores(scores) {
  const existing = _cache?.study_tools ?? {}
  const updated = { ...existing, __practice_scores: scores }
  if (_cache) _cache.study_tools = updated
  await _upsert({ study_tools: updated })
}

export async function appendSessionRecall(entry) {
  const existing = _cache?.session_recalls ?? []
  const updated = [...existing, entry].slice(-50)
  if (_cache) _cache.session_recalls = updated
  await _upsert({ session_recalls: updated })
}

export async function saveEmailDigest(enabled) {
  if (_cache) _cache.email_digest = enabled
  await _upsert({ email_digest: enabled })
}
