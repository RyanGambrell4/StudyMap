/**
 * The rules behind the Practice Exams entry screen.
 *
 * These are the claims the design makes that a rendering test cannot pin: the
 * score bands and their exact boundaries, the ordering of history, whether the
 * source line is allowed to name a source, and that reopening the app never
 * rewrites a stored score.
 */
import { describe, it, expect } from 'vitest'
import { GRADE_HUB } from '../theme/tokens.js'
import {
  scoreColor, buildExamHistory, migrateExamRecord, sourceLine,
  buildStartPayload, timerLabel, examRowMeta, formatExamDate,
} from './practiceExams.js'

// Local noon, so formatExamDate lands on the intended calendar day whatever
// timezone the test machine is in.
const AUG_5 = new Date(2026, 7, 5, 12).getTime()
const AUG_2 = new Date(2026, 7, 2, 12).getTime()
const JUL_27 = new Date(2026, 6, 27, 12).getTime()

const q = (topic = 'T') => ({ type: 'multiple_choice', question: 'x', answer: 'A', topic })

const exam = (over = {}) => ({
  id: 'e1', takenAt: AUG_5, courseName: 'Cell Biology',
  questions: [q(), q()], answers: ['A', 'A'], score: 86, timeMs: 1000,
  ...over,
})

describe('scoreColor thresholds', () => {
  it('colors 85 and up green', () => {
    expect(scoreColor(85)).toBe(GRADE_HUB.green)
    expect(scoreColor(86)).toBe(GRADE_HUB.green)
    expect(scoreColor(100)).toBe(GRADE_HUB.green)
  })

  it('colors 70 through 84 ink', () => {
    expect(scoreColor(70)).toBe(GRADE_HUB.ink)
    expect(scoreColor(78)).toBe(GRADE_HUB.ink)
    expect(scoreColor(84)).toBe(GRADE_HUB.ink)
  })

  it('colors below 70 amber', () => {
    expect(scoreColor(69)).toBe(GRADE_HUB.amber)
    expect(scoreColor(62)).toBe(GRADE_HUB.amber)
    expect(scoreColor(0)).toBe(GRADE_HUB.amber)
  })

  it('has no color for an exam that was never scored', () => {
    expect(scoreColor(null)).toBe(null)
    expect(scoreColor(undefined)).toBe(null)
    expect(scoreColor(NaN)).toBe(null)
  })

  it('puts the four boundary cases the export shows on the right side', () => {
    expect(scoreColor(84)).toBe(GRADE_HUB.ink)
    expect(scoreColor(85)).toBe(GRADE_HUB.green)
    expect(scoreColor(69)).toBe(GRADE_HUB.amber)
    expect(scoreColor(70)).toBe(GRADE_HUB.ink)
  })
})

