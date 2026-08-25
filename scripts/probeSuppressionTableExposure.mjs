#!/usr/bin/env node
/**
 * Can an ordinary logged-in student read or edit the suppression list?
 *
 * migrations/20260727_email_suppression_and_queue.sql creates email_suppression,
 * email_queue and app_config but never enables row-level security on them.
 * Supabase's default privileges in this project grant anon and authenticated
 * arwdDxtm on every new table in `public`, so a table created without RLS is
 * readable and writable by anyone holding the anon key.
 *
 * email_queue.context carries email addresses. email_suppression is a list of
 * people who bounced or complained. This probe finds out whether that is
 * actually exposed rather than assuming either way.
 *
 * Run it against staging AFTER applying the migration, both before and after
 * the RLS follow-up.
 *
 * Usage:
 *   set -a && . ~/.studyedge/env.staging && set +a
 *   node scripts/probeSuppressionTableExposure.mjs
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
const student = { email: `expo-probe-${stamp}@example.com`, password: `Probe!${stamp}xX` }

async function admin(path, init = {}) {
  return fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

async function as(token, path, init = {}) {
  return fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

const results = []
async function check(actor, label, res) {
  const body = await res.text()
  let rows = null
  try { const j = JSON.parse(body); rows = Array.isArray(j) ? j.length : null } catch { /* not json */ }
  const exposed = res.ok
  results.push({ actor, label, verdict: exposed ? 'EXPOSED' : 'blocked',
                 detail: exposed ? `${res.status}, ${rows ?? '?'} row(s)` : `${res.status} ${body.slice(0, 80)}` })
}

async function main() {
  let uid = null
  try {
    const created = await admin('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: student.email, password: student.password, email_confirm: true }),
    })
    const cj = await created.json()
    if (!created.ok) throw new Error(JSON.stringify(cj))
    uid = cj.id

    const tok = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(student),
    })
    const tj = await tok.json()
    if (!tok.ok) throw new Error(JSON.stringify(tj))
    const token = tj.access_token

    // Seed one suppression row and one queue row so "0 rows" cannot be
    // mistaken for "blocked".
    await admin('/rest/v1/email_suppression', {
      method: 'POST',
      body: JSON.stringify({ email: `bounced-${stamp}@example.com`, reason: 'bounced' }),
    })
    await admin('/rest/v1/email_queue', {
      method: 'POST',
      body: JSON.stringify({ user_id: uid, campaign: `probe-${stamp}`, priority: 5, context: { email: student.email } }),
    })

    for (const [actor, token_] of [['anon (no login)', null], ['logged-in student', token]]) {
      await check(actor, 'read email_suppression', await as(token_, 'email_suppression?select=*'))
      await check(actor, 'read email_queue', await as(token_, 'email_queue?select=*'))
      await check(actor, 'read app_config', await as(token_, 'app_config?select=*'))
      await check(actor, 'delete from email_suppression',
        await as(token_, `email_suppression?email=eq.bounced-${stamp}@example.com`,
          { method: 'DELETE', headers: { Prefer: 'return=representation' } }))
      await check(actor, 'flip app_config lifecycle_v2',
        await as(token_, 'app_config?id=eq.1',
          { method: 'PATCH', body: JSON.stringify({ feature_flags: { lifecycle_v2: true } }),
            headers: { Prefer: 'return=representation' } }))
      await check(actor, 'insert own address into email_suppression',
        await as(token_, 'email_suppression',
          { method: 'POST', body: JSON.stringify({ email: `injected-${actor}-${stamp}@example.com`, reason: 'manual' }),
            headers: { Prefer: 'return=representation' } }))
    }

    const pad = (s, n) => String(s).padEnd(n)
    console.log('\n─── results ────────────────────────────────────────────────')
    for (const r of results) {
      console.log(`${pad(r.actor, 20)} ${pad(r.label, 40)} ${pad(r.verdict, 10)} ${r.detail}`)
    }
    const exposed = results.filter(r => r.verdict === 'EXPOSED')
    console.log('\n' + (exposed.length
      ? `SUPPRESSION TABLES EXPOSED: ${exposed.length} path(s) reachable with the public anon key`
      : 'No path reachable with the anon key.'))
    process.exitCode = exposed.length ? 2 : 0
  } finally {
    // Leave the seeded rows out of the way.
    await admin(`/rest/v1/email_suppression?email=like.*${stamp}*`, { method: 'DELETE' })
    await admin(`/rest/v1/email_queue?campaign=eq.probe-${stamp}`, { method: 'DELETE' })
    if (uid) await admin(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' })
    console.log('\ncleaned up')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
