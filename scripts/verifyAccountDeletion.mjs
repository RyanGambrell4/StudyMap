#!/usr/bin/env node
/**
 * Can a user who actually used the product delete their account?
 *
 * api/delete-account.js used to clean three of the eight public tables that
 * reference auth.users. Seven of those eight cascade, so the omissions were
 * mostly cosmetic, but course_uploads.user_id is ON DELETE NO ACTION, so its
 * rows BLOCKED the auth delete:
 *
 *   23503 update or delete on table "users" violates foreign key constraint
 *         "course_uploads_user_id_fkey" on table "course_uploads"
 *
 * The route returned 500 and told the user to email support. Anyone who had
 * uploaded a syllabus could not delete their account, and
 * course_uploads.extracted_text holds the full text of that document.
 *
 * This seeds a student with a row in every one of those tables, runs the same
 * sequence the route runs, and then checks that nothing is left behind.
 *
 * SAFETY: refuses to run against production unless ALLOW_PROD=1. Creates and
 * destroys its own student. Sends no email: it does not touch the route's
 * Stripe branch and never calls Resend.
 *
 * Usage:
 *   set -a && . ~/.studyedge/env.staging && set +a
 *   node scripts/verifyAccountDeletion.mjs
 */

const URL_ = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_KEY
const PROD_REF = 'vpmgamaspefwqywttdtj'

if (!URL_ || !SERVICE) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_KEY in env.')
  process.exit(1)
}
if (URL_.includes(PROD_REF) && process.env.ALLOW_PROD !== '1') {
  console.error(`Refusing to run against production (${PROD_REF}). Set ALLOW_PROD=1 to override.`)
  process.exit(1)
}

const stamp = Date.now()
const email = `delete-probe-${stamp}@example.com`

const svc = (path, init = {}) => fetch(`${URL_}${path}`, {
  ...init,
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

// Every public table with a user_id, and a minimal valid row for each. Keep in
// step with the `tables` list in api/delete-account.js.
const SEEDS = (uid) => ({
  user_data:              { user_id: uid, plan: {}, subscription: { plan: 'free', status: 'active' } },
  course_uploads:         { user_id: uid, course_id: 'probe', filename: 'syllabus.pdf', file_type: 'pdf', extracted_text: 'sensitive document text' },
  ios_state:              { user_id: uid, snapshot: {} },
  struggle_topics:        { user_id: uid, course_name: 'probe', topic: 'probe' },
  topic_signals:          { user_id: uid, course_id: 'probe', course_name: 'probe', topic: 'probe', signal_type: 'quiz_answer', source: 'server_graded', score: 0.5 },
  generated_artifacts:    { user_id: uid, course_id: 'probe', course_name: 'probe', artifact_type: 'probe', title: 'probe' },
  course_grade_baselines: { user_id: uid, course_id: 'probe', baseline_grade: 90 },
  one_time_offers:        { user_id: uid, code: `probe-${stamp}`, stripe_coupon: 'probe', discount_pct: 10, reason: 'probe', expires_at: new Date(Date.now() + 864e5).toISOString() },
})

// The route's deletion order. course_uploads must come first.
const DELETE_ORDER = [
  'course_uploads', 'user_data', 'ios_state', 'struggle_topics',
  'topic_signals', 'generated_artifacts', 'course_grade_baselines', 'one_time_offers',
]

const checks = []
function check(name, pass, detail) {
  checks.push({ name, pass, detail })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

async function countFor(table, uid) {
  const res = await svc(`/rest/v1/${table}?select=user_id&user_id=eq.${uid}`)
  if (!res.ok) return -1
  return (await res.json()).length
}

async function main() {
  let uid = null
  try {
    const created = await svc('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password: `Probe!${stamp}dD`, email_confirm: true }),
    })
    const cj = await created.json()
    if (!created.ok) throw new Error(JSON.stringify(cj))
    uid = cj.id
    console.log(`seeded student ${uid}\n`)

    console.log('seeding one row in every table that references auth.users')
    const seeds = SEEDS(uid)
    for (const [table, row] of Object.entries(seeds)) {
      const res = await svc(`/rest/v1/${table}`, {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(row),
      })
      if (!res.ok) console.log(`  could not seed ${table}: ${res.status} ${(await res.text()).slice(0, 120)}`)
    }
    const seeded = []
    for (const t of Object.keys(seeds)) if ((await countFor(t, uid)) > 0) seeded.push(t)
    console.log(`  seeded: ${seeded.join(', ')}\n`)
    check('the upload row exists, so this is the case that used to fail',
      seeded.includes('course_uploads'), seeded.includes('course_uploads') ? '' : 'could not seed it')

    // ── Step 2 of the route: clear the public tables ─────────────────────────
    console.log('\nrunning the route\'s table deletions')
    for (const table of DELETE_ORDER) {
      const res = await svc(`/rest/v1/${table}?user_id=eq.${uid}`, { method: 'DELETE' })
      if (!res.ok) console.log(`  ${table}: ${res.status} ${(await res.text()).slice(0, 120)}`)
    }

    // ── Step 3 of the route: delete the auth user ────────────────────────────
    console.log('\ndeleting the auth user')
    const del = await svc(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' })
    const body = del.ok ? '' : (await del.text()).slice(0, 200)
    check('auth delete succeeded', del.ok, del.ok ? `${del.status}` : `${del.status} ${body}`)

    // ── Nothing left behind ──────────────────────────────────────────────────
    console.log('\nchecking nothing was left behind')
    const leftovers = []
    for (const t of Object.keys(seeds)) {
      const n = await countFor(t, uid)
      if (n > 0) leftovers.push(`${t} (${n})`)
    }
    check('no rows survive in any user table', leftovers.length === 0,
      leftovers.length ? leftovers.join(', ') : 'all clear')

    const stillThere = await svc(`/auth/v1/admin/users/${uid}`)
    check('the auth user is gone', stillThere.status === 404, `GET returned ${stillThere.status}`)

    if (del.ok) uid = null // nothing left to clean up

    const failed = checks.filter(c => !c.pass)
    console.log('\n─────────────────────────────────────────────────────────────')
    console.log(`${checks.length - failed.length}/${checks.length} checks passed`)
    process.exitCode = failed.length ? 2 : 0
  } finally {
    if (uid) {
      // Best effort: clear everything, then the user, so a failed run does not
      // leave an orphan behind the way the original bug did.
      for (const t of DELETE_ORDER) await svc(`/rest/v1/${t}?user_id=eq.${uid}`, { method: 'DELETE' })
      const res = await svc(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' })
      console.log(`\ncleanup: auth delete ${res.status}`)
      if (!res.ok) console.log(`  ORPHAN LEFT BEHIND: ${uid} (${email})`)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
