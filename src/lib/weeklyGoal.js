// Weekly Study Goal
// User declares a target number of hours for the current week. We compare
// against the week's completed session minutes and surface progress on the
// dashboard. Anchors weekly intent — a very effective retention lever.

const LS_KEY = 'se_weekly_goal_v1'
const DEFAULT_HOURS = 5

function isoWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(d)
  monday.setDate(d.getDate() - offset)
  return monday.toISOString().slice(0, 10)
}

function loadStore() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') ?? {} } catch { return {} }
}

function saveStore(store) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)) } catch {}
}

export function getWeeklyGoal(todayStr) {
  const store = loadStore()
  const week = isoWeekStart(todayStr)
  return {
    hours:     store[week]?.hours ?? store.default ?? DEFAULT_HOURS,
    weekStart: week,
    // If the user has explicitly set a goal this week, treat as declared —
    // otherwise it's a default and we can prompt for confirmation.
    declared:  Boolean(store[week]),
  }
}

export function setWeeklyGoal(todayStr, hours) {
  const store = loadStore()
  const week = isoWeekStart(todayStr)
  const clamped = Math.max(1, Math.min(80, Math.round(hours)))
  store[week] = { hours: clamped, setAt: Date.now() }
  store.default = clamped // carry forward as a preferred default
  saveStore(store)
  return clamped
}

// Compute progress in minutes for the current week from completedSessionLog.
export function computeWeeklyProgress(completedSessionLog = [], todayStr) {
  const week = isoWeekStart(todayStr)
  const sessions = completedSessionLog.filter(s => {
    const ds = s.dateStr ?? s.date
    return ds && ds >= week && ds <= todayStr
  })
  const minutes = sessions.reduce((acc, s) => {
    if (typeof s.elapsedSeconds === 'number' && s.elapsedSeconds > 0) {
      return acc + s.elapsedSeconds / 60
    }
    return acc + (s.duration ?? 0)
  }, 0)
  return { minutes: Math.round(minutes), sessions: sessions.length, weekStart: week }
}
