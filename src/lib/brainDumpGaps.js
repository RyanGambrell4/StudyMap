// brainDumpGaps.js — lightweight persistent record of the possibleGaps a
// brain dump surfaced for each course. Other features (Connections, Cheat
// Sheet, Quiz Burst) read this so a gap the student left in their brain
// dump on Monday shows up on Tuesday's cheat-sheet ranking without any
// re-processing. Kept separate from masteryStore because these are
// unscored gaps (things the student didn't mention) rather than scored
// mastery blend inputs.

const STORE_KEY = 'se_brain_dump_gaps_v1'
const MAX_ENTRIES = 200

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]') } catch { return [] }
}

function save(entries) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))) } catch {}
}

/**
 * Record the gaps a brain dump surfaced.
 * @param {object} arg
 * @param {string|number|null} arg.courseId
 * @param {string|null}        arg.topic       - topic the dump was scoped to
 * @param {string[]}           arg.gaps        - possibleGaps from the API
 * @param {number|null}        arg.score       - overall score at time of dump
 */
export function recordBrainDumpGaps({ courseId, topic, gaps, score }) {
  if (!Array.isArray(gaps) || gaps.length === 0) return
  const entries = load()
  entries.push({
    courseId: courseId ?? null,
    topic: topic ?? null,
    gaps: gaps.slice(0, 6).filter(g => typeof g === 'string' && g.trim()),
    score: typeof score === 'number' ? score : null,
    ts: Date.now(),
  })
  save(entries)
}

/**
 * Return the N most recent gap entries for a course, most recent first.
 * If courseId is null, returns global entries.
 */
export function getRecentBrainDumpGaps(courseId, limit = 3) {
  return load()
    .filter(e => String(e.courseId ?? '') === String(courseId ?? ''))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
}

/**
 * A flat, deduplicated list of gap strings for this course, most recent
 * first. Handy for passing into an LLM prompt.
 */
export function getBrainDumpGapTopics(courseId, limit = 8) {
  const seen = new Set()
  const out = []
  for (const entry of getRecentBrainDumpGaps(courseId, 10)) {
    for (const g of entry.gaps) {
      const key = g.toLowerCase().trim()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(g)
      if (out.length >= limit) return out
    }
  }
  return out
}
