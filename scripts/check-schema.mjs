#!/usr/bin/env node
/**
 * Assert that every table the server code queries actually exists.
 *
 * This exists because a migration that was never applied changed production
 * behaviour silently for close to a month. supabase-js returns
 * { data: null, error } for a missing relation, which is shaped exactly like an
 * empty result, so `email_suppression` not existing read as "nobody is
 * suppressed" and every lifecycle email went out.
 *
 * Read-only. Safe against production.
 *
 *   node --env-file=.env.local scripts/check-schema.mjs
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/check-schema.mjs
 *
 * Exit 0 = every required table present. Exit 1 = something is missing.
 * Run it after any migration, and in CI before a deploy.
 */

import { createClient } from '@supabase/supabase-js'
import { REQUIRED_TABLES, EXPECTED_MISSING_TABLES } from '../lib/server/supabaseErrors.js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
  process.exit(1)
}

const ref = url.replace('https://', '').split('.')[0]
const db = createClient(url, key, { auth: { persistSession: false } })

async function exists(table) {
  // Deliberately NOT { head: true }. Verified 2026-08-21: a head request against
  // a table that does not exist returns error: null and HTTP 204, so it reports
  // every missing table as present. That is the same silence this script exists
  // to catch, one layer further down. limit(1) is cheap and actually errors.
  const { error } = await db.from(table).select('*').limit(1)
  if (!error) return { ok: true }
  const msg = `${error.message ?? ''} ${error.details ?? ''}`
  if (error.code === '42P01' || error.code === 'PGRST205' || /could not find the table|schema cache/i.test(msg)) {
    return { ok: false, missing: true, detail: error.message }
  }
  // RLS or permission problems are not "missing", report them distinctly.
  return { ok: false, missing: false, detail: `${error.code ?? ''} ${error.message ?? ''}`.trim() }
}

console.log(`schema check against ${ref}\n`)

let missing = 0
let broken = 0

console.log('REQUIRED')
for (const t of REQUIRED_TABLES) {
  const r = await exists(t)
  if (r.ok) { console.log(`  ok       ${t}`) }
  else if (r.missing) { missing++; console.log(`  MISSING  ${t}   <-- a migration has not been applied`) }
  else { broken++; console.log(`  ERROR    ${t}   ${r.detail}`) }
}

console.log('\nKNOWN MISSING (queried by code, not in production as of 2026-08-21)')
for (const t of EXPECTED_MISSING_TABLES) {
  const r = await exists(t)
  console.log(r.ok
    ? `  now present  ${t}   <-- move it into REQUIRED_TABLES`
    : `  still absent ${t}`)
}

console.log('')
if (missing || broken) {
  console.error(`FAIL: ${missing} required table(s) missing, ${broken} erroring.`)
  process.exit(1)
}
console.log('PASS: every required table is present.')
