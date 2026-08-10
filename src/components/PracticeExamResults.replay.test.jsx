// @vitest-environment jsdom
/**
 * Replay mode writes nothing.
 *
 * Reopening a stored exam from the history card renders the same results view.
 * Without a guard that mount would record a second study session, re-add every
 * miss to the deck, re-fire mastery signals and throw confetti for work the
 * student finished days ago. This pins that none of it happens, and the
 * non-replay case is asserted alongside so the guard cannot pass by accident.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  supabase: {}, getAccessToken: vi.fn(async () => 'token'),
}))
vi.mock('../lib/db', () => ({ getCachedPracticeExams: () => [] }))
vi.mock('../lib/subscription', () => ({
  getActivePlan: () => 'unlimited',
  canUseFeature: () => ({ allowed: true }),
  hasUsedTrial: () => false,
}))

const addWeakTopics = vi.hoisted(() => vi.fn())
const addStudySession = vi.hoisted(() => vi.fn())
const addCardsToDeck = vi.hoisted(() => vi.fn(async () => ({ added: 1 })))
const celebrate = vi.hoisted(() => vi.fn())
const track = vi.hoisted(() => vi.fn())

vi.mock('../lib/weakTopics', () => ({ addWeakTopics }))
vi.mock('../lib/studyHistory', () => ({ addStudySession }))
vi.mock('../lib/deckAdditions', () => ({
  addCardsToDeck,
  cardFromPracticeExamMiss: (q) => ({ front: q.question }),
}))
vi.mock('../utils/useCelebration', () => ({ useCelebration: () => celebrate }))
vi.mock('../lib/analytics', () => ({ track }))

const PracticeExamResults = (await import('./PracticeExamResults')).default

const QUESTIONS = [
  { type: 'multiple_choice', question: 'Q1', answer: 'A', topic: 'Cell cycle', options: ['A', 'B'] },
  { type: 'multiple_choice', question: 'Q2', answer: 'A', topic: 'Bioenergetics', options: ['A', 'B'] },
]
// One right, one wrong, so there is a miss to bank and a weak topic to record.
const ANSWERS = ['A', 'B']

let container, events, fetchSpy

beforeEach(() => {
  vi.clearAllMocks()
  events = []
  fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
  globalThis.fetch = fetchSpy
  window.addEventListener('studyedge:tool-session-complete', e => events.push(e.type))
  window.addEventListener('studyedge:deck-updated', e => events.push(e.type))
  container = document.createElement('div')
  document.body.appendChild(container)
})

async function mount(props = {}) {
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <PracticeExamResults
        questions={QUESTIONS}
        answers={ANSWERS}
        timeMs={60000}
        courseId="c1"
        courseName="Cell Biology"
        course={{ id: 'c1', name: 'Cell Biology' }}
        onRetake={() => {}}
        onClose={() => {}}
        {...props}
      />,
    )
  })
  return root
}

const signalCalls = () => fetchSpy.mock.calls.filter(c => String(c[0]).includes('/api/record-signals'))

describe('replay mode', () => {
  it('records nothing at all', async () => {
    await mount({ readOnly: true })
    expect(addWeakTopics).not.toHaveBeenCalled()
    expect(addStudySession).not.toHaveBeenCalled()
    expect(addCardsToDeck).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
    expect(celebrate).not.toHaveBeenCalled()
    expect(signalCalls()).toHaveLength(0)
    expect(events).toEqual([])
  })

  it('still renders the stored result', async () => {
    await mount({ readOnly: true })
    expect(container.textContent).toContain('Cell Biology')
  })
})

describe('finishing an exam for real', () => {
  it('records the session, the misses and the signals', async () => {
    await mount()
    expect(addStudySession).toHaveBeenCalledTimes(1)
    expect(addWeakTopics).toHaveBeenCalledTimes(1)
    expect(addCardsToDeck).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('practice_exam_complete', expect.anything())
    expect(signalCalls()).toHaveLength(1)
    expect(events).toContain('studyedge:tool-session-complete')
  })
})
