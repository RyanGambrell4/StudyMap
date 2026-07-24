// Coach v2 plan generation, why-lines, trust-line, extra-reps flags,
// grade-gap logic, and countdown clamping.
//
// HARD PRODUCT RULE — enforced at generation time by assertNoGuessing():
//   Everything the Study Coach shows must come from the student's own
//   inputs: pasted topic text, extracted text from uploaded PDFs/DOCX/PPTX,
//   syllabus events, marked struggles, prior recall scores, or completed
//   session records. The coach must NEVER emit subject-specific content
//   (subtopics, terminology, chapter names, focus areas) derived from the
//   course name alone. If the student's inputs are silent on a topic, that
//   topic does not exist for this plan.
//
// Zero-guessing rules (design spec):
//   • No fabricated data, ever. Fallbacks are UI states, not invented content.
//   • Session titles come only from the student's input, that course's
//     uploads, or existing topic data. Thin input → fewer, broader sessions.
//   • Extra-reps flags come from (a) student-marked struggles or (b) topics
//     with recall < 60 in that course. Nothing else. Inside Coach only —
//     masteryStore's global thresholds are untouched.
//   • Why-lines require real recall data for that exact topic in that course.
//     No data → no why-line.
//   • Trust line lists only sources that actually exist for the course.
//   • Every session stores a toolId from the whitelist below. Generation
//     never emits a toolId outside the whitelist.

import { getMasteryForCourse } from '../../lib/masteryStore'
import { TARGET_OPTIONS } from '../../utils/gradeCalc'
import { newSessionId, ymdToDate, dateToYmd, addDays, dayDiff } from './planStore'

// ── Tool whitelist ────────────────────────────────────────────────────────────

// Only tools that currently accept preloaded topic + courseId. Adding to this
// list requires the tool to support initialTopic/initialCourseIdx/autoStart.
export const ALLOWED_TOOL_IDS = [
  'quiz_burst',
  'teach_it_back',
  'brain_dump',
  'focus_mode',
  'practice_exam',
]

export const TOOL_META = {
  quiz_burst:    { label: 'Quiz Burst',    method: 'Active recall' },
  teach_it_back: { label: 'Teach It Back', method: 'Explain and evaluate' },
  brain_dump:    { label: 'Brain Dump',    method: 'Retrieval practice' },
  focus_mode:    { label: 'Focus Session', method: 'Guided study' },
  practice_exam: { label: 'Practice Exam', method: 'Timed retrieval' },
}

function assertAllowed(toolId) {
  if (!ALLOWED_TOOL_IDS.includes(toolId)) {
    // Dev-time loud failure per spec ("fail loudly in dev if not").
    // In prod this still throws — surfaces early rather than silently
    // producing a session no tool can launch.
    throw new Error(`[coach] toolId "${toolId}" is not in the allowed whitelist`)
  }
  return toolId
}

// Hard runtime guard for the no-guessing rule. Called at the end of
// generatePlan. Every session title, topic, and topic-chip name MUST be
// present (case-insensitive, whitespace-collapsed) in the student's raw
// input universe. Throws immediately if a violation is found so bugs
// surface in dev and Sentry-style monitoring instead of being invisibly
// rendered to a student.
function assertNoGuessing(v2, studentInputUniverse) {
  const bag = String(studentInputUniverse || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!bag) {
    throw new Error('[coach] generatePlan called with no student input; refusing to emit content')
  }
  const check = (label, value) => {
    const v = String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (!v) return
    if (!bag.includes(v)) {
      throw new Error(`[coach] no-guessing invariant violated: ${label} "${value}" is not present in student inputs`)
    }
  }
  v2.weeks.forEach(w => w.sessions.forEach(s => {
    check('session.title', s.title)
    check('session.topic', s.topic)
  }))
  v2.topics.forEach(t => check('plan.topics[].name', t.name))
}

// ── Extra reps + why-lines (Coach-scoped <60 threshold) ───────────────────────

export const EXTRA_REPS_THRESHOLD = 60

// Returns Set of topic keys (lowercase) that qualify for extra reps because of
// low recall. Struggle-derived flags are handled separately by the caller.
export function extraRepsTopicsFromRecall(courseId) {
  const items = getMasteryForCourse(courseId)
  const flagged = new Set()
  items.forEach(m => {
    if (m.score != null && m.score < EXTRA_REPS_THRESHOLD && m.topic) {
      flagged.add(m.topic.toLowerCase())
    }
  })
  return flagged
}

// Real recall score for one topic in a course, or null when missing.
export function recallFor(courseId, topic) {
  const items = getMasteryForCourse(courseId)
  const needle = String(topic || '').toLowerCase()
  const hit = items.find(m => (m.topic || '').toLowerCase() === needle)
  return hit?.score ?? null
}

