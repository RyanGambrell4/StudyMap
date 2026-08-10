// Knowledge Map: pure derivation from recorded evidence.
//
// Everything the map claims about a topic is computed here, from evidence
// rows that were actually recorded by a tool the student used. There is no
// modelling, no smoothing, no projection. If a number is on screen, a row in
// public.topic_signals put it there, and the evidence line names the event
// and the date it happened.
//
// This module is deliberately free of React, storage, and network access so
// the rules can be tested directly. The caller supplies `now` so relative
// dates and staleness are deterministic under test.

import { KM_SOLID_AT, KM_STALE_DAYS } from '../theme/tokens'

const DAY_MS = 24 * 60 * 60 * 1000

// How a raw signal_type presents to the student. The map only ever shows
// these labels; it never shows a raw signal_type.
export const SOURCE_LABELS = {
  brain_dump_score:     'Brain Dump',
  brain_dump_gap:       'Brain Dump',
  teach_it_back:        'Teach It Back',
  quiz_answer:          'Quiz',
  practice_exam_answer: 'Practice Exam',
  repair_misconception: 'Misconception repair',
}

// Signal types that arrive as one row per question and have to be folded into
// a single scored event before they mean anything to a student. A single row
// here is one right-or-wrong answer, not a score.
const PER_QUESTION_TYPES = new Set(['quiz_answer', 'practice_exam_answer'])

// Signal types that record that something happened without grading it. These
// count as evidence of activity, so the row stops saying "No evidence yet",
// but they can never make a topic read Solid on their own.
const UNSCORED_TYPES = new Set(['brain_dump_gap'])

// Per-question rows this far apart belong to different sittings. Two hours is
// comfortably longer than any single exam and far shorter than the gap
// between two attempts at the same material.
const SESSION_GAP_MS = 2 * 60 * 60 * 1000

export function topicKey(topic) {
  return String(topic ?? '').trim().toLowerCase()
}

// Idempotent normalizer for stored evidence rows.
//
// Modelled on migratePlan in lib/shared/coachPlan.js: it returns the input
// untouched when nothing is missing, fills absent optional fields with
// explicit nulls, and never overwrites a value that is already present. It
// never invents a score: a row with no score comes out with score null, which
// is what makes it unscored evidence rather than a zero.
//
// Returns { records, changed } so a caller can skip a write when nothing moved.
export function normalizeEvidence(records) {
  if (!Array.isArray(records)) return { records: [], changed: !Array.isArray(records) }

  let changed = false
  const out = records.map(raw => {
    if (!raw || typeof raw !== 'object') { changed = true; return null }

    const topic = typeof raw.topic === 'string' ? raw.topic.trim() : ''
    if (!topic) { changed = true; return null }

    const normalized = {
      topic,
      topicKey: raw.topicKey ?? topicKey(topic),
      courseId: raw.courseId ?? null,
      courseName: raw.courseName ?? null,
      signalType: raw.signalType ?? null,
      // score stays null unless a real number was recorded. Never defaulted
      // to 0: a missing score means "not graded", and 0 means "graded zero".
      score: typeof raw.score === 'number' && Number.isFinite(raw.score) ? raw.score : null,
      at: typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : null,
      detail: raw.detail ?? null,
      count: typeof raw.count === 'number' && Number.isFinite(raw.count) ? raw.count : null,
    }

    // changed is true only when this pass actually had to supply something.
    for (const k of Object.keys(normalized)) {
      if (!(k in raw) || raw[k] !== normalized[k]) { changed = true; break }
    }
    return normalized
  }).filter(Boolean)

  return { records: out, changed }
}

