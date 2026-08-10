// Practice Exams: the pure logic behind the entry screen.
//
// Everything here is deliberately free of React and of the db cache so the
// score thresholds, the history ordering, the source line and the legacy
// record migration can be tested directly. The view imports these; it does not
// re-derive any of it.
//
// Governing rule, same as the Grade Hub and the Study Coach: we only ever show
// what is actually stored. No invented scores, no invented breakdowns, and no
// naming a source the student has not given us.

import { GRADE_HUB, courseColor } from '../theme/tokens.js'

// Minutes of exam time per question. Unchanged from the setup step it moved
// out of, so a 20-question exam still reads "On, 30 minutes".
export const MINS_PER_Q = 1.5

// The three lengths the approved export offers. There is no custom length.
export const EXAM_LENGTHS = [10, 20, 30]

// Score bands, from the four history rows in the export (86 green, 78 and 71
// ink, 62 amber).
export const SCORE_GREEN_MIN = 85
export const SCORE_INK_MIN = 70

/**
 * The color a history numeral is set in, or null when there is no score to
 * color. Callers must render the null case as a muted dash, never as a number.
 */
export function scoreColor(score) {
  if (!Number.isFinite(score)) return null
  if (score >= SCORE_GREEN_MIN) return GRADE_HUB.green
  if (score >= SCORE_INK_MIN) return GRADE_HUB.ink
  return GRADE_HUB.amber
}

const isNullOr = (v, ok) => v === null || ok(v)

/**
 * Brings one stored practice exam record up to the shape the history card
 * reads, without ever changing a value that is already there.
 *
 * Modeled on migratePlan in lib/shared/coachPlan.js: absent fields are filled,
 * present fields are left alone, and a record that is already current comes
 * back with changed:false so a second pass is a no-op.
 *
 * `score` is special. It is only ever filled when the key is missing outright.
 * A stored score of any kind, including a null one from an all-short-answer
 * exam, is passed through untouched.
 */
export function migrateExamRecord(exam, { courseId = null, courseName = null, index = 0 } = {}) {
  if (!exam || typeof exam !== 'object') return { exam, changed: false }

  const needsId = !exam.id
  const needsTakenAt = !('takenAt' in exam) || !isNullOr(exam.takenAt, Number.isFinite)
  const needsCourseName = !('courseName' in exam) || (exam.courseName == null && courseName != null)
  const needsQuestions = !Array.isArray(exam.questions)
  const needsAnswers = !Array.isArray(exam.answers)
  const needsScore = !('score' in exam)

  if (!needsId && !needsTakenAt && !needsCourseName && !needsQuestions && !needsAnswers && !needsScore) {
    return { exam, changed: false }
  }

  const next = { ...exam }
  if (needsId) next.id = `exam_legacy_${courseId ?? 'course'}_${index}`
  // A record with no timestamp cannot be dated. It gets an explicit null and
  // sorts last rather than being given a date it never had.
  if (needsTakenAt) next.takenAt = null
  if (needsCourseName) next.courseName = courseName ?? null
  if (needsQuestions) next.questions = []
  if (needsAnswers) next.answers = []
  if (needsScore) next.score = null

  return { exam: next, changed: true }
}

/**
 * Flattens the practice exams stored under every course in the coach_plans
 * blob into history rows, most recent first.
 *
 * A row is skipped entirely when we cannot name its course, because a row
 * reading "null" is worse than a row that is not there.
 */
