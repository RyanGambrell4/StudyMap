// Momentum Score: composite health metric that blends three signals.
//   - Consistency: active-day density over the past 14 days
//   - Mastery velocity: net topic score movement over the past 14 days
//   - Completion rate: fraction of planned sessions that were finished
//
// Everything is derived from data already in localStorage / props,
// so there is no new persistence layer.

import { getAllMastery } from './masteryStore'

const DAY = 24 * 60 * 60 * 1000

function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function pastNDates(n) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - i)
    return toDateStr(d)
  })
}

// Consistency: 0-100 based on active-day density.
export function computeConsistency(completedSessionLog = [], windowDays = 14) {
  const dates = pastNDates(windowDays)
  const activeDays = new Set(completedSessionLog.map(s => s.date))
  const hit = dates.filter(d => activeDays.has(d)).length
  return Math.round((hit / windowDays) * 100)
}

// Mastery velocity: 0-100 mapping of net score change.
// +15 avg score change over the window = 100. Flat = 50. -15 = 0.
export function computeMasteryVelocity(windowDays = 14) {
  const all = getAllMastery()
  if (!all.length) return 50
  const cutoff = Date.now() - windowDays * DAY
  const recent = all.filter(m => m.lastUpdated && m.lastUpdated > cutoff && m.prevScore != null)
  if (!recent.length) return 50
  const avgDelta = recent.reduce((s, m) => s + (m.score - m.prevScore), 0) / recent.length
  const clamped = Math.max(-15, Math.min(15, avgDelta))
  return Math.round(50 + (clamped / 15) * 50)
}

// Completion rate: 0-100 based on scheduled vs completed.
export function computeCompletionRate(allSessions = [], completedIds, todayStr, windowDays = 14) {
  const completed = completedIds instanceof Set ? completedIds : new Set(completedIds ?? [])
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - windowDays)
  const cutoffStr = toDateStr(cutoff)
  const eligible = allSessions.filter(s => s.date && s.date >= cutoffStr && s.date <= todayStr)
  if (!eligible.length) return 50
  const done = eligible.filter(s => completed.has(s.id)).length
  return Math.round((done / eligible.length) * 100)
}

// Momentum Score: weighted combination.
// Consistency 45%, Mastery Velocity 30%, Completion 25%.
export function computeMomentum({ completedSessionLog, allSessions, completedIds, todayStr, windowDays = 14 } = {}) {
  const consistency = computeConsistency(completedSessionLog, windowDays)
  const velocity    = computeMasteryVelocity(windowDays)
  const completion  = computeCompletionRate(allSessions ?? [], completedIds, todayStr, windowDays)
  const score = Math.round(consistency * 0.45 + velocity * 0.30 + completion * 0.25)
  return { score, consistency, velocity, completion }
}

// Momentum a week ago -- used for week-over-week delta.
export function computeMomentumLastWeek({ completedSessionLog, allSessions, completedIds, todayStr } = {}) {
  // Filter both datasets to 14..7 days ago.
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = toDateStr(cutoff)
  const past = (completedSessionLog ?? []).filter(s => s.date && s.date < cutoffStr)
  const pastSessions = (allSessions ?? []).filter(s => s.date && s.date < cutoffStr)
  return computeMomentum({
    completedSessionLog: past,
    allSessions: pastSessions,
    completedIds,
    todayStr: cutoffStr,
    windowDays: 7,
  })
}

// Labels used across UI.
export function momentumLabel(score) {
  if (score >= 80) return 'Peak momentum'
  if (score >= 65) return 'Strong'
  if (score >= 45) return 'Building'
  if (score >= 25) return 'Slipping'
  return 'Restart needed'
}

export function momentumColor(score) {
  if (score >= 65) return '#16A34A'
  if (score >= 45) return '#3B61C4'
  if (score >= 25) return '#D97706'
  return '#DC2626'
}

// Detect "comeback" state: no sessions in the last 3+ days but had sessions before.
export function detectComeback(completedSessionLog = []) {
  if (!completedSessionLog.length) return null
  const dates = new Set(completedSessionLog.map(s => s.date))
  const now = new Date()
  let gap = 0
  for (let i = 0; i < 21; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    if (dates.has(toDateStr(d))) break
    gap++
  }
  if (gap < 3) return null

  // Find most recent session date within the last 30 days.
  let lastSessionDate = null
  for (let i = 3; i < 30; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    if (dates.has(toDateStr(d))) { lastSessionDate = toDateStr(d); break }
  }
  if (!lastSessionDate) return null

  return { daysAway: gap, lastSessionDate }
}
