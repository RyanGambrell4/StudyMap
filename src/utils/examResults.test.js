/**
 * The result screen's logic.
 *
 * Two things this file exists to prevent. The first is a number the app cannot
 * know: an unscorable exam must render as a dash, never as a zero, and a first
 * attempt must not claim progress against nothing. The second is drift between
 * the score bands here and the ones the entry screen's history rows use, which
 * is why the boundaries are pinned on both sides.
 */
import { describe, it, expect } from 'vitest'
import { GRADE_HUB } from '../theme/tokens'
import {
  gradeExam, examScore, correctCountLine, topicBreakdown, comparisonLine,
  timeLine, subtextLine, headline, sortForReview, reviewGroup, scoreColor,
} from './examResults'

const mc = (over = {}) => ({ type: 'multiple_choice', question: 'Q', answer: 'A', ...over })
const sa = (over = {}) => ({ type: 'short_answer', question: 'Q', answer: 'Model', ...over })

// Local noon, not UTC. A UTC timestamp lands on the previous or next day for
// anyone far enough east or west, which makes the date assertions below depend
// on where the test runs.
const at = (y, m, d) => new Date(y, m, d, 12).getTime()

describe('score bands', () => {
  it('holds the boundaries exactly where the design puts them', () => {
    expect(scoreColor(100)).toBe(GRADE_HUB.green)
    expect(scoreColor(85)).toBe(GRADE_HUB.green)
    expect(scoreColor(84)).toBe(GRADE_HUB.ink)
    expect(scoreColor(70)).toBe(GRADE_HUB.ink)
    expect(scoreColor(69)).toBe(GRADE_HUB.amber)
    expect(scoreColor(0)).toBe(GRADE_HUB.amber)
  })

  it('gives an unscorable exam no color at all', () => {
    expect(scoreColor(null)).toBe(null)
    expect(scoreColor(undefined)).toBe(null)
  })
})

describe('grading', () => {
  it('marks multiple choice and leaves short answer ungraded', () => {
    const graded = gradeExam([mc(), sa()], ['A', 'anything'])
    expect(graded[0].correct).toBe(true)
    expect(graded[1].correct).toBe(null)
  })

  it('counts an unanswered question as missed, not as ungraded', () => {
    expect(gradeExam([mc()], [''])[0].correct).toBe(false)
  })

  it('tolerates case and whitespace differences', () => {
    expect(gradeExam([mc({ answer: 'A. Mitosis' })], ['a. mitosis  '])[0].correct).toBe(true)
  })
})

describe('the score', () => {
  it('is the share of the auto-graded questions', () => {
    const graded = gradeExam([mc(), mc(), mc(), mc()], ['A', 'A', 'A', 'B'])
    expect(examScore(graded)).toEqual({ score: 75, correctCount: 3, autoGradedCount: 4 })
  })

  it('ignores short answers rather than counting them wrong', () => {
    const graded = gradeExam([mc(), sa()], ['A', ''])
    expect(examScore(graded).score).toBe(100)
  })

  it('is null, never zero, when nothing can be auto-graded', () => {
    const graded = gradeExam([sa(), sa()], ['', ''])
    const result = examScore(graded)
    expect(result.score).toBe(null)
    expect(result.score).not.toBe(0)
    expect(correctCountLine(result)).toBe(null)
  })

  it('reads the count out once, in words', () => {
    expect(correctCountLine({ correctCount: 17, autoGradedCount: 20 })).toBe('17 of 20 correct')
  })
})

describe('the topic breakdown', () => {
  const graded = gradeExam(
    [
      mc({ topic: 'Cell cycle' }), mc({ topic: 'Cell cycle' }), mc({ topic: 'Cell cycle' }),
      mc({ topic: 'Membrane transport' }), mc({ topic: 'Membrane transport' }),
    ],
    ['A', 'B', 'B', 'A', 'A'],
  )

  it('frames each topic as correct of total, strongest first', () => {
    const rows = topicBreakdown(graded)
    expect(rows.map(r => [r.topic, r.correct, r.total, r.pct])).toEqual([
      ['Membrane transport', 2, 2, 100],
      ['Cell cycle', 1, 3, 33],
    ])
  })

  it('colors each bar by the same bands as the hero numeral', () => {
    const rows = topicBreakdown(graded)
    expect(rows[0].color).toBe(GRADE_HUB.green)  // 100
    expect(rows[1].color).toBe(GRADE_HUB.amber)  // 33
  })

  it('reports how many were missed, so the Drill link knows where to appear', () => {
    const rows = topicBreakdown(graded)
    expect(rows.find(r => r.topic === 'Membrane transport').missed).toBe(0)
    expect(rows.find(r => r.topic === 'Cell cycle').missed).toBe(2)
  })

  it('leaves short answers out, having no grade to chart', () => {
    expect(topicBreakdown(gradeExam([sa({ topic: 'Essay' })], ['x']))).toEqual([])
  })

  it('files untagged questions under General rather than dropping them', () => {
    expect(topicBreakdown(gradeExam([mc()], ['A']))[0].topic).toBe('General')
  })
})