export function buildExamHistory(coachPlans, courses = []) {
  const byId = new Map(courses.map((c, i) => [String(c.id), { course: c, idx: i }]))
  const rows = []

  for (const [courseId, entry] of Object.entries(coachPlans ?? {})) {
    // coach_plans doubles as the home of __exam_context, which is not a course.
    if (courseId.startsWith('__')) continue
    const stored = Array.isArray(entry?.practice_exams) ? entry.practice_exams : []
    const match = byId.get(String(courseId))

    stored.forEach((raw, index) => {
      const { exam } = migrateExamRecord(raw, {
        courseId,
        courseName: match?.course?.name ?? null,
        index,
      })
      const name = exam.courseName ?? match?.course?.name ?? null
      if (!name) return

      const questions = Array.isArray(exam.questions) ? exam.questions : []
      rows.push({
        id: exam.id,
        courseId,
        courseName: name,
        dot: match?.course?.color?.dot ?? (match ? courseColor(match.idx).dot : GRADE_HUB.label),
        takenAt: Number.isFinite(exam.takenAt) ? exam.takenAt : null,
        score: Number.isFinite(exam.score) ? exam.score : null,
        questionCount: questions.length || null,
        // Review replays the stored questions and answers. Without them there
        // is nothing to open, so the row renders without the link.
        canReview: questions.length > 0 && Array.isArray(exam.answers),
        exam,
      })
    })
  }

  rows.sort((a, b) => (b.takenAt ?? -1) - (a.takenAt ?? -1))
  return rows
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** "August 5", matching the export. Null when the record has no timestamp. */
export function formatExamDate(takenAt) {
  if (!Number.isFinite(takenAt)) return null
  const d = new Date(takenAt)
  if (Number.isNaN(d.getTime())) return null
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** The meta string to the right of a course name: "August 5, 20 questions". */
export function examRowMeta(row) {
  const parts = []
  const date = formatExamDate(row?.takenAt)
  if (date) parts.push(date)
  if (Number.isFinite(row?.questionCount) && row.questionCount > 0) {
    parts.push(`${row.questionCount} questions`)
  }
  return parts.join(', ')
}

/**
 * The muted line under the setup options, naming only what the exam can
 * actually draw from.
 *
 * `material` is null while the uploads fetch is still in flight. In that
 * window we say we are checking rather than guessing, because flashing the
 * amber warning at a student who has material would be a lie we then take
 * back a moment later.
 *
 * Returns { tone: 'muted' | 'amber', text }.
 */
export function sourceLine({ courseName, material, hasPastResults = false }) {
  const name = courseName || 'this course'

  if (!material) {
    return { tone: 'muted', text: `Checking your material for ${name}.` }
  }

  // The uploads read failed. We genuinely do not know what is there, so we say
  // so rather than claiming sources or warning about their absence.
  if (material.error) {
    return { tone: 'muted', text: `We could not check your material for ${name}. You can add notes on the next step.` }
  }

  const { hasNotes = false, hasSyllabus = false } = material

  // The amber state is literally about uploads. Past results alone cannot
  // build an exam, so they do not clear this warning.
  if (!hasNotes && !hasSyllabus) {
    return {
      tone: 'amber',
      text: 'No material uploaded for this course yet. You can paste notes or describe topics on the next step.',
    }
  }

  const parts = []
  if (hasNotes) parts.push('uploaded notes')
  if (hasSyllabus) parts.push(hasNotes ? 'syllabus' : 'uploaded syllabus')
  if (hasPastResults) parts.push('past results')

  let list
  if (parts.length === 1) list = parts[0]
  else if (parts.length === 2) list = `${parts[0]} and ${parts[1]}`
  else list = `${parts[0]}, ${parts[1]}, and ${parts[2]}`

  return { tone: 'muted', text: `Uses your ${list} for ${name}.` }
}

/** The timer control's label: "On, 30 minutes" or "Off". */
export function timerLabel(timerOn, length) {
  if (!timerOn) return 'Off'
  return `On, ${timerMinutesFor(length)} minutes`
}

export function timerMinutesFor(length) {
  return Math.round((Number(length) || 0) * MINS_PER_Q)
}

/**
 * What the entry screen hands to the generation flow. Everything the setup
 * step used to ask for a second time is settled here.
 */
export function buildStartPayload({ course, length, timerOn }) {
  return {
    courseId: course?.id ?? null,
    courseName: course?.name ?? null,
    course: course ?? null,
    length,
    timerMinutes: timerOn ? timerMinutesFor(length) : null,
  }
}
