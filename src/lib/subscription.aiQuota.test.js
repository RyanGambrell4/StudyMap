import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

// subscription.js pulls in the Supabase browser client and posthog-js at import
// time, and usage.js constructs a Resend client. None of that is under test
// here: this file only reads configuration values.
vi.mock('./supabase', () => ({ supabase: {}, getAccessToken: async () => null }))
vi.mock('./analytics', () => ({
  track: () => {}, register: () => {}, registerOnce: () => {},
  identifyUser: () => {}, resetUser: () => {}, initAnalytics: () => {},
}))
vi.mock('resend', () => ({ Resend: class { constructor() {} } }))

const {
  AI_ACTION_PERIOD,
  AI_PERIOD_LABEL,
  FREE_LIMITS,
  PRO_LIMITS,
  PLAN_LIMITS,
} = await import('./subscription.js')
const { PLAN_AI_LIMITS } = await import('../../lib/server/usage.js')

/**
 * The configured behaviour and every string describing it must agree.
 *
 * Before this test there were four answers to "how long do my five free AI
 * actions last":
 *
 *   lib/server/usage.js   reset monthly      (the one users actually felt)
 *   FREE_LIMITS.aiTutor   period: 'total'    (five for life)
 *   getAIQueriesUsed()    daily boundary     (a third answer again)
 *   the UI copy           "this month"
 *
 * Monthly won, because it is what the server already enforced and what the
 * copy already promised. This test fails if any of them drift apart again.
 */

describe('the free AI allowance has exactly one definition', () => {
  it('the client period matches the label used in copy', () => {
    expect(AI_ACTION_PERIOD).toBe('month')
    expect(AI_PERIOD_LABEL).toBe('this month')
  })

  it('the free AI limit reads its period from the single source of truth', () => {
    expect(FREE_LIMITS.aiTutor.period).toBe(AI_ACTION_PERIOD)
    expect(PLAN_LIMITS.free.aiResetPeriod).toBe(AI_ACTION_PERIOD)
  })

  it('the client and server agree on the numbers', () => {
    expect(FREE_LIMITS.aiTutor.count).toBe(PLAN_AI_LIMITS.free)
    expect(PRO_LIMITS.aiActions.count).toBe(PLAN_AI_LIMITS.pro)
    expect(PLAN_LIMITS.free.aiQueries).toBe(PLAN_AI_LIMITS.free)
    expect(PLAN_LIMITS.pro.aiQueries).toBe(PLAN_AI_LIMITS.pro)
  })

  it('the server enforces the same period the client declares', () => {
    // reserveAiUsage resets the counter on a month boundary via isNewMonth.
    // If the model ever moves off monthly, that helper has to move with it.
    const server = readFileSync(new URL('../../lib/server/usage.js', import.meta.url), 'utf8')
    expect(server).toContain('isNewMonth(sub.aiQueriesResetAt)')
    expect(AI_ACTION_PERIOD).toBe('month')
  })

  it('the client reads its own counter against the same boundary', () => {
    // getAIQueriesUsed used isNewDay against a limit that was never daily.
    const client = readFileSync(new URL('./subscription.js', import.meta.url), 'utf8')
    const fn = client.slice(client.indexOf('export function getAIQueriesUsed'))
      .slice(0, client.slice(client.indexOf('export function getAIQueriesUsed')).indexOf('\n}'))
    expect(fn).toContain('isNewMonth')
    expect(fn).not.toContain('isNewDay')
  })
})

/**
 * No user-facing string may describe the free AI allowance as a lifetime cap
 * while the configuration says it renews.
 */
describe('no copy contradicts the configured period', () => {
  const ROOT = new URL('../', import.meta.url).pathname          // src/
  const EXTRA = [new URL('../../lib/server/usage.js', import.meta.url).pathname]

  function walk(dir, acc = []) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, acc)
      else if (['.js', '.jsx'].includes(extname(entry)) && !entry.includes('.test.')) acc.push(full)
    }
    return acc
  }

  // "5 total", "5 AI actions total", "5 ... for life", "5 lifetime".
  // The 5 must be a standalone number followed by a space, which keeps
  // arithmetic like `(x * 0.5) / total` out of the results.
  const LIFETIME_CLAIM = /(?<![\d.])5\s[^.\n]{0,40}\b(total|lifetime|for life|one[- ]time only)\b/i

  it('nothing tells the user the five free actions are all they ever get', () => {
    const offenders = []
    for (const file of [...walk(ROOT), ...EXTRA]) {
      const src = readFileSync(file, 'utf8')
      for (const [i, line] of src.split('\n').entries()) {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
        if (LIFETIME_CLAIM.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`)
      }
    }
    expect(offenders, `copy still describes the free AI allowance as a lifetime cap:\n  ${offenders.join('\n  ')}`)
      .toEqual([])
  })
})
