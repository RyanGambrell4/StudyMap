/**
 * Practice exam result logic, kept out of the render layer so the parts that
 * decide what a student is told can be tested directly.
 *
 * Two rules govern this file.
 *
 * The first is the design system's: color encodes data, never decorates. The
 * score bands live in practiceExams.js and are reused here rather than
 * restated, so a score shown on this screen and the same score shown as a
 * history row on the entry screen can never drift apart.
 *
 * The second is that this app does not invent numbers. Everything below is
 * derived from what the student actually answered or from a stored record of
 * an exam they actually sat. There is no projection, no extrapolation, and no
 * claim about what a future score would be.
 */
import { scoreColor, formatExamDate } from './practiceExams'

export { scoreColor }

// ── Grading ──────────────────────────────────────────────────────────────────
// `correct` is true, false, or null. null means "not auto-graded": a short
// answer has no reliable machine grade, so it never counts for or against the
// score, never gets a color, and never appears in the topic bars.

export function gradeMultipleChoice(question, given) {
  if (!given) return false
  if (given === question?.answer) return true
  // Tolerate "A. text" against "A. Text" and stray whitespace.
  return given.trim().toLowerCase() === (question?.answer ?? '').trim().toLowerCase()
}

export function gradeExam(questions = [], answers = []) {
  return questions.map((q, index) => {
    const given = answers[index] ?? ''
    const correct = q?.type === 'multiple_choice' ? gradeMultipleChoice(q, given) : null
    return { q, given, correct, index }
  })
}

/**
 * The score is the share of auto-graded questions answered correctly. An exam
 * of nothing but short answers has no score at all, which is a null rather
 * than a zero: the student did not get everything wrong, we simply cannot mark
 * it. Callers render a dash for that case.
 */
export function examScore(graded = []) {
  const autoGraded = graded.filter(g => g.correct !== null)
  const correctCount = autoGraded.filter(g => g.correct === true).length
  const score = autoGraded.length > 0
    ? Math.round((correctCount / autoGraded.length) * 100)
    : null
  return { score, correctCount, autoGradedCount: autoGraded.length }
}

export function correctCountLine({ correctCount, autoGradedCount }) {
  if (!autoGradedCount) return null
  return `${correctCount} of ${autoGradedCount} correct`
}

// ── Topic breakdown ──────────────────────────────────────────────────────────

/**
 * One row per topic, framed as correct-of-total, ordered strongest first. The
 * bar color reuses the score bands, so a topic bar and the hero numeral answer
 * to the same thresholds.
 */
export function topicBreakdown(graded = []) {
  const map = new Map()
  for (const { q, correct } of graded) {
    if (correct === null) continue
    const topic = (typeof q?.topic === 'string' && q.topic.trim()) || 'General'
    if (!map.has(topic)) map.set(topic, { topic, correct: 0, total: 0 })
    const row = map.get(topic)
    row.total += 1
    if (correct === true) row.correct += 1
  }
  return [...map.values()]
    .map(r => {
      const pct = Math.round((r.correct / r.total) * 100)
      return { ...r, missed: r.total - r.correct, pct, color: scoreColor(pct) }
    })
    .sort((a, b) => b.pct - a.pct || a.topic.localeCompare(b.topic))
}

// ── The subtext line ─────────────────────────────────────────────────────────

/**
 * Compares this score against the last attempt at the same course.
 *
 * Prior exams with no score are skipped rather than treated as zero, and the
 * comparison falls through to the most recent scored attempt. When none
 * exists this reads as a first attempt and the line is omitted entirely: an
 * opening sentence about progress makes no sense before there is any.
 *
 * Callers must pass exams for one course only. There is no cross-course
 * comparison, because the scores are not measuring the same thing.
 */
export function comparisonLine(score, priorExams = []) {
  if (!Number.isFinite(score)) return null
  const prior = priorExams
    .filter(e => Number.isFinite(e?.takenAt) && Number.isFinite(e?.score))
    .sort((a, b) => b.takenAt - a.takenAt)[0]
  if (!prior) return null
  const when = formatExamDate(prior.takenAt)
  if (!when) return null
  if (score > prior.score) return `Up from ${prior.score} on ${when}.`
  if (score < prior.score) return `Down from ${prior.score} on ${when}.`
  return `Same as your last attempt on ${when}.`
}

export function timeLine(timeMs, timerMinutes = null) {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return null
  const mins = Math.round(timeMs / 60000)
  const spent = mins < 1 ? 'under a minute' : `${mins} minute${mins === 1 ? '' : 's'}`
  if (Number.isFinite(timerMinutes) && timerMinutes > 0) {
    return `Finished in ${spent} of the ${timerMinutes} allowed.`
  }
  return `Finished in ${spent}.`
}

/**
 * The one line under the headline. Time appears here and nowhere else on the
 * screen; the correct count appears beside the numeral and nowhere else.
 */
export function subtextLine({ score, priorExams = [], timeMs, timerMinutes = null }) {
  return [comparisonLine(score, priorExams), timeLine(timeMs, timerMinutes)]
    .filter(Boolean)
    .join(' ') || null
}

export function headline(score) {
  return Number.isFinite(score) ? `You scored ${score}` : 'Practice exam complete'
}

// ── Answer review ordering ───────────────────────────────────────────────────

export function reviewGroup(g) {
  if (g.correct === false) return 'missed'
  if (g.correct === null) return 'ungraded'
  return 'correct'
}

const GROUP_RANK = { missed: 0, ungraded: 1, correct: 2 }

/**
 * Missed first, then the short answers that need self-grading, then the ones
 * already right. Original question order is kept inside each group so the
 * numbering still climbs.
 */
export function sortForReview(graded = []) {
  return [...graded].sort((a, b) =>
    GROUP_RANK[reviewGroup(a)] - GROUP_RANK[reviewGroup(b)] || a.index - b.index)
}
