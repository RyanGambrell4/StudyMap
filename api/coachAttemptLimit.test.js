import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The coach plan is the only Sonnet endpoint, and reserve/commit means a failed
 * generation costs the user nothing while still billing us in full. Quota
 * cannot catch that — a reservation that is never committed is never written —
 * so without a ceiling on ATTEMPTS, anyone willing to make requests that fail
 * had an unmetered Sonnet budget.
 *
 * The assertion that matters is not just the 429: it is that the refusal
 * happens before fetch is ever called, because a limit checked after the model
 * has already generated tokens would have cost the money it exists to save.
 */

const fetchCalls = []
vi.stubGlobal('fetch', vi.fn(async (url) => {
  fetchCalls.push(String(url))
  return { ok: true, status: 200, json: async () => ({ content: [{ text: '{}' }], usage: {} }) }
}))

let counters = {}
vi.mock('../lib/server/redis.js', () => ({
  getRedis: () => ({
    incr: async (k) => { counters[k] = (counters[k] ?? 0) + 1; return counters[k] },
    expire: async () => 1,
  }),
}))

vi.mock('../lib/server/axiom.js', () => ({ log: () => {}, logAiCall: () => {} }))

let currentPlan = 'free'
vi.mock('../lib/server/usage.js', () => ({
  verifyAuth: async () => ({ ok: true, userId: 'u1' }),
  reserveAiUsage: async () => ({
    ok: true,
    userId: 'u1',
    plan: currentPlan,
    usage: { used: 5, limit: 5 },
    commit: async () => ({ ok: true }),
  }),
  verifyAndCheckAiUsage: async () => ({ ok: true, userId: 'u1', plan: currentPlan }),
  PLAN_AI_LIMITS: { free: 5, pro: 100, unlimited: Infinity },
}))

// Course resolution is not what this test is about; make it succeed cheaply.
vi.mock('../lib/server/courseContext.js', () => ({
  getCourseContext: async () => ({ identity: { name: 'Bio 101' } }),
  formatCourseContextForPrompt: () => '',
  resolveCourseId: async () => 'course-1',
}))

const handler = (await import('./generate-study-coach-plan.js')).default

/** A well-formed request, so validation cannot be what refuses it. */
function makeReq() {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: { courseId: 'course-1', goal: 'Pass the final', daysPerWeek: 3, sessionMinutes: 60 },
  }
}

function makeRes() {
  const r = { statusCode: null, payload: null }
  r.status = (c) => { r.statusCode = c; return r }
  r.json = (p) => { r.payload = p; return r }
  return r
}

beforeEach(() => { counters = {}; fetchCalls.length = 0; currentPlan = 'free' })

describe('coach plan hourly attempt ceiling', () => {
  it('refuses a free user on the sixth attempt in an hour', async () => {
    for (let i = 0; i < 5; i++) {
      const res = makeRes()
      await handler(makeReq(), res)
      expect(res.statusCode).not.toBe(429)
    }

    const res = makeRes()
    await handler(makeReq(), res)

    expect(res.statusCode).toBe(429)
    expect(res.payload.code).toBe('COACH_ATTEMPT_LIMIT')
  })

  it('refuses before any Anthropic call is made', async () => {
    for (let i = 0; i < 5; i++) await handler(makeReq(), makeRes())
    const callsBefore = fetchCalls.filter(u => u.includes('api.anthropic.com')).length
    // Guard against a vacuous pass: if the allowed attempts never reached
    // Anthropic at all, "no new call" below would prove nothing.
    expect(callsBefore).toBeGreaterThan(0)

    await handler(makeReq(), makeRes())

    const callsAfter = fetchCalls.filter(u => u.includes('api.anthropic.com')).length
    expect(callsAfter).toBe(callsBefore)
  })

  it('gives a paid user a higher ceiling than a free one', async () => {
    currentPlan = 'pro'
    for (let i = 0; i < 20; i++) {
      const res = makeRes()
      await handler(makeReq(), res)
      expect(res.statusCode).not.toBe(429)
    }

    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(429)
  })

  it('counts attempts per user, so one user cannot exhaust another', async () => {
    for (let i = 0; i < 6; i++) await handler(makeReq(), makeRes())
    expect(Object.keys(counters).some(k => k.includes('coach:attempts:u1'))).toBe(true)
  })
})
