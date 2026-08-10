// @vitest-environment jsdom
/**
 * The Practice Exams entry screen, mounted for real so the uploads effect runs.
 *
 * Mounting rather than server-rendering is the point here: the material check
 * is asynchronous, and the thing most worth pinning is that the amber warning
 * never appears before that check has resolved.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../lib/supabase', () => ({
  supabase: {}, getAccessToken: async () => 'token',
}))

const exams = vi.hoisted(() => ({ current: {} }))
vi.mock('../lib/db', () => ({
  getCachedPracticeExams: (courseId) => exams.current[String(courseId)] ?? [],
  savePracticeExam: vi.fn(async () => {}),
}))

vi.mock('../lib/subscription', () => ({
  getActivePlan: () => 'pro',
  canUseFeature: () => ({ allowed: true }),
}))

vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const listUploads = vi.hoisted(() => vi.fn(async () => []))
vi.mock('../lib/uploadRegistry', () => ({ listUploads }))

const setupProps = vi.hoisted(() => ({ current: null }))
vi.mock('./PracticeExamSetup', () => ({
  default: (props) => { setupProps.current = props; return <div data-testid="setup" /> },
}))
const screenProps = vi.hoisted(() => ({ current: null }))
vi.mock('./PracticeExamScreen', () => ({
  default: (props) => { screenProps.current = props; return <div data-testid="screen" /> },
}))
vi.mock('./PracticeExamResults', () => ({ default: () => <div /> }))

const PracticeExamView = (await import('./PracticeExamView')).default

const COURSES = [
  { id: 'c1', name: 'Cell Biology', color: { dot: '#3452D9' } },
  { id: 'c2', name: 'Organic Chemistry', color: { dot: '#1a9e5c' } },
]

const AUG_5 = new Date(2026, 7, 5, 12).getTime()
const AUG_2 = new Date(2026, 7, 2, 12).getTime()
const JUL_19 = new Date(2026, 6, 19, 12).getTime()

const q = () => ({ type: 'multiple_choice', question: 'x', answer: 'A', topic: 'T' })
const rec = (over) => ({
  id: over.id, takenAt: over.takenAt, courseName: over.courseName,
  questions: [q(), q()], answers: ['A', 'A'], score: over.score, timeMs: 1,
})

let container

// Node 26 defines an unavailable localStorage global that shadows jsdom's, so
// the store is stubbed explicitly rather than assumed.
function stubStorage(seed = null) {
  const store = new Map()
  if (seed) store.set('studyedge_practice_exam_draft', JSON.stringify(seed))
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: k => { store.delete(k) },
    clear: () => { store.clear() },
  })
  return store
}

const savedExam = {
  version: 1, savedAt: Date.now(), courseId: 'c2', courseName: 'Organic Chemistry',
  questions: [
    { type: 'multiple_choice', question: 'Q1', answer: 'A', options: ['A', 'B'] },
    { type: 'multiple_choice', question: 'Q2', answer: 'B', options: ['A', 'B'] },
    { type: 'multiple_choice', question: 'Q3', answer: 'A', options: ['A', 'B'] },
  ],
  answers: ['A', 'B', ''], idx: 1,
  timerMinutes: 30, secondsLeft: 800, elapsedMs: 1000000, timings: [10, 20, 30],
}

beforeEach(() => {
  listUploads.mockClear()
  listUploads.mockResolvedValue([])
  exams.current = {}
  setupProps.current = null
  screenProps.current = null
  stubStorage()
  window.matchMedia = window.matchMedia ?? (() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  }))
  container = document.createElement('div')
  document.body.appendChild(container)
})

async function mount(props = {}) {
  const root = createRoot(container)
  await act(async () => {
    root.render(<PracticeExamView courses={COURSES} {...props} />)
  })
  return root
}

const text = () => container.textContent
const byText = (s) => [...container.querySelectorAll('*')].filter(el => el.textContent === s)

describe('entry screen, headline and deleted copy', () => {
  it('sets the H1 and the functional subtext from the export', async () => {
    await mount()
    const h1 = container.querySelector('h1')
    expect(h1.textContent).toBe('Practice Exams.')
    expect(text()).toContain('Built from your material. Find out where you stand before it counts.')
  })

  it('carries no marketing copy, no explainer and no icon tiles', async () => {
    await mount()
    const t = text()
    expect(t).not.toContain('Test yourself before it counts')
    expect(t).not.toContain('Pulls verbatim questions')
    expect(t).not.toContain('Optional countdown timer')
    expect(t).not.toContain('Instant score with a breakdown')
    expect(t).not.toContain('Built from your course data')
    expect(t).not.toContain('Pick a course')
    expect(t).not.toContain('Add your material')
    expect(t).not.toContain('Review results')
    expect(t).not.toContain('improve their scores significantly')
    expect(container.querySelectorAll('svg')).toHaveLength(0)
  })

  it('has exactly one primary button', async () => {
    await mount()
    expect(byText('Start practice exam')).toHaveLength(1)
  })
})

describe('the material check drives the source line', () => {
  it('never shows the amber warning before the check resolves', async () => {
    let release
    listUploads.mockReturnValue(new Promise(r => { release = r }))
    await mount()
    expect(text()).toContain('Checking your material for Cell Biology.')
    expect(text()).not.toContain('No material uploaded')
    await act(async () => { release([]) })
    expect(text()).toContain('No material uploaded for this course yet.')
  })

  it('names the real sources when the course has material', async () => {
    listUploads.mockResolvedValue([
      { status: 'processed', kind: 'material' },
      { status: 'processed', kind: 'syllabus' },
    ])
    exams.current.c1 = [rec({ id: 'a', takenAt: AUG_5, courseName: 'Cell Biology', score: 86 })]
    await mount()
    expect(text()).toContain('Uses your uploaded notes, syllabus, and past results for Cell Biology.')
    expect(text()).not.toContain('No material uploaded')
  })

  it('ignores uploads that never finished processing', async () => {
    listUploads.mockResolvedValue([{ status: 'failed', kind: 'material' }])
    await mount()
    expect(text()).toContain('No material uploaded for this course yet.')
  })

  it('leaves the start button enabled with no material', async () => {
    await mount()
    const btn = byText('Start practice exam')[0]
    expect(btn.disabled).toBe(false)
  })

  it('reads uploads once per course however often the chips are switched', async () => {
    await mount()
    expect(listUploads).toHaveBeenCalledTimes(1)
    const chip = (name) => [...container.querySelectorAll('button')].find(b => b.textContent === name)
    await act(async () => { chip('Organic Chemistry').click() })
    await act(async () => { chip('Cell Biology').click() })
    await act(async () => { chip('Organic Chemistry').click() })
    expect(listUploads).toHaveBeenCalledTimes(2)
  })
})

describe('history card', () => {
  beforeEach(() => {
    exams.current.c1 = [
      rec({ id: 'a', takenAt: AUG_5, courseName: 'Cell Biology', score: 86 }),
      rec({ id: 'c', takenAt: JUL_19, courseName: 'Cell Biology', score: 62 }),
    ]
    exams.current.c2 = [rec({ id: 'b', takenAt: AUG_2, courseName: 'Organic Chemistry', score: 78 })]
  })

  it('lists every course together, most recent first', async () => {
    await mount()
    const scores = [...container.querySelectorAll('span')]
      .filter(el => /^(86|78|62)$/.test(el.textContent))
      .map(el => el.textContent)
    expect(scores).toEqual(['86', '78', '62'])
  })

  it('counts what it is showing', async () => {
    await mount()
    expect(text()).toContain('3 taken')
  })

  it('colors each score by its band', async () => {
    await mount()
    const numeral = (s) => [...container.querySelectorAll('span')].find(el => el.textContent === s)
    expect(numeral('86').style.color).toBe('rgb(26, 158, 92)')
    expect(numeral('78').style.color).toBe('rgb(28, 27, 24)')
    expect(numeral('62').style.color).toBe('rgb(217, 119, 6)')
  })

  it('writes the date and length the way the export does', async () => {
    await mount()
    expect(text()).toContain('August 5, 2 questions')
  })

  it('offers Review on every row it can replay', async () => {
    await mount()
    expect(byText('Review')).toHaveLength(3)
  })

  it('renders a dash, not a number, for an exam that was never scored', async () => {
    exams.current = { c1: [rec({ id: 'a', takenAt: AUG_5, courseName: 'Cell Biology', score: null })] }
    await mount()
    const dash = [...container.querySelectorAll('span')].find(el => el.textContent === '–')
    expect(dash).toBeTruthy()
    expect(text()).not.toContain('null')
  })

  it('drops the Review link when there is nothing stored to replay', async () => {
    exams.current = {
      c1: [{ id: 'a', takenAt: AUG_5, courseName: 'Cell Biology', questions: [], answers: [], score: 80 }],
    }
    await mount()
    expect(byText('Review')).toHaveLength(0)
  })
})

describe('a saved, unfinished exam', () => {
  const click = (label) => act(async () => {
    [...container.querySelectorAll('button')].find(b => b.textContent === label).click()
  })

  it('is not offered when there is nothing saved', async () => {
    await mount()
    expect(text()).not.toContain('EXAM IN PROGRESS')
    expect(byText('Resume exam')).toHaveLength(0)
  })

  it('shows what was saved and how far it got', async () => {
    stubStorage(savedExam)
    await mount()
    expect(text()).toContain('EXAM IN PROGRESS')
    expect(text()).toContain('Organic Chemistry')
    expect(text()).toContain('2 of 3 answered')
  })

  it('hands the whole sitting back to the exam screen on resume', async () => {
    stubStorage(savedExam)
    await mount()
    await click('Resume exam')
    expect(screenProps.current.questions).toHaveLength(3)
    expect(screenProps.current.initial.answers).toEqual(['A', 'B', ''])
    expect(screenProps.current.initial.idx).toBe(1)
    expect(screenProps.current.initial.secondsLeft).toBe(800)
    expect(screenProps.current.initial.elapsedMs).toBe(1000000)
    expect(screenProps.current.timerMinutes).toBe(30)
    expect(screenProps.current.courseId).toBe('c2')
  })

  it('lets the student throw it away deliberately', async () => {
    stubStorage(savedExam)
    await mount()
    await click('Discard')
    expect(text()).not.toContain('EXAM IN PROGRESS')
    expect(byText('Resume exam')).toHaveLength(0)
  })

  it('asks before a new exam takes its place', async () => {
    stubStorage(savedExam)
    await mount()
    await click('Start practice exam')
    expect(setupProps.current).toBe(null)
    expect(text()).toContain('You have an exam in progress')
  })

  it('goes ahead once the student confirms', async () => {
    stubStorage(savedExam)
    await mount()
    await click('Start practice exam')
    await click('Start a new exam')
    expect(setupProps.current).not.toBe(null)
  })

  it('keeps the saved exam when the student cancels', async () => {
    stubStorage(savedExam)
    await mount()
    await click('Start practice exam')
    await click('Cancel')
    expect(setupProps.current).toBe(null)
    expect(text()).toContain('EXAM IN PROGRESS')
  })

  it('keeps Resume secondary so there is still one primary button', async () => {
    stubStorage(savedExam)
    await mount()
    const resume = byText('Resume exam')[0]
    const start = byText('Start practice exam')[0]
    // The primary is the filled one. Resume is outlined.
    expect(start.style.background).toBe('rgb(52, 82, 217)')
    expect(resume.style.background).toBe('rgb(255, 255, 255)')
    expect(resume.style.color).toBe('rgb(52, 82, 217)')
  })
})

describe('first time state', () => {
  it('replaces the history card with one quiet line', async () => {
    await mount()
    expect(text()).toContain('Your past exams and scores will show up here.')
    expect(text()).not.toContain('Past exams')
    expect(text()).not.toContain('taken')
  })
})

describe('what the start button hands downstream', () => {
  it('passes the selected course, the length and the timer', async () => {
    await mount()
    const click = (label) => act(async () => {
      [...container.querySelectorAll('button')].find(b => b.textContent === label).click()
    })
    await click('Organic Chemistry')
    await click('30questions')
    await act(async () => {
      [...container.querySelectorAll('button')].find(b => b.textContent === 'Start practice exam').click()
    })
    expect(setupProps.current.course.id).toBe('c2')
    expect(setupProps.current.length).toBe(30)
    expect(setupProps.current.timerMinutes).toBe(45)
  })

  it('sends a null timer once the toggle is off', async () => {
    await mount()
    await act(async () => { container.querySelector('[role="switch"]').click() })
    await act(async () => {
      [...container.querySelectorAll('button')].find(b => b.textContent === 'Start practice exam').click()
    })
    expect(setupProps.current.length).toBe(20)
    expect(setupProps.current.timerMinutes).toBe(null)
  })

  it('defaults to the 20 question timed exam the export shows', async () => {
    await mount()
    expect(text()).toContain('On, 30 minutes')
    await act(async () => {
      [...container.querySelectorAll('button')].find(b => b.textContent === 'Start practice exam').click()
    })
    expect(setupProps.current.length).toBe(20)
    expect(setupProps.current.timerMinutes).toBe(30)
  })

  it('offers 10, 20 and 30 and no custom length', async () => {
    await mount()
    const lengths = [...container.querySelectorAll('button')]
      .map(b => b.textContent)
      .filter(t => t.endsWith('questions'))
    expect(lengths).toEqual(['10questions', '20questions', '30questions'])
    expect(container.querySelector('input[type="number"]')).toBe(null)
  })
})
