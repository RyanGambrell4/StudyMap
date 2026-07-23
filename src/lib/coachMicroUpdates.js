// coachMicroUpdates.js — after every study session, emit a one-liner
// describing what the coach plan just adapted to. Persisted per course so
// the Study Coach view can show a "Recent adaptations" banner and the plan
// feels alive instead of frozen at generation time.
//
// Kept intentionally lightweight — no LLM call needed. All derived from
// masteryStore + last-session data.

import { getMasteryForCourse } from './masteryStore'
import { getStudyHistory } from './studyHistory'

const STORE_KEY = 'se_coach_micro_updates_v1'
const MAX_PER_COURSE = 8

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function save(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)) } catch {}
}

/**
 * Record a micro-update for a course.
 *
 * @param {object} arg
 * @param {string|number|null} arg.courseId
 * @param {string} arg.line     - human-readable summary
 * @param {string} arg.topic    - primary topic touched
 * @param {'up'|'down'|'flat'} arg.direction
 * @param {number} arg.delta    - mastery point change
 */
export function recordCoachMicroUpdate({ courseId, line, topic, direction, delta }) {
  if (!line) return
  const data = load()
  const key = String(courseId ?? 'global')
  const entries = data[key] ?? []
  entries.unshift({ line, topic, direction, delta, ts: Date.now() })
  data[key] = entries.slice(0, MAX_PER_COURSE)
  save(data)
}

export function getCoachMicroUpdates(courseId, limit = 5) {
  const data = load()
  const key = String(courseId ?? 'global')
  return (data[key] ?? []).slice(0, limit)
}

export function clearCoachMicroUpdates(courseId) {
  const data = load()
  const key = String(courseId ?? 'global')
  delete data[key]
  save(data)
}

/**
 * Compute + record a micro-update immediately after a tool session completes.
 * Called by the app's session-complete event handler.
 *
 * Chooses the most notable topic change in this course since the previous
 * micro-update timestamp; skips silently if nothing meaningful moved.
 */
export function emitMicroUpdateFromEvent({ tool, courseId, courseName }) {
  if (!courseId) return null

  // Find the mastery entry that was updated most recently in this course.
  const mastery = getMasteryForCourse(courseId)
  if (!mastery.length) return null
  const recent = [...mastery].sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0))[0]
  if (!recent) return null

  const prev = recent.prevScore
  const cur = recent.score
  const delta = prev != null ? cur - prev : null
  const direction = delta == null ? 'flat' : delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat'

  // Look at what's still weak in this course besides the topic we just moved
  // so we can name the reweight target.
  const stillWeak = mastery
    .filter(m => m.topic.toLowerCase() !== recent.topic.toLowerCase() && m.score < 70)
    .sort((a, b) => a.score - b.score)[0]

  let line = ''
  if (direction === 'up' && delta >= 10) {
    line = `You crushed ${recent.topic} (+${delta} to ${cur}/100).`
    if (stillWeak) line += ` Tomorrow re-weighted toward ${stillWeak.topic} (${stillWeak.score}/100).`
  } else if (direction === 'up') {
    line = `Nudged ${recent.topic} up ${delta} pts to ${cur}/100.`
    if (stillWeak) line += ` Keeping ${stillWeak.topic} on the queue.`
  } else if (direction === 'down' && delta <= -5) {
    line = `${recent.topic} slipped ${Math.abs(delta)} pts to ${cur}/100. Adding a review session before your next exam.`
  } else if (direction === 'flat' && cur < 60) {
    line = `${recent.topic} still stuck at ${cur}/100. Switching to a different explanation angle next session.`
    if (stillWeak) line += ` ${stillWeak.topic} also on the list.`
  } else {
    // Nothing notable — don't spam the coach view.
    return null
  }

  recordCoachMicroUpdate({ courseId, line, topic: recent.topic, direction, delta })
  return line
}

/**
 * Turn a stored micro-update into a human-friendly "X min ago" string.
 */
export function relativeTime(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d}d ago`
}
