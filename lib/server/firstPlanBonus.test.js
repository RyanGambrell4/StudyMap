import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The grant that keeps the seeded plan from spending the student's month.
 *
 * The failure this guards is quiet and expensive: COACH_PLAN_AI_COST is 5 and
 * the free tier is 5 a month, so a seeded generation that is NOT covered by a
 * grant leaves a brand new account at 0 of 5 before they have chosen to do
 * anything. Nothing errors. The plan appears. The next thing they touch is a
 * paywall.
 */

const captured = []
vi.mock('./posthog.js', () => ({
  posthogCapture: async (event, distinctId, properties) => {
    captured.push({ event, distinctId, properties })
  },
}))

let billingResult
vi.mock('./billing.js', () => ({
  BILLING_TABLE: 'user_billing',
  readBilling: async () => billingResult,
}))

let updates, updateError
function fakeSupabase() {
  return {
    from: () => ({
      update: (patch) => ({
        eq: async (_col, uid) => {
          updates.push({ uid, patch })
          return { error: updateError }
        },
      }),
    }),
  }
}

let mod
beforeEach(async () => {
  vi.resetModules()
  captured.length = 0
  updates = []
  updateError = null
  billingResult = { ok: true, billing: { plan: 'free', bonusAiActions: 0, firstGenerationAt: null } }
  mod = await import('./firstPlanBonus.js')
})

describe('the grant covers exactly one coach plan', () => {
  it('matches COACH_PLAN_AI_COST, read from the endpoint that charges it', () => {
    // Not a hardcoded 5 on both sides. If the spend-control work retunes their
    // number, this fails rather than leaving the grant quietly short, which
    // would put us straight back to charging the student for the gift.
    const src = readFileSync(new URL('../../api/generate-study-coach-plan.js', import.meta.url), 'utf8')
    const m = src.match(/const COACH_PLAN_AI_COST = (\d+)/)
    expect(m, 'COACH_PLAN_AI_COST not found — did the constant move?').toBeTruthy()
    expect(mod.FIRST_PLAN_BONUS_ACTIONS).toBe(Number(m[1]))
  })
})

describe('grantFirstPlanBonus', () => {
  it('grants to a fresh free account', async () => {
    const r = await mod.grantFirstPlanBonus(fakeSupabase(), 'u1')
    expect(r).toMatchObject({ ok: true, granted: true, reason: 'granted' })
    expect(updates).toHaveLength(1)
    expect(updates[0].patch.bonus_ai_actions).toBe(mod.FIRST_PLAN_BONUS_ACTIONS)
  })

  it('is idempotent: a second call writes nothing and still says granted', async () => {
    billingResult = { ok: true, billing: { plan: 'free', bonusAiActions: 5, firstGenerationAt: null } }
    const r = await mod.grantFirstPlanBonus(fakeSupabase(), 'u1')
    expect(r).toMatchObject({ ok: true, granted: true, reason: 'already_granted' })
    expect(updates).toHaveLength(0)
  })

  it('does not grant to an account that has already generated', async () => {
    billingResult = {
      ok: true,
      billing: { plan: 'free', bonusAiActions: 0, firstGenerationAt: '2026-09-01T00:00:00Z' },
    }
    const r = await mod.grantFirstPlanBonus(fakeSupabase(), 'u1')
    expect(r).toMatchObject({ ok: true, granted: false, reason: 'already_activated' })
    expect(updates).toHaveLength(0)
  })

  it('does not grant to a paid account, which has nothing to protect', async () => {
    billingResult = { ok: true, billing: { plan: 'pro', bonusAiActions: 0, firstGenerationAt: null } }
    const r = await mod.grantFirstPlanBonus(fakeSupabase(), 'u1')
    expect(r).toMatchObject({ ok: true, granted: false, reason: 'not_free' })
    expect(updates).toHaveLength(0)
  })
})

describe('a missing user_billing table is loud, not silent', () => {
  const missing = { code: '42P01', message: 'relation "user_billing" does not exist' }

  it('refuses rather than granting nothing quietly', async () => {
    updateError = missing
    const r = await mod.grantFirstPlanBonus(fakeSupabase(), 'u1')
    // ok:false is the caller's instruction not to generate. Returning ok:true
    // with granted:false here would let the seed proceed uncovered, which is
    // the exact bug this module exists to prevent.
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('billing_table_missing')
  })

  it('fires a tracked event naming the migration', async () => {
    updateError = missing
    await mod.grantFirstPlanBonus(fakeSupabase(), 'u1')
    const ev = captured.find(c => c.event === 'first_plan_bonus_unavailable')
    expect(ev, 'no tracked event fired for a missing billing table').toBeTruthy()
    expect(ev.properties.reason).toBe('billing_table_missing')
    expect(ev.properties.migration).toMatch(/user_billing\.sql/)
  })

  it('also refuses, loudly, on any other write failure', async () => {
    updateError = { code: '23514', message: 'check constraint violated' }
    const r = await mod.grantFirstPlanBonus(fakeSupabase(), 'u1')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('write_failed')
    expect(captured.some(c => c.event === 'first_plan_bonus_unavailable')).toBe(true)
  })

  it('refuses when billing cannot be read at all', async () => {
    billingResult = { ok: false, error: { message: 'unreachable' } }
    const r = await mod.grantFirstPlanBonus(fakeSupabase(), 'u1')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('billing_unreadable')
    expect(updates).toHaveLength(0)
  })
})

describe('the caller honours a failed grant', () => {
  const out = readFileSync(new URL('../../src/components/OutputView.jsx', import.meta.url), 'utf8')

  it('returns without generating when the grant is not ok', () => {
    // The ordering that matters: the grant is requested, and a falsy `ok`
    // returns BEFORE the generation fetch.
    const grantAt = out.indexOf("fetch('/api/grant-first-plan-bonus'")
    const bailAt = out.indexOf("reason: 'bonus_grant_failed'")
    const genAt = out.indexOf("fetch('/api/generate-study-coach-plan'")
    expect(grantAt).toBeGreaterThan(-1)
    expect(bailAt).toBeGreaterThan(grantAt)
    expect(genAt).toBeGreaterThan(bailAt)
  })

  it('refreshes the counters before reporting what is left', () => {
    expect(out).toMatch(/await refreshSubscription\(userId\)/)
    expect(out).toMatch(/ai_actions_remaining: getAiActionsRemaining\(\)/)
  })
})