// Fold raw signal rows into the events a student would recognise.
//
// Per-question types are grouped into sittings and averaged, so twelve
// quiz_answer rows become one "Quiz 62, 12 questions" event rather than
// twelve rows of 100 and 0. Everything else is already one row per event.
export function aggregateEvidence(records) {
  const { records: rows } = normalizeEvidence(records)

  const perQuestion = []
  const singles = []
  for (const r of rows) {
    if (PER_QUESTION_TYPES.has(r.signalType)) perQuestion.push(r)
    else singles.push(r)
  }

  const events = singles.map(r => ({
    topic: r.topic,
    topicKey: r.topicKey,
    courseId: r.courseId,
    courseName: r.courseName,
    signalType: r.signalType,
    source: SOURCE_LABELS[r.signalType] ?? r.signalType ?? 'Evidence',
    // An unscored type carries no number no matter what is in the column.
    score: UNSCORED_TYPES.has(r.signalType) ? null : r.score,
    at: r.at,
    detail: r.detail,
    questionCount: null,
  }))

  // Group per-question rows by topic, then split on gaps in time.
  const byTopic = new Map()
  for (const r of perQuestion) {
    const key = `${r.courseId ?? 'global'}::${r.topicKey}::${r.signalType}`
    if (!byTopic.has(key)) byTopic.set(key, [])
    byTopic.get(key).push(r)
  }

  for (const group of byTopic.values()) {
    const dated = group.filter(r => r.at != null).sort((a, b) => a.at - b.at)
    const undated = group.filter(r => r.at == null)

    let cluster = []
    const flush = () => {
      if (!cluster.length) return
      const scored = cluster.filter(r => typeof r.score === 'number')
      const head = cluster[cluster.length - 1]
      events.push({
        topic: head.topic,
        topicKey: head.topicKey,
        courseId: head.courseId,
        courseName: head.courseName,
        signalType: head.signalType,
        source: SOURCE_LABELS[head.signalType] ?? head.signalType,
        score: scored.length
          ? Math.round((scored.reduce((s, r) => s + r.score, 0) / scored.length))
          : null,
        at: head.at,
        detail: null,
        questionCount: cluster.length,
      })
      cluster = []
    }

    for (const r of dated) {
      if (cluster.length && r.at - cluster[cluster.length - 1].at > SESSION_GAP_MS) flush()
      cluster.push(r)
    }
    flush()

    // Undated per-question rows cannot be placed on a timeline, so they are
    // not shown. Dropping them is the honest option: the map's contract is
    // that every claim carries a real date.
    void undated
  }

  return events.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
}

export function ageInDays(at, now) {
  if (at == null) return null
  return Math.floor((now - at) / DAY_MS)
}

export function isStale(at, now) {
  const days = ageInDays(at, now)
  if (days == null) return false
  return days > KM_STALE_DAYS
}