describe('buildExamHistory', () => {
  const courses = [
    { id: 'c1', name: 'Cell Biology', color: { dot: '#3452D9' } },
    { id: 'c2', name: 'Organic Chemistry', color: { dot: '#1a9e5c' } },
  ]
  const plans = {
    c1: { practice_exams: [exam({ id: 'a', takenAt: AUG_5 }), exam({ id: 'c', takenAt: JUL_27, score: 71 })] },
    c2: { practice_exams: [exam({ id: 'b', takenAt: AUG_2, courseName: 'Organic Chemistry', score: 78 })] },
  }

  it('orders every course together, most recent first', () => {
    const rows = buildExamHistory(plans, courses)
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps the stored score and derives the question count', () => {
    const rows = buildExamHistory(plans, courses)
    expect(rows.map(r => r.score)).toEqual([86, 78, 71])
    expect(rows[0].questionCount).toBe(2)
  })

  it('carries each course dot through', () => {
    const rows = buildExamHistory(plans, courses)
    expect(rows[0].dot).toBe('#3452D9')
    expect(rows[1].dot).toBe('#1a9e5c')
  })

  it('ignores __exam_context, which shares the coach_plans map', () => {
    const rows = buildExamHistory({ ...plans, __exam_context: { foo: 1 } }, courses)
    expect(rows).toHaveLength(3)
  })

  it('sorts undated legacy records last instead of first', () => {
    const rows = buildExamHistory(
      { c1: { practice_exams: [{ id: 'old', questions: [q()], answers: ['A'], score: 90 }, exam({ id: 'new' })] } },
      courses,
    )
    expect(rows.map(r => r.id)).toEqual(['new', 'old'])
  })

  it('skips a row it cannot name rather than rendering null', () => {
    const rows = buildExamHistory({ ghost: { practice_exams: [exam({ courseName: null })] } }, courses)
    expect(rows).toEqual([])
  })

  it('falls back to the course list when the record has no courseName', () => {
    const rows = buildExamHistory({ c1: { practice_exams: [exam({ courseName: null })] } }, courses)
    expect(rows).toHaveLength(1)
    expect(rows[0].courseName).toBe('Cell Biology')
  })

  it('keeps a null score as null and never invents a number', () => {
    const rows = buildExamHistory({ c1: { practice_exams: [exam({ score: null })] } }, courses)
    expect(rows[0].score).toBe(null)
    expect(scoreColor(rows[0].score)).toBe(null)
  })

  it('drops the Review link when there are no stored questions to replay', () => {
    const rows = buildExamHistory({ c1: { practice_exams: [exam({ questions: [] })] } }, courses)
    expect(rows[0].canReview).toBe(false)
  })

  it('offers Review when questions and answers are both stored', () => {
    const rows = buildExamHistory(plans, courses)
    expect(rows.every(r => r.canReview)).toBe(true)
  })
})

describe('migrateExamRecord', () => {
  it('leaves a current record untouched', () => {
    const before = exam()
    const { exam: after, changed } = migrateExamRecord(before, { courseId: 'c1' })
    expect(changed).toBe(false)
    expect(after).toBe(before)
  })

  it('fills the fields a legacy record is missing', () => {
    const { exam: after, changed } = migrateExamRecord(
      { score: 74 },
      { courseId: 'c1', courseName: 'Cell Biology', index: 2 },
    )
    expect(changed).toBe(true)
    expect(after.id).toBe('exam_legacy_c1_2')
    expect(after.takenAt).toBe(null)
    expect(after.courseName).toBe('Cell Biology')
    expect(after.questions).toEqual([])
    expect(after.answers).toEqual([])
  })

  it('is idempotent: a second pass changes nothing', () => {
    const once = migrateExamRecord({ score: 74 }, { courseId: 'c1', courseName: 'Bio' })
    expect(once.changed).toBe(true)
    const twice = migrateExamRecord(once.exam, { courseId: 'c1', courseName: 'Bio' })
    expect(twice.changed).toBe(false)
    expect(twice.exam).toBe(once.exam)
  })

  it('preserves an existing score rather than recomputing it', () => {
    const { exam: after } = migrateExamRecord({ score: 62 }, { courseId: 'c1', courseName: 'Bio' })
    expect(after.score).toBe(62)
  })

  it('preserves a deliberately null score from an all-short-answer exam', () => {
    const { exam: after } = migrateExamRecord(
      { score: null, questions: [q()], answers: ['A'] },
      { courseId: 'c1', courseName: 'Bio' },
    )
    expect(after.score).toBe(null)
  })

  it('never invents a score for a record that has none', () => {
    const { exam: after } = migrateExamRecord({ id: 'x' }, { courseId: 'c1', courseName: 'Bio' })
    expect(after.score).toBe(null)
  })

  it('does not overwrite a courseName that is already there', () => {
    const { exam: after } = migrateExamRecord(exam({ courseName: 'Real Name' }), { courseName: 'Wrong Name' })
    expect(after.courseName).toBe('Real Name')
  })
})

