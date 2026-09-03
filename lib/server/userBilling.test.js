import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * The invariant this whole change exists to create:
 *
 *   plan and status are decided by public.user_billing, which the user cannot
 *   write, and are changed only by Stripe.
 *
 * The failure mode is quiet. Nothing errors if a handler reads the plan from
 * user_data.subscription instead — it just silently trusts a value the user
 * controls, which is exactly what shipped for months. So these assertions are
 * about WHERE a value came from, which no runtime test can see.
 */

const ROOT = process.cwd()
const API_DIR = join(ROOT, 'api')
const read = p => readFileSync(join(ROOT, p), 'utf8')

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*)/.test(l))
    .join('\n')
}

describe('the migration locks the table', () => {
  const sql = read('migrations/20260903_user_billing.sql')

  it('enables RLS and grants only SELECT', () => {
    expect(sql).toMatch(/ALTER TABLE public\.user_billing ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/CREATE POLICY user_billing_select_own[\s\S]*?FOR SELECT USING \(auth\.uid\(\) = user_id\)/)
  })

  it('creates no INSERT, UPDATE or DELETE policy', () => {
    // A command with no policy is denied to every role that does not bypass
    // RLS. Adding one here would hand the column back to the browser.
    const policies = sql.match(/CREATE POLICY[\s\S]*?;/g) ?? []
    expect(policies).toHaveLength(1)
    for (const p of policies) expect(p).toMatch(/FOR SELECT/)
  })

  it('revokes the blanket grants this project hands out by default', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.user_billing FROM anon, authenticated/)
  })

  it('carries entitlements across verbatim rather than resetting them', () => {
    // Revoking a comp is a decision with an email attached, never a side
    // effect of a schema change.
    expect(sql).not.toMatch(/SET\s+plan\s*=\s*'free'/i)
    expect(sql).toMatch(/ON CONFLICT \(user_id\) DO NOTHING/)
  })

  it('marks comps so analytics can exclude them', () => {
    expect(sql).toContain("'legacy-unknown'")
    expect(sql).toMatch(/granted_by/)
  })
})

describe('plan is read from user_billing, not the user-writable blob', () => {
  it('reserveAiUsage reads billing and never reads subscription for the plan', () => {
    const src = stripComments(read('lib/server/usage.js'))
    expect(src).toMatch(/readBilling\(supabase, userId\)/)
    expect(src).toMatch(/billing\.plan/)
    // The old read is gone entirely.
    expect(src).not.toMatch(/row\?\.subscription/)
    expect(src).not.toMatch(/sub\.aiQueriesUsed/)
  })

  it('reserveAiUsage fails closed when the billing read fails', () => {
    const src = stripComments(read('lib/server/usage.js'))
    expect(src).toMatch(/if \(!read\.ok\)[\s\S]{0,200}status: 500/)
  })

  it('the usage path cannot write plan or status', () => {
    // commitUsage touches the counters only. If it could write a plan, the
    // table would be writable from a path the user can trigger at will.
    const src = stripComments(read('lib/server/billing.js'))
    const commitUsage = src.slice(src.indexOf('export async function commitUsage'), src.indexOf('export async function commitFeatureUsage'))
    expect(commitUsage).not.toMatch(/\bplan\b/)
    expect(commitUsage).not.toMatch(/\bstatus\b/)
  })

  it('only the Stripe webhook writes plan and status', () => {
    const src = stripComments(read('lib/server/billing.js'))
    const writers = src.match(/plan:\s+fields\.plan/g) ?? []
    expect(writers).toHaveLength(1)

    const callers = readdirSync(API_DIR)
      .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
      .filter(f => stripComments(read(join('api', f))).includes('commitStripeBilling'))
    expect(callers).toEqual(['stripe.js'])
  })

  it('generate-podcast gates on billing, not on the blob', () => {
    const src = stripComments(read('api/generate-podcast.js'))
    expect(src).toMatch(/readBilling\(supabase, userId\)/)
    expect(src).toMatch(/billing\.featureUsage\?\.podcast/)
    expect(src).not.toMatch(/sub\.feature_usage\?\.podcast/)
  })
})

describe('the client shows the restrictive answer', () => {
  const src = read('src/lib/subscription.js')

  it('takes the lower-ranked plan when the two sources disagree', () => {
    expect(src).toMatch(/PLAN_RANK\[fromBilling\] < PLAN_RANK\[fromBlob\] \? fromBilling : fromBlob/)
  })

  it('falls back to the blob when the billing row has not loaded', () => {
    // A failed fetch must not lock a paying customer out of what they bought.
    expect(src).toMatch(/if \(!_billing\) return fromBlob/)
  })

  it('exposes the comp marker for analytics', () => {
    expect(src).toMatch(/export function isComped/)
    expect(src).toMatch(/_billing\?\.granted_by/)
  })
})

describe('the reconcile job', () => {
  const src = read('api/reconcile-billing.js')

  it('is cron-authenticated and runs nightly', () => {
    expect(src).toMatch(/CRON_SECRET/)
    expect(read('vercel.json')).toMatch(/"path":\s*"\/api\/reconcile-billing"/)
  })

  it('reports rather than corrects', () => {
    // An automatic corrector that gets its logic wrong revokes paid accounts
    // overnight. This job must never write to user_billing.
    expect(src).not.toMatch(/\.update\(/)
    expect(src).not.toMatch(/\.upsert\(/)
  })

  it('checks both directions', () => {
    expect(src).toContain('db_paid_stripe_absent')
    expect(src).toContain('stripe_active_db_free')
    expect(src).toContain('stripe_active_db_missing')
  })

  it('does not report deliberate comps as drift', () => {
    expect(src).toMatch(/if \(row\.granted_by\)/)
    expect(src).toContain('comp_now_paying')
  })

  it('emits a completion event even when there is no drift, so a silent job is visible', () => {
    expect(src).toContain('billing_reconcile_completed')
  })
})
