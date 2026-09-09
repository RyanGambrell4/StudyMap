import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The org-wide daily spend cap.
 *
 * Every other ceiling in the product is per user, so N accounts is N times the
 * ceiling, and Google OAuth signups arrive already confirmed so account
 * creation is cheaper than the email wall suggests. This is the only limit that
 * does not scale with the number of accounts.
 *
 * It is a backstop behind the Anthropic console spend limit, so the other half
 * of its contract matters as much as the cap itself: every failure path has to
 * allow. A bug here must not be able to take AI down on its own.
 */

let store = {}
let redisImpl = null

vi.mock('./redis.js', () => ({ getRedis: () => redisImpl }))

const logged = []
vi.mock('./axiom.js', () => ({ log: (event, data) => { logged.push({ event, data }) } }))

let billingRow = {
  plan: 'free',
  status: 'active',
  aiQueriesUsed: 0,
  aiQueriesResetAt: new Date().toISOString(),
  bonusAiActions: 0,
  firstGenerationAt: null,
}
vi.mock('./billing.js', () => ({
  readBilling: async () => ({ ok: true, billing: billingRow }),
  commitUsage: async () => ({ ok: true }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('resend', () => ({ Resend: class { constructor() { this.emails = { send: async () => ({}) } } } }))

const { checkGlobalSpendCap, logAiCall } = await import('./aiCost.js')
const { reserveAiUsage } = await import('./usage.js')

function workingRedis() {
  return {
    get: async (k) => store[k] ?? null,
    incrby: async (k, n) => { store[k] = (store[k] ?? 0) + n; return store[k] },
    expire: async () => 1,
    incr: async (k) => { store[k] = (store[k] ?? 0) + 1; return store[k] },
  }
}

const todayKey = () => `ai:spend:${new Date().toISOString().slice(0, 10)}`
const originalCap = process.env.AI_DAILY_SPEND_CAP_USD

beforeEach(() => { store = {}; logged.length = 0; redisImpl = workingRedis(); delete process.env.AI_DAILY_SPEND_CAP_USD })
afterEach(() => {
  if (originalCap === undefined) delete process.env.AI_DAILY_SPEND_CAP_USD
  else process.env.AI_DAILY_SPEND_CAP_USD = originalCap
})

describe('checkGlobalSpendCap', () => {
  it('defaults to a $25 cap and allows an empty day', async () => {
    const r = await checkGlobalSpendCap()
    expect(r).toMatchObject({ ok: true, spentUsd: 0, capUsd: 25 })
  })

  it('refuses once the day has exceeded the cap', async () => {
    process.env.AI_DAILY_SPEND_CAP_USD = '10'
    store[todayKey()] = 10_500_000 // $10.50 in micro-dollars
    const r = await checkGlobalSpendCap()
    expect(r.ok).toBe(false)
    expect(r.spentUsd).toBeCloseTo(10.5, 4)
    expect(r.capUsd).toBe(10)
  })

  it('refuses everything at a cap of 0', async () => {
    process.env.AI_DAILY_SPEND_CAP_USD = '0'
    const r = await checkGlobalSpendCap()
    expect(r.ok).toBe(false)
  })

  it('allows when Redis is absent rather than taking AI down', async () => {
    redisImpl = null
    process.env.AI_DAILY_SPEND_CAP_USD = '0'
    const r = await checkGlobalSpendCap()
    expect(r.ok).toBe(true)
  })

  it('allows when Redis throws', async () => {
    redisImpl = { get: async () => { throw new Error('down') } }
    process.env.AI_DAILY_SPEND_CAP_USD = '0'
    const r = await checkGlobalSpendCap()
    expect(r.ok).toBe(true)
  })

  it('falls back to the default cap when the env var is nonsense', async () => {
    process.env.AI_DAILY_SPEND_CAP_USD = 'not-a-number'
    const r = await checkGlobalSpendCap()
    expect(r.capUsd).toBe(25)
  })
})

describe('logAiCall feeds the counter', () => {
  it('accumulates spend across calls', async () => {
    await logAiCall({
      endpoint: 'generate-study-coach-plan',
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 10_000, output_tokens: 16_000 },
      ok: true,
    })
    const after = await checkGlobalSpendCap()
    expect(after.spentUsd).toBeCloseTo(0.27, 2)
  })

  it('counts sub-cent Haiku calls instead of rounding them away', async () => {
    // The reason the counter is in micro-dollars: in cents each of these is 0,
    // and 25 of the 29 endpoints would contribute nothing to an org-wide cap.
    for (let i = 0; i < 100; i++) {
      await logAiCall({
        endpoint: 'reteach',
        model: 'claude-haiku-4-5-20251001',
        usage: { input_tokens: 2000, output_tokens: 500 },
        ok: true,
      })
    }
    const after = await checkGlobalSpendCap()
    expect(after.spentUsd).toBeGreaterThan(0.4)
  })

  it('sets a TTL on the key it creates, so the counter is daily', async () => {
    const expires = []
    redisImpl = { ...workingRedis(), expire: async (k, s) => { expires.push([k, s]); return 1 } }
    await logAiCall({ endpoint: 'x', model: 'claude-sonnet-4-6', usage: { output_tokens: 1000 }, ok: true })
    expect(expires[0][0]).toBe(todayKey())
    expect(expires[0][1]).toBe(48 * 3600)
  })

  it('does not increment for a zero-cost failed call', async () => {
    await logAiCall({ endpoint: 'x', model: 'claude-sonnet-4-6', usage: null, ok: false })
    expect(store[todayKey()]).toBeUndefined()
  })
})

describe('the cap refuses real requests through reserveAiUsage', () => {
  const gate = () => reserveAiUsage({ headers: {} }, { verified: { ok: true, userId: 'u1' } })

  it('refuses every AI request with a 503 at a cap of 0', async () => {
    process.env.AI_DAILY_SPEND_CAP_USD = '0'
    const r = await gate()
    expect(r.ok).toBe(false)
    expect(r.status).toBe(503)
    expect(logged.map(l => l.event)).toContain('ai.gate.spend_cap')
  })

  it('lets the same request through under the default cap', async () => {
    const r = await gate()
    expect(r.ok).toBe(true)
  })

  it('is checked before the quota, so an over-cap day reads as 503 not 402', async () => {
    // A user with nothing left would normally get 402. The org cap outranks it:
    // there is no point telling someone to upgrade into a budget that is spent.
    process.env.AI_DAILY_SPEND_CAP_USD = '0'
    billingRow = { ...billingRow, aiQueriesUsed: 5 }
    const r = await gate()
    expect(r.status).toBe(503)
    billingRow = { ...billingRow, aiQueriesUsed: 0 }
  })
})