// Why-lines used in the review step. Only emitted when real recall exists.
// Max 2 lines, prioritising the lowest-scoring extra-reps topic first.
export function buildWhyLines(courseId, topics) {
  const withRecall = topics
    .filter(t => t.extra)
    .map(t => ({ ...t, recall: recallFor(courseId, t.name) }))
    .filter(t => t.recall != null)
    .sort((a, b) => a.recall - b.recall)
    .slice(0, 2)
  return withRecall.map(t => `Extra reps on ${shortName(t.name)}: your recall there is ${t.recall}%.`)
}

function shortName(name) {
  // "Osmosis and tonicity" → "Osmosis". Keeps why-lines tight.
  return String(name).split(' and ')[0]
}

// ── Trust line (only names sources that actually exist) ───────────────────────

// signals: { uploads: bool, practice: bool, schedule: bool }
// Never invents. Returns null when nothing exists so the caller can hide.
export function buildTrustLine({ uploads, practice, schedule }) {
  const parts = []
  if (uploads)  parts.push('your uploads')
  if (practice) parts.push('your practice history')
  if (schedule) parts.push('your schedule')
  if (!parts.length) return 'Building from what you tell me here.'
  return `Building from ${joinList(parts)}.`
}

function joinList(parts) {
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

// ── Countdown chip clamping ───────────────────────────────────────────────────

// Days until exam, clamped ≥0. Returns null when no exam date (caller hides).
export function daysUntilExam(examDateIso, todayIso) {
  if (!examDateIso) return null
  const today = ymdToDate(todayIso)
  const exam = ymdToDate(examDateIso)
  return Math.max(0, dayDiff(today, exam))
}

// Chip descriptor for the plan-index row. Returns null when no chip should
// render (no exam date, or exam already passed).
export function chipForCourse(examDateIso, todayIso) {
  if (!examDateIso) return null
  const d = daysUntilExam(examDateIso, todayIso)
  if (d == null || d === 0) return null   // past exams → nothing
  if (d > 14) return null                  // outside 2-week window → no chip
  return { label: `Exam in ${d}d`, red: d <= 3 }
}

// ── Grade gap ─────────────────────────────────────────────────────────────────

const LETTER_VALUE = Object.fromEntries(TARGET_OPTIONS.map(o => [o.label, o.value]))

// One letter grade ≈ 3-5 points on TARGET_OPTIONS. Treat any gap ≥ 5 pts as
// "gap of one letter grade or more". Missing inputs → false (no boost).
export function gradeGapMeetsBoost(currentLabel, targetLabel) {
  const cur = LETTER_VALUE[currentLabel]
  const tgt = LETTER_VALUE[targetLabel]
  if (cur == null || tgt == null) return false
  return (tgt - cur) >= 5
}

// ── Plan generation ───────────────────────────────────────────────────────────

/**
 * Build a v2 plan object from real inputs. No AI, no fabricated subtopics.
 *
 * inputs: {
 *   courseId, courseName,
 *   examDateIso?: 'YYYY-MM-DD' | null,
 *   todayIso: 'YYYY-MM-DD',
 *   topicsText?: string,            // raw student input
 *   struggles?: string[],           // student-marked struggle topic names
 *   uploads?: bool,
 *   daysPerWeek?: number (1..7),    // fallback picker if no rich schedule
 *   sessionLen?: number (minutes),
 *   currentGrade?: 'B' | ...,
 *   targetGrade?: 'A' | ...,
 * }
 * returns v2 plan or null when there's nothing to build a plan from.
 */
export function generatePlan(inputs) {
  const {
    courseId, courseName,
    examDateIso, todayIso,
    topicsText = '', struggles = [],
    daysPerWeek = 4, sessionLen = 45,
    currentGrade, targetGrade,
  } = inputs

  const topics = extractTopics(topicsText, struggles)
  if (!topics.length) return null

  // Flag extra reps from real signals only
  const recallFlagged = extraRepsTopicsFromRecall(courseId)
  const struggleSet = new Set(struggles.map(s => s.toLowerCase()))
  const flagged = topics.map(name => ({
    name,
    extra: struggleSet.has(name.toLowerCase()) || recallFlagged.has(name.toLowerCase()),
  }))

  // Cadence: use student's daysPerWeek. Grade-gap adds +1/week (capped at 7).
  const boost = gradeGapMeetsBoost(currentGrade, targetGrade) ? 1 : 0
  const sessionsPerWeek = Math.min(7, Math.max(1, daysPerWeek + boost))

  // Duration: student's sessionLen, no fabrication.
  const durationMin = Math.max(15, sessionLen | 0)

  // Time budget
  const today = ymdToDate(todayIso)
  // Plan wraps ≥3 days before exam if there is one; fallback 3 weeks.
  const wrapDate = examDateIso ? addDays(ymdToDate(examDateIso), -3) : addDays(today, 21)
  const totalDays = Math.max(7, dayDiff(today, wrapDate))
  const totalSessions = Math.max(topics.length, Math.ceil((totalDays / 7) * sessionsPerWeek))
  const weeks = groupIntoWeeks(totalDays, totalSessions, sessionsPerWeek)

  // Prioritise extra-reps topics first when there's a grade gap
  const orderedTopics = boost
    ? [...flagged].sort((a, b) => Number(b.extra) - Number(a.extra))
    : flagged

  // Rotate through the tool whitelist for variety. Practice exams only go
  // in the final week (end-of-plan simulation).
  const rotation = ['quiz_burst', 'teach_it_back', 'brain_dump', 'focus_mode']
  const finalWeekIdx = weeks.length - 1

  let topicCursor = 0
  const weeksOut = weeks.map((w, wi) => {
    const sessions = []
    const weekStart = addDays(today, w.startDayOffset)
    const daySpacing = Math.max(1, Math.floor(w.dayCount / w.sessionCount))
    for (let i = 0; i < w.sessionCount; i += 1) {
      const t = orderedTopics[topicCursor % orderedTopics.length]
      topicCursor += 1
      const isFinalSession = wi === finalWeekIdx && i === w.sessionCount - 1
      const toolId = isFinalSession
        ? 'practice_exam'
        : rotation[(wi + i) % rotation.length]
      const meta = TOOL_META[assertAllowed(toolId)]
      const scheduled = dateToYmd(addDays(weekStart, i * daySpacing))
      sessions.push({
        id: newSessionId(),
        title: t.name,           // straight from student input — no invention
        topic: t.name,
        toolId,
        toolLabel: meta.label,
        method: meta.method,
        durationMin,
        status: 'todo',
        scheduledDate: scheduled,
        extra: t.extra,
      })
    }
    return {
      label: `Week ${wi + 1}`,
      startIso: dateToYmd(weekStart),
      endIso:   dateToYmd(addDays(weekStart, w.dayCount - 1)),
      sessions,
    }
  })

  const v2 = {
    version: 2,
    courseId,
    courseName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    examDate: examDateIso ?? null,
    endDate: dateToYmd(wrapDate),
    cadence: { daysPerWeek: sessionsPerWeek, sessionLen: durationMin },
    grades: { current: currentGrade ?? null, target: targetGrade ?? null, boostApplied: !!boost },
    topics: flagged,
    weeks: weeksOut,
    lastRebalancedAt: null,
  }
  // Runtime enforcement of the no-guessing rule. Universe = every string
  // the student contributed: raw text + struggle list. If any emitted
  // title/topic isn't present here, throw before the plan is returned.
  const studentInputUniverse = [topicsText, ...(struggles || [])].join('\n')
  assertNoGuessing(v2, studentInputUniverse)
  return v2
}

// Split raw student text into unique topic phrases. Lines, semicolons,
// bullets, and commas all work. Deduped by lowercased form. Preserves
// student's own capitalisation.
export function extractTopics(rawText, extraFromStruggles = []) {
  const seen = new Set()
  const out = []
  const push = (t) => {
    const clean = t.replace(/^[\s\-*•\d.)]+/, '').trim()
    if (!clean) return
    const key = clean.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(clean)
  }
  String(rawText || '')
    .split(/\r?\n|;/)
    .flatMap(line => {
      // Only split by comma when a line looks like a comma-list, not a sentence.
      if (line.includes(',') && !/\.\s|:\s/.test(line) && line.length < 200) {
        return line.split(',')
      }
      return [line]
    })
    .forEach(push)
  extraFromStruggles.forEach(push)
  return out
}

