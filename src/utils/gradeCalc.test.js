import { describe, it, expect } from 'vitest'
import {
  computeGradeMath, bestAchievableTarget, letterGrade, TARGET_OPTIONS,
  generateScenarioPaths,
} from './gradeCalc'

// Component fixtures mirror the worked examples in design/grade-hub/.
const comp = (id, component, weight, grade = null) => ({
  id, component, weight,
  grade,
  graded: grade !== null,
})

// The design export's 2a: Midterm graded at 93, everything else outstanding.
const FULLY_SET_UP = [
  comp('m', 'Midterm', 30, 93),
  comp('f', 'Final Exam', 40),
  comp('q', 'Quizzes', 15),
  comp('p', 'Group Project', 15),
]

const A_PLUS = TARGET_OPTIONS.find(o => o.label === 'A+').value  // 90

describe('computeGradeMath — the sanity example from the design spec', () => {
  // Midterm 93 at 30% weight, target cutoff 90.0
  const m = computeGradeMath(FULLY_SET_UP, 90)

  it('banks 27.9 points and loses 2.1', () => {
    expect(m.earned).toBeCloseTo(27.9, 6)
    expect(m.lost).toBeCloseTo(2.1, 6)
  })

  it('tops out at 97.9 achievable', () => {
    expect(m.maxAchievable).toBeCloseTo(97.9, 6)
    // maxAchievable = 100 - lost = earned + remaining
    expect(m.maxAchievable).toBeCloseTo(m.earned + m.remaining, 6)
  })

  it('needs 88.71% on the remaining 70%', () => {
    expect(m.remaining).toBeCloseTo(70, 6)
    expect(m.neededAvg).toBeCloseTo(88.714285, 5)
    expect(m.neededAvg.toFixed(1)).toBe('88.7')
  })

  it('leaves a 7.9 point cushion', () => {
    expect(m.cushion).toBeCloseTo(7.9, 6)
    expect(m.impossible).toBe(false)
  })

  it('makes the four bar segments sum to exactly 100', () => {
    // Order per the export: earned, lost, needed, cushion. The "needed" segment
    // is what is required of the remaining work; cushion is the slack above it.
    const needed = m.remaining - m.cushion
    expect(m.earned + m.lost + needed + m.cushion).toBeCloseTo(100, 6)
    expect(needed).toBeCloseTo(62.1, 6)
  })

  it('reports the current average and graded count for the footer stats', () => {
    expect(m.currentAverage).toBeCloseTo(93.0, 6)
    expect(m.gradedCount).toBe(1)
    expect(m.componentCount).toBe(4)
  })
})

describe('computeGradeMath — all graded', () => {
  // The export's 2d: every component in, final average 92.4.
  const allGraded = [
    comp('m', 'Midterm', 30, 93),
    comp('f', 'Final Exam', 40, 90),
    comp('q', 'Quizzes', 15, 96),
    comp('p', 'Group Project', 15, 94),
  ]
  const m = computeGradeMath(allGraded, 90)

  it('has nothing remaining', () => {
    expect(m.allGraded).toBe(true)
    expect(m.remaining).toBeCloseTo(0, 6)
  })

  it('reports the final average as 92.4', () => {
    expect(m.finalAverage).toBeCloseTo(92.4, 6)
    expect(m.earned).toBeCloseTo(92.4, 6)
  })

  it('draws a two-segment bar of 92.4 earned and 7.6 lost', () => {
    expect(m.lost).toBeCloseTo(7.6, 6)
    expect(m.earned + m.lost).toBeCloseTo(100, 6)
  })

  it('has no needed average to show', () => {
    expect(m.neededAvg).toBeNull()
    // A finished course is never "impossible", it is simply done.
    expect(m.impossible).toBe(false)
  })
})

