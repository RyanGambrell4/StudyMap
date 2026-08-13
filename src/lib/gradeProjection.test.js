import { describe, it, expect, vi, beforeEach } from 'vitest'

// masteryStore reads localStorage; stub it so these stay pure unit tests of the
// projection rules rather than of the store.
let mockMastery = null
vi.mock('./masteryStore', () => ({
  getAverageMastery: () => mockMastery,
}))

const { projectCourseGrade, getProjectionMove, projectionMoveLine, MIN_MOVE_PCT } =
  await import('./gradeProjection')

function course(components, id = 'c1') {
  return { id, name: 'BIOL 2030', gradeData: { components } }
}

const MIDTERM_ONLY = [
  { id: 'a', weight: 30, graded: true, grade: 80 },
  { id: 'b', weight: 70, graded: false, grade: null },
]

beforeEach(() => { mockMastery = null })

describe('projectCourseGrade', () => {
  it('returns null when the course has no components', () => {
    expect(projectCourseGrade(course([]))).toBeNull()
    expect(projectCourseGrade({ id: 'x' })).toBeNull()
    expect(projectCourseGrade(null)).toBeNull()
  })

  it('returns null when nothing is graded and nothing is recalled', () => {
    // The failure mode this whole module exists to prevent: a week-3 student
    // being shown a projection of ~0 because ungraded work counts as zero.
    expect(projectCourseGrade(course(MIDTERM_ONLY.map(c => ({ ...c, graded: false }))))).toBeNull()
  })

  it('never projects near zero just because most work is ungraded', () => {
    mockMastery = null
    const p = projectCourseGrade(course(MIDTERM_ONLY))
    // 30% graded at 80, 70% ungraded. Raw getProjectedGrade would say 24.
    expect(p.projected).toBeGreaterThan(70)
    expect(p.basis).toBe('current')
  })

  it('uses recall as the estimate for ungraded work when it exists', () => {
    mockMastery = 90
    const p = projectCourseGrade(course(MIDTERM_ONLY))
    // 0.3*80 + 0.7*90 = 87
    expect(p.projected).toBeCloseTo(87, 1)
    expect(p.basis).toBe('mastery')
    expect(p.letter).toBe('A')
  })

  it('moves the projection when recall moves, which is the whole feature', () => {
    mockMastery = 60
    const before = projectCourseGrade(course(MIDTERM_ONLY)).projected
    mockMastery = 95
    const after = projectCourseGrade(course(MIDTERM_ONLY)).projected
    expect(after).toBeGreaterThan(before)
  })

  it('barely moves when there is almost nothing left to grade', () => {
    const nearlyDone = [
      { id: 'a', weight: 95, graded: true, grade: 80 },
      { id: 'b', weight: 5, graded: false, grade: null },
    ]
    mockMastery = 20
    const low = projectCourseGrade(course(nearlyDone)).projected
    mockMastery = 100
    const high = projectCourseGrade(course(nearlyDone)).projected
    // 5% of the grade is 4 points of swing, not 80.
    expect(high - low).toBeLessThan(5)
  })

  it('handles a fully graded course without dividing by remaining weight', () => {
    mockMastery = 50
    const p = projectCourseGrade(course([
      { id: 'a', weight: 50, graded: true, grade: 88 },
      { id: 'b', weight: 50, graded: true, grade: 92 },
    ]))
    expect(p.projected).toBeCloseTo(90, 1)
    expect(p.remainingWeight).toBe(0)
  })

  it('returns null on zero total weight rather than dividing by it', () => {
    expect(projectCourseGrade(course([{ id: 'a', weight: 0, graded: true, grade: 80 }]))).toBeNull()
  })
})

describe('getProjectionMove', () => {
  const projection = { projected: 87, letter: 'A' }

  it('is null with no prior snapshot, so a first visit is not a "move"', () => {
    expect(getProjectionMove('c1', projection, {})).toBeNull()
  })

  it('ignores movement below the noise floor', () => {
    const snaps = { c1: { projected: 87 - (MIN_MOVE_PCT / 2) } }
    expect(getProjectionMove('c1', projection, snaps)).toBeNull()
  })

  it('reports a real rise and whether it crossed a letter', () => {
    const move = getProjectionMove('c1', projection, { c1: { projected: 82 } })
    expect(move.delta).toBeCloseTo(5, 1)
    expect(move.letterBefore).toBe('A-')
    expect(move.letterAfter).toBe('A')
    expect(move.crossedLetter).toBe(true)
  })

  it('reports a fall too, because a mirror that only flatters is not a mirror', () => {
    const move = getProjectionMove('c1', projection, { c1: { projected: 94 } })
    expect(move.delta).toBeLessThan(0)
  })

  it('is null for a missing projection or course', () => {
    expect(getProjectionMove('c1', null, { c1: { projected: 80 } })).toBeNull()
    expect(getProjectionMove(null, projection, {})).toBeNull()
  })
})

describe('projectionMoveLine', () => {
  const up = { delta: 5, letterAfter: 'B+', letterBefore: 'B', crossedLetter: true }

  it('names the score, the topic and the course in one sentence', () => {
    const line = projectionMoveLine({ move: up, courseName: 'BIOL 2030', topic: 'enzyme kinetics', scorePct: 78 })
    expect(line).toBe('78 percent on enzyme kinetics moves your BIOL 2030 projection to B+.')
  })

  it('says nothing when nothing moved', () => {
    expect(projectionMoveLine({ move: null, courseName: 'BIOL 2030' })).toBeNull()
    expect(projectionMoveLine({})).toBeNull()
  })

  it('degrades without a topic or a score rather than rendering undefined', () => {
    for (const args of [
      { move: up, courseName: 'BIOL 2030' },
      { move: up, scorePct: 78 },
      { move: up },
    ]) {
      const line = projectionMoveLine(args)
      expect(line).toBeTruthy()
      expect(line).not.toMatch(/undefined|null|NaN/)
      expect(line[0]).toBe(line[0].toUpperCase())
    }
  })

  it('states a drop flatly, with no blame and no praise', () => {
    const down = { delta: -4, letterAfter: 'B', letterBefore: 'B+', crossedLetter: true }
    const line = projectionMoveLine({ move: down, courseName: 'BIOL 2030', topic: 'glycolysis', scorePct: 41 })
    expect(line).toBe('41 percent on glycolysis puts your BIOL 2030 projection at B.')
    expect(line).not.toMatch(/sorry|unfortunately|keep going|do not worry/i)
  })

  it('carries no em dash, en dash, emoji or exclamation mark', () => {
    const cases = [
      { move: up, courseName: 'BIOL 2030', topic: 'enzyme kinetics', scorePct: 78 },
      { move: { ...up, delta: -3 }, courseName: 'CHEM 1010', topic: 'titration', scorePct: 44 },
      { move: up },
    ]
    for (const c of cases) {
      const line = projectionMoveLine(c)
      expect(line).not.toMatch(/[–—]/u)
      expect(line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
      expect(line).not.toContain('!')
    }
  })
})
