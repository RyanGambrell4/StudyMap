/**
 * Shared date/time utilities - single source of truth across components.
 */

export function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)
}

export function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

// ── Exam countdown ──────────────────────────────────────────────────────────
// Every countdown surface anchors the exam to noon on the exam day. It is the
// convention ExamCountdownCard already shipped with, and having one definition
// is what stops the header pill and the dashboard card disagreeing by a day.

const EXAM_ANCHOR = 'T12:00:00'

export function examMomentMs(dateStr) {
  if (!dateStr) return null
  const ms = new Date(dateStr + EXAM_ANCHOR).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** Whole days until the exam, floored at 0. Null when there is no date. */
export function daysUntil(dateStr) {
  const target = examMomentMs(dateStr)
  if (target === null) return null
  return Math.max(0, Math.ceil((target - Date.now()) / 86400000))
}

/**
 * Live countdown split into days and hours, for the ticking header pill.
 * `past` is true once the exam moment has gone by.
 */
export function countdownParts(dateStr, now = Date.now()) {
  const target = examMomentMs(dateStr)
  if (target === null) return null
  const diff = target - now
  if (diff <= 0) return { days: 0, hours: 0, past: true }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    past: false,
  }
}