describe('computeGradeMath — impossible target', () => {
  // The export's 2b: Midterm 68 at 30%, Quizzes 78 at 15%, target A+ (90).
  const behind = [
    comp('m', 'Midterm', 30, 68),
    comp('f', 'Final Exam', 40),
    comp('q', 'Quizzes', 15, 78),
    comp('p', 'Group Project', 15),
  ]
  const m = computeGradeMath(behind, 90)

  it('banks 32.1 and loses 12.9', () => {
    expect(m.earned).toBeCloseTo(32.1, 6)
    expect(m.lost).toBeCloseTo(12.9, 6)
  })

  it('tops out at 87.1, below the 90 cutoff', () => {
    expect(m.maxAchievable).toBeCloseTo(87.1, 6)
  })

  it('flags the target as unreachable with a 2.9 point shortfall', () => {
    expect(m.impossible).toBe(true)
    expect(m.cushion).toBeCloseTo(-2.9, 6)
    expect(m.shortfall).toBeCloseTo(2.9, 6)
  })

  it('needs more than 100% on remaining work', () => {
    expect(m.rawNeededAvg).toBeGreaterThan(100)
    // The displayed value stays clamped so the hero never prints "105%".
    expect(m.neededAvg).toBe(100)
  })

  it('carves the shortfall out of the lost segment so the bar still sums to 100', () => {
    // Order per the export: earned, possible, short, lost.
    expect(m.residualLost).toBeCloseTo(10.0, 6)
    expect(m.earned + m.remaining + m.shortfall + m.residualLost).toBeCloseTo(100, 6)
  })

  it('offers the best still-reachable target as the retarget action', () => {
    const best = bestAchievableTarget(behind, m.maxAchievable)
    expect(best).not.toBeNull()
    // Under this app's cutoff table 87.1 clears the A cutoff of 85.
    expect(best.value).toBeLessThanOrEqual(m.maxAchievable)
    expect(best.label).toBe(letterGrade(m.maxAchievable))
    // And the retarget must itself be achievable.
    expect(best.neededAvg).toBeLessThanOrEqual(100)
  })
})

describe('computeGradeMath — edge cases', () => {
  it('returns an empty shape for no components', () => {
    const m = computeGradeMath([], 90)
    expect(m.hasComponents).toBe(false)
    expect(m.neededAvg).toBeNull()
    expect(m.impossible).toBe(false)
  })

  it('survives null and undefined component lists', () => {
    expect(computeGradeMath(null, 90).hasComponents).toBe(false)
    expect(computeGradeMath(undefined, 90).hasComponents).toBe(false)
  })

  it('returns an empty shape when weights total zero', () => {
    const m = computeGradeMath([comp('a', 'Nothing', 0)], 90)
    expect(m.hasComponents).toBe(true)
    expect(m.neededAvg).toBeNull()
  })

  it('normalises legacy rows whose weights do not total 100', () => {
    // Same 93 on the midterm, but the saved weights only add to 50.
    const m = computeGradeMath([
      comp('m', 'Midterm', 15, 93),
      comp('f', 'Final', 35),
    ], 90)
    // Scaled onto a 100-point course this is identical to the 30/70 split.
    expect(m.earned).toBeCloseTo(27.9, 6)
    expect(m.remaining).toBeCloseTo(70, 6)
    expect(m.earned + m.lost + m.remaining).toBeCloseTo(100, 6)
  })

  it('treats a target of zero as trivially reachable', () => {
    const m = computeGradeMath(FULLY_SET_UP, 0)
    expect(m.impossible).toBe(false)
    expect(m.neededAvg).toBe(0)
  })

  it('handles a perfect record with room to spare', () => {
    const m = computeGradeMath([comp('m', 'Midterm', 50, 100), comp('f', 'Final', 50)], A_PLUS)
    expect(m.lost).toBeCloseTo(0, 6)
    expect(m.maxAchievable).toBeCloseTo(100, 6)
    expect(m.cushion).toBeCloseTo(10, 6)
    expect(m.neededAvg).toBeCloseTo(80, 6)
  })
})

