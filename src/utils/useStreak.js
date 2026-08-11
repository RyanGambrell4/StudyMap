/**
 * useStreak - the app's streak store.
 *
 * This is a module-level store rather than per-component state, for a reason
 * that cost us the entire streak mechanic once already:
 *
 *   The previous version recorded completions inside DashboardView (V1). The
 *   `se_dashboard_v2` flag defaults ON, so DashboardViewV2 renders instead and
 *   V1 never mounts. Nothing called recordCompletion, nothing listened to
 *   `studyedge:tool-session-complete`, and every user on the default dashboard
 *   sat at a permanent 0-day streak while fourteen different tools dispatched
 *   completion events into the void.
 *
 * So recording no longer lives in a view. The store owns the window listener
 * itself, which means it works regardless of which dashboard (or which future
 * dashboard) happens to be mounted. Views only read.
 *
 * Because every consumer reads the same store through useSyncExternalStore,
 * the number updates live everywhere the moment it changes, instead of three
 * useState copies drifting apart.
 *
 * Dates follow the app-wide convention in dateUtils (`toDateStr`, UTC-derived)
 * so this agrees with the `todayStr` OutputView threads through everything
 * else. That convention rolls over before local midnight in western
 * timezones; that is a pre-existing app-wide issue and deliberately not
 * forked here, because a streak that disagrees with the calendar it is drawn
 * next to is worse than one that rolls early.
 */

import { useSyncExternalStore, useCallback } from 'react'
import { getCachedStreak, saveStreak } from '../lib/db'
import { toDateStr } from './dateUtils'
import {
  MAX_FREEZES,
  EMPTY_STREAK as EMPTY,
  derive,
  applyCompletion,
  freezeTarget,
  applyFreezeTo,
  grantWeeklyFreeze,
} from '../lib/streakLogic'

const STORAGE_KEY = 'studyedge_streak'
const FREEZE_KEY  = 'studyedge_streak_freeze'

/**
 * Two. The old code granted one freeze per week forever with no ceiling, so a
 * user returning in week twelve had twelve freezes and a streak that could
 * never actually break. A streak you cannot lose exerts no pull at all.
 */
export { MAX_FREEZES }

const hasWindow = typeof window !== 'undefined'

function today() { return toDateStr(new Date()) }

function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// ── Persistence ─────────────────────────────────────────────────────────────

function loadStreak() {
  const cached = getCachedStreak()
  if (cached) return { ...EMPTY, ...cached }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...EMPTY, ...JSON.parse(raw) }
  } catch { /* unreadable storage is the same as no storage */ }
  return EMPTY
}

function persistStreak(next) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* quota or private mode */ }
  saveStreak(next).catch(() => {})
}

function loadFreeze() {
  try {
    const raw = localStorage.getItem(FREEZE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed) return { count: 0, weekEarned: null }
    // Clamp on read so anyone carrying a pre-cap balance lands back in range.
    return { count: Math.min(MAX_FREEZES, parsed.count ?? 0), weekEarned: parsed.weekEarned ?? null }
  } catch { return { count: 0, weekEarned: null } }
}

function persistFreeze(next) {
  try { localStorage.setItem(FREEZE_KEY, JSON.stringify(next)) } catch { /* quota or private mode */ }
}

// ── State ───────────────────────────────────────────────────────────────────

let _raw    = hasWindow ? loadStreak() : EMPTY
let _freeze = hasWindow ? loadFreeze() : { count: 0, weekEarned: null }
let _snapshot = null
const listeners = new Set()

/**
 * One freeze per ISO week, up to the cap. Runs at module init rather than in a
 * useState initialiser, which is where it used to live - that wrote to
 * localStorage during render and could double-award under StrictMode.
 */
function ensureWeeklyFreeze() {
  if (!hasWindow) return
  const next = grantWeeklyFreeze(_freeze, getISOWeek())
  if (next === _freeze) return
  _freeze = next
  persistFreeze(_freeze)
}

function buildSnapshot() {
  const t = today()
  return {
    ...derive(_raw, t),
    lastCompletedDate: _raw.lastCompletedDate,
    canFreeze:         freezeTarget(_raw, _freeze.count, t) !== null,
    freezeCount:       _freeze.count,
    maxFreezes:        MAX_FREEZES,
  }
}

function getSnapshot() {
  if (!_snapshot) _snapshot = buildSnapshot()
  return _snapshot
}

const SERVER_SNAPSHOT = {
  currentStreak: 0, lastCompletedDate: null, completedToday: false,
  personalBest: 0, lapsedStreak: 0, canFreeze: false,
  freezeCount: 0, maxFreezes: MAX_FREEZES,
}
function getServerSnapshot() { return SERVER_SNAPSHOT }

function emit() {
  _snapshot = buildSnapshot()
  listeners.forEach((l) => { try { l() } catch { /* a bad subscriber must not stop the rest */ } })
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * The date can roll while the tab sits open overnight, which changes the
 * snapshot without any store mutation. Recompute on the events that mean a
 * human came back, and only notify when something actually moved.
 */
function refresh() {
  const prev = getSnapshot()
  const next = buildSnapshot()
  const changed =
    prev.currentStreak !== next.currentStreak ||
    prev.completedToday !== next.completedToday ||
    prev.lapsedStreak !== next.lapsedStreak ||
    prev.canFreeze !== next.canFreeze ||
    prev.freezeCount !== next.freezeCount
  if (!changed) return
  _snapshot = next
  listeners.forEach((l) => { try { l() } catch { /* as above */ } })
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function recordCompletion(dateStr = today()) {
  const next = applyCompletion(_raw, dateStr)
  if (next === _raw) return          // already recorded for that day
  _raw = next
  persistStreak(_raw)
  emit()
}

/**
 * Spend a freeze on the exposed day. Returns whether it applied, so callers can
 * avoid showing a success state for a no-op.
 */
function applyFreeze(dateStr = today()) {
  // Resolve the covered day before spending anything, so the two updates cannot
  // disagree about whether the freeze was applicable.
  const next = applyFreezeTo(_raw, _freeze.count, dateStr)
  if (next === _raw) return false

  _freeze = { ..._freeze, count: Math.max(0, _freeze.count - 1) }
  persistFreeze(_freeze)

  _raw = next
  persistStreak(_raw)
  emit()
  return true
}

/** Test seam. Not used by the app. */
export function _resetStreakForTesting() {
  _raw = EMPTY
  _freeze = { count: 0, weekEarned: null }
  _snapshot = null
  emit()
}

// ── Wiring ──────────────────────────────────────────────────────────────────
// The single recording path in the app. Fourteen tools already dispatch this
// event; previously only the unmounted V1 dashboard listened for it.

if (hasWindow) {
  ensureWeeklyFreeze()
  window.addEventListener('studyedge:tool-session-complete', () => recordCompletion())
  window.addEventListener('visibilitychange', refresh)
  window.addEventListener('focus', refresh)
}

export function useStreak() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    ...snap,
    recordCompletion: useCallback((d) => recordCompletion(d), []),
    // Named spendFreeze, not useFreeze: it is a plain action, and a `use`
    // prefix makes rules-of-hooks reject every call inside an event handler.
    spendFreeze:      useCallback((d) => applyFreeze(d), []),
  }
}
