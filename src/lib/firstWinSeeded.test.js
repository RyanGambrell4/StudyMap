/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The seeded generation must not trigger the card ask.
 *
 * Task B runs a generation for every new account at the end of onboarding. That
 * plan is a gift, not a win the student earned, and the ask arriving 2.5s after
 * their first screen is the worst moment in the funnel for it. The ask belongs
 * on the first generation they chose to run.
 *
 * What must NOT break in the process: firstGenerationAt still gets stamped by
 * the seeded run, and first_generation_succeeded still fires for it. That event
 * is the activation metric the whole branch exists to move.
 */

const tracked = []
vi.mock('./analytics', () => ({
  track: (event, props) => tracked.push({ event, props }),
  identifyUser: () => {}, register: () => {}, registerOnce: () => {}, resetUser: () => {},
}))
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ upsert: () => ({ then: (f) => f({ error: null }) }) }) },
  getAccessToken: async () => null,
}))

// An explicit stub rather than the ambient one: Node 26 defines its own
// localStorage global that shadows jsdom's, so relying on the ambient object
// makes this suite depend on the runtime. Same reasoning as examDraft.test.js.
function stubStorage() {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
  })
}

let sub
beforeEach(async () => {
  vi.resetModules()
  tracked.length = 0
  stubStorage()
  sub = await import('./subscription')
  sub.initSubscription('user-1', { plan: 'free', status: 'active' })
})
afterEach(() => { vi.unstubAllGlobals() })

function firstWinEvents(fn) {
  const seen = []
  const h = (e) => seen.push(e.detail?.source ?? null)
  window.addEventListener('studyedge:first-win', h)
  try { fn() } finally { window.removeEventListener('studyedge:first-win', h) }
  return seen
}

describe('seeded generation does not ask for money', () => {
  it('classifies the onboarding-seeded source as seeded', () => {
    expect(sub.isSeededGenerationSource('first_course_plan')).toBe(true)
    expect(sub.isSeededGenerationSource('ai_action')).toBe(false)
    expect(sub.isSeededGenerationSource('syllabus_coach_plan')).toBe(false)
  })

  it('fires no first-win event for the seeded generation', () => {
    const seen = firstWinEvents(() => sub.maybeFireFirstWin('first_course_plan'))
    expect(seen).toEqual([])
  })

  it('still stamps the win and still reports the activation metric', () => {
    sub.markSuccessfulGeneration('first_course_plan')
    expect(sub.hasSuccessfulGeneration()).toBe(true)
    const names = tracked.map(t => t.event)
    expect(names).toContain('first_generation_succeeded')
  })

  it('fires on the first generation the student runs themselves, even after a seeded one', () => {
    // The order that matters: seeded first (silent), then organic (asks).
    const seededSeen = firstWinEvents(() => sub.maybeFireFirstWin('first_course_plan'))
    expect(seededSeen).toEqual([])

    const organicSeen = firstWinEvents(() => sub.maybeFireFirstWin('ai_action'))
    expect(organicSeen).toEqual(['ai_action'])
  })

  it('asks only once, however many organic generations follow', () => {
    firstWinEvents(() => sub.maybeFireFirstWin('ai_action'))
    const again = firstWinEvents(() => {
      sub.maybeFireFirstWin('ai_action')
      sub.maybeFireFirstWin('syllabus_coach_plan')
    })
    expect(again).toEqual([])
  })

  it('does not dispatch first-win from markSuccessfulGeneration any more', () => {
    // The dispatch moved out so the seeded path could be excluded. If it comes
    // back, the seeded run starts asking for money again and this fails.
    const seen = firstWinEvents(() => sub.markSuccessfulGeneration('first_course_plan'))
    expect(seen).toEqual([])
  })
})