describe('generateScenarioPaths', () => {
  const paths = generateScenarioPaths(FULLY_SET_UP, 90)
  const byName = Object.fromEntries(paths.map(p => [p.name, p]))
  // Final Exam is the heaviest outstanding component, so it is the anchor.
  const FINAL = 'f', QUIZ = 'q', PROJ = 'p'

  it('returns the three designed paths in card order', () => {
    expect(paths.map(p => p.name)).toEqual(['Consistent', 'Strong Finish', 'Front-Loaded'])
  })

  it('puts every remaining component on the flat average for Consistent', () => {
    const s = byName['Consistent'].scores
    expect(s[FINAL]).toBeCloseTo(88.7, 1)
    expect(s[QUIZ]).toBeCloseTo(88.7, 1)
    expect(s[PROJ]).toBeCloseTo(88.7, 1)
  })

  it('pushes the final above the rest for Strong Finish', () => {
    const s = byName['Strong Finish'].scores
    expect(s[FINAL]).toBeGreaterThan(s[QUIZ])
    expect(s[QUIZ]).toBe(s[PROJ])
    // Coast on the small stuff means the small stuff drops below flat.
    expect(s[QUIZ]).toBeLessThan(88.7)
  })

  it('pulls the final below the rest for Front-Loaded', () => {
    const s = byName['Front-Loaded'].scores
    expect(s[FINAL]).toBeLessThan(s[QUIZ])
    expect(s[QUIZ]).toBe(s[PROJ])
    expect(s[QUIZ]).toBeGreaterThan(88.7)
  })

  it('lands every path on the target, not just the flat one', () => {
    // Weighted average of the three outstanding components must equal the
    // needed average, otherwise a path quietly misses the grade it promises.
    const weights = { [FINAL]: 40, [QUIZ]: 15, [PROJ]: 15 }
    for (const p of paths) {
      const avg = Object.entries(p.scores).reduce((s, [id, v]) => s + v * weights[id], 0) / 70
      expect(avg).toBeCloseTo(88.71, 1)
    }
  })

  it('never asks for a score above 100 or below 0', () => {
    // A target that needs 97% on the remainder leaves no room to push higher.
    const tight = [
      comp('m', 'Midterm', 50, 60),
      comp('f', 'Final', 40),
      comp('q', 'Quiz', 10),
    ]
    for (const p of generateScenarioPaths(tight, 85)) {
      for (const v of Object.values(p.scores)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('falls back to the flat average when only one component remains', () => {
    const one = [comp('m', 'Midterm', 60, 80), comp('f', 'Final', 40)]
    for (const p of generateScenarioPaths(one, 85)) {
      expect(p.scores['f']).toBeCloseTo(92.5, 1)
    }
  })

  it('reports an unreachable target instead of inventing a path', () => {
    const doomed = [comp('m', 'Midterm', 80, 40), comp('f', 'Final', 20)]
    const [only] = generateScenarioPaths(doomed, 90)
    expect(only.possible).toBe(false)
  })
})

describe('the cushion bar never lies', () => {
  // Property check: whatever the data, the segments the Plan tab draws total 100.
  const cases = [
    [[comp('a', 'A', 100, 50)], 90],
    [[comp('a', 'A', 25, 88), comp('b', 'B', 75)], 90],
    [[comp('a', 'A', 60, 12), comp('b', 'B', 40)], 85],
    [[comp('a', 'A', 33, 100), comp('b', 'B', 33, 0), comp('c', 'C', 34)], 73],
  ]

  it.each(cases)('sums to 100 for case %#', (components, target) => {
    const m = computeGradeMath(components, target)
    const total = m.impossible
      ? m.earned + m.remaining + m.shortfall + m.residualLost
      : m.allGraded
        ? m.earned + m.lost
        : m.earned + m.lost + (m.remaining - m.cushion) + m.cushion
    expect(total).toBeCloseTo(100, 6)
  })
})
