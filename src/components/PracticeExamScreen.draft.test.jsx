// @vitest-environment jsdom
/**
 * Leaving an exam without losing it.
 *
 * The old behaviour: Exit called onExit() straight through, the entry screen
 * cleared the answer array, and every answer was gone with no prompt. These
 * tests pin the new contract, including that discarding is still possible but
 * has to be chosen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const PracticeExamScreen = (await import('./PracticeExamScreen')).default
const { loadExamDraft, saveExamDraft } = await import('../lib/examDraft')

const QUESTIONS = [
  { type: 'multiple_choice', question: 'Q1', answer: 'A', options: ['A', 'B'] },
  { type: 'multiple_choice', question: 'Q2', answer: 'B', options: ['A', 'B'] },
  { type: 'multiple_choice', question: 'Q3', answer: 'A', options: ['A', 'B'] },
]

let container, onExit, onSubmit

function stubStorage() {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: k => { store.delete(k) },
    clear: () => { store.clear() },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  stubStorage()
  onExit = vi.fn()
  onSubmit = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
})

async function mount(props = {}) {
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <PracticeExamScreen
        questions={QUESTIONS}
        courseId="c1"
        courseName="Cell Biology"
        timerMinutes={null}
        onSubmit={onSubmit}
        onExit={onExit}
        {...props}
      />,
    )
  })
  return root
}

const btn = (label) => [...container.querySelectorAll('button')].find(b => b.textContent === label)
const click = (label) => act(async () => { btn(label).click() })
const answerFirstOption = () => act(async () => { btn('A').click() })

describe('exiting mid exam', () => {
  it('asks instead of dropping the answers on the floor', async () => {
    await mount()
    await answerFirstOption()
    await click('Exit')
    expect(onExit).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Leave this exam?')
  })

  it('keeps the answers when the student saves and exits', async () => {
    await mount()
    await answerFirstOption()
    await click('Exit')
    await click('Save and exit')
    expect(onExit).toHaveBeenCalledTimes(1)
    const draft = loadExamDraft()
    expect(draft).not.toBe(null)
    expect(draft.answers[0]).toBe('A')
    expect(draft.answeredCount).toBe(1)
    expect(draft.courseId).toBe('c1')
    expect(draft.courseName).toBe('Cell Biology')
  })

  it('throws them away only when that is the choice made', async () => {
    await mount()
    await answerFirstOption()
    await click('Exit')
    await click('Discard exam')
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(loadExamDraft()).toBe(null)
  })

  it('goes back to the exam on Keep going', async () => {
    await mount()
    await click('Exit')
    await click('Keep going')
    expect(onExit).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('Leave this exam?')
  })
})

describe('saving as the student works', () => {
  it('writes a draft as soon as an answer is given, before any exit', async () => {
    await mount()
    await answerFirstOption()
    const draft = loadExamDraft()
    expect(draft).not.toBe(null)
    expect(draft.answers[0]).toBe('A')
  })

  it('remembers which question the student was on', async () => {
    await mount()
    await click('Next →')
    expect(loadExamDraft().idx).toBe(1)
  })
})

describe('resuming', () => {
  it('restores the answers, the position and the clock', async () => {
    await mount({
      timerMinutes: 30,
      initial: {
        answers: ['A', 'B', ''], idx: 2, secondsLeft: 700,
        elapsedMs: 500000, timings: [1, 2, 3],
      },
    })
    expect(container.textContent).toContain('Question 3 of 3')
    expect(container.textContent).toContain('2/3 answered')
    expect(container.textContent).toContain('11:40') // 700 seconds left
  })

  it('counts the whole sitting, not just the visit after resuming', async () => {
    await mount({
      initial: { answers: ['A', 'B', 'A'], idx: 2, elapsedMs: 600000, timings: [0, 0, 0] },
    })
    await click('Submit exam')
    await click('Submit')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    // Time already spent is folded in, so the total is at least what was
    // carried over rather than restarting from zero.
    expect(onSubmit.mock.calls[0][0].timeMs).toBeGreaterThanOrEqual(600000)
  })
})

describe('finishing', () => {
  it('clears the draft on submit so nothing stale is offered later', async () => {
    saveExamDraft({ courseId: 'c1', questions: QUESTIONS, answers: ['A', '', ''], idx: 0 })
    await mount()
    await answerFirstOption()
    await click('Submit anyway')
    await click('Submit')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(loadExamDraft()).toBe(null)
  })
})
