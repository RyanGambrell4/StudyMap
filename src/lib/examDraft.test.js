/**
 * The saved-exam store.
 *
 * The failure this exists to prevent is silent: a student taps Exit, the entry
 * screen clears the answer array, and an hour of work is gone with no warning.
 * These pin that a draft survives the round trip and that a damaged one is
 * treated as absent rather than restored into a broken exam.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveExamDraft, loadExamDraft, clearExamDraft, hasExamDraft, draftSummary } from './examDraft.js'

const questions = [
  { type: 'multiple_choice', question: 'Q1', answer: 'A', options: ['A', 'B'] },
  { type: 'multiple_choice', question: 'Q2', answer: 'B', options: ['A', 'B'] },
  { type: 'short_answer', question: 'Q3' },
]

const draft = (over = {}) => ({
  courseId: 'c1', courseName: 'Cell Biology',
  questions, answers: ['A', '', 'some text'], idx: 2,
  timerMinutes: 30, secondsLeft: 900, elapsedMs: 900000,
  timings: [1000, 2000, 3000],
  ...over,
})

// An explicit stub rather than a DOM environment. Node 26 defines its own
// localStorage global that is unavailable without a CLI flag and shadows
// jsdom's, so relying on the ambient one makes this suite depend on the
// runtime rather than on the code under test.
function stubStorage() {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: k => { store.delete(k) },
    clear: () => { store.clear() },
  })
}

beforeEach(() => { stubStorage() })

describe('round trip', () => {
  it('gives back everything needed to carry on', () => {
    saveExamDraft(draft())
    const d = loadExamDraft()
    expect(d.courseId).toBe('c1')
    expect(d.courseName).toBe('Cell Biology')
    expect(d.questions).toHaveLength(3)
    expect(d.answers).toEqual(['A', '', 'some text'])
    expect(d.idx).toBe(2)
    expect(d.timerMinutes).toBe(30)
    expect(d.secondsLeft).toBe(900)
    expect(d.elapsedMs).toBe(900000)
    expect(d.timings).toEqual([1000, 2000, 3000])
  })

  it('counts the answered questions for the resume line', () => {
    saveExamDraft(draft())
    const d = loadExamDraft()
    expect(d.answeredCount).toBe(2)
    expect(draftSummary(d)).toBe('2 of 3 answered')
  })

  it('reports nothing saved on a clean slate', () => {
    expect(loadExamDraft()).toBe(null)
    expect(hasExamDraft()).toBe(false)
    expect(draftSummary(null)).toBe(null)
  })

  it('clears on demand', () => {
    saveExamDraft(draft())
    expect(hasExamDraft()).toBe(true)
    clearExamDraft()
    expect(loadExamDraft()).toBe(null)
  })

  it('keeps only the newest sitting', () => {
    saveExamDraft(draft({ courseName: 'Old' }))
    saveExamDraft(draft({ courseName: 'New' }))
    expect(loadExamDraft().courseName).toBe('New')
  })
})

describe('refusing to restore something broken', () => {
  it('treats a draft with no questions as absent', () => {
    expect(saveExamDraft(draft({ questions: [] }))).toBe(false)
    expect(loadExamDraft()).toBe(null)
  })

  it('treats unparseable storage as absent instead of throwing', () => {
    localStorage.setItem('studyedge_practice_exam_draft', '{not json')
    expect(loadExamDraft()).toBe(null)
  })

  it('drops a draft written by an older version', () => {
    saveExamDraft(draft())
    const raw = JSON.parse(localStorage.getItem('studyedge_practice_exam_draft'))
    localStorage.setItem('studyedge_practice_exam_draft', JSON.stringify({ ...raw, version: 0 }))
    expect(loadExamDraft()).toBe(null)
  })

  it('realigns an answer array that does not match the questions', () => {
    saveExamDraft(draft({ answers: ['A'] }))
    const d = loadExamDraft()
    expect(d.answers).toEqual(['A', '', ''])
  })

  it('pulls an out of range position back into the exam', () => {
    saveExamDraft(draft({ idx: 99 }))
    expect(loadExamDraft().idx).toBe(2)
    saveExamDraft(draft({ idx: -4 }))
    expect(loadExamDraft().idx).toBe(0)
  })
})

describe('storage that will not cooperate', () => {
  it('never throws out of the exam when a write fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => {},
    })
    expect(() => saveExamDraft(draft())).not.toThrow()
    expect(saveExamDraft(draft())).toBe(false)
  })

  it('never throws when storage cannot be read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => {},
      removeItem: () => { throw new Error('SecurityError') },
    })
    expect(loadExamDraft()).toBe(null)
    expect(() => clearExamDraft()).not.toThrow()
  })
})
