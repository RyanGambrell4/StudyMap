// lastSessionBridge.js — computes the "since your last session" hint that
// study features show at the top of their setup screen. This is the visible
// side of cross-feature stitching: when a student finishes Quiz Burst and
// then opens Cheat Sheet an hour later, the sheet knows what they closed
// and what they should hit next.
//
// Pure read helper — no writes, no persistence. Runs against masteryStore
// and studyHistory.

import { getStudyHistory } from './studyHistory'
import { getWeakestTopics, getMasteryTrend, getAllMastery } from './masteryStore'
import { getRecentBrainDumpGaps } from './brainDumpGaps'

// Sessions older than 3 days aren't relevant enough to reference in a
// "since your last session" bridge — the student won't remember the context.
const FRESH_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Returns a short human-readable string (or null) summarizing what changed
 * since the student's last completed study session on this course.
 *
 * @param {object} arg
 * @param {string|number|null} arg.courseId
 * @param {string|null}        arg.courseName - used to match study history entries
 * @param {string}             arg.currentTool - the tool the student just opened
 */
export function getLastSessionBridge({ courseId = null, courseName = null, currentTool = null } = {}) {
  const history = getStudyHistory() // most recent first
  const now = Date.now()

  // Find the most recent session on this course from any OTHER tool.
  const recent = history.find(s => {
    if (!s.courseName || s.courseName !== courseName) return false
    if (currentTool && s.tool === currentTool) return false
    const ts = new Date(s.date).getTime()
    return now - ts <= FRESH_MS
  })
  if (!recent) return null

  const hoursAgo = Math.round((now - new Date(recent.date).getTime()) / 3_600_000)
  const when = hoursAgo < 1 ? 'just now' : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo / 24)}d ago`

  // Look for a mastery trend on the topic of that last session.
  let trendLine = null
  if (recent.topic) {
    const allMastery = getAllMastery()
    const key = `${courseId ?? 'global'}::${recent.topic.toLowerCase().trim()}`
    const m = allMastery.find(x => `${x.courseId ?? 'global'}::${x.topic.toLowerCase()}` === key)
    if (m) {
      const trend = getMasteryTrend(m)
      if (trend === 'up') trendLine = `${recent.topic} climbed to ${m.score}/100`
      else if (trend === 'down') trendLine = `${recent.topic} slipped to ${m.score}/100`
      else trendLine = `${recent.topic} sits at ${m.score}/100`
    }
  }

  // Weakest topic on this course, if we have data.
  const weakest = getWeakestTopics(courseId, 1)[0]
  const weakLine = weakest?.topic ? ` — target ${weakest.topic} (${weakest.score}/100) next` : ''

  const scoreLine = typeof recent.score === 'number' ? ` scored ${recent.score}%` : ''
  const parts = [
    `${when}: ${recent.tool}${scoreLine}${recent.topic ? ` on ${recent.topic}` : ''}`,
    trendLine,
  ].filter(Boolean)

  return {
    line: parts.join(' · ') + weakLine,
    recentTool: recent.tool,
    recentTopic: recent.topic,
    recentScore: recent.score,
    hoursAgo,
    weakestTopic: weakest?.topic ?? null,
    weakestScore: weakest?.score ?? null,
  }
}

/**
 * Returns the top brain-dump gap the student has NOT yet drilled — handy for
 * a "you left this gap open" nudge in Quiz Burst / Cheat Sheet.
 */
export function getUnaddressedBrainDumpGap(courseId) {
  const entries = getRecentBrainDumpGaps(courseId, 3)
  if (!entries.length) return null
  const allMastery = getAllMastery()
  for (const e of entries) {
    for (const g of e.gaps) {
      const key = `${courseId ?? 'global'}::${g.toLowerCase().trim()}`
      const m = allMastery.find(x => `${x.courseId ?? 'global'}::${x.topic.toLowerCase()}` === key)
      if (!m || m.score < 70) return { gap: g, score: m?.score ?? null, dumpDateStr: new Date(e.ts).toISOString().slice(0, 10) }
    }
  }
  return null
}
