#!/usr/bin/env node
/**
 * Prove the optimistic lock actually stops one tab overwriting another.
 *
 * Simulates the real scenario against a live database: two clients read the
 * same row, each adds a different course to its own copy, and both save. Before
 * the lock, the second save wins and the first tab's course is gone. After it,
 * the second save is refused and the client is handed the winning plan so it
 * can reapply.
 *
 * SAFETY: refuses to run against production unless ALLOW_PROD=1. Creates its
 * own throwaway student and deletes it, including every table with a user_id,
 * because course_uploads has a NO ACTION foreign key that blocks the auth
 * delete otherwise. Sends no email.
 *
 * Usage:
 *   set -a && . ~/.studyedge/env.staging && set +a
 *   node scripts/verifyPlanVersioning.mjs
 */

const URL_ = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_KEY
const PROD_REF = 'vpmgamaspefwqywttdtj'

if (!URL_ || !SERVICE) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
if (URL_.includes(PROD_REF) && process.env.ALLOW_PROD !== '1') {
  console.error(`Refusing to run against production (${PROD_REF}). Set ALLOW_PROD=1 to override.`)
  process.exit(1)
}

const svc = (path, init = {}) => fetch(`${URL_}${path}`, {
  ...init,
  headers: {
    apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json', ...(init.headers ?? {}),
  },
})

const checks = []
const check = (name, pass, detail = '') => {
  checks.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

const read = async (uid) => {
  const r = await svc(`/rest/v1/user_data?select=plan,plan_version&user_id=eq.${uid}`)
  if (!r.ok) return { err: `${r.status} ${(await r.text()).slice(0, 160)}` }
  return (await r.json())[0] ?? {}
}

/** A guarded write, exactly as src/lib/db.js savePlan performs it. */
const guardedWrite = async (uid, plan, expectedVersion) => {
  const r = await svc(
    `/rest/v1/user_data?user_id=eq.${uid}&plan_version=eq.${expectedVersion}`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ plan }) }
  )
  if (!r.ok) return { ok: false, status: r.status, body: (await r.text()).slice(0, 200) }
  const rows = await r.json()
  return { ok: true, applied: rows.length > 0, rows }
}

const stamp = Date.now()
const email = `planver-probe-${stamp}@example.com`
const TABLES = ['course_uploads', 'user_data', 'ios_state', 'struggle_topics',
                'topic_signals', 'generated_artifacts', 'course_grade_baselines', 'one_time_offers']

async function main() {
  let uid = null
  try {
    const created = await svc('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password: `Probe!${stamp}pV`, email_confirm: true }),
    })
    const cj = await created.json()
    if (!created.ok) throw new Error(JSON.stringify(cj))
    uid = cj.id
    console.log(`seeded student ${uid}\n`)

    // Does the column exist at all? Without it the whole exercise is moot, and
    // saying so is more useful than every check failing for one reason.
    const probe = await svc('/rest/v1/user_data?select=plan_version&limit=1')
    if (!probe.ok) {
      console.error('\nuser_data.plan_version does not exist on this project.')
      console.error('Apply migrations/20260825_plan_version_optimistic_lock.sql first.')
      console.error(`(${probe.status} ${(await probe.text()).slice(0, 160)})`)
      process.exitCode = 2
      return
    }

    await svc('/rest/v1/user_data', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: uid, plan: { courses: [] } }),
    })

    const start = await read(uid)
    check('a fresh row starts at a known version', typeof start.plan_version === 'number',
      `plan_version=${start.plan_version}`)

    // ── Both tabs read the same state ────────────────────────────────────────
    const tabA = await read(uid)
    const tabB = await read(uid)
    check('both tabs read the same version', tabA.plan_version === tabB.plan_version,
      `A=${tabA.plan_version} B=${tabB.plan_version}`)

    // ── Tab A adds Biology and saves ─────────────────────────────────────────
    const planA = { courses: [{ id: 'a1', name: 'Biology 101' }] }
    const wroteA = await guardedWrite(uid, planA, tabA.plan_version)
    check("tab A's write lands", wroteA.ok && wroteA.applied)

    const afterA = await read(uid)
    check('the version advanced on a real change', afterA.plan_version === tabA.plan_version + 1,
      `${tabA.plan_version} -> ${afterA.plan_version}`)

    // ── Tab B, still holding the old version, adds Chemistry ─────────────────
    // This is the exact overwrite. Tab B's plan has no Biology in it.
    const planB = { courses: [{ id: 'b1', name: 'Chemistry 201' }] }
    const wroteB = await guardedWrite(uid, planB, tabB.plan_version)
    check("tab B's stale write is refused", wroteB.ok && !wroteB.applied,
      wroteB.applied ? 'IT OVERWROTE TAB A' : 'zero rows matched, as intended')

    const afterB = await read(uid)
    const names = (afterB.plan?.courses ?? []).map(c => c.name)
    check("tab A's course survived", names.includes('Biology 101'), `courses now: ${names.join(', ') || 'none'}`)
    check('the version did not move on the refused write', afterB.plan_version === afterA.plan_version,
      `plan_version=${afterB.plan_version}`)

    // ── Tab B re-reads and reapplies, which is what the client does ──────────
    const reread = await read(uid)
    const merged = { courses: [...(reread.plan?.courses ?? []), { id: 'b1', name: 'Chemistry 201' }] }
    const wroteB2 = await guardedWrite(uid, merged, reread.plan_version)
    check('tab B succeeds after re-reading', wroteB2.ok && wroteB2.applied)

    const final = await read(uid)
    const finalNames = (final.plan?.courses ?? []).map(c => c.name)
    check('both courses are present at the end',
      finalNames.includes('Biology 101') && finalNames.includes('Chemistry 201'),
      finalNames.join(', '))

    // ── A no-op write must not burn a version ────────────────────────────────
    // Otherwise a harmless idempotent save would hand the other tab a spurious
    // conflict every time.
    const before = await read(uid)
    await guardedWrite(uid, before.plan, before.plan_version)
    const after = await read(uid)
    check('a no-op write does not bump the version',
      after.plan_version === before.plan_version,
      `${before.plan_version} -> ${after.plan_version}`)

    const failed = checks.filter(c => !c.pass).length
    console.log('\n─────────────────────────────────────────────────────────')
    console.log(`${checks.length - failed}/${checks.length} checks passed`)
    process.exitCode = failed ? 1 : 0
  } finally {
    if (uid) {
      for (const t of TABLES) await svc(`/rest/v1/${t}?user_id=eq.${uid}`, { method: 'DELETE' })
      const r = await svc(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' })
      console.log(`\ncleanup: auth delete ${r.status}`)
      if (!r.ok) console.log(`  ORPHAN LEFT BEHIND: ${uid} (${email})`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
