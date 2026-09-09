import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Redis is the only ceiling on AI burst rate. It used to fail open in both
 * directions — no Redis configured, and Redis throwing — which meant an Upstash
 * outage silently handed every account unlimited burst at once, on the one code
 * path where the monthly quota cannot act as a backstop (a failed generation
 * never commits, so it never depletes quota).
 *
 * The rule now splits by plan: free users are the abuse surface and are refused,
 * paid users are let through and the outage is logged rather than silent.
 */

let redisImpl = null
vi.mock('./redis.js', () => ({ getRedis: () => redisImpl }))

const logged = []
vi.mock('./axiom.js', () => ({
  log: (event, data) => { logged.push({ event, data }) },
}))

const { rateLimit, checkAiRateLimit } = await import('./rateLimit.js')

beforeEach(() => { redisImpl = null; logged.length = 0 })

/** A Redis stub that counts, so the non-degraded path can be exercised too. */
function workingRedis() {
  const counters = {}
  return {
    incr: async (k) => { counters[k] = (counters[k] ?? 0) + 1; return counters[k] },
    expire: async () => 1,
  }
}

describe('rateLimit degraded flag', () => {
  it('reports degraded when Redis is not configured', async () => {
    redisImpl = null
    const r = await rateLimit('k', 5, 60)
    expect(r.degraded).toBe(true)
  })

  it('reports degraded when Redis throws', async () => {
    redisImpl = { incr: async () => { throw new Error('ECONNRESET') }, expire: async () => 1 }
    const r = await rateLimit('k', 5, 60)
    expect(r.degraded).toBe(true)
  })

  it('is not degraded when Redis answers', async () => {
    redisImpl = workingRedis()
    const r = await rateLimit('k', 5, 60)
    expect(r.degraded).toBe(false)
    expect(r.allowed).toBe(true)
  })
})

describe('checkAiRateLimit when Redis is unavailable', () => {
  it('refuses a free user with a 503', async () => {
    redisImpl = null
    const r = await checkAiRateLimit('user-free', 'free')

    expect(r.allowed).toBe(false)
    expect(r.status).toBe(503)
    expect(r.error).toMatch(/try again in a moment/i)
  })

  it('allows a paid user and logs the degradation', async () => {
    redisImpl = null
    const r = await checkAiRateLimit('user-pro', 'pro')

    expect(r.allowed).toBe(true)
    expect(logged.map(l => l.event)).toContain('ai.gate.ratelimit_degraded')
    expect(logged.find(l => l.event === 'ai.gate.ratelimit_degraded').data)
      .toMatchObject({ userId: 'user-pro', plan: 'pro' })
  })

  it('allows an unlimited user too', async () => {
    redisImpl = null
    const r = await checkAiRateLimit('user-unl', 'unlimited')
    expect(r.allowed).toBe(true)
  })

  it('refuses a free user when Redis throws, not only when it is absent', async () => {
    redisImpl = { incr: async () => { throw new Error('boom') }, expire: async () => 1 }
    const r = await checkAiRateLimit('user-free', 'free')
    expect(r.allowed).toBe(false)
    expect(r.status).toBe(503)
  })
})

describe('checkAiRateLimit with a healthy Redis keeps the existing limits', () => {
  it('allows a free user up to 3 per minute, then refuses with 429 semantics', async () => {
    redisImpl = workingRedis()
    for (let i = 0; i < 3; i++) {
      expect((await checkAiRateLimit('u', 'free')).allowed).toBe(true)
    }
    const r = await checkAiRateLimit('u', 'free')
    expect(r.allowed).toBe(false)
    expect(r.status).toBeUndefined() // falls through to the caller's 429
    expect(r.error).toMatch(/slow down/i)
  })

  it('allows a paid user more headroom than a free one', async () => {
    redisImpl = workingRedis()
    for (let i = 0; i < 10; i++) {
      expect((await checkAiRateLimit('p', 'pro')).allowed).toBe(true)
    }
    expect((await checkAiRateLimit('p', 'pro')).allowed).toBe(false)
  })
})
