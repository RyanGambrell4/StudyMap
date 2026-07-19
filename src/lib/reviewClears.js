// Review Queue clears
// Small persistence layer for tracking when the user brings the spaced
// repetition queue to zero. Powers the "all caught up" celebration copy —
// a weekly counter feels earned in a way a naked empty state never does.

const LS_KEY = 'se_review_clears_v1'

function load() {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

function save(list) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LS_KEY, JSON.stringify(list.slice(-100))) } catch {}
}

// Record a clear timestamp. Debounces: no more than one clear per rolling
// hour, since re-mounting the view or filter toggling shouldn't stack.
export function recordReviewClear(now = Date.now()) {
  const list = load()
  const last = list[list.length - 1]
  if (last && now - last < 60 * 60 * 1000) return { recorded: false, weeklyClears: countThisWeek(list) }
  const next = [...list, now]
  save(next)
  return { recorded: true, weeklyClears: countThisWeek(next) }
}

function countThisWeek(list) {
  const now = new Date()
  const dow = now.getDay()
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  const ts = weekStart.getTime()
  return list.filter(t => t >= ts).length
}

export function getWeeklyClears() {
  return countThisWeek(load())
}

export function getTotalClears() {
  return load().length
}
