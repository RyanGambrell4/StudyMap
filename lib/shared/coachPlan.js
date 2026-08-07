/**
 * coachPlan.js - the single source of truth for Study Coach plan math.
 *
 * Imported by both the generator (api/generate-study-coach-plan.js) and the
 * plan view (src/components/StudyCoachView.jsx) so a date or a count can never
 * mean two different things on the two sides of the wire.
 *
 * Every formula here is transcribed from the approved design export in
 * design/study-coach/ ("Study Coach Spec", sections 1 and 2). Where a comment
 * quotes the spec, the quote is authoritative and the code follows it.
 *
 * Pure functions only: no React, no DB, no Date.now() reads outside the
 * explicit `today` arguments, so every branch is testable.
 */

const MS_PER_DAY = 86400000
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

// ── Date helpers ─────────────────────────────────────────────────────────────
// All dates in a plan are bare ISO day strings (YYYY-MM-DD). Parsing them as
// local midnight (not UTC) keeps "today" honest for a student in any timezone.

export function parseISO(s) {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const out = new Date(y, m - 1, d)
  return Number.isNaN(out.getTime()) ? null : out
}

export function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso, n) {
  const d = parseISO(iso)
  if (!d) return null
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Whole calendar days between two ISO days, b - a. */
export function daysBetween(a, b) {
  const da = parseISO(a)
  const db = parseISO(b)
  if (!da || !db) return null
  return Math.round((db - da) / MS_PER_DAY)
}

/** Inclusive list of ISO days from `from` to `to`. Empty if `to` precedes `from`. */
export function dateRange(from, to) {
  const n = daysBetween(from, to)
  if (n === null || n < 0) return []
  const out = []
  for (let i = 0; i <= n; i++) out.push(addDays(from, i))
  return out
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Spec: hoursRemaining is "shown to 2 significant decimals (9.0, 5.25, 6.0)".
 * So two decimals, with a single trailing zero trimmed but never the last one:
 * 9 -> "9.0", 5.5 -> "5.5", 5.25 -> "5.25".
 */
export function formatHours(hours) {
  const n = Number(hours)
  if (!Number.isFinite(n)) return '0.0'
  const two = n.toFixed(2)
  return two.endsWith('0') ? two.slice(0, -1) : two
}

// ── Session traversal ────────────────────────────────────────────────────────

/**
 * Flattens weeklyFocus into a single ordered list, tagging each session with
 * its week index, index-within-week, and 1-based plan-wide ordinal. The plan
 * view numbers sessions from this ordinal ("Session 6 · Krebs cycle").
 */
export function flattenSessions(plan) {
  const weeks = Array.isArray(plan?.weeklyFocus) ? plan.weeklyFocus : []
  const out = []
  weeks.forEach((week, wi) => {
    const sessions = Array.isArray(week?.sessions) ? week.sessions : []
    sessions.forEach((session, si) => {
      out.push({ session, week, wi, si, ordinal: out.length + 1 })
    })
  })
  return out
}

/** The next session the student should sit down to: first one not done. */
export function nextSession(plan) {
  return flattenSessions(plan).find(s => !s.session.done) ?? null
}

export function isSessionDone(session) {
  return session?.done === true
}

// ── Plan math (spec section 1) ───────────────────────────────────────────────

/**
 * Every number the plan view renders, computed once from the stored plan.
 *
 * `examDate` is optional and everything that depends on a horizon degrades
 * honestly without it: no behind state, no catch-up, no "Exam in N days".
 * We never invent a horizon (same grounding rule as the plan content itself).
 */
export function computePlanMath(plan, { today, examDate = null } = {}) {
  const flat = flattenSessions(plan)
  const total = flat.length
  const doneList = flat.filter(s => isSessionDone(s.session))
  const done = doneList.length
  const remaining = total - done

  const minutesOf = s => {
    const n = Number(s?.duration)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const hoursRemaining = flat
    .filter(s => !isSessionDone(s.session))
    .reduce((sum, s) => sum + minutesOf(s.session), 0) / 60
  const hoursStudied = doneList.reduce((sum, s) => sum + minutesOf(s.session), 0) / 60

  const hasExamDate = !!parseISO(examDate)

  // Spec: "expectedByToday = count(sessions where scheduledDate <= today)"
  // "a session counts as expected the moment its scheduled date has passed,
  //  whether or not it was done."
  const expectedByToday = flat.filter(s => {
    const d = s.session?.scheduledDate
    return !!parseISO(d) && d <= today
  }).length

  // Spec: "behind = max(0, expectedByToday - done)". Requires a horizon:
  // with no exam date there is no behind state at all (approved decision B).
  const behind = hasExamDate ? Math.max(0, expectedByToday - done) : 0
  // Spec: "stillScheduled = remaining - behind"
  const stillScheduled = remaining - behind

  // Spec: "daysToExam = examDate - today (calendar days, ceil)"
  const daysToExam = hasExamDate ? Math.max(0, daysBetween(today, examDate) ?? 0) : null

  const complete = total > 0 && done === total
  // Spec: "the behind state renders iff behind >= 1". Complete outranks it.
  const isBehind = !complete && behind >= 1

  let state
  if (complete) state = 'complete'
  else if (isBehind) state = 'behind'
  else if (done === 0) state = 'fresh'
  else state = 'mid'

  return {
    total, done, remaining,
    hoursRemaining, hoursStudied,
    expectedByToday, behind, stillScheduled,
    daysToExam, hasExamDate,
    complete, isBehind, state,
  }
}

/**
 * Bar segment widths as percentages. Spec: "Progress bar segments
 * (widths = count / total as %): done blue -> behind amber (behind state
 * only) -> stillScheduled light blue. Segments always sum to total."
 */
export function progressSegments(math) {
  const { total, done, behind, stillScheduled, isBehind } = math
  if (!total) return []
  const pct = n => (n / total) * 100
  if (isBehind) {
    return [
      { key: 'done', count: done, pct: pct(done) },
      { key: 'behind', count: behind, pct: pct(behind) },
      { key: 'stillScheduled', count: stillScheduled, pct: pct(stillScheduled) },
    ].filter(s => s.count > 0)
  }
  return [
    { key: 'done', count: done, pct: pct(done) },
    { key: 'remaining', count: total - done, pct: pct(total - done) },
  ].filter(s => s.count > 0)
}

// ── Scheduling (generation time) ─────────────────────────────────────────────

const MOCK_RE = /mock|practice exam|full.?length|final exam/i

/** The plan's terminal session, which catch-up pins to the last day. */
export function isMockExamSession(session) {
  if (!session) return false
  if (String(session.sessionType || '').toLowerCase() === 'mock test') return true
  return MOCK_RE.test(String(session.focusArea || '') + ' ' + String(session.sessionLabel || ''))
}

const REVIEW_RE = /spaced|cumulative|review/i

/** Sessions catch-up is allowed to shorten before it starts merging. */
export function isReviewSession(session) {
  if (!session) return false
  return REVIEW_RE.test(String(session.sessionType || '') + ' ' + String(session.studyMethod || ''))
}

/**
 * Spreads `count` items across `days` day-slots, returning a day index per item.
 *
 * When the items fit one-per-day they are spaced evenly across the whole
 * window (so a 4-session week does not bunch into the first four days); when
 * they do not fit, they pack evenly at up to ceil(count/days) per day. Either
 * way the final item lands on the final day, which is what lets catch-up honor
 * "the mock exam session always stays last, on the final available day".
 */
export function spreadIndices(count, days) {
  if (count <= 0 || days <= 0) return []
  if (count === 1) return [days - 1]
  if (count <= days) {
    return Array.from({ length: count }, (_, i) => Math.round((i * (days - 1)) / (count - 1)))
  }
  return Array.from({ length: count }, (_, i) => Math.min(days - 1, Math.floor((i * days) / count)))
}

/**
 * Assigns a scheduledDate to every session, bounded by [today+1, examDate-1]
 * when an exam date exists, or by the plan's own week windows when it does not.
 *
 * Deterministic: same plan plus same today always yields the same dates, which
 * is what makes the generator's output reproducible and the tests meaningful.
 */
export function assignScheduledDates(plan, { today, examDate = null } = {}) {
  const flat = flattenSessions(plan)
  if (!flat.length) return plan

  const hasExam = !!parseISO(examDate)
  const firstDay = addDays(today, 1)

  let days
  if (hasExam) {
    // Study up to the day before the exam; the exam day itself is not a slot.
    days = dateRange(firstDay, addDays(examDate, -1))
    // Degenerate horizon (exam today or tomorrow): fall back to the one day we
    // have rather than emitting sessions with no date at all.
    if (!days.length) days = [firstDay]
  } else {
    // No horizon given: honor the week scaffold the generator already locked.
    const weeks = Array.isArray(plan.weeklyFocus) ? plan.weeklyFocus : []
    const start = weeks[0]?.startDate && parseISO(weeks[0].startDate) > parseISO(firstDay)
      ? weeks[0].startDate
      : firstDay
    const lastWeek = weeks[weeks.length - 1]
    const end = lastWeek?.endDate && parseISO(lastWeek.endDate) ? lastWeek.endDate : addDays(start, 7 * Math.max(1, weeks.length))
    days = dateRange(start, end)
    if (!days.length) days = [firstDay]
  }

  const slots = spreadIndices(flat.length, days.length)
  flat.forEach((entry, i) => {
    entry.session.scheduledDate = days[slots[i]]
  })
  return plan
}

// ── Catch-up (spec section 2) ────────────────────────────────────────────────

/**
 * Rebuilds the schedule for the remaining sessions, deterministically and with
 * no AI call. Follows the spec's four numbered rules in order:
 *
 *   1. Redistribute remaining sessions evenly across available days, at most
 *      one session per day while remaining <= daysLeft.
 *   2. If remaining > daysLeft, first shorten review sessions from 45 to 30
 *      min, then merge adjacent sessions that share a topic theme, until
 *      sessions fit at max two per day.
 *   3. The mock exam session always stays last, on the final available day.
 *   4. Session content is never dropped, only compressed or merged.
 *
 * Returns a new plan plus a summary of what it did. Done sessions are never
 * touched, so completed work keeps its original date and its provenance.
 */
export function catchUpReschedule(plan, { today, examDate } = {}) {
  const empty = { plan, changed: false, shortened: 0, merged: 0, days: 0 }
  if (!parseISO(examDate)) return empty

  const days = dateRange(addDays(today, 1), addDays(examDate, -1))
  if (!days.length) return empty

  // Deep-copy the weeks so callers can diff old against new.
  const next = {
    ...plan,
    weeklyFocus: (plan.weeklyFocus || []).map(w => ({
      ...w,
      sessions: (w.sessions || []).map(s => ({ ...s })),
    })),
  }

  const flat = flattenSessions(next)
  const pending = flat.filter(e => !isSessionDone(e.session))
  if (!pending.length) return { ...empty, plan: next }

  let shortened = 0
  let merged = 0

  // Rule 2, first half: shorten reviews before touching anything else.
  if (pending.length > days.length) {
    for (const entry of pending) {
      if (isReviewSession(entry.session) && Number(entry.session.duration) > 30) {
        entry.session.duration = 30
        shortened++
      }
    }
  }

  // Rule 2, second half: merge adjacent same-theme sessions until they fit at
  // two per day. Merging concatenates content rather than discarding it.
  const capacity = days.length * 2
  let working = pending.map(e => e.session)

  const sharesTheme = (a, b) => {
    if (isMockExamSession(a) || isMockExamSession(b)) return false
    const ta = new Set((a.keyTopics || []).map(t => String(t).toLowerCase()))
    const tb = (b.keyTopics || []).map(t => String(t).toLowerCase())
    if (tb.some(t => ta.has(t))) return true
    const pa = a.provenance?.id
    const pb = b.provenance?.id
    return !!pa && pa === pb
  }

  while (working.length > capacity) {
    let mergeAt = -1
    for (let i = 0; i < working.length - 1; i++) {
      if (sharesTheme(working[i], working[i + 1])) { mergeAt = i; break }
    }
    if (mergeAt === -1) break // nothing left to merge; fall through to packing
    const a = working[mergeAt]
    const b = working[mergeAt + 1]
    const combined = {
      ...a,
      focusArea: a.focusArea === b.focusArea ? a.focusArea : `${a.focusArea} and ${b.focusArea}`,
      goal: a.goal === b.goal ? a.goal : `${a.goal} Then: ${b.goal}`,
      keyTopics: [...new Set([...(a.keyTopics || []), ...(b.keyTopics || [])])].slice(0, 6),
      duration: (Number(a.duration) || 0) + (Number(b.duration) || 0),
      mergedFrom: [...(a.mergedFrom || [a.id]), ...(b.mergedFrom || [b.id])].filter(Boolean),
    }
    working.splice(mergeAt, 2, combined)
    merged++
  }

  // Rule 3: pull the mock exam out, schedule everything else, then pin it last.
  const mockIdx = working.findIndex(isMockExamSession)
  const mock = mockIdx >= 0 ? working[mockIdx] : null
  const rest = mock ? working.filter((_, i) => i !== mockIdx) : working

  if (mock) {
    const restDays = days.slice(0, Math.max(1, days.length - 1))
    const slots = spreadIndices(rest.length, restDays.length)
    rest.forEach((s, i) => { s.scheduledDate = restDays[slots[i]] })
    mock.scheduledDate = days[days.length - 1]
  } else {
    const slots = spreadIndices(rest.length, days.length)
    rest.forEach((s, i) => { s.scheduledDate = days[slots[i]] })
  }

  // Write the (possibly merged) working set back into the week structure,
  // keeping completed sessions exactly where they were.
  const rebuilt = redistributeIntoWeeks(next, working)

  return { plan: rebuilt, changed: true, shortened, merged, days: days.length }
}

/**
 * Puts a reworked list of pending sessions back into weeklyFocus. Merging can
 * change the session count, so pending sessions are re-homed into the week
 * whose date window contains their new scheduledDate, falling back to the last
 * week. Completed sessions never move.
 */
function redistributeIntoWeeks(plan, pendingSessions) {
  const weeks = (plan.weeklyFocus || []).map(w => ({
    ...w,
    sessions: (w.sessions || []).filter(isSessionDone),
  }))
  if (!weeks.length) return plan

  const homeFor = (iso) => {
    const idx = weeks.findIndex(w => w.startDate && w.endDate && iso >= w.startDate && iso <= w.endDate)
    if (idx >= 0) return idx
    // Before the first window or after the last: clamp to the nearest end.
    if (weeks[0]?.startDate && iso < weeks[0].startDate) return 0
    return weeks.length - 1
  }

  for (const session of pendingSessions) {
    weeks[homeFor(session.scheduledDate)].sessions.push(session)
  }
  for (const w of weeks) {
    w.sessions.sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')))
  }
  return { ...plan, weeklyFocus: weeks }
}

// ── Completion ───────────────────────────────────────────────────────────────

/**
 * Marks one session done (or not) by its stable id, returning a new plan.
 * This is the only way completion is recorded: the stored plan is canonical,
 * so the hero, the progress bar and the "X of 12" all move off this one write.
 */
export function setSessionDone(plan, sessionId, done, { at = null } = {}) {
  if (!sessionId) return plan
  let hit = false
  const weeklyFocus = (plan?.weeklyFocus || []).map(w => ({
    ...w,
    sessions: (w.sessions || []).map(s => {
      if (s.id !== sessionId) return s
      hit = true
      return { ...s, done: !!done, doneAt: done ? (at || new Date().toISOString()) : null }
    }),
  }))
  return hit ? { ...plan, weeklyFocus } : plan
}

export function findSessionById(plan, sessionId) {
  return flattenSessions(plan).find(e => e.session.id === sessionId) ?? null
}

// ── Migration ────────────────────────────────────────────────────────────────

/**
 * Brings a plan stored before session ids, dates and done flags existed up to
 * the current shape.
 *
 * Without this, every plan a student already had would show 0 of N progress,
 * refuse to push to the calendar (no dates to place), and never be able to
 * record a completed session (no id to write back to). Runs on read and saves
 * only when it actually changed something.
 *
 * Existing content is never rewritten: it only fills in fields that are absent.
 */
export function migratePlan(plan, { today, examDate = null } = {}) {
  if (!plan?.weeklyFocus?.length) return { plan, changed: false }

  const flat = flattenSessions(plan)
  const needsIds = flat.some(f => !f.session.id)
  const needsDates = flat.some(f => !parseISO(f.session.scheduledDate))
  const needsFlags = flat.some(f => typeof f.session.done !== 'boolean')
  if (!needsIds && !needsDates && !needsFlags) return { plan, changed: false }

  const next = {
    ...plan,
    weeklyFocus: plan.weeklyFocus.map((w, wi) => ({
      ...w,
      sessions: (w.sessions || []).map((s, si) => ({
        ...s,
        id: s.id || `cs-w${wi + 1}-s${si + 1}`,
        done: typeof s.done === 'boolean' ? s.done : false,
        doneAt: s.doneAt ?? null,
      })),
    })),
  }

  if (needsDates) {
    // Only date the sessions that have none, so a partially migrated plan does
    // not have its existing schedule shuffled underneath the student.
    const undated = flattenSessions(next).filter(f => !parseISO(f.session.scheduledDate))
    const horizon = examDate ?? next.examDate ?? null
    const scratch = { weeklyFocus: [{ sessions: undated.map(f => f.session) }] }
    assignScheduledDates(scratch, { today, examDate: horizon })
  }
  if (!next.examDate && examDate) next.examDate = examDate

  return { plan: next, changed: true }
}
