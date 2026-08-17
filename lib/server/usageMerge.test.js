import { describe, it, expect } from 'vitest'
import { applyServerUsagePatch, SERVER_USAGE_KEYS } from './subscriptionMerge.js'

/**
 * Regression guard for the feature_usage clobber.
 *
 * `subscription` is one JSON column with two writers: this server usage writer
 * and the browser (src/lib/subscription.js). Both wrote the WHOLE column from a
 * stale snapshot, so whichever wrote last erased the other's keys. Observable
 * result: `feature_usage` existed on 0 of 777 rows, which left every non-AI free
 * limit (practice exams, blueprints, quiz bursts, brain dumps, exam rescue,
 * coach plans) unenforced AND unmeasured for the product's whole history.
 */
describe('applyServerUsagePatch', () => {
  const patch = {
    plan: 'free',
    status: 'active',
    aiQueriesUsed: 3,
    aiQueriesResetAt: '2026-08-01T00:00:00.000Z',
    lastAiCallAt: '2026-08-17T12:00:00.000Z',
  }

  it('preserves feature_usage, the key that was being destroyed', () => {
    const latest = { feature_usage: { practiceExam: { count: 1, resetAt: 'x' } }, aiQueriesUsed: 2 }
    const out = applyServerUsagePatch(latest, patch)
    expect(out.feature_usage).toEqual({ practiceExam: { count: 1, resetAt: 'x' } })
    expect(out.aiQueriesUsed).toBe(3)
  })

  it('preserves every key it does not own', () => {
    const latest = {
      feature_usage: { quizBurst: { count: 1 } },
      stripeCustomerId: 'cus_x',
      stripeSubId: 'sub_x',
      currentPeriodEnd: 123,
      day5_proof_sent: true,
      referredBy: 'someone',
      bonusAiActions: 5,
    }
    const out = applyServerUsagePatch(latest, patch)
    for (const [k, v] of Object.entries(latest)) {
      expect(out[k]).toEqual(v)
    }
  })

  it('only writes the five keys it declares ownership of', () => {
    const out = applyServerUsagePatch({}, { ...patch, feature_usage: { hacked: true }, stripeSubId: 'nope' })
    expect(Object.keys(out).sort()).toEqual([...SERVER_USAGE_KEYS].sort())
    expect(out.feature_usage).toBeUndefined()
    expect(out.stripeSubId).toBeUndefined()
  })

  it('advances the counters it does own', () => {
    const out = applyServerUsagePatch({ aiQueriesUsed: 2, lastAiCallAt: 'old' }, patch)
    expect(out.aiQueriesUsed).toBe(3)
    expect(out.lastAiCallAt).toBe('2026-08-17T12:00:00.000Z')
  })

  it('ignores undefined patch values rather than writing undefined over real data', () => {
    const out = applyServerUsagePatch({ aiQueriesUsed: 9 }, { aiQueriesUsed: undefined, status: 'active' })
    expect(out.aiQueriesUsed).toBe(9)
    expect(out.status).toBe('active')
  })

  it('tolerates a null, missing, or non-object subscription', () => {
    for (const bad of [null, undefined, 'string', 42, []]) {
      const out = applyServerUsagePatch(bad, patch)
      expect(out.aiQueriesUsed).toBe(3)
      expect(typeof out).toBe('object')
    }
  })

  it('replays the actual bug: a server write no longer erases a concurrent client write', () => {
    // Client records a practice exam, then the server records an AI call.
    const afterClientWrite = {
      plan: 'free', status: 'active', aiQueriesUsed: 2,
      feature_usage: { practiceExam: { count: 1, resetAt: '2026-08-17T11:00:00.000Z' } },
    }
    const afterServerWrite = applyServerUsagePatch(afterClientWrite, patch)

    // Before the fix this came back undefined and the free practice-exam limit
    // silently reset to zero uses.
    expect(afterServerWrite.feature_usage.practiceExam.count).toBe(1)
  })
})
