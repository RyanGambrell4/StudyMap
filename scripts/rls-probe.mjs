#!/usr/bin/env node
/**
 * Prove, with real credentials, whether one signed-in student can read or write
 * another student's rows.
 *
 * Why this exists: supabase/rls-lockdown.sql creates four named policies on
 * user_data but never drops the older permissive "Users can manage their own
 * data" (FOR ALL). Postgres combines permissive policies with OR, so if the old
 * one is broader the lockdown is cosmetic. Reading the SQL is not proof. This
 * signs in as two students and tries the access.
 *
 * Read-mostly. The only writes are against the prober's OWN row and are
 * reverted. It refuses to run against production.
 *
 *   node --env-file=.env.local scripts/rls-probe.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from './lib/envGuard.mjs'

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_KEY
if (!url || !anon || !service) {
  console.error('SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY are required.')
  process.exit(1)
}
assertNotProduction(url, 'rls-probe')

const A = { email: 'seed-mid-semester@studyedge.test', pw: 'StudyEdgeSeed!2026' }
const B = { email: 'seed-exam-shock@studyedge.test',   pw: 'StudyEdgeSeed!2026' }

const admin = createClient(url, service, { auth: { persistSession: false } })

async function signIn(who) {
  const c = createClient(url, anon, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email: who.email, password: who.pw })
  if (error) { console.error(`sign in failed for ${who.email}: ${error.message}`); process.exit(1) }
  return { client: c, id: data.user.id, email: who.email }
}

const a = await signIn(A)
const b = await signIn(B)
console.log(`A = ${a.email}\n    ${a.id}`)
console.log(`B = ${b.email}\n    ${b.id}\n`)

const results = []
function record(name, leaked, detail) {
  results.push({ name, leaked, detail })
  console.log(`  ${leaked ? 'LEAK    ' : 'blocked '} ${name}${detail ? '   ' + detail : ''}`)
}

console.log('Cross-user READ attempts, as A, targeting B:')
for (const table of ['user_data', 'topic_signals', 'generated_artifacts', 'course_uploads', 'struggle_topics', 'course_grade_baselines', 'one_time_offers', 'feedback', 'ios_state']) {
  const { data, error } = await a.client.from(table).select('*').eq('user_id', b.id)
  if (error) { record(`read ${table}`, false, `error ${error.code ?? ''}`); continue }
  record(`read ${table}`, (data?.length ?? 0) > 0, `${data?.length ?? 0} row(s)`)
}

console.log('\nUnscoped SELECT as A (no user_id filter). Any row belonging to B is a leak:')
for (const table of ['user_data', 'topic_signals', 'generated_artifacts', 'course_uploads']) {
  const { data, error } = await a.client.from(table).select('user_id').limit(200)
  if (error) { record(`scan ${table}`, false, `error ${error.code ?? ''}`); continue }
  const others = (data ?? []).filter(r => r.user_id && r.user_id !== a.id)
  record(`scan ${table}`, others.length > 0, `${data?.length ?? 0} row(s), ${others.length} not mine`)
}

console.log("\nCross-user WRITE attempts, as A, targeting B's row:")
{
  const { data, error } = await a.client.from('user_data')
    .update({ sms_phone: '+10000000000' }).eq('user_id', b.id).select()
  record('update user_data', (data?.length ?? 0) > 0, error ? `error ${error.code ?? ''}` : `${data?.length ?? 0} row(s) changed`)
}
{
  const { data, error } = await a.client.from('topic_signals').insert({
    user_id: b.id, course_id: 'x', course_name: 'x', topic: 'rls-probe',
    signal_type: 'quiz_answer', source: 'server_graded', score: 0.5,
  }).select()
  record('insert topic_signals as B', (data?.length ?? 0) > 0, error ? `error ${error.code ?? ''}` : 'inserted')
}
{
  const { data, error } = await a.client.from('user_data').delete().eq('user_id', b.id).select()
  record('delete user_data', (data?.length ?? 0) > 0, error ? `error ${error.code ?? ''}` : `${data?.length ?? 0} row(s) deleted`)
}

console.log('\nSelf-write, to prove the probe would notice a successful write:')
{
  const { data, error } = await a.client.from('user_data')
    .update({ sms_phone: '+15550001111' }).eq('user_id', a.id).select('user_id, sms_phone')
  console.log(`  own row update: ${error ? 'error ' + error.message : (data?.length ?? 0) + ' row(s)'}`)
  await a.client.from('user_data').update({ sms_phone: null }).eq('user_id', a.id)
}

console.log('\nPrivilege escalation via the subscription column, as A on A:')
{
  const before = await admin.from('user_data').select('subscription').eq('user_id', a.id).maybeSingle()
  await a.client.from('user_data')
    .update({ subscription: { plan: 'unlimited', status: 'active', aiQueriesUsed: 0 } })
    .eq('user_id', a.id)
  const after = await admin.from('user_data').select('subscription').eq('user_id', a.id).maybeSingle()
  const planAfter = after.data?.subscription?.plan
  const changed = JSON.stringify(before.data?.subscription) !== JSON.stringify(after.data?.subscription)
  record('self-upgrade to unlimited', changed && planAfter === 'unlimited',
    `plan is now ${planAfter ?? 'null'}`)
}

console.log('\nService-role tables that no user should touch:')
for (const table of ['cron_locks', 'stripe_idempotency']) {
  const { data, error } = await a.client.from(table).select('*').limit(5)
  record(`read ${table}`, !error && (data?.length ?? 0) > 0, error ? `error ${error.code ?? ''}` : `${data?.length ?? 0} row(s)`)
}

const leaks = results.filter(r => r.leaked)
console.log(`\n${'='.repeat(70)}`)
if (leaks.length) {
  console.log(`CROSS-USER ACCESS IS LIVE. ${leaks.length} path(s):`)
  for (const l of leaks) console.log(`   ${l.name}  ${l.detail ?? ''}`)
  process.exitCode = 1
} else {
  console.log('No cross-user read or write path found. RLS is holding.')
}
