#!/usr/bin/env node
/**
 * One-time repair: give back AI quota that was spent on requests that failed.
 *
 * WHY
 * ---
 * Until this branch, verifyAndCheckAiUsage ran at the top of every AI endpoint
 * and wrote the usage increment BEFORE the handler validated the request. A
 * request that was about to be rejected with "Missing courseId" still cost the
 * user an AI action. Free tier is five actions, so a short burst of failures
 * takes the whole allowance. Two accounts did exactly that on 19 Aug 2026,
 * inside sixty seconds, with zero successful generations.
 *
 * WHO IS AFFECTED, AND HOW WE KNOW PRECISELY
 * ------------------------------------------
 * The identification does not need error logs. It falls out of the data:
 *
 *   an account with ZERO courses that has nonetheless been charged for AI
 *   actions was charged for failures, because with no course every
 *   course-requiring endpoint rejects the request before doing any work.
 *
 * That is corroborated three independent ways. As of 2026-08-20, across the
 * 48 accounts matching this description:
 *
 *   generated_artifacts   0 rows
 *   course_uploads        0 rows
 *   topic_signals         0 rows
 *
 * Not one of them has a single trace of a successful generation in any of the
 * three tables where a success leaves one. So the charge is 100 percent
 * failure, and the correct restoration is the full amount, not a partial one.
 *
 * The 107 accounts that spent quota AND have at least one course are NOT
 * touched. Some of their charges were certainly failures too, but the data
 * cannot separate a failed call from a successful one for those accounts, and
 * guessing would either shortchange them or hand out quota nobody lost. That
 * limitation is reported rather than approximated. If you want them covered
 * too, that is a business decision, not a data one: run with --include-partial
 * and every affected account is reported so you can see exactly what it does.
 *
 * WHAT IT CHANGES
 * ---------------
 * Only these keys on user_data.subscription:
 *
 *   aiQueriesUsed      reset to 0
 *   aiQueriesResetAt   cleared, so the next call starts a clean month
 *   quotaRestoredAt    audit stamp, so this script is idempotent
 *   quotaRestoredCount how many actions were given back
 *
 * Everything else on the row is preserved. `subscription` is a single JSON
 * column with several writers that each rewrite the whole thing, so this
 * re-reads each row immediately before writing and applies only the four keys
 * above onto that fresh value. Do not change this to a blind overwrite.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It sends no email. Telling these people is a separate decision and a
 * separate change. This script has no Resend import on purpose.
 *
 * USAGE
 * -----
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/restoreQuotaForFailedRequests.mjs
 *     Dry run. Reports exactly what it would do and writes nothing.
 *
 *   ... node scripts/restoreQuotaForFailedRequests.mjs --apply
 *     Performs the restoration.
 *
 *   --include-partial   also restore accounts that have courses (see above)
 *   --json <path>       write the full per-account report to a file
 */

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const INCLUDE_PARTIAL = args.includes('--include-partial')
const jsonIdx = args.indexOf('--json')
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY before running this.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const courseCount = (row) => Array.isArray(row?.plan?.courses) ? row.plan.courses.length : 0
const used = (row) => Number(row?.subscription?.aiQueriesUsed) || 0

// PostgREST caps an unbounded select at max-rows (1000 by default) and returns
// the truncated set with no error. That would be silent and it would be wrong in
// the dangerous direction: a truncated success-trace set makes accounts look like
// they never generated anything, so the script would hand back quota that was
// legitimately spent. user_data is at 815 rows as of 2026-08-21, so this is not
// hypothetical for much longer. Page explicitly rather than trust one round trip.
const PAGE = 1000