describe('the comparison line', () => {
  const prior = [
    { takenAt: at(2026, 6, 27), score: 71 },
    { takenAt: at(2026, 5, 2), score: 90 },
  ]

  it('says nothing on a first attempt', () => {
    expect(comparisonLine(86, [])).toBe(null)
  })

  it('names the gain against the most recent attempt', () => {
    expect(comparisonLine(86, prior)).toBe('Up from 71 on July 27.')
  })

  it('names the drop just as plainly', () => {
    expect(comparisonLine(64, prior)).toBe('Down from 71 on July 27.')
  })

  it('says so when nothing moved', () => {
    expect(comparisonLine(71, prior)).toBe('Same as your last attempt on July 27.')
  })

  it('skips a null-scored attempt and compares against the last real one', () => {
    const withNull = [{ takenAt: at(2026, 7, 1), score: null }, ...prior]
    expect(comparisonLine(86, withNull)).toBe('Up from 71 on July 27.')
  })

  it('treats an all-null history as a first attempt', () => {
    expect(comparisonLine(86, [{ takenAt: at(2026, 7, 1), score: null }])).toBe(null)
  })

  it('says nothing when this exam has no score to compare', () => {
    expect(comparisonLine(null, prior)).toBe(null)
  })
})

describe('the time line', () => {
  it('names the limit when the exam was timed', () => {
    expect(timeLine(24 * 60000, 30)).toBe('Finished in 24 minutes of the 30 allowed.')
  })

  it('just names the time when it was not', () => {
    expect(timeLine(24 * 60000, null)).toBe('Finished in 24 minutes.')
  })

  it('handles the single minute and the sub-minute sprint', () => {
    expect(timeLine(60000)).toBe('Finished in 1 minute.')
    expect(timeLine(4000)).toBe('Finished in under a minute.')
  })

  it('says nothing rather than inventing a duration', () => {
    expect(timeLine(0)).toBe(null)
    expect(timeLine(null)).toBe(null)
  })
})

describe('the subtext', () => {
  it('joins the comparison and the time into one line', () => {
    expect(subtextLine({
      score: 86,
      priorExams: [{ takenAt: at(2026, 6, 27), score: 71 }],
      timeMs: 24 * 60000,
      timerMinutes: 30,
    })).toBe('Up from 71 on July 27. Finished in 24 minutes of the 30 allowed.')
  })

  it('drops to the time alone on a first attempt', () => {
    expect(subtextLine({ score: 86, priorExams: [], timeMs: 24 * 60000 }))
      .toBe('Finished in 24 minutes.')
  })

  it('is absent entirely when there is nothing true to say', () => {
    expect(subtextLine({ score: null, priorExams: [], timeMs: 0 })).toBe(null)
  })
})

describe('the headline', () => {
  it('states the score when there is one', () => {
    expect(headline(86)).toBe('You scored 86')
  })

  it('never puts a number where there is no score', () => {
    expect(headline(null)).toBe('Practice exam complete')
    expect(headline(null)).not.toMatch(/\d/)
  })
})

describe('review order', () => {
  const graded = gradeExam(
    [mc(), mc(), sa(), mc()],
    ['A', 'B', 'essay', 'B'],
  ) // correct, missed, ungraded, missed

  it('puts the misses first, then what needs self-grading, then the rest', () => {
    expect(sortForReview(graded).map(reviewGroup))
      .toEqual(['missed', 'missed', 'ungraded', 'correct'])
  })

  it('keeps the original numbering climbing inside each group', () => {
    expect(sortForReview(graded).map(g => g.index)).toEqual([1, 3, 2, 0])
  })

  it('does not mutate what it was given', () => {
    const before = graded.map(g => g.index)
    sortForReview(graded)
    expect(graded.map(g => g.index)).toEqual(before)
  })
})