describe('sourceLine', () => {
  const amber = 'No material uploaded for this course yet. You can paste notes or describe topics on the next step.'

  it('says it is checking while the uploads read is in flight', () => {
    const line = sourceLine({ courseName: 'Cell Biology', material: null })
    expect(line.tone).toBe('muted')
    expect(line.text).toBe('Checking your material for Cell Biology.')
    expect(line.text).not.toContain('No material uploaded')
  })

  it('warns in amber only once an empty result has actually resolved', () => {
    const line = sourceLine({
      courseName: 'Linear Algebra',
      material: { hasNotes: false, hasSyllabus: false },
    })
    expect(line.tone).toBe('amber')
    expect(line.text).toBe(amber)
  })

  it('names all three sources when all three exist, exactly as the export does', () => {
    const line = sourceLine({
      courseName: 'Cell Biology',
      material: { hasNotes: true, hasSyllabus: true },
      hasPastResults: true,
    })
    expect(line.tone).toBe('muted')
    expect(line.text).toBe('Uses your uploaded notes, syllabus, and past results for Cell Biology.')
  })

  it('names only the sources that are really there', () => {
    expect(sourceLine({
      courseName: 'Bio', material: { hasNotes: true, hasSyllabus: false }, hasPastResults: false,
    }).text).toBe('Uses your uploaded notes for Bio.')

    expect(sourceLine({
      courseName: 'Bio', material: { hasNotes: true, hasSyllabus: false }, hasPastResults: true,
    }).text).toBe('Uses your uploaded notes and past results for Bio.')

    expect(sourceLine({
      courseName: 'Bio', material: { hasNotes: false, hasSyllabus: true }, hasPastResults: false,
    }).text).toBe('Uses your uploaded syllabus for Bio.')
  })

  it('does not let past results alone clear the no-material warning', () => {
    const line = sourceLine({
      courseName: 'Bio',
      material: { hasNotes: false, hasSyllabus: false },
      hasPastResults: true,
    })
    expect(line.tone).toBe('amber')
  })

  it('makes no claim when the uploads read failed', () => {
    const line = sourceLine({ courseName: 'Bio', material: { error: true } })
    expect(line.tone).toBe('muted')
    expect(line.text).not.toContain('Uses your')
    expect(line.text).not.toContain('No material uploaded')
  })
})

describe('buildStartPayload', () => {
  const course = { id: 'c1', name: 'Cell Biology' }

  it('carries the selected course, the length and the timer', () => {
    const payload = buildStartPayload({ course, length: 20, timerOn: true })
    expect(payload.courseId).toBe('c1')
    expect(payload.courseName).toBe('Cell Biology')
    expect(payload.length).toBe(20)
    expect(payload.timerMinutes).toBe(30)
  })

  it('sends a null timer when the toggle is off', () => {
    expect(buildStartPayload({ course, length: 20, timerOn: false }).timerMinutes).toBe(null)
  })

  it('keeps 1.5 minutes per question across all three lengths', () => {
    expect(buildStartPayload({ course, length: 10, timerOn: true }).timerMinutes).toBe(15)
    expect(buildStartPayload({ course, length: 20, timerOn: true }).timerMinutes).toBe(30)
    expect(buildStartPayload({ course, length: 30, timerOn: true }).timerMinutes).toBe(45)
  })
})

describe('labels', () => {
  it('reads "On, 30 minutes" for a timed 20-question exam, as the export shows', () => {
    expect(timerLabel(true, 20)).toBe('On, 30 minutes')
    expect(timerLabel(false, 20)).toBe('Off')
  })

  it('formats a row meta line the way the export does', () => {
    expect(examRowMeta({ takenAt: AUG_5, questionCount: 20 })).toBe('August 5, 20 questions')
  })

  it('omits what it does not have rather than guessing', () => {
    expect(examRowMeta({ takenAt: null, questionCount: 20 })).toBe('20 questions')
    expect(examRowMeta({ takenAt: AUG_5, questionCount: null })).toBe('August 5')
    expect(formatExamDate(null)).toBe(null)
  })
})
