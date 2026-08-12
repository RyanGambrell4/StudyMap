/**
 * streakLogic - the pure rules behind the streak.
 *
 * Split out of useStreak so the date arithmetic can be tested in plain Node
 * without React, Supabase or localStorage. Every function here is a pure
 * function of (stored state, today). No clock reads, no storage, no network.
 *
 * The rules, in one place:
 *   - A streak is ALIVE if it was fed today or yesterday, and DEAD otherwise.
 *     Dead means the displayed streak is 0, not a stale number from last month.
 *   - Completing on the day after the last completion extends the run.
 *     Completing after any longer gap starts a new run at 1.
 *   - A freeze covers exactly one day: today (protect it in advance) or
 *     yesterday (bridge a miss). It never extends a run and never resurrects
 *     one that has already lapsed.
 */

import { addDays } from '../utils/dateUtils.js'

export const MAX_FREEZES = 2

export const EMPTY_STREAK = { lastCompletedDate: null, currentStreak: 0, personalBest: 0 }

/** Is the run still going as of `todayStr`? */
export function isAlive(raw, todayStr) {
  const last = raw?.lastCompletedDate
  if (!last) return false
  return last === todayStr || last === addDays(todayStr, -1)
}

/**
 * What the UI should show. `currentStreak` decays to 0 the moment the run
 * lapses; `lapsedStreak` carries what was lost so the UI can say so.
 */
export function derive(raw, todayStr) {
  const stored = raw?.currentStreak ?? 0
  const alive = isAlive(raw, todayStr)
  return {
    currentStreak: alive ? stored : 0,
    lapsedStreak: !alive && stored > 0 ? stored : 0,
    completedToday: raw?.lastCompletedDate === todayStr,
    personalBest: Math.max(raw?.personalBest ?? 0, stored),
  }
}

/**
 * Apply a completion. Returns the new stored state, or the original object
 * (referentially identical) when the day was already recorded.
 */
export function applyCompletion(raw, dateStr) {
  const base = raw ?? EMPTY_STREAK
  if (!dateStr || base.lastCompletedDate === dateStr) return base
  const continues = base.lastCompletedDate === addDays(dateStr, -1)
  const next = continues ? (base.currentStreak ?? 0) + 1 : 1
  return {
    lastCompletedDate: dateStr,
    currentStreak: next,
    personalBest: Math.max(base.personalBest ?? 0, next),
  }
}

/**
 * Which day a freeze would cover, or null when a freeze cannot be spent.
 *   last === yesterday      -> today is exposed, cover today
 *   last === two days ago   -> yesterday was missed, cover yesterday
 */
export function freezeTarget(raw, freezeCount, todayStr) {
  const last = raw?.lastCompletedDate
  if (!Number.isFinite(freezeCount) || freezeCount <= 0) return null
  if (!last || last === todayStr) return null
  if (last === addDays(todayStr, -1)) return todayStr
  if (last === addDays(todayStr, -2)) return addDays(todayStr, -1)
  return null
}

/**
 * Spend a freeze. Returns the new stored state, or the original when the
 * freeze does not apply. The run length is deliberately unchanged: a freeze
 * protects a streak, it does not grow one.
 */
export function applyFreezeTo(raw, freezeCount, todayStr) {
  const covered = freezeTarget(raw, freezeCount, todayStr)
  if (!covered) return raw ?? EMPTY_STREAK
  return { ...(raw ?? EMPTY_STREAK), lastCompletedDate: covered }
}

/** One freeze per ISO week, hard-capped. Returns the new freeze state. */
export function grantWeeklyFreeze(freeze, isoWeek) {
  const current = freeze ?? { count: 0, weekEarned: null }
  if (current.weekEarned === isoWeek) return current
  return { count: Math.min(MAX_FREEZES, (current.count ?? 0) + 1), weekEarned: isoWeek }
}
