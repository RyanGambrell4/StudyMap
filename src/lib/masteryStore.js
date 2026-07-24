// Concept mastery tracking -- persisted in localStorage.
// Every AI practice tool writes scores here. The Mastery Map reads them.

const STORE_KEY = 'se_mastery_v2'

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}

function save(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)) } catch {}
}

// Blend a new score into an existing one (exponential moving average).
// New observations carry 40% weight so early outliers don't dominate.
function blend(existing, incoming) {
  if (existing == null) return Math.round(incoming)
  return Math.round(existing * 0.6 + incoming * 0.4)
}

function makeKey(topic, courseId) {
  return `${courseId ?? 'global'}::${topic.toLowerCase().trim()}`
}

export function updateMastery(topic, courseId, score, source) {
  if (!topic || score == null) return
  const key = makeKey(topic, courseId)
  const data = load()
  const prev = data[key]
  const prevHistory = prev?.history ?? []
  data[key] = {
    topic: topic.trim(),
    courseId: courseId ?? null,
    score: blend(prev?.score, score),
    prevScore: prev?.score ?? null,
    lastUpdated: Date.now(),
    source,
    count: (prev?.count ?? 0) + 1,
    history: [...prevHistory, score].slice(-6),
  }
  save(data)
}

export function getMastery(topic, courseId) {
  return load()[makeKey(topic, courseId)] ?? null
}

export function getAllMastery() {
  return Object.values(load())
}

export function getMasteryForCourse(courseId) {
  return Object.values(load()).filter(m => String(m.courseId) === String(courseId))
}

export function getWeakestTopics(courseId, limit = 5) {
  const items = courseId ? getMasteryForCourse(courseId) : getAllMastery()
  return items
    .filter(m => m.score != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
}

export function getMasteryLevel(score) {
  if (score == null) return 'unknown'
  if (score < 40) return 'weak'
  if (score < 70) return 'developing'
  return 'strong'
}

export function getMasteryColor(score) {
  if (score == null) return '#9B9B9B'
  if (score < 40) return '#DC2626'
  if (score < 70) return '#D97706'
  return '#16A34A'
}

export function getMasteryTrend(entry) {
  if (entry.prevScore == null || entry.count < 2) return null
  const delta = entry.score - entry.prevScore
  if (Math.abs(delta) < 3) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

export function getMasterySummary() {
  const all = getAllMastery()
  if (!all.length) return null
  const avg = Math.round(all.reduce((s, m) => s + m.score, 0) / all.length)
  return {
    total: all.length,
    avg,
    strong: all.filter(m => m.score >= 70).length,
    developing: all.filter(m => m.score >= 40 && m.score < 70).length,
    weak: all.filter(m => m.score < 40).length,
  }
}

// Average mastery score (0-100) for one course, or all courses if courseId is null.
// Returns null when no mastery entries exist yet — callers should hide the
// recall delta line in the results screen in that case.
export function getAverageMastery(courseId = null) {
  const items = courseId ? getMasteryForCourse(courseId) : getAllMastery()
  const scored = items.filter(m => m.score != null)
  if (!scored.length) return null
  return Math.round(scored.reduce((s, m) => s + m.score, 0) / scored.length)
}

// Spaced repetition interval in milliseconds based on mastery score.
// Weak topics need review sooner; strong topics can wait longer.
function getReviewInterval(score) {
  if (score < 40) return 1 * 24 * 60 * 60 * 1000   // 1 day
  if (score < 60) return 2 * 24 * 60 * 60 * 1000   // 2 days
  if (score < 75) return 4 * 24 * 60 * 60 * 1000   // 4 days
  return 7 * 24 * 60 * 60 * 1000                    // 7 days
}

// Returns topics due for review, sorted by urgency (most overdue first).
export function getDueForReview(courseId = null, limit = 20) {
  const now = Date.now()
  const items = courseId ? getMasteryForCourse(courseId) : getAllMastery()
  return items
    .map(m => {
      const interval = getReviewInterval(m.score)
      const dueAt = (m.lastUpdated ?? 0) + interval
      const overdueMs = now - dueAt
      return { ...m, dueAt, overdueMs, isDue: overdueMs >= 0 }
    })
    .filter(m => m.isDue)
    .sort((a, b) => b.overdueMs - a.overdueMs)
    .slice(0, limit)
}

// Returns upcoming topics not yet due but due within the next N days.
export function getUpcomingReviews(courseId = null, withinDays = 3) {
  const now = Date.now()
  const cutoff = now + withinDays * 24 * 60 * 60 * 1000
  const items = courseId ? getMasteryForCourse(courseId) : getAllMastery()
  return items
    .map(m => {
      const interval = getReviewInterval(m.score)
      const dueAt = (m.lastUpdated ?? 0) + interval
      return { ...m, dueAt }
    })
    .filter(m => m.dueAt > now && m.dueAt <= cutoff)
    .sort((a, b) => a.dueAt - b.dueAt)
}

// Summary counts for the review queue badge.
export function getReviewStats() {
  const due = getDueForReview()
  const upcoming = getUpcomingReviews()
  return { dueCount: due.length, upcomingCount: upcoming.length }
}
