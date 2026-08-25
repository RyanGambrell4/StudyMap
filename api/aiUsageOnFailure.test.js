import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * One assertion, applied to every AI endpoint that requires a course:
 *
 *   a request that fails validation must leave the user's quota unchanged.
 *
 * This is the regression test for the bug that emptied two accounts on
 * 19 Aug 2026. verifyAndCheckAiUsage ran at the top of each handler and wrote
 * the increment before the handler had looked at the request body, so a request
 * that was about to 400 for a missing course still cost an AI action. Free tier
 * is five actions, so a burst of failures is the whole allowance.
 *
 * The test asserts on `commit`, not on a refund. Under reserve-and-commit a
 * failed request never writes in the first place, so "quota unchanged" means
 * "commit was never called". There is no refund to get wrong.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────
// usage.js is stubbed so we can observe reservations without a database.

const reservations = []

vi.mock('../lib/server/usage.js', () => ({
  verifyAuth: async () => ({ ok: true, userId: 'user-under-test' }),
  reserveAiUsage: async () => {
    const r = { committed: false }
    reservations.push(r)
    return {
      ok: true,
      userId: 'user-under-test',
      plan: 'free',
      usage: { used: 1, limit: 5 },
      commit: async () => { r.committed = true; return { ok: true } },
    }
  },
  verifyAndCheckAiUsage: async () => {
    // The all-in-one variant charges at call time by definition. If an endpoint
    // still uses it above its validation, that is the bug, so record it as a
    // charge the moment it is called.
    const r = { committed: true }
    reservations.push(r)
    return { ok: true, userId: 'user-under-test', plan: 'free', usage: { used: 1, limit: 5 }, commit: async () => ({ ok: true }) }
  },
  PLAN_AI_LIMITS: { free: 5, pro: 100, unlimited: Infinity },
}))

// The course lookup finds nothing, which is the validation failure under test.
vi.mock('../lib/server/courseContext.js', () => ({
  resolveCourseId: async () => null,
  getCourseContext: async () => { throw new Error('should not be reached') },
  formatCourseContextForPrompt: () => '',
}))

vi.mock('../lib/server/rateLimit.js', () => ({ checkAiRateLimit: async () => ({ allowed: true }) }))
vi.mock('../lib/server/axiom.js', () => ({ log: async () => {}, logAiCall: async () => {} }))
vi.mock('../lib/server/artifactWriter.js', () => ({ saveArtifact: async () => {} }))

// Nothing should reach the network. If an endpoint gets this far, the test
// should fail loudly rather than silently hitting a real provider.
const fetchSpy = vi.fn(async () => { throw new Error('network call attempted after a validation failure') })
vi.stubGlobal('fetch', fetchSpy)

// ── Endpoints under test ────────────────────────────────────────────────────
// Every handler that resolves a course before doing AI work. Each entry carries
// the minimum body that gets past the handler's OTHER validations, so the
// missing course is the thing that actually rejects the request.

const ENDPOINTS = [
  ['quiz-burst', {}],
  ['cheat-sheet', {}],
  ['course-insights', {}],
  ['session-debrief', {}],
  ['connections-mode', { phase: 'generate' }],
  ['exam-rescue', {}],
  ['brain-dump-score', { text: 'some recalled material' }],
  ['chat-tutor', { messages: [{ role: 'user', content: 'hi' }] }],
  ['essay-thesis', { topic: 'a topic' }],
  ['essay-outline', { topic: 'a topic' }],
  ['essay-review-section', { sectionName: 'Intro', draft: 'a draft' }],
  ['generate-diagram', { topic: 'a topic', diagramType: 'flowchart' }],
  ['generate-session-blueprint', { durationMinutes: 45 }],
  ['generate-study-coach-plan', { goal: 'Do well' }],
  ['generate-study-tools', { mode: 'quick-quiz', text: 'x'.repeat(120) }],
  ['generate-practice-exam', { text: 'x'.repeat(120) }],
]

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
    setHeader(k, v) { this.headers[k] = v },
    write() {},
    end() {},
  }
  return res
}

function makeReq(body) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-length': '100' },
    body,
  }
}

describe('AI endpoints do not charge for requests that fail validation', () => {
  beforeEach(() => {
    reservations.length = 0
    fetchSpy.mockClear()
  })

  for (const [name, body] of ENDPOINTS) {
    it(`${name}: a request with no resolvable course leaves the quota unchanged`, async () => {
      const { default: handler } = await import(`./${name}.js`)
      const res = makeRes()
      await handler(makeReq(body), res)

      // It must reject, and specifically for the missing course. Asserting the
      // code stops this passing vacuously because some other required field
      // happened to be missing from the fixture body.
      expect(res.statusCode, `${name} should reject a request with no course`).toBeGreaterThanOrEqual(400)
      expect(res.body?.code, `${name} rejected for the wrong reason: ${JSON.stringify(res.body)}`)
        .toBe('course_required')

      // And it must not have charged for it.
      const charged = reservations.filter(r => r.committed)
      expect(charged, `${name} charged the user for a request it rejected`).toHaveLength(0)

      // And it must not have called the AI provider.
      expect(fetchSpy, `${name} called out to the network before validating`).not.toHaveBeenCalled()
    })
  }
})
