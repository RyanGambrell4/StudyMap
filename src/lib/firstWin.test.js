/**
 * The card ask may not fire before a generation has actually succeeded.
 *
 * The trial offer used to be step 3 of onboarding, ten seconds after a preview
 * screen, against an account with no course and no generation behind it. 13 of
 * 24 trials were cancelled the same day the card went in and 20 of 24 quit
 * before the trial ended.
 *
 * The rule is enforced at one choke point, openPaywall in App.jsx, which is
 * what makes it checkable at all. These tests cover the signal it reads
 * (markSuccessfulGeneration) and assert the wiring is still in place.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'

const upserts = []
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      upsert: (row) => { upserts.push(row); return { then: (cb) => { cb({ error: null }); return Promise.resolve() } } },
    }),
  },
  getAccessToken: async () => null,
}))

const tracked = []
vi.mock('./analytics', () => ({
  track: (event, props) => tracked.push({ event, props }),
  register: () => {}, registerOnce: () => {},
  identifyUser: () => {}, resetUser: () => {}, initAnalytics: () => {},
}))

const {
  initSubscription, clearSubscription,
  hasSuccessfulGeneration, markSuccessfulGeneration, getFirstGenerationAt,
} = await import('./subscription.js')

const dispatched = []
globalThis.window = globalThis.window ?? {}
globalThis.window.dispatchEvent = (e) => { dispatched.push(e); return true }
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type, init) { this.type = type; this.detail = init?.detail } }

describe('the first successful generation', () => {
  beforeEach(() => {
    upserts.length = 0
    tracked.length = 0
    dispatched.length = 0
    clearSubscription()
  })

  it('a brand new free account has not had one', () => {
    initSubscription('user-1', { plan: 'free', status: 'active' })
    expect(hasSuccessfulGeneration()).toBe(false)
  })

  it('marking one records it, persists it, and announces it', () => {
    initSubscription('user-1', { plan: 'free', status: 'active' })

    expect(markSuccessfulGeneration('quiz_burst')).toBe(true)

    expect(hasSuccessfulGeneration()).toBe(true)
    expect(getFirstGenerationAt()).toBeTruthy()
    // Persisted, so a reload does not ask for a card all over again.
    expect(upserts).toHaveLength(1)
    expect(upserts[0].subscription.firstGenerationAt).toBeTruthy()
    // Announced, so the card ask can fire off the win.
    expect(dispatched.map(e => e.type)).toContain('studyedge:first-win')
    expect(tracked.map(t => t.event)).toContain('first_generation_succeeded')
  })

  it('is stamped once and only once', () => {
    initSubscription('user-1', { plan: 'free', status: 'active' })
    markSuccessfulGeneration('quiz_burst')
    const first = getFirstGenerationAt()
    upserts.length = 0
    dispatched.length = 0

    expect(markSuccessfulGeneration('flashcards')).toBe(false)

    expect(getFirstGenerationAt()).toBe(first)
    expect(upserts).toHaveLength(0)
    expect(dispatched).toHaveLength(0)
  })

  it('an account that already has one is recognised on load', () => {
    initSubscription('user-1', { plan: 'free', status: 'active', firstGenerationAt: '2026-08-01T00:00:00.000Z' })
    expect(hasSuccessfulGeneration()).toBe(true)
  })
})

describe('the card ask is wired behind the win', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
  const onboarding = readFileSync(new URL('../components/Onboarding.jsx', import.meta.url), 'utf8')

  it('openPaywall refuses to open for a free user with no successful generation', () => {
    const fn = app.slice(app.indexOf('const openPaywall = useCallback'))
    const body = fn.slice(0, fn.indexOf('}, [])'))
    expect(body).toContain("plan === 'free' && !hasSuccessfulGeneration()")
    // It must return before setting any paywall state.
    const guardIdx = body.indexOf('!hasSuccessfulGeneration()')
    const openIdx = body.indexOf('setPaywallOpen(true)')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(openIdx).toBeGreaterThan(guardIdx)
  })

  it('every paywall surface goes through that one choke point', () => {
    // Any component opening the paywall does it by dispatching this event,
    // which App routes into openPaywall. A direct setPaywallOpen elsewhere
    // would bypass the rule.
    const directOpens = app.split('\n').filter(l => l.includes('setPaywallOpen(true)'))
    expect(directOpens, 'setPaywallOpen(true) should only appear inside openPaywall').toHaveLength(1)
  })

  it('the win schedules the ask rather than onboarding scheduling it', () => {
    expect(app).toContain("window.addEventListener('studyedge:first-win', handler)")
    expect(app).toContain("openPaywall('first-win')")
  })

  it('onboarding no longer contains a trial step', () => {
    expect(onboarding).not.toContain('trial_offer')
    expect(onboarding).not.toContain('activateTrial')
    expect(onboarding).not.toContain('Start 7-day free trial')
    expect(onboarding).not.toContain('step === 3')
  })

  it('the floating trial pill obeys the same rule', () => {
    const pill = app.split('\n').find(l => l.includes('trialNudgeVisible && !trialNudgeDismissed'))
    expect(pill).toContain('hasSuccessfulGeneration()')
  })
})
