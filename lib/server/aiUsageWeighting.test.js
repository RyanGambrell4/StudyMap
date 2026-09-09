import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Cost weighting in the usage gate.
 *
 * A coach plan and a reteach call used to cost the user the same single AI
 * action despite roughly a 100x price difference. `cost` closes that gap. The
 * assertions here are the three places the multiplier has to land — the quota
 * check, the number reported back to the client, and the number written on
 * commit — plus the boost-nudge crossing test, which is the one that breaks
 * quietly: an equality check on 4 is stepped straight over by a weighted call.
 */

const writes = []
let billingRow

vi.mock('./redis.js', () => ({
  getRedis: () => ({ incr: async () => 1, expire: async () => 1 }),
}))

vi.mock('./axiom.js', () => ({ log: () => {} }))

const nudges = []
vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: async (m) => { nudges.push(m); return { data: {}, error: null } } }
    }
  },
}))

vi.mock('./billing.js', () => ({
  readBilling: async () => ({ ok: true, billing: billingRow }),
  commitUsage: async (_s, _u, patch) => { writes.push(patch); return { ok: true } },
}))

// The nudge looks the user's email up through the admin client before sending,
// so a bare {} here makes it throw and swallow, and the nudge assertions below
// would pass for the wrong reason.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'u1@example.com' } } }) } },
  }),
}))

process.env.RESEND_API_KEY = 'test-key'

const { reserveAiUsage } = await import('./usage.js')

/** sendBoostNudgeEmail is fire-and-forget, so let its promise chain settle. */
const flush = () => new Promise(r => setTimeout(r, 0))

/** A gate call for a user whose plan and current usage we control. */
async function gateFor({ plan = 'free', used = 0, cost }) {
  billingRow = {
    plan,
    status: 'active',
    aiQueriesUsed: used,
    aiQueriesResetAt: new Date().toISOString(),
    bonusAiActions: 0,
    firstGenerationAt: null,
  }
  const opts = { verified: { ok: true, userId: 'u1' } }
  if (cost !== undefined) opts.cost = cost
  return reserveAiUsage({ headers: {} }, opts)
}

beforeEach(() => { writes.length = 0; nudges.length = 0 })

describe('cost weighting', () => {
  it('defaults to 1 so unweighted callers are unchanged', async () => {
    const gate = await gateFor({ used: 0 })
    expect(gate.ok).toBe(true)
    expect(gate.usage.used).toBe(1)
    await gate.commit()
    expect(writes[0].aiQueriesUsed).toBe(1)
  })

  it('writes 5 for a cost-5 reservation', async () => {
    const gate = await gateFor({ used: 0, cost: 5 })
    expect(gate.ok).toBe(true)
    expect(gate.usage.used).toBe(5)
    await gate.commit()
    expect(writes[0].aiQueriesUsed).toBe(5)
  })

  it('refuses a cost-5 reservation when only 4 actions remain', async () => {
    const gate = await gateFor({ used: 1, cost: 5 }) // free limit is 5, so 4 left
    expect(gate.ok).toBe(false)
    expect(gate.status).toBe(402)
    expect(gate.error).toMatch(/4 left/)
    expect(writes).toHaveLength(0)
  })

  it('allows a cost-5 reservation that exactly consumes the allowance', async () => {
    const gate = await gateFor({ used: 0, cost: 5 })
    expect(gate.ok).toBe(true)
  })

  it('does not bind on unlimited, where the limit is Infinity', async () => {
    const gate = await gateFor({ plan: 'unlimited', used: 999, cost: 5 })
    expect(gate.ok).toBe(true)
  })

  it('rejects a nonsense cost rather than silently treating it as 1', async () => {
    await expect(gateFor({ used: 0, cost: 0 })).rejects.toThrow(TypeError)
    await expect(gateFor({ used: 0, cost: 2.5 })).rejects.toThrow(TypeError)
  })
})

describe('boost nudge crossing', () => {
  it('fires when a weighted call steps over 4 without landing on it', async () => {
    // used 0 + cost 5 = 5. An `=== 4` equality check would miss this entirely,
    // skipping the nudge for exactly the user who just spent their allowance.
    const gate = await gateFor({ plan: 'free', used: 0, cost: 5 })
    await gate.commit()
    await flush()
    expect(nudges).toHaveLength(1)
  })

  it('still fires on the ordinary cost-1 path that lands exactly on 4', async () => {
    const gate = await gateFor({ plan: 'free', used: 3 })
    await gate.commit()
    await flush()
    expect(nudges).toHaveLength(1)
  })

  it('does not fire twice for a user already past the threshold', async () => {
    const gate = await gateFor({ plan: 'free', used: 4 })
    await gate.commit()
    await flush()
    expect(nudges).toHaveLength(0)
  })
})