// "today", "1 day ago", "12 days ago". Deliberately coarse: the map is about
// what you know, not what time it was.
export function formatAge(at, now) {
  const days = ageInDays(at, now)
  if (days == null) return null
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

// The status of one topic, derived only from its evidence.
//
//   no scored evidence            -> untested
//   latest scored evidence >= 80  -> solid
//   latest scored evidence  < 80  -> shaky
//
// Staleness is carried alongside the status, never instead of it: an aged
// Solid topic is still Solid, it just shows a hollow dot and the "(a while
// ago)" suffix. Evidence that was recorded without a score counts as
// activity, so the row names the event without a number, but it cannot lift
// a topic to Solid on its own.
export function deriveStatus(records, { now } = {}) {
  const at = now ?? Date.now()
  const events = Array.isArray(records) && records.length && records[0]?.source
    ? [...records].sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    : aggregateEvidence(records)

  const scored = events.filter(e => typeof e.score === 'number')
  const latestScored = scored.length
    ? scored.reduce((best, e) => ((e.at ?? 0) > (best.at ?? 0) ? e : best))
    : null
  const latestEvent = events.length
    ? events.reduce((best, e) => ((e.at ?? 0) > (best.at ?? 0) ? e : best))
    : null

  let status = 'untested'
  if (latestScored) status = latestScored.score >= KM_SOLID_AT ? 'solid' : 'shaky'

  // Staleness is measured from the evidence that decided the status. With no
  // scored evidence there is no status to age, so untested is never stale.
  const stale = latestScored ? isStale(latestScored.at, at) : false

  return {
    status,
    stale,
    score: latestScored ? latestScored.score : null,
    latestScored,
    latestEvent,
    scoredCount: scored.length,
    eventCount: events.length,
    events,
    evidenceLine: buildEvidenceLine({ latestScored, latestEvent, now: at }),
  }
}

// The line under a topic name. Three shapes, in priority order:
//   scored    "Brain Dump 58, 6 days ago"  (+ " (a while ago)" when stale)
//   unscored  "Brain Dump, 3 days ago"     (names the event, no number)
//   nothing   "No evidence yet"
export function buildEvidenceLine({ latestScored, latestEvent, now }) {
  const event = latestScored ?? latestEvent
  if (!event) return { text: 'No evidence yet', stale: false, staleSuffix: null }

  const age = formatAge(event.at, now)
  const base = typeof event.score === 'number'
    ? `${event.source} ${event.score}${age ? `, ${age}` : ''}`
    : `${event.source}${age ? `, ${age}` : ''}`

  const stale = latestScored ? isStale(latestScored.at, now) : false
  return { text: base, stale, staleSuffix: stale ? '(a while ago)' : null }
}

// Rank for hero selection. Shaky is the thing to fix, Untested is the thing
// to find out about, Solid is the thing to leave alone.
const HERO_RANK = { shaky: 0, untested: 1, solid: 2 }

// Which topic to put in the "Check this next" card.
//
// Shakiest first, then the stalest evidence among equally-ranked topics, then
// alphabetical so the choice is stable across renders and across sessions.
// When every topic is Solid and fresh the card congratulates instead and
// offers the stalest Solid topic as a refresh.
export function selectHero(topics, { now } = {}) {
  const at = now ?? Date.now()
  const evaluated = (topics ?? [])
    .filter(t => t && typeof t.topic === 'string' && t.topic.trim())
    .map(t => ({ ...t, derived: t.derived ?? deriveStatus(t.evidence ?? [], { now: at }) }))

  if (!evaluated.length) return null

  const sorted = [...evaluated].sort((a, b) => {
    const rank = HERO_RANK[a.derived.status] - HERO_RANK[b.derived.status]
    if (rank !== 0) return rank
    // Stalest first. A topic with no dated evidence sorts as maximally stale,
    // because "we have never seen this" is at least as urgent as "we saw it
    // a long time ago".
    const aAt = a.derived.latestScored?.at ?? a.derived.latestEvent?.at ?? -Infinity
    const bAt = b.derived.latestScored?.at ?? b.derived.latestEvent?.at ?? -Infinity
    if (aAt !== bAt) return aAt - bAt
    return a.topic.localeCompare(b.topic)
  })

  const allSolidAndFresh = evaluated.every(t => t.derived.status === 'solid' && !t.derived.stale)

  if (allSolidAndFresh) {
    const stalestSolid = [...evaluated].sort((a, b) => {
      const aAt = a.derived.latestScored?.at ?? -Infinity
      const bAt = b.derived.latestScored?.at ?? -Infinity
      if (aAt !== bAt) return aAt - bAt
      return a.topic.localeCompare(b.topic)
    })[0]
    return {
      mode: 'congratulate',
      topic: stalestSolid,
      headline: 'Nothing is shaky. Keep it that way.',
      evidence: heroEvidenceCopy(stalestSolid, at),
    }
  }

  const pick = sorted[0]
  return {
    mode: 'check',
    topic: pick,
    headline: pick.topic,
    evidence: heroEvidenceCopy(pick, at),
  }
}

// The hero's one-line justification. It restates the evidence that put the
// topic at the top of the list, so the card can never claim more than the
// row below it does.
export function heroEvidenceCopy(entry, now) {
  if (!entry) return null
  const { latestScored, latestEvent, status } = entry.derived

  if (status === 'untested' && !latestEvent) {
    return 'No evidence recorded for this yet.'
  }
  if (status === 'untested' && latestEvent) {
    const age = formatAge(latestEvent.at, now)
    return `${latestEvent.source} recorded this${age ? ` ${age}` : ''}, but nothing scored it.`
  }

  const age = formatAge(latestScored.at, now)
  const sourcePhrase = latestScored.source === 'Quiz'
    ? 'in a quiz'
    : latestScored.source === 'Practice Exam'
      ? 'in a practice exam'
      : latestScored.source === 'Teach It Back'
        ? 'teaching it back'
        : 'in a Brain Dump'

  if (status === 'solid') {
    return `Scored ${latestScored.score} ${sourcePhrase} ${age}. Worth a refresh.`
  }
  return `Scored ${latestScored.score} ${sourcePhrase} ${age}. Nothing since.`
}

// "8 of 14 solid". A plain count of topics, never a synthetic percentage and
// never an average of scores.
export function courseAggregate(topics, { now } = {}) {
  const at = now ?? Date.now()
  const evaluated = (topics ?? []).map(t => t.derived ?? deriveStatus(t.evidence ?? [], { now: at }))
  return {
    total: evaluated.length,
    solid: evaluated.filter(d => d.status === 'solid').length,
  }
}

// The topic detail panel draws a sparkline only once there is a real shape to
// show. Two points is a line segment, not a trend.
export const SPARKLINE_MIN_POINTS = 3

export function sparklinePoints(derived) {
  const scored = (derived?.events ?? [])
    .filter(e => typeof e.score === 'number' && e.at != null)
    .sort((a, b) => a.at - b.at)
  if (scored.length < SPARKLINE_MIN_POINTS) return null
  return scored.map(e => ({ at: e.at, score: e.score }))
}
