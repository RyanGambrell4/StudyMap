// @vitest-environment jsdom
/**
 * What the rebuilt result screen shows, and what it must never show.
 *
 * The screen this replaced opened with a projected course grade and a claim
 * that three sessions "typically move scores 8-15 pts", then rendered every
 * missed question as a red-tinted card with a red INCORRECT badge. A student
 * who scored badly met nineteen alarms in a row and two numbers the app had no
 * way to know. These tests pin that none of that can come back, that an
 * unscorable exam shows a dash rather than a zero, and that the celebration
 * only fires for a score worth celebrating.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({ supabase: {}, getAccessToken: vi.fn(async () => 'token') }))

const cachedExams = vi.hoisted(() => vi.fn(() => []))
const celebrate = vi.hoisted(() => vi.fn())
const plan = vi.hoisted(() => vi.fn(() => 'pro'))

vi.mock('../lib/subscription', () => ({
  getActivePlan: plan,
  canUseFeature: () => ({ allowed: true }),
  hasUsedTrial: () => false,
}))

vi.mock('../lib/db', () => ({ getCachedPracticeExams: cachedExams }))
vi.mock('../lib/weakTopics', () => ({ addWeakTopics: vi.fn() }))
vi.mock('../lib/studyHistory', () => ({ addStudySession: vi.fn() }))
vi.mock('../lib/deckAdditions', () => ({
  addCardsToDeck: vi.fn(async () => ({ added: 0 })),
  cardFromPracticeExamMiss: (q) => ({ front: q.question }),
}))
vi.mock('../utils/useCelebration', () => ({ useCelebration: () => celebrate }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const PracticeExamResults = (await import('./PracticeExamResults')).default

const mc = (n, topic, answer = 'A') => ({
  type: 'multiple_choice', question: `Question text ${n}`, answer, topic, options: ['A', 'B'],
})

// Four multiple choice, three right and one wrong: a 75.
const QUESTIONS = [mc(1, 'Cell cycle'), mc(2, 'Cell cycle'), mc(3, 'Bioenergetics'), mc(4, 'Bioenergetics')]
const ANSWERS = ['A', 'A', 'A', 'B']

let container

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  cachedExams.mockReturnValue([])
  plan.mockReturnValue('pro')
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
  container = document.createElement('div')
  document.body.appendChild(container)
})

async function mount(props = {}) {
  await act(async () => {
    createRoot(container).render(
      <PracticeExamResults
        questions={QUESTIONS}
        answers={ANSWERS}
        timeMs={24 * 60000}
        courseId="c1"
        courseName="Cell Biology"
        onRetake={() => {}}
        onClose={() => {}}
        {...props}
      />,
    )
  })
}

const buttons = () => [...container.querySelectorAll('button')]
const byText = (label) => buttons().find(b => b.textContent.trim() === label)

// The screen carries an inline stylesheet for its entrance animation and its
// responsive rules. That is not copy, and reading it as copy makes assertions
// about what the student sees pass or fail on CSS.
const text = () => {
  const clone = container.cloneNode(true)
  clone.querySelectorAll('style').forEach(s => s.remove())
  return clone.textContent
}

describe('the hero', () => {
  it('states the score once, as the headline and the numeral', async () => {
    await mount()
    expect(text()).toContain('You scored 75')
    expect(text()).toContain('3 of 4 correct')
  })

  it('colors the numeral by the band the score falls in', async () => {
    await mount()
    const numeral = [...container.querySelectorAll('span')].find(s => s.textContent === '75')
    expect(numeral.style.color).toBe('rgb(28, 27, 24)') // ink, 70 to 84
    expect(numeral.style.fontSize).toBe('62px')
  })

  it('puts the time in the subtext and nowhere else', async () => {
    await mount({ timerMinutes: 30 })
    expect(text()).toContain('Finished in 24 minutes of the 30 allowed.')
    expect(text().match(/24 minutes/g)).toHaveLength(1)
  })

  it('compares against the last attempt when there was one', async () => {
    cachedExams.mockReturnValue([{ takenAt: new Date(2026, 6, 27, 12).getTime(), score: 71 }])
    await mount({ takenAt: new Date(2026, 7, 3, 12).getTime() })
    expect(text()).toContain('Up from 71 on July 27.')
  })

  it('never compares an exam against itself', async () => {
    const takenAt = new Date(2026, 7, 3, 12).getTime()
    // The exam that was just sat is already in the cache by the time this
    // renders. Comparing against it would always report no change.
    cachedExams.mockReturnValue([{ takenAt, score: 75 }])
    await mount({ takenAt })
    expect(text()).not.toContain('Same as your last attempt')
  })
})

describe('an exam with no score', () => {
  const shortAnswers = [
    { type: 'short_answer', question: 'Explain osmosis', answer: 'Model answer', topic: 'Transport' },
    { type: 'short_answer', question: 'Explain mitosis', answer: 'Model answer', topic: 'Cell cycle' },
  ]

  it('shows a dash instead of inventing a number', async () => {
    await mount({ questions: shortAnswers, answers: ['a', 'b'] })
    expect(text()).toContain('Scored answers below')
    expect(text()).not.toContain('You scored')
    expect(text()).not.toMatch(/\b0\b/)
  })

  it('leaves the numeral uncolored, having no band to sit in', async () => {
    await mount({ questions: shortAnswers, answers: ['a', 'b'] })
    const dash = [...container.querySelectorAll('span')].find(s => s.style.fontSize === '62px')
    expect(dash.style.color).toBe('rgb(85, 86, 92)') // secondary, not a score color
  })
})

describe('the topic breakdown', () => {
  it('shows every topic as correct of total', async () => {
    await mount()
    expect(text()).toContain('Cell cycle')
    expect(text()).toContain('2 of 2')
    expect(text()).toContain('1 of 2')
  })

  it('offers Drill only where something was actually missed', async () => {
    const onDrillTopic = vi.fn()
    await mount({ onDrillTopic })
    const drills = buttons().filter(b => b.textContent.trim() === 'Drill')
    expect(drills).toHaveLength(1) // Bioenergetics only; Cell cycle was perfect
    await act(async () => { drills[0].click() })
    expect(onDrillTopic).toHaveBeenCalledWith('Bioenergetics')
  })

  it('shows no Drill links at all when nothing routes anywhere', async () => {
    await mount({ onDrillTopic: null })
    expect(buttons().filter(b => b.textContent.trim() === 'Drill')).toHaveLength(0)
  })
})

describe('the answer review', () => {
  it('opens the missed question and collapses the correct ones', async () => {
    await mount()
    // The miss is question 4, and its text is rendered.
    expect(text()).toContain('Question text 4')
    // The three correct ones are collapsed to a single line each, so their
    // question text is not on the page until they are opened.
    expect(text()).not.toContain('Question text 1')
  })

  it('expands a correct row when it is clicked', async () => {
    await mount()
    const collapsed = buttons().find(b => b.textContent.includes('Question 1'))
    await act(async () => { collapsed.click() })
    expect(text()).toContain('Question text 1')
  })

  it('labels the wrong answer and the right one without a badge', async () => {
    await mount()
    expect(text()).toContain('Your answer')
    expect(text()).toContain('Correct answer')
    expect(text()).not.toMatch(/INCORRECT/i)
  })

  it('marks an unanswered question as skipped rather than blank', async () => {
    await mount({ answers: ['A', 'A', 'A', ''] })
    expect(text()).toContain('Skipped')
  })

  it('keeps the explanation as plain text, with no tinted box behind it', async () => {
    await mount({ questions: [{ ...QUESTIONS[3], explanation: 'Because the spindle checks first.' }], answers: ['B'] })
    expect(text()).toContain('Because the spindle checks first.')
    const tinted = [...container.querySelectorAll('div, p')].filter(el => {
      const bg = el.style.background
      return bg && /rgba?\(\s*2[0-9]{2}\s*,\s*[0-9]{1,2}\s*,/.test(bg)
    })
    expect(tinted).toHaveLength(0)
  })

  it('offers Why was I wrong only on the miss', async () => {
    await mount()
    expect(buttons().filter(b => b.textContent.trim() === 'Why was I wrong?')).toHaveLength(1)
  })
})

describe('the celebration', () => {
  it('fires for a score worth celebrating', async () => {
    vi.useFakeTimers()
    await mount({ answers: ['A', 'A', 'A', 'A'] }) // 100
    await act(async () => { vi.advanceTimersByTime(1200) })
    expect(celebrate).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('stays quiet at 84, one point under the line', async () => {
    vi.useFakeTimers()
    // 5 of 6 is 83, below the threshold.
    const qs = [...QUESTIONS, mc(5, 'Cell cycle'), mc(6, 'Cell cycle')]
    await mount({ questions: qs, answers: ['A', 'A', 'A', 'B', 'A', 'A'] })
    await act(async () => { vi.advanceTimersByTime(1200) })
    expect(celebrate).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('never fires on a replay, however good the score', async () => {
    vi.useFakeTimers()
    await mount({ answers: ['A', 'A', 'A', 'A'], readOnly: true })
    await act(async () => { vi.advanceTimersByTime(1200) })
    expect(celebrate).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('the footer', () => {
  it('leaves Retake as the only filled button on the screen', async () => {
    await mount({ onDrillTopic: vi.fn() })
    const filled = buttons().filter(b => b.style.background === 'rgb(52, 82, 217)')
    expect(filled).toHaveLength(1)
    expect(filled[0].textContent.trim()).toBe('Retake')
  })

  it('offers the way back as a quiet link that actually goes back', async () => {
    const onClose = vi.fn()
    await mount({ onClose })
    const back = byText('Back to Practice Exams')
    expect(back.style.background).toBe('none')
    await act(async () => { back.click() })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('retakes when Retake is pressed', async () => {
    const onRetake = vi.fn()
    await mount({ onRetake })
    await act(async () => { byText('Retake').click() })
    expect(onRetake).toHaveBeenCalledTimes(1)
  })
})

describe('the history note', () => {
  it('claims the save only once it has actually happened', async () => {
    await mount({ savedToHistory: false })
    expect(text()).not.toContain('Added to your practice exam history.')
    await mount({ savedToHistory: true })
    expect(text()).toContain('Added to your practice exam history.')
  })

  it('does not claim a save on a replay, where nothing was written', async () => {
    await mount({ savedToHistory: true, readOnly: true })
    expect(text()).not.toContain('Added to your practice exam history.')
  })
})

describe('the score trend', () => {
  const past = [
    { takenAt: new Date(2026, 5, 2, 12).getTime(), score: 60 },
    { takenAt: new Date(2026, 6, 27, 12).getTime(), score: 71 },
  ]
  const takenAt = new Date(2026, 7, 3, 12).getTime()

  it('plots the exams that were actually sat, and forecasts nothing', async () => {
    plan.mockReturnValue('unlimited')
    cachedExams.mockReturnValue(past)
    await mount({ takenAt })
    expect(text()).toContain('Your last 3 practice exams for this course.')
    expect(text()).not.toContain('Predicted')
    expect(text()).not.toContain('Projected')
  })

  it('stays hidden until there are two sittings to compare', async () => {
    plan.mockReturnValue('unlimited')
    cachedExams.mockReturnValue([])
    await mount({ takenAt })
    expect(text()).not.toContain('Score trend')
  })

  it('is an Unlimited feature, and the nudge replaces it for everyone else', async () => {
    plan.mockReturnValue('pro')
    cachedExams.mockReturnValue(past)
    await mount({ takenAt })
    expect(text()).not.toContain('Score trend')
    expect(byText('See Unlimited')).toBeTruthy()
  })
})

describe('what can never come back', () => {
  it('shows no projection, no autopsy and no invented improvement', async () => {
    await mount()
    for (const banned of [
      'Projected if this were the real exam', 'recovery plan', 'Your recovery plan',
      '8-15', 'Exam autopsy', 'INCORRECT', 'Predicted real exam score',
      'Time breakdown', 'Weakest topics', 'Drill these topics',
    ]) {
      expect(text()).not.toContain(banned)
    }
  })
})