// Split totalDays into N weekly windows (max 7 days each), then bucket
// sessions across those windows to hit `totalSessions` with `perWeekCap`.
function groupIntoWeeks(totalDays, totalSessions, perWeekCap) {
  const weekCount = Math.max(1, Math.ceil(totalDays / 7))
  const weeks = []
  let placed = 0
  let dayCursor = 0
  for (let i = 0; i < weekCount; i += 1) {
    const remainingWeeks = weekCount - i
    const remainingSessions = totalSessions - placed
    const sessionCount = Math.max(1, Math.min(perWeekCap, Math.ceil(remainingSessions / remainingWeeks)))
    const dayCount = Math.min(7, totalDays - dayCursor)
    weeks.push({ startDayOffset: dayCursor, dayCount, sessionCount })
    placed += sessionCount
    dayCursor += dayCount
  }
  return weeks
}

// ── Adjustment banner (7-day window + change-required) ────────────────────────

// Renders "Plan adjusted to fit your N remaining weeks" only when a
// rebalance happened within the last 7 days AND actually moved ≥1 session.
export function adjustmentBanner(v2, todayIso) {
  if (!v2?.lastRebalancedAt) return null
  const daysSince = (Date.now() - v2.lastRebalancedAt) / (24 * 60 * 60 * 1000)
  if (daysSince > 7) return null
  // Compute "N remaining weeks" from endDate
  if (!v2.endDate) return null
  const remainingDays = dayDiff(ymdToDate(todayIso), ymdToDate(v2.endDate))
  const remainingWeeks = Math.max(1, Math.round(remainingDays / 7))
  return `Plan adjusted to fit your ${remainingWeeks} remaining ${remainingWeeks === 1 ? 'week' : 'weeks'}.`
}
