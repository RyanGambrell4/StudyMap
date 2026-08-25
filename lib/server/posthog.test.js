/**
 * Server-side capture must fail loudly.
 *
 * Between 2026-07-27 and 2026-08-20 exactly five server-side events landed.
 * The old implementation awaited fetch() and never looked at the response, so
 * a rejected key produced no log line, no throw, and no event. From the
 * outside that is indistinguishable from nobody signing up.
 *
 * Two facts about the PostHog ingest endpoint, verified live on 2026-08-20 and
 * encoded here so they are not rediscovered the hard way:
 *
 *   - a personal API key (phx_) is rejected with 401 invalid_personal_api_key
 *   - ANY phc_-shaped key returns 200, valid or not, because ingest validates
 *     asynchronously. res.ok therefore proves acceptance, not delivery.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { posthogCapture, posthogKeyKind, assertPosthogKeyShape } from './posthog.js'

const PROJECT_KEY = 'phc_exampleProjectWriteKey0000000000000000000'
const PERSONAL_KEY = 'phx_examplePersonalApiKey000000000000000000'

let errors = []

beforeEach(() => {
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')))
  delete process.env.VERCEL_ENV
  delete process.env.POSTHOG_STRICT
  process.env.POSTHOG_API_KEY = PROJECT_KEY
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('posthogKeyKind', () => {
  it('tells a project write key from a personal API key', () => {
    expect(posthogKeyKind(PROJECT_KEY)).toBe('project')
    expect(posthogKeyKind(PERSONAL_KEY)).toBe('personal')
    expect(posthogKeyKind('')).toBe('missing')
    expect(posthogKeyKind(null)).toBe('missing')
    // No argument falls through to the environment, which is the normal call.
    expect(posthogKeyKind()).toBe('project')
    expect(posthogKeyKind('sk-something-else')).toBe('unknown')
  })
})

describe('assertPosthogKeyShape', () => {
  it('passes silently on a project key', () => {
    expect(assertPosthogKeyShape()).toEqual({ ok: true, kind: 'project' })
    expect(errors).toHaveLength(0)
  })

  it('names the personal-key mistake explicitly rather than failing vaguely', () => {
    process.env.POSTHOG_API_KEY = PERSONAL_KEY
    const result = assertPosthogKeyShape()
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('personal')
    expect(errors.join('\n')).toContain('phx_')
    expect(errors.join('\n')).toContain('phc_')
  })

  it('never logs the key itself', () => {
    process.env.POSTHOG_API_KEY = PERSONAL_KEY
    assertPosthogKeyShape()
    expect(errors.join('\n')).not.toContain(PERSONAL_KEY)
  })

  it('throws outside production so a broken pipeline fails the deploy check', () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.POSTHOG_API_KEY = PERSONAL_KEY
    expect(() => assertPosthogKeyShape()).toThrow(/personal/)
  })
})

describe('posthogCapture', () => {
  it('reports a non-2xx response instead of swallowing it', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 401,
      text: async () => '{"code":"invalid_personal_api_key"}',
    }))
    const result = await posthogCapture('checkout_started', 'user-1', {})
    expect(result.ok).toBe(false)
    expect(result.status).toBe(401)
    // The body matters: without it a 401 is indistinguishable from a 500.
    expect(errors.join('\n')).toContain('invalid_personal_api_key')
  })

  it('reports a network failure instead of swallowing it', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('socket hang up') })
    const result = await posthogCapture('checkout_started', 'user-1', {})
    expect(result.ok).toBe(false)
    expect(errors.join('\n')).toContain('socket hang up')
  })

  it('throws in a preview deploy rather than going quiet', async () => {
    process.env.VERCEL_ENV = 'preview'
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, text: async () => 'nope' }))
    await expect(posthogCapture('checkout_started', 'user-1', {})).rejects.toThrow(/401/)
  })

  it('does not throw in production, because analytics must not take a webhook down', async () => {
    process.env.VERCEL_ENV = 'production'
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, text: async () => 'boom' }))
    await expect(posthogCapture('checkout_started', 'user-1', {})).resolves.toMatchObject({ ok: false })
  })

  it('refuses to send with a personal key and says why', async () => {
    process.env.POSTHOG_API_KEY = PERSONAL_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await posthogCapture('checkout_started', 'user-1', {})
    expect(result.ok).toBe(false)
    expect(result.skipped).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports a missing distinctId rather than dropping the event quietly', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await posthogCapture('checkout_started', null, {})
    expect(result.ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(errors.join('\n')).toContain('distinctId')
  })

  it('sends the event and reports success on a 200', async () => {
    let sent = null
    vi.stubGlobal('fetch', async (url, init) => {
      sent = { url, body: JSON.parse(init.body) }
      return { ok: true, status: 200, text: async () => 'ok' }
    })
    const result = await posthogCapture('checkout_started', 'user-1', { plan: 'pro' })
    expect(result).toMatchObject({ ok: true, status: 200, kind: 'project' })
    expect(sent.url).toContain('/i/v0/e/')
    expect(sent.body.event).toBe('checkout_started')
    expect(sent.body.distinct_id).toBe('user-1')
    expect(sent.body.properties.plan).toBe('pro')
    expect(sent.body.properties.$lib).toBe('server')
  })
})

describe('checkout_started is not fire-and-forget', () => {
  it('the Stripe handler awaits the capture before returning the session', async () => {
    const { readFileSync } = await import('fs')
    const src = readFileSync(new URL('../../api/stripe.js', import.meta.url), 'utf8')
    const idx = src.indexOf("posthogCapture('checkout_started'")
    expect(idx).toBeGreaterThan(-1)
    const stmt = src.slice(idx - 40, idx)
    expect(stmt, 'checkout_started must be awaited: res.json() ends the invocation').toContain('await')
    // And the old fire-and-forget shape must be gone.
    expect(src.slice(idx, idx + 400)).not.toContain('.catch(() => {})')
  })
})
