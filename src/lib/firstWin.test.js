/**
 * The first-generation stamp is a signal. It is not a gate.
 *
 * markSuccessfulGeneration() still exists and still schedules a well-timed ask
 * the moment a student's first generation lands — that part was always the good
 * idea, and the tests for it below are unchanged.
 *
 * What these tests now forbid is the thing that idea turned into. The stamp was
 * wired as a precondition on openPaywall and on every upgrade surface in the
 * product. Because it is written only server-side, and only from 2026-08-25,
 * almost no account had one — so every upgrade button in the app silently did
 * nothing. Clicking did not navigate, did not open a modal, did not error.
 * Walked on production 2026-08-29 against a free account with one course: the
 * Grade Hub lock CTA and the Courses add button were both dead.
 *
 * The earlier version of this file made that worse rather than catching it. It
 * asserted the gate was present on every surface, so the tests went green
 * precisely because the buttons were unreachable. A previous round even found
 * the same defect in the nav and "fixed" it by hiding the button instead of
 * fixing the gate — the comment recording that is still in the git history.
 *
 * So the assertions are inverted. A gate on the ask must never be a silent
 * no-op again: if a surface should not ask, it renders something a person can
 * see, and if openPaywall cannot open it says so out loud.
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
    // This asserts the client ATTEMPTS the write, against a mocked Supabase.
    // In production the write is reverted by user_data_guard_subscription_trg,
    // which blocks every non-service-role write to `subscription`. The durable
    // stamp comes from commitReservation() server-side instead. Do not read
    // this assertion as proof that the value survives a reload.
    // See docs/subscription-column-writes.md.
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

describe('openPaywall opens, unconditionally', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
  const onboarding = readFileSync(new URL('../components/Onboarding.jsx', import.meta.url), 'utf8')

  // The body of openPaywall, which is what actually has to be free of gates.
  const fnBody = (() => {
    const fn = app.slice(app.indexOf('const openPaywall = useCallback'))
    return fn.slice(0, fn.indexOf('}, [])'))
  })()

  it('REGRESSION: does not gate opening on the first-generation stamp', () => {
    // This is the whole bug. If this string comes back, every upgrade button in
    // the product goes dead again for any account without a server-written stamp.
    expect(fnBody, 'openPaywall must not consult the first-generation stamp')
      .not.toContain('hasSuccessfulGeneration')
  })

  it('REGRESSION: has no early return before the paywall is opened', () => {
    const openIdx = fnBody.indexOf('setPaywallOpen(true)')
    expect(openIdx, 'setPaywallOpen(true) not found').toBeGreaterThan(-1)
    const before = fnBody.slice(0, openIdx)
    // `return` inside the refuse() helper is fine; a bare early return that
    // skips opening is not. Nothing above the open call may return.
    const bareReturn = before.split('\n').find(l => /^\s*return\b/.test(l))
    expect(bareReturn, `early return before opening: ${bareReturn}`).toBeUndefined()
  })

  it('a refusal is loud: it logs and fires an event', () => {
    // A CTA that no-ops must never again be invisible. Any future condition that
    // wants to suppress the paywall has to go through this path.
    expect(fnBody).toContain('paywall_open_failed')
    expect(fnBody).toContain('console.error')
  })

  it('every paywall surface still goes through that one choke point', () => {
    const directOpens = app.split('\n').filter(l => l.includes('setPaywallOpen(true)'))
    expect(directOpens, 'setPaywallOpen(true) should only appear inside openPaywall').toHaveLength(1)
  })

  it('the win still schedules an ask — that part was never the problem', () => {
    expect(app).toContain("window.addEventListener('studyedge:first-win', handler)")
    expect(app).toContain("openPaywall('first-win')")
  })

  it('onboarding still contains no trial step', () => {
    expect(onboarding).not.toContain('trial_offer')
    expect(onboarding).not.toContain('activateTrial')
    expect(onboarding).not.toContain('Start 7-day free trial')
    expect(onboarding).not.toContain('step === 3')
  })
})

/**
 * Every upgrade entry point must be reachable by a free account.
 *
 * These four surfaces were each gated on the stamp, so a free user had no
 * visible way to upgrade anywhere in the product: no nav button, no dashboard
 * prompt, no Account control, and a floating pill that never appeared.
 */
describe('no upgrade surface is gated on the stamp', () => {
  const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')

  for (const file of [
    '../components/AppShell.jsx',
    '../components/DashboardView.jsx',
    '../components/AccountView.jsx',
  ]) {
    it(`REGRESSION: ${file.split('/').pop()} does not import or call the stamp`, () => {
      const src = read(file)
      // Comments are allowed to mention the history; code is not. Strip line
      // comments before asserting so the prose above does not fake a pass —
      // the previous version of this suite went green off exactly that kind of
      // string match.
      const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
      expect(code, `${file} still gates an upgrade surface on the stamp`)
        .not.toContain('hasSuccessfulGeneration')
    })
  }

  it('REGRESSION: the floating trial pill is not gated on the stamp', () => {
    const app = read('../App.jsx')
    const pill = app.split('\n').find(l => l.includes('trialNudgeVisible && !trialNudgeDismissed'))
    expect(pill, 'trial pill line not found').toBeTruthy()
    expect(pill).not.toContain('hasSuccessfulGeneration')
  })

  it('the Courses add button no longer says "Free Trial to Add"', () => {
    // Not English, and it described a trial rather than the action.
    const src = read('../components/CoursesView.jsx')
    expect(src).not.toContain('Free Trial to Add')
  })
})
