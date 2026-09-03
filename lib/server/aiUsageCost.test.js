import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * reserveAiUsage() grew a `cost` parameter so one request can consume more
 * than one of a plan's monthly actions. generate-podcast is the only caller
 * that uses it, at 3.
 *
 * Two things need locking down, because both fail silently:
 *
 *   1. Every existing call site omits `cost`, and there are 28 of them. If the
 *      default ever stops being 1, every metered endpoint in the product
 *      quietly starts charging a different amount.
 *
 *   2. The quota check has to compare against the cost, not against zero
 *      remaining. A user with 2 actions left asking for a 3-cost action must
 *      be refused; `used >= limit` would have let them through and taken them
 *      negative.
 *
 * The 4-of-5 nudge email is in here too. It used to fire on `used + 1 === 4`,
 * an equality that a 3-cost action steps straight over — 1 -> 4 would have
 * skipped the nudge for exactly the people about to run out.
 */

let subscriptionRow
let lastUpsert
let emailsSent

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: subscriptionRow, error: null }) }),
      }),
      upsert: async (payload) => { lastUpsert = payload; return { error: null } },
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'student@example.com' } } }) } },
  }),
}))

vi.mock('resend', () => ({
  Resend: class { constructor() { this.emails = { send: async (m) => { emailsSent.push(m); return {} } } } },
}))

vi.mock('./rateLimit.js', () => ({ checkAiRateLimit: async () => ({ allowed: true }) }))
vi.mock('./axiom.js', () => ({ log: async () => {} }))

const { reserveAiUsage } = await import('./usage.js')

// verifyBearer is bypassed by passing an already-verified auth result through,
// which is exactly what generate-podcast does.
const VERIFIED = { ok: true, userId: 'user-under-test' }

function freeUserWith(used) {
  subscriptionRow = {
    subscription: {
      plan: 'free',
      status: 'active',
      aiQueriesUsed: used,
      aiQueriesResetAt: new Date().toISOString(),
    },
  }
}

beforeEach(() => {
  lastUpsert = undefined
  emailsSent = []
  process.env.RESEND_API_KEY = 'test-key'
})

describe('reserveAiUsage cost', () => {
  it('defaults to 1, so the 28 call sites that omit it are unchanged', async () => {
    freeUserWith(0)
    const gate = await reserveAiUsage({ headers: {} }, { verified: VERIFIED })
    expect(gate.ok).toBe(true)
    expect(gate.cost).toBe(1)
    expect(gate.usage).toEqual({ used: 1, limit: 5 })

    await gate.commit()
    expect(lastUpsert.subscription.aiQueriesUsed).toBe(1)
  })

  it('charges the full cost on commit', async () => {
    freeUserWith(0)
    const gate = await reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 3 })
    expect(gate.ok).toBe(true)
    expect(gate.usage).toEqual({ used: 3, limit: 5 })

    await gate.commit()
    expect(lastUpsert.subscription.aiQueriesUsed).toBe(3)
  })

  it('refuses when the remaining balance is smaller than the cost', async () => {
    // 3 of 5 used, so 2 remain and a 3-cost action must not run.
    freeUserWith(3)
    const gate = await reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 3 })
    expect(gate.ok).toBe(false)
    expect(gate.status).toBe(402)
    // The message says how many are left rather than claiming there are none.
    expect(gate.error).toContain('3 study boosts')
    expect(gate.error).toContain('2 left')
  })

  it('still allows a cost that exactly consumes the remainder', async () => {
    freeUserWith(2)
    const gate = await reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 3 })
    expect(gate.ok).toBe(true)
    expect(gate.usage).toEqual({ used: 5, limit: 5 })
  })

  it('writes nothing when the reservation is never committed', async () => {
    freeUserWith(0)
    await reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 3 })
    expect(lastUpsert).toBeUndefined()
  })

  it('is not charged twice if commit is called twice', async () => {
    freeUserWith(0)
    const gate = await reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 3 })
    await gate.commit()
    await gate.commit()
    expect(lastUpsert.subscription.aiQueriesUsed).toBe(3)
  })

  it('does not bind on unlimited, where the limit is Infinity', async () => {
    subscriptionRow = { subscription: { plan: 'unlimited', status: 'active', aiQueriesUsed: 999 } }
    const gate = await reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 3 })
    expect(gate.ok).toBe(true)
    expect(gate.usage.limit).toBeNull()
  })

  it('rejects a non-positive or non-integer cost rather than mis-charging', async () => {
    freeUserWith(0)
    await expect(reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 0 })).rejects.toThrow(TypeError)
    await expect(reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 2.5 })).rejects.toThrow(TypeError)
  })

  it('fires the 4-of-5 nudge when a multi-cost action steps over 4, not onto it', async () => {
    // 1 used + 3 = 4. The old `used + 1 === 4` test never sees this.
    freeUserWith(1)
    const gate = await reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 3 })
    await gate.commit()
    await new Promise(r => setTimeout(r, 0)) // the nudge is fire-and-forget
    expect(emailsSent).toHaveLength(1)
    expect(emailsSent[0].to).toBe('student@example.com')
  })

  it('does not fire the nudge twice for a user already past 4', async () => {
    freeUserWith(4)
    const gate = await reserveAiUsage({ headers: {} }, { verified: VERIFIED, cost: 1 })
    await gate.commit()
    await new Promise(r => setTimeout(r, 0))
    expect(emailsSent).toHaveLength(0)
  })
})
