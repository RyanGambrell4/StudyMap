#!/usr/bin/env node
/**
 * The AI quota accounting checks, driven against a real database.
 *
 * Task 5 asks: does a generation decrement the count by exactly one, does a
 * failed request leave it unchanged, and does the wall land where the copy
 * says. Those are questions about lib/server/usage.js and user_data, not about
 * Anthropic, so this drives the gate directly rather than clicking through the
 * UI. It needs no ANTHROPIC_API_KEY and it is the stricter test: it reads the
 * actual stored counter after every step instead of trusting a rendered number.
 *
 * What it does NOT cover, because those genuinely need a model: that a syllabus
 * upload produces a populated course, that a flashcard generation returns usable
 * cards, and that FocusMode flashcards, quiz burst, diagrams and essay review
 * render real output. Those still need the key.
 *
 * SAFETY
 *   - Refuses to run against production unless ALLOW_PROD=1.
 *   - Creates its own throwaway student and deletes it at the end.
 *   - SENDS NO EMAIL. commitReservation fires sendBoostNudgeEmail at the 4th
 *     action, which returns immediately when RESEND_API_KEY is unset. This
 *     script asserts RESEND_API_KEY is absent before doing anything, and
 *     refuses to run if it is present. That is checked, not assumed.
 *
 * Usage:
 *   set -a && . ~/.studyedge/env.staging && set +a
 *   node scripts/verifyAiQuotaAccounting.mjs
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

// The email guardrail, enforced rather than trusted. commitReservation calls
// sendBoostNudgeEmail(userId) when a free user reaches their 4th action, and
// this harness deliberately walks a user past 4. That call is a no-op only
// while RESEND_API_KEY is unset, so refuse to run when it is set.
if (process.env.RESEND_API_KEY) {
  console.error(
    'RESEND_API_KEY is set. This harness drives a free user past their 4th AI\n' +
    'action, which is exactly where commitReservation fires the boost-nudge\n' +
    'email. Unset it and re-run:  env -u RESEND_API_KEY node scripts/verifyAiQuotaAccounting.mjs'
  )
  process.exit(1)
}

const { reserveAiUsage, PLAN_AI_LIMITS } = await import('../lib/server/usage.js')

const stamp = Date.now()
const student = { email: `quota-probe-${stamp}@example.com`, password: `Probe!${stamp}qQ` }

const svc = (path, init = {}) => fetch(`${URL_}${path}`, {
  ...init,
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

async function storedUsage(uid) {
  const res = await svc(`/rest/v1/user_data?select=subscription&user_id=eq.${uid}`)
  const rows = await res.json()
  const sub = rows[0]?.subscription ?? {}
  return {
    used: Number(sub.aiQueriesUsed) || 0,
    resetAt: sub.aiQueriesResetAt ?? null,
    lastCall: sub.lastAiCallAt ?? null,
    firstGeneration: sub.firstGenerationAt ?? null,
    stripeCustomerId: sub.stripeCustomerId ?? null,
    raw: sub,
  }
}

const checks = []
function check(name, pass, detail) {
  checks.push({ name, pass, detail })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

// reserveAiUsage takes either a req with a bearer token, or a pre-verified
// { ok, userId }. The second form is what the course-requiring endpoints use
// after resolveCourseId, so it is the real code path, not a shortcut.
const asVerified = (uid) => ({ verified: { ok: true, userId: uid } })

// With USE_ATOMIC_RPC=1, commit() routes through the prepared
// public.increment_ai_usage function instead of usage.js's read-modify-write.
// This is how supabase/atomic-ai-usage-increment.sql was validated before being
// handed over: same harness, same assertions, only the write path swapped.
const ATOMIC = process.env.USE_ATOMIC_RPC === '1'
async function reserve(uid) {
  const gate = await reserveAiUsage({}, asVerified(uid))
  if (!gate.ok || !ATOMIC) return gate
  // Keep the once-per-request guard that lives in the real gate's closure. The
  // RPC is atomic, not idempotent: calling it twice charges twice, which is
  // correct for two generations and wrong for one. The integration must keep
  // this flag when it swaps the write path.
  let committed = false
  return { ...gate, usage: gate.usage, async commit() {
    if (committed) return { ok: true, alreadyCommitted: true }
    committed = true
    const res = await svc('/rest/v1/rpc/increment_ai_usage', {
      method: 'POST', body: JSON.stringify({ p_user_id: uid, p_reset_month: false }),
    })
    if (!res.ok) return { ok: false, error: await res.text() }
    return { ok: true }
  } }
}

async function main() {
  let uid = null
  try {
    const created = await svc('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: student.email, password: student.password, email_confirm: true }),
    })
    const cj = await created.json()
    if (!created.ok) throw new Error(JSON.stringify(cj))
    uid = cj.id
    console.log(`seeded free student ${uid}\n`)

    // A realistic starting row: free plan, never used AI, plus a Stripe id so we
    // can watch whether anything erases keys it does not own.
    await svc('/rest/v1/user_data', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        user_id: uid, plan: { courses: [] },
        subscription: { plan: 'free', status: 'active', aiQueriesUsed: 0, stripeCustomerId: 'cus_probe_seed' },
      }),
    })

    const FREE_LIMIT = PLAN_AI_LIMITS.free
    console.log(`── free plan limit as the server enforces it: ${FREE_LIMIT}\n`)

    // ── 1. A failed request costs nothing ────────────────────────────────────
    // Reserve, then never commit. That is exactly what an endpoint does when it
    // rejects the request after reserving, and it is the shape of the bug that
    // emptied two accounts on 19 Aug.
    console.log('1. a request that fails after reserving')
    const before1 = await storedUsage(uid)
    const gate1 = await reserve(uid)
    if (!gate1.ok) throw new Error(`reserve failed: ${gate1.status} ${gate1.error}`)
    const after1 = await storedUsage(uid)
    check('reserving alone writes nothing', after1.used === before1.used, `stored ${before1.used} -> ${after1.used}`)
    check('the gate reports the would-be count', gate1.usage.used === before1.used + 1,
      `gate says used=${gate1.usage.used}, limit=${gate1.usage.limit}`)

    // ── 2. A successful generation decrements by exactly one ─────────────────
    console.log('\n2. a generation that succeeds and commits')
    const gate2 = await reserve(uid)
    await gate2.commit()
    const after2 = await storedUsage(uid)
    check('stored count advanced by exactly one', after2.used === before1.used + 1, `stored ${before1.used} -> ${after2.used}`)
    check('lastAiCallAt was stamped', !!after2.lastCall, after2.lastCall ?? 'null')
    check('firstGenerationAt was stamped', !!after2.firstGeneration, after2.firstGeneration ?? 'null')
    check('the Stripe id it does not own survived', after2.stripeCustomerId === 'cus_probe_seed',
      String(after2.stripeCustomerId))

    // ── 3. commit is idempotent within a request ─────────────────────────────
    console.log('\n3. commit called twice in one request')
    const gate3 = await reserve(uid)
    await gate3.commit()
    const afterFirst = await storedUsage(uid)
    await gate3.commit()
    const afterSecond = await storedUsage(uid)
    check('the second commit charges nothing', afterSecond.used === afterFirst.used,
      `${afterFirst.used} -> ${afterSecond.used}`)

    // ── 4. The wall lands exactly where the copy says ────────────────────────
    console.log(`\n4. walking to the ${FREE_LIMIT}-action wall`)
    let guard = 0
    while ((await storedUsage(uid)).used < FREE_LIMIT && guard++ < 20) {
      const g = await reserve(uid)
      if (!g.ok) break
      await g.commit()
    }
    const atLimit = await storedUsage(uid)
    check(`stored count reached exactly ${FREE_LIMIT}`, atLimit.used === FREE_LIMIT, `stored ${atLimit.used}`)

    const blocked = await reserve(uid)
    check('the next request is refused', blocked.ok === false, `status ${blocked.status}`)
    check('refused with 402, not 500 or 429', blocked.status === 402, `status ${blocked.status}`)
    check('the refusal names the real limit', String(blocked.error ?? '').includes(String(FREE_LIMIT)),
      JSON.stringify(blocked.error))
    const afterBlocked = await storedUsage(uid)
    check('a refused request leaves the count unchanged', afterBlocked.used === FREE_LIMIT,
      `stored ${atLimit.used} -> ${afterBlocked.used}`)

    // ── 5. Two AI calls in flight at once ────────────────────────────────────
    // commitReservation spreads the `sub` it read at RESERVE time and writes the
    // whole subscription column. The gap between reserve and commit is a whole
    // generation, tens of seconds. Two overlapping calls therefore both read
    // used=N and both write used=N+1, so one action is free. Reset to a clean
    // slate and measure it.
    console.log('\n5. two generations overlapping (reserve, reserve, commit, commit)')
    await svc(`/rest/v1/user_data?user_id=eq.${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({ subscription: { plan: 'free', status: 'active', aiQueriesUsed: 0, stripeCustomerId: 'cus_probe_seed' } }),
    })
    const gateA = await reserve(uid)
    const gateB = await reserve(uid)
    await gateA.commit()
    await gateB.commit()
    const afterConcurrent = await storedUsage(uid)
    check('two committed generations charged two actions',
      afterConcurrent.used === 2,
      `expected 2, stored ${afterConcurrent.used}${afterConcurrent.used < 2 ? '  <-- one generation was free' : ''}`)

    // ── 6. A concurrent service-role write during a generation ───────────────
    // The Stripe webhook writes this same column. If it lands between reserve
    // and commit, does commit erase it?
    console.log('\n6. a Stripe-webhook-shaped write landing mid-generation')
    const gateC = await reserve(uid)
    await svc(`/rest/v1/user_data?user_id=eq.${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({
        subscription: { ...(await storedUsage(uid)).raw, plan: 'pro', status: 'active', stripeSubId: 'sub_arrived_midflight' },
      }),
    })
    await gateC.commit()
    const afterRace = await storedUsage(uid)
    check('the mid-flight upgrade survived the commit',
      afterRace.raw.stripeSubId === 'sub_arrived_midflight' && afterRace.raw.plan === 'pro',
      `plan=${afterRace.raw.plan} stripeSubId=${afterRace.raw.stripeSubId ?? 'GONE'}`)

    // ── Report ───────────────────────────────────────────────────────────────
    const failed = checks.filter(c => !c.pass)
    console.log('\n─────────────────────────────────────────────────────────────')
    console.log(`${checks.length - failed.length}/${checks.length} checks passed`)
    if (failed.length) {
      console.log('\nfailed:')
      for (const f of failed) console.log(`  ${f.name}  (${f.detail})`)
    }
    process.exitCode = failed.length ? 2 : 0
  } finally {
    if (uid) {
      await svc(`/rest/v1/user_data?user_id=eq.${uid}`, { method: 'DELETE' })
      await svc(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' })
    }
    console.log('\ncleaned up')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
