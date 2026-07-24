// Coach v2 plan store.
//
// Wraps the existing `coach_plans[courseId]` JSONB blob in db.js so the new
// UI can read/write per-session progress without a schema migration. The v2
// plan lives at `coach_plans[courseId].v2` alongside the legacy `plan` +
// `formData` fields so v1 keeps working behind the flag.

import {
  getCachedCoachPlan,
  saveCoachPlan as legacySaveCoachPlan,
} from '../../lib/db'
import { supabase } from '../../lib/supabase'

const V2_KEY = 'v2'

function rand() { return Math.random().toString(36).slice(2, 10) }
export function newSessionId() { return `cs_${Date.now().toString(36)}_${rand()}` }

// ── Read ──────────────────────────────────────────────────────────────────────

export function getV2Plan(courseId) {
  if (!courseId) return null
  const blob = getCachedCoachPlan(courseId)
  return blob?.[V2_KEY] ?? null
}

export function hasV2Plan(courseId) {
  return !!getV2Plan(courseId)
}

// ── Write ─────────────────────────────────────────────────────────────────────

// Writes v2 without stomping the legacy `plan` / `formData` keys.
async function upsertV2(courseId, v2) {
  const blob = getCachedCoachPlan(courseId) ?? {}
  const merged = { ...blob, [V2_KEY]: v2 }
  // legacySaveCoachPlan requires plan + formData shape; call raw supabase upsert
  // to preserve everything already on the blob.
  const uid = (await supabase.auth.getUser()).data.user?.id
  if (!uid) return
  const { data: existing } = await supabase
    .from('user_data')
    .select('coach_plans')
    .eq('user_id', uid)
    .maybeSingle()
  const nextCoachPlans = { ...(existing?.coach_plans ?? {}), [courseId]: merged }
  await supabase
    .from('user_data')
    .upsert({ user_id: uid, coach_plans: nextCoachPlans, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  // Keep in-memory cache in sync so subsequent reads see the write.
  const cacheBlob = getCachedCoachPlan(courseId) ?? {}
  Object.assign(cacheBlob, merged)
}

export async function saveV2Plan(courseId, v2) {
  await upsertV2(courseId, v2)
}

// Also writes the legacy `plan` + `formData` fields so the old view can still
// render if the flag is flipped off later. Called on initial plan save.
export async function saveInitialV2Plan(courseId, v2, legacyPlan, legacyFormData) {
  // Legacy write first (writes plan/formData/savedAt/sessionIndex).
  await legacySaveCoachPlan(courseId, legacyPlan, legacyFormData)
  // Then v2.
  await upsertV2(courseId, v2)
}

// ── Session mutations (idempotent) ────────────────────────────────────────────

// Mark one plan session complete by id. Idempotent — already-complete
// sessions are left alone.
export async function markSessionComplete(courseId, sessionId, completedAt = Date.now()) {
  const v2 = getV2Plan(courseId)
  if (!v2) return { changed: false }
  let changed = false
  const nextWeeks = v2.weeks.map(w => ({
    ...w,
    sessions: w.sessions.map(s => {
      if (s.id !== sessionId) return s
      if (s.status === 'done') return s
      changed = true
      return { ...s, status: 'done', completedAt }
    }),
  }))
  if (!changed) return { changed: false }
  const next = { ...v2, weeks: nextWeeks, updatedAt: Date.now() }
  await upsertV2(courseId, next)
  return { changed: true }
}

// Idempotent cross-credit: find the earliest incomplete session in this course
// whose topic matches, mark exactly one complete. If nothing matches, silent
// no-op. Never re-marks completed sessions. Never marks more than one per call.
export async function crossCreditByTopic(courseId, topic, completedAt = Date.now()) {
  if (!courseId || !topic) return { credited: false }
  const v2 = getV2Plan(courseId)
  if (!v2) return { credited: false }
  const needle = normalizeTopic(topic)
  if (!needle) return { credited: false }
  // Walk in week order, then session order. Take the first incomplete match.
  let target = null
  outer: for (const w of v2.weeks) {
    for (const s of w.sessions) {
      if (s.status === 'done') continue
      if (sessionMatchesTopic(s, needle)) { target = s; break outer }
    }
  }
  if (!target) return { credited: false }
  const res = await markSessionComplete(courseId, target.id, completedAt)
  return { credited: res.changed, sessionId: target.id }
}

function normalizeTopic(t) {
  return String(t || '').toLowerCase().trim()
}

// Session matches if the incoming topic string appears in the session title,
// focus, topic, or any chip. Substring match both directions so
// "Osmosis" matches session "Passive transport: diffusion and osmosis".
function sessionMatchesTopic(s, needle) {
  const haystack = [s.topic, s.title, s.focus, ...(s.chips || [])]
    .filter(Boolean)
    .map(x => x.toLowerCase())
  return haystack.some(h => h.includes(needle) || needle.includes(h))
}

// ── Replan / rebalance ────────────────────────────────────────────────────────

// Redistribute incomplete sessions whose scheduledDate has passed evenly
// across the days remaining until endDate (exam or fallback). Idempotent
// on a given day. Sets `lastRebalancedAt` when at least one session moves.
export async function rebalanceIfNeeded(courseId, todayIso) {
  const v2 = getV2Plan(courseId)
  if (!v2) return { moved: 0 }
  const today = ymdToDate(todayIso)
  const endDate = v2.endDate ? ymdToDate(v2.endDate) : null
  const incomplete = []
  v2.weeks.forEach((w, wi) => w.sessions.forEach((s, si) => {
    if (s.status === 'done') return
    incomplete.push({ wi, si, s })
  }))
  const overdue = incomplete.filter(x => x.s.scheduledDate && ymdToDate(x.s.scheduledDate) < today)
  if (!overdue.length) return { moved: 0 }

  // Determine day pool from today → endDate (or +21 days if no end)
  const finalDate = endDate ?? addDays(today, 21)
  const daysAvailable = Math.max(1, dayDiff(today, finalDate))
  // Space incomplete sessions across available days, preserving sessions
  // already scheduled in the future.
  const future = incomplete.filter(x => !x.s.scheduledDate || ymdToDate(x.s.scheduledDate) >= today)
  const totalToPlace = incomplete.length
  const spacing = Math.max(1, Math.floor(daysAvailable / totalToPlace))

  let cursor = today
  let moved = 0
  const nextWeeks = v2.weeks.map(w => ({ ...w, sessions: w.sessions.map(s => ({ ...s })) }))
  for (const { wi, si, s } of incomplete) {
    const target = new Date(cursor)
    // Future sessions keep their original date unless it's now beyond finalDate
    if (future.includes(future.find(f => f.s.id === s.id))) {
      const orig = ymdToDate(s.scheduledDate)
      if (orig <= finalDate) {
        cursor = addDays(orig, spacing)
        continue
      }
    }
    const newIso = dateToYmd(target)
    if (nextWeeks[wi].sessions[si].scheduledDate !== newIso) {
      nextWeeks[wi].sessions[si].scheduledDate = newIso
      moved += 1
    }
    cursor = addDays(target, spacing)
  }

  if (moved === 0) return { moved: 0 }
  const next = { ...v2, weeks: nextWeeks, lastRebalancedAt: Date.now(), updatedAt: Date.now() }
  await upsertV2(courseId, next)
  return { moved }
}

// ── Progress helpers ──────────────────────────────────────────────────────────

export function planProgress(v2) {
  if (!v2) return { total: 0, done: 0, pct: 0 }
  let total = 0, done = 0
  v2.weeks.forEach(w => w.sessions.forEach(s => { total += 1; if (s.status === 'done') done += 1 }))
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
}

export function firstIncomplete(v2) {
  if (!v2) return null
  for (const w of v2.weeks) {
    for (const s of w.sessions) if (s.status !== 'done') return { week: w, session: s }
  }
  return null
}

export function currentWeekIndex(v2, todayIso) {
  if (!v2) return 0
  const today = ymdToDate(todayIso)
  for (let i = 0; i < v2.weeks.length; i += 1) {
    const w = v2.weeks[i]
    if (w.endIso && ymdToDate(w.endIso) >= today) return i
  }
  return v2.weeks.length - 1
}

// ── Date helpers (self-contained; no dep on utils/dateUtils to keep this pure) ─

export function ymdToDate(iso) {
  // iso: 'YYYY-MM-DD'. Use noon to avoid TZ off-by-one.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}
export function dateToYmd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function addDays(d, n) {
  const nd = new Date(d)
  nd.setDate(nd.getDate() + n)
  return nd
}
export function dayDiff(a, b) {
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}
export function todayIso() {
  return dateToYmd(new Date())
}