async function selectAll(table, columns) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).range(from, from + PAGE - 1)
    if (error) throw new Error(`reading ${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

async function idsWithRows(table) {
  return new Set((await selectAll(table, 'user_id')).map(r => r.user_id))
}

async function main() {
  console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run, nothing will be written\n')

  const rows = await selectAll('user_data', 'user_id, plan, subscription')

  // The three places a successful generation leaves a trace.
  const [withArtifacts, withUploads, withSignals] = await Promise.all([
    idsWithRows('generated_artifacts'),
    idsWithRows('course_uploads'),
    idsWithRows('topic_signals'),
  ])
  const hasEvidenceOfSuccess = (id) =>
    withArtifacts.has(id) || withUploads.has(id) || withSignals.has(id)

  const charged = rows.filter(r => used(r) > 0)
  const alreadyRestored = charged.filter(r => r.subscription?.quotaRestoredAt)

  const certain = charged.filter(r =>
    !r.subscription?.quotaRestoredAt &&
    courseCount(r) === 0 &&
    !hasEvidenceOfSuccess(r.user_id) &&
    // A paying account's counter is not a free allowance and is not restored here.
    (r.subscription?.plan ?? 'free') === 'free')

  const unprovable = charged.filter(r =>
    !r.subscription?.quotaRestoredAt && courseCount(r) > 0)

  const targets = INCLUDE_PARTIAL ? [...certain, ...unprovable] : certain
  const actions = targets.reduce((n, r) => n + used(r), 0)

  console.log('user_data rows                                  ', rows.length)
  console.log('accounts charged for at least one AI action     ', charged.length)
  console.log('already restored by a previous run              ', alreadyRestored.length)
  console.log('')
  console.log('CERTAIN: charged, zero courses, no trace of any success')
  console.log('  accounts                                      ', certain.length)
  console.log('  AI actions to restore                         ', certain.reduce((n, r) => n + used(r), 0))
  console.log('  of those, accounts that hit the free wall     ', certain.filter(r => used(r) >= 5).length)
  console.log('')
  console.log('UNPROVABLE: charged, but the account has courses, so failed and')
  console.log('successful calls cannot be told apart from stored data')
  console.log('  accounts                                      ', unprovable.length)
  console.log('  AI actions charged                            ', unprovable.reduce((n, r) => n + used(r), 0))
  console.log('  included in this run                          ', INCLUDE_PARTIAL ? 'YES (--include-partial)' : 'no')
  console.log('')
  console.log('WILL RESTORE:', targets.length, 'accounts,', actions, 'AI actions')

  if (JSON_OUT) {
    const { writeFileSync } = await import('fs')
    writeFileSync(JSON_OUT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      applied: APPLY,
      includePartial: INCLUDE_PARTIAL,
      certain: certain.map(r => ({ user_id: r.user_id, actions: used(r), courses: courseCount(r) })),
      unprovable: unprovable.map(r => ({ user_id: r.user_id, actions: used(r), courses: courseCount(r) })),
    }, null, 2))
    console.log('report written to', JSON_OUT)
  }

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write.')
    return
  }

  let ok = 0
  let failed = 0
  for (const target of targets) {
    // Re-read immediately before writing and apply only the keys this script
    // owns onto that fresh value. `subscription` has several writers that each
    // rewrite the whole column, so a blind overwrite here would erase whatever
    // the Stripe webhook or the browser wrote in the meantime.
    const { data: fresh, error: readErr } = await db
      .from('user_data')
      .select('subscription')
      .eq('user_id', target.user_id)
      .maybeSingle()
    if (readErr || !fresh) {
      console.error('  re-read failed for', target.user_id, readErr?.message ?? 'row missing')
      failed++
      continue
    }
    if (fresh.subscription?.quotaRestoredAt) {
      // Restored by a concurrent run. Idempotent, so skip.
      continue
    }

    const restored = Number(fresh.subscription?.aiQueriesUsed) || 0
    const patched = {
      ...fresh.subscription,
      aiQueriesUsed: 0,
      aiQueriesResetAt: null,
      quotaRestoredAt: new Date().toISOString(),
      quotaRestoredCount: restored,
      quotaRestoredReason: 'charged for requests that failed validation before doing any work',
    }

    const { error: writeErr } = await db
      .from('user_data')
      .update({ subscription: patched, updated_at: new Date().toISOString() })
      .eq('user_id', target.user_id)

    if (writeErr) {
      console.error('  write failed for', target.user_id, writeErr.message)
      failed++
    } else {
      ok++
    }
  }

  console.log(`\nRestored ${ok} accounts. ${failed} failed.`)
  if (failed) process.exitCode = 1
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
