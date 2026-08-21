/**
 * Tell a missing table apart from an empty result.
 *
 * supabase-js does NOT throw. Every query returns { data, error }. A query
 * against a table that does not exist returns { data: null, error: {...} },
 * which is byte-identical in shape to "no rows matched". So this:
 *
 *     const { data: suppressed } = await db.from('email_suppression')...
 *     if (suppressed) return { ok: false }
 *
 * reads a missing table as "this address is not suppressed" and sends the mail.
 * That is exactly what has been happening in production since the
 * 20260727 migration was never applied: `email_suppression` does not exist, so
 * canSendUserEmail() has never suppressed anybody.
 *
 * A missing relation is a deployment fault, not a data condition. It must be
 * loud. An ordinary query failure is worth logging but should not take a
 * lifecycle cron down.
 *
 * Usage:
 *
 *     const { data, error } = await db.from('email_suppression').select(...)
 *     if (reportQueryError(error, { table: 'email_suppression', context: 'emailGuard' })) {
 *       // decide what to do about a failed read. Do NOT treat it as empty.
 *     }
 */

// Two different codes reach us for the same condition:
//   42P01    Postgres SQLSTATE undefined_table, when the query reaches Postgres
//   PGRST205 PostgREST schema-cache miss, which is what a missing table
//            ACTUALLY returns through supabase-js. Verified 2026-08-21:
//            { code: 'PGRST205', message: "Could not find the table
//              'public.email_suppression' in the schema cache" }, HTTP 404.
const UNDEFINED_TABLE = '42P01'
const POSTGREST_NO_TABLE = 'PGRST205'
const UNDEFINED_COLUMN = '42703'

export function isMissingRelation(error) {
  if (!error) return false
  if (error.code === UNDEFINED_TABLE || error.code === POSTGREST_NO_TABLE) return true
  // PostgREST's schema cache miss does not always carry the SQLSTATE.
  const msg = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  return /could not find the table|does not exist|schema cache/i.test(msg)
}

export function isMissingColumn(error) {
  if (!error) return false
  if (error.code === UNDEFINED_COLUMN) return true
  return /column .* does not exist/i.test(error.message ?? '')
}

function isStrict() {
  if (process.env.SUPABASE_STRICT_SCHEMA === '1') return true
  if (process.env.SUPABASE_STRICT_SCHEMA === '0') return false
  const env = process.env.VERCEL_ENV
  if (!env) return false          // local dev and test runners
  return env !== 'production'     // preview fails the deploy check
}

/**
 * Returns true if there WAS an error, so the caller can branch. Never returns
 * a value that could be mistaken for data.
 *
 * Throws on a missing relation outside production, so a preview deploy fails
 * loudly rather than shipping a silent no-op to production.
 */
export function reportQueryError(error, { table, context, fatal = false } = {}) {
  if (!error) return false

  const where = `${context ?? 'query'} -> ${table ?? 'unknown table'}`

  if (isMissingRelation(error)) {
    const msg =
      `[schema] MISSING RELATION. ${where} queried a table that does not exist. ` +
      `This is a deployment fault: a migration has not been applied. ` +
      `The query returned no rows, which is indistinguishable from an empty ` +
      `result, so whatever this code does on "empty" is what it is doing now. ` +
      `(${error.code ?? 'no code'}: ${error.message ?? ''})`
    console.error(msg)
    if (fatal || isStrict()) throw new Error(msg)
    return true
  }

  if (isMissingColumn(error)) {
    const msg = `[schema] MISSING COLUMN. ${where}: ${error.message ?? ''}`
    console.error(msg)
    if (fatal || isStrict()) throw new Error(msg)
    return true
  }

  console.error(`[db] ${where} failed: ${error.code ?? ''} ${error.message ?? error}`)
  if (fatal) throw new Error(`${where} failed: ${error.message ?? error}`)
  return true
}

/**
 * Tables the server code requires. scripts/check-schema.mjs asserts every one
 * of these exists, which turns "a migration was never applied" from a silent
 * behaviour change into a one-command check.
 *
 * Keep this in step with supabase/schema.sql.
 */
export const REQUIRED_TABLES = [
  'user_data',
  'topic_signals',
  'generated_artifacts',
  'course_uploads',
  'struggle_topics',
  'course_grade_baselines',
  'ios_state',
  'one_time_offers',
  'feedback',
  'cron_locks',
  'stripe_idempotency',
  'waitlist',
]

/**
 * Tables the code QUERIES but which are not in production as of 2026-08-21.
 * Listed separately and honestly rather than being quietly added to the
 * required set, because the fix is a migration plus a backfill, not a rename.
 */
export const EXPECTED_MISSING_TABLES = [
  'email_suppression',  // lib/server/emailGuard.js
  'email_queue',        // lib/server/emailQueue.js
  'app_config',         // lib/server/featureFlags.js, lib/server/courseContext.js
]
