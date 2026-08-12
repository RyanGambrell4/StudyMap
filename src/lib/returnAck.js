/**
 * returnAck - the one line the app says when a student comes back after a gap.
 *
 * If she has been away four or more days, the first thing the app says on her
 * return has to acknowledge the return, once, before it says anything else.
 *
 * What this is NOT:
 *   - a streak-broken message. That already exists and already sends an email,
 *     and it is about what she lost.
 *   - guilt. No "you missed", no "it has been a while", no day count. She knows
 *     how long it has been. Saying it back to her is scolding with extra steps.
 *   - a modal. It is one line, and it disappears once seen.
 *
 * The register is a friend picking the thread back up: "Back. Let us pick up at
 * electron transport." Nothing about the absence, everything about the next move.
 */

const ACK_KEY = 'studyedge_return_ack_v1'
const DAY_MS = 24 * 60 * 60 * 1000

/** Days away before a return is worth acknowledging at all. */
export const AWAY_DAYS = 4

/**
 * Pure core, so this is testable without localStorage or a clock.
 *
 * @param {object}   opts
 * @param {Array}    opts.history  newest-first study history entries
 * @param {number}   opts.now
 * @param {string?}  opts.ackedFor ISO date of the last session we already
 *                                 acknowledged a return against
 * @returns {null | { line: string, topic: string|null, sinceDate: string, daysAway: number }}
 */
export function buildReturnAck({ history = [], now = Date.now(), ackedFor = null } = {}) {
  if (!Array.isArray(history) || history.length === 0) return null

  // Newest entry with a parseable date. getStudyHistory returns newest first,
  // but do not rely on that for correctness.
  let latest = null
  for (const entry of history) {
    const t = Date.parse(entry?.date ?? '')
    if (!Number.isFinite(t)) continue
    if (!latest || t > latest.t) latest = { t, entry }
  }
  if (!latest) return null

  const daysAway = Math.floor((now - latest.t) / DAY_MS)
  if (daysAway < AWAY_DAYS) return null

  // Already said once for this exact absence. Saying it every reload turns a
  // welcome into nagging.
  const sinceDate = new Date(latest.t).toISOString()
  if (ackedFor && ackedFor === sinceDate) return null

  const topicRaw = latest.entry?.topic
  const topic = typeof topicRaw === 'string' && topicRaw.trim() ? topicRaw.trim() : null

  return {
    line: topic ? `Back. Let us pick up at ${topic}.` : 'Back. Let us pick up where you stopped.',
    topic,
    sinceDate,
    daysAway,
  }
}

/** Read the acknowledgement for this session, or null. Safe in any environment. */
export function getReturnAck(now = Date.now()) {
  if (typeof window === 'undefined') return null
  try {
    // Imported lazily-ish via require-free dynamic access so this module stays
    // usable from plain node tests that never touch localStorage.
    const raw = localStorage.getItem('studyedge_study_history')
    const history = raw ? [...JSON.parse(raw)].reverse() : []
    return buildReturnAck({ history, now, ackedFor: localStorage.getItem(ACK_KEY) })
  } catch { return null }
}

/** Record that we have said it, so it is said exactly once per absence. */
export function markReturnAcked(sinceDate) {
  if (!sinceDate) return
  try { localStorage.setItem(ACK_KEY, sinceDate) } catch { /* ignore */ }
}

export default { buildReturnAck, getReturnAck, markReturnAcked, AWAY_DAYS }
