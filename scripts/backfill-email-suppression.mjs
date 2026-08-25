#!/usr/bin/env node
/**
 * Populate `email_suppression` from historical Resend bounce and complaint data.
 *
 * WHY THIS IS NOT OPTIONAL
 * ------------------------
 * Applying migrations/20260821_email_suppression_and_queue_v2.sql creates an EMPTY
 * table. An empty suppression list suppresses nobody. Every address that hard
 * bounced or filed a complaint between 2026-07-27 and today is still mailable
 * the moment the migration lands, so the migration on its own changes nothing
 * except that the read stops erroring.
 *
 * Worse: nothing in this codebase ever WROTE to email_suppression. Not
 * api/resend-webhook.js, not anything. The migration comment says "Written by
 * resend-webhook on bounce and complaint events", but the webhook's bounce and
 * complaint handlers only call posthogCapture and console.warn. So the table
 * would stay empty forever even after the migration, until the webhook is
 * taught to write to it. See the WEBHOOK WRITER section at the bottom.
 *
 * INPUT
 * -----
 * Two modes. CSV is the recommended one because it is certain.
 *
 *   --from-csv <path>     A suppressions export from the Resend dashboard.
 *                         Expects columns containing an email and a reason or
 *                         type; header names are matched loosely.
 *
 *   --from-api            Page the Resend API. Requires RESEND_API_KEY.
 *                         Resend's list endpoints have changed shape more than
 *                         once and this path could not be verified here because
 *                         no RESEND_API_KEY was available, so treat it as a
 *                         starting point and check the response shape on the
 *                         first run with --dry-run.
 *
 * SAFETY
 * ------
 * Dry run by default. Refuses production only for WRITES if you pass
 * --allow-production, because unlike the seed script this one is legitimately
 * meant to run against production eventually. It will not run at all without an
 * explicit target.
 *
 * It sends no email and imports no mailer.
 *
 *   node --env-file=.env.local scripts/backfill-email-suppression.mjs --from-csv bounces.csv
 *   ... --from-csv bounces.csv --apply --allow-production
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { refFromUrl, PRODUCTION_SUPABASE_REF } from './lib/envGuard.mjs'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ALLOW_PROD = args.includes('--allow-production')
const FROM_API = args.includes('--from-api')
const csvIdx = args.indexOf('--from-csv')
const CSV = csvIdx >= 0 ? args[csvIdx + 1] : null

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
  process.exit(1)
}
if (!CSV && !FROM_API) {
  console.error('Give it input: --from-csv <path>  or  --from-api')
  process.exit(1)
}

const ref = refFromUrl(url)
const isProd = ref === PRODUCTION_SUPABASE_REF
if (isProd && APPLY && !ALLOW_PROD) {
  console.error(`REFUSING: ${ref} is production and --allow-production was not passed.`)
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

// ── Input parsing ───────────────────────────────────────────────────────────

const VALID_REASONS = new Set(['bounced', 'complained', 'manual'])

function normaliseReason(raw) {
  const r = (raw ?? '').toLowerCase()
  if (r.includes('complain') || r.includes('spam') || r.includes('abuse')) return 'complained'
  if (r.includes('bounce') || r.includes('hard') || r.includes('undeliverable')) return 'bounced'
  return 'manual'
}

function parseCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')  // strip BOM
  const rows = text.split(/\r?\n/).filter(l => l.trim())
  if (!rows.length) return []
  const split = (line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(c =>
    c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()) ?? []

  const header = split(rows[0]).map(h => h.toLowerCase())
  const emailCol = header.findIndex(h => h.includes('email') || h.includes('recipient') || h === 'to')
  const reasonCol = header.findIndex(h => h.includes('reason') || h.includes('type') || h.includes('status') || h.includes('event'))
  const dateCol = header.findIndex(h => h.includes('date') || h.includes('created') || h.includes('time'))

  if (emailCol < 0) {
    console.error(`Could not find an email column in: ${header.join(', ')}`)
    process.exit(1)
  }

  const out = []
  for (const line of rows.slice(1)) {
    const cells = split(line)
    const email = (cells[emailCol] ?? '').toLowerCase()
    if (!email || !email.includes('@')) continue
    out.push({
      email,
      reason: normaliseReason(reasonCol >= 0 ? cells[reasonCol] : 'bounced'),
      suppressed_at: dateCol >= 0 && cells[dateCol] ? new Date(cells[dateCol]).toISOString() : new Date().toISOString(),
    })
  }
  return out
}

async function fetchFromResend() {
  const rk = process.env.RESEND_API_KEY
  if (!rk) {
    console.error('RESEND_API_KEY is required for --from-api. Use --from-csv instead.')
    process.exit(1)
  }
  // Unverified: no RESEND_API_KEY was available to test this against. Run with
  // --dry-run first and check that the printed shape matches what you expect.
  const out = []
  let after = null
  for (let page = 0; page < 50; page++) {
    const u = new URL('https://api.resend.com/emails')
    u.searchParams.set('limit', '100')
    if (after) u.searchParams.set('after', after)
    const res = await fetch(u, { headers: { Authorization: `Bearer ${rk}` } })
    if (!res.ok) {
      console.error(`Resend API ${res.status}: ${(await res.text()).slice(0, 300)}`)
      console.error('The list endpoint shape may have changed. Use --from-csv.')
      process.exit(1)
    }
    const body = await res.json()
    const items = body.data ?? body.emails ?? []
    if (!items.length) break
    for (const e of items) {
      const status = (e.last_event ?? e.status ?? '').toLowerCase()
      if (status.includes('bounce') || status.includes('complain')) {
        const to = Array.isArray(e.to) ? e.to[0] : e.to
        if (to) out.push({ email: String(to).toLowerCase(), reason: normaliseReason(status), suppressed_at: e.created_at ?? new Date().toISOString() })
      }
    }
    after = body.next_cursor ?? items[items.length - 1]?.id
    if (!after) break
  }
  return out
}

// ── Apply ───────────────────────────────────────────────────────────────────

const raw = CSV ? parseCsv(CSV) : await fetchFromResend()

// Dedupe by email, keeping the strongest reason. A complaint outranks a bounce:
// it is an explicit "stop", not a delivery failure.
const byEmail = new Map()
for (const r of raw) {
  const prev = byEmail.get(r.email)
  if (!prev || (prev.reason !== 'complained' && r.reason === 'complained')) byEmail.set(r.email, r)
}
const records = [...byEmail.values()].filter(r => VALID_REASONS.has(r.reason))

console.log(`target        : ${ref}${isProd ? '  (PRODUCTION)' : ''}`)
console.log(`mode          : ${APPLY ? 'APPLY' : 'dry run, nothing will be written'}`)
console.log(`source        : ${CSV ? `csv ${CSV}` : 'resend api'}`)
console.log(`rows read     : ${raw.length}`)
console.log(`unique emails : ${records.length}`)
console.log(`  bounced     : ${records.filter(r => r.reason === 'bounced').length}`)
console.log(`  complained  : ${records.filter(r => r.reason === 'complained').length}`)

// Attach user_id where the address maps to an account, so the by-user_id lookup
// in canSendUserEmail works too and not just the by-email one.
const { data: users, error: uErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (uErr) { console.error(`listUsers failed: ${uErr.message}`); process.exit(1) }
const idByEmail = new Map((users?.users ?? []).map(u => [(u.email ?? '').toLowerCase(), u.id]))
let matched = 0
for (const r of records) {
  const id = idByEmail.get(r.email)
  if (id) { r.user_id = id; matched++ }
}
console.log(`matched to an account: ${matched} of ${records.length}`)

if (!APPLY) {
  console.log('\nFirst 10 that would be inserted:')
  for (const r of records.slice(0, 10)) {
    console.log(`  ${r.reason.padEnd(11)} ${r.email}${r.user_id ? '  (account)' : ''}`)
  }
  console.log('\nDry run complete. Re-run with --apply to write.')
  process.exit(0)
}

const { error } = await db.from('email_suppression')
  .upsert(records, { onConflict: 'email', ignoreDuplicates: true })
if (error) {
  console.error(`insert failed: ${error.code ?? ''} ${error.message}`)
  if (error.code === 'PGRST205') {
    console.error('The table does not exist. Apply the migration first.')
  }
  process.exit(1)
}
console.log(`\nInserted or skipped ${records.length} suppression records.`)

/**
 * WEBHOOK WRITER, still required
 * ------------------------------
 * This backfill covers history. Going forward, api/resend-webhook.js must write
 * new bounces and complaints into the table, which it currently does not. Add
 * to the email.bounced and email.complained cases:
 *
 *   await supabaseAdmin.from('email_suppression').upsert({
 *     user_id: userId ?? null,
 *     email,
 *     reason: type === 'email.complained' ? 'complained' : 'bounced',
 *   }, { onConflict: 'email', ignoreDuplicates: true })
 *
 * Without it the list is a snapshot that goes stale from the day it is loaded.
 * Left out of this build deliberately: the brief said prepare, do not apply,
 * and this is a production behaviour change to a live webhook.
 */
