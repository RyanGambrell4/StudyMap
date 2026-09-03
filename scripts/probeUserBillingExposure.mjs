#!/usr/bin/env node
/**
 * Can a logged-in student change their own plan?
 *
 * That is the whole question this migration exists to answer "no" to. Until
 * now the answer was yes: user_data.subscription carries plan, status and
 * aiQueriesUsed, its RLS policy is `auth.uid() = user_id` FOR ALL, and
 * reserveAiUsage read the quota straight out of it.
 *
 * public.user_billing is meant to be readable by its owner and writable by
 * nobody but the service role. This probe signs up a real throwaway student,
 * and with THEIR token tries every write there is. Anything that succeeds is a
 * hole.
 *
 * It also confirms the read still works, because a table the client cannot read
 * breaks the paywall UI just as surely as a writable one breaks the quota.
 *
 * Run AFTER applying migrations/20260903_user_billing.sql.
 *
 * Usage:
 *   set -a && . ~/.studyedge/env.staging && set +a
 *   node scripts/probeUserBillingExposure.mjs
 *
 * Against production (read-only checks still create one throwaway account):
 *   ALLOW_PROD=1 node scripts/probeUserBillingExposure.mjs
 */

const URL_ = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_KEY
const PROD_REF = 'vpmgamaspefwqywttdtj'

if (!URL_ || !ANON || !SERVICE) {
  console.error('Need SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY in env.')
  process.exit(1)
}
if (URL_.includes(PROD_REF) && process.env.ALLOW_PROD !== '1') {
  console.error(`Refusing to run against production (${PROD_REF}). Set ALLOW_PROD=1 to override.`)
  process.exit(1)
}

const stamp = Date.now()
const student = { email: `billing-probe-${stamp}@example.com`, password: `Probe!${stamp}xX` }

const results = []
function record(who, what, res, body) {
  const reachable = res.status >= 200 && res.status < 300
  results.push({ who, what, status: res.status, reachable, body })
  const mark = reachable ? 'REACHABLE' : 'blocked'
  console.log(`  ${mark.padEnd(10)} ${who.padEnd(14)} ${what.padEnd(38)} HTTP ${res.status}`)
}

async function rest(path, init = {}, token = ANON) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  let body = null
  try { body = await res.json() } catch { /* empty body is fine */ }
  return { res, body }
}

async function main() {
  // ── Create a throwaway student and get their token ────────────────────────
  const signup = await fetch(`${URL_}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(student),
  })
  const signupBody = await signup.json()
  const token = signupBody?.access_token
  const userId = signupBody?.user?.id

  if (!token || !userId) {
    console.error('Could not create a probe account:', JSON.stringify(signupBody))
    process.exit(1)
  }
  console.log(`Probe account ${student.email} (${userId})\n`)

  // Make sure a row exists to attack.
  await rest('user_billing', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, plan: 'free', status: 'active' }),
  }, SERVICE)

  console.log('As the logged-in student:')

  // ── Read: this one SHOULD work ────────────────────────────────────────────
  {
    const { res, body } = await rest(`user_billing?user_id=eq.${userId}&select=*`, {}, token)
    const ok = res.status === 200 && Array.isArray(body) && body.length === 1
    console.log(`  ${(ok ? 'ok' : 'PROBLEM').padEnd(10)} ${'student'.padEnd(14)} ${'read own row (expected to work)'.padEnd(38)} HTTP ${res.status}`)
    if (!ok) results.push({ who: 'student', what: 'read own row', status: res.status, readBroken: true })
  }

  // ── Writes: all of these MUST fail ────────────────────────────────────────
  {
    const { res, body } = await rest(`user_billing?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ plan: 'unlimited', status: 'active' }),
    }, token)
    record('student', 'PATCH own plan -> unlimited', res, body)
  }
  {
    const { res, body } = await rest(`user_billing?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ai_queries_used: 0 }),
    }, token)
    record('student', 'PATCH own ai_queries_used -> 0', res, body)
  }
  {
    const { res, body } = await rest('user_billing', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, plan: 'unlimited', status: 'active' }),
    }, token)
    record('student', 'INSERT a row for self', res, body)
  }
  {
    const { res, body } = await rest(`user_billing?user_id=eq.${userId}`, { method: 'DELETE' }, token)
    record('student', 'DELETE own row', res, body)
  }
  {
    const { res, body } = await rest('user_billing?select=user_id,plan', {}, token)
    const leaked = Array.isArray(body) && body.length > 1
    console.log(`  ${(leaked ? 'REACHABLE' : 'blocked').padEnd(10)} ${'student'.padEnd(14)} ${'read OTHER users rows'.padEnd(38)} HTTP ${res.status} (${Array.isArray(body) ? body.length : 0} rows)`)
    if (leaked) results.push({ who: 'student', what: 'read other users rows', status: res.status, reachable: true })
  }

  console.log('\nAs anon, not logged in:')
  {
    const { res, body } = await rest('user_billing?select=*', {}, ANON)
    const leaked = Array.isArray(body) && body.length > 0
    console.log(`  ${(leaked ? 'REACHABLE' : 'blocked').padEnd(10)} ${'anon'.padEnd(14)} ${'read the table'.padEnd(38)} HTTP ${res.status} (${Array.isArray(body) ? body.length : 0} rows)`)
    if (leaked) results.push({ who: 'anon', what: 'read the table', status: res.status, reachable: true })
  }
  {
    const { res, body } = await rest(`user_billing?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ plan: 'unlimited' }),
    }, ANON)
    record('anon', 'PATCH a plan', res, body)
  }

  // ── Verify nothing actually changed ───────────────────────────────────────
  const { body: after } = await rest(`user_billing?user_id=eq.${userId}&select=plan,ai_queries_used`, {}, SERVICE)
  const row = Array.isArray(after) ? after[0] : null
  const planHeld = row?.plan === 'free'
  console.log(`\nPlan after all writes: ${row?.plan ?? '(row gone)'} ${planHeld ? '(unchanged, correct)' : '(CHANGED — the lock does not hold)'}`)

  // ── Clean up ──────────────────────────────────────────────────────────────
  await fetch(`${URL_}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })

  const holes = results.filter(r => r.reachable || r.readBroken)
  if (holes.length === 0 && planHeld) {
    console.log('\nNo write path reachable with the anon key.')
    process.exit(0)
  }
  console.error('\nPROBLEMS:')
  for (const h of holes) console.error('  ', JSON.stringify(h))
  if (!planHeld) console.error('   plan was modified by a client-side write')
  process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })
