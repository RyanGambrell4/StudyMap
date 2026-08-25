#!/usr/bin/env node
/**
 * Emit ONE .sql file that creates the suppression tables and populates them in
 * a single transaction, so the table is never visible-and-empty.
 *
 * ── The ordering problem this exists to solve ───────────────────────────────
 * Right now `email_suppression` does not exist, canSendUserEmail fails closed,
 * and lifecycle mail is blocked. That is the safe state.
 *
 * Apply the migration on its own and the table exists and is EMPTY. The guard
 * then reads it successfully, finds nobody suppressed, and lifecycle mail
 * resumes to everyone, including every address that hard bounced or complained.
 * Applying the migration alone does not fix the reputation problem, it restarts
 * it, and it does so silently because from the code's point of view everything
 * is now working.
 *
 * Running the backfill "immediately after" does not close that window, it just
 * makes it short. The crons run every 2 to 4 hours and the dispatcher every 2;
 * a window of even a minute is a real chance to send.
 *
 * ── Why one transaction is a real fix, not a smaller window ─────────────────
 * Postgres DDL is transactional. Inside BEGIN...COMMIT, the new table is
 * invisible to every other session until COMMIT. So if the INSERTs are in the
 * same transaction as the CREATE, then at the instant any other session can
 * first see `email_suppression`, it is already populated. There is no window,
 * not a short one.
 *
 * That is why this emits a file rather than doing the work itself: the
 * suppression data comes from Resend over HTTP, which cannot happen inside a
 * Postgres transaction. So we fetch first, generate the whole cutover as one
 * SQL text, and you run that text once.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *   # from the Resend API (needs RESEND_API_KEY)
 *   RESEND_API_KEY=re_... node scripts/buildSuppressionCutover.mjs \
 *     --out /tmp/suppression-cutover.sql
 *
 *   # or from a dashboard CSV export, if the API key is not to hand
 *   node scripts/buildSuppressionCutover.mjs \
 *     --from-csv ~/Downloads/bounces.csv --out /tmp/suppression-cutover.sql
 *
 * Then paste /tmp/suppression-cutover.sql into Supabase SQL Editor and Run.
 *
 * Writes nothing to any database. It only reads Resend and writes a file.
 */

import { readFileSync, writeFileSync } from 'fs'

const args = process.argv.slice(2)
const argOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }
const OUT = argOf('--out') ?? '/tmp/suppression-cutover.sql'
const CSV = argOf('--from-csv')
const KEY = process.env.RESEND_API_KEY

if (!CSV && !KEY) {
  console.error('Need either --from-csv <path> or RESEND_API_KEY in the environment.')
  console.error('The Resend dashboard export is at Emails -> filter by Bounced / Complained -> Export.')
  process.exit(1)
}

const REASON_BY_ORIGIN = { bounce: 'bounced', complaint: 'complained', manual: 'manual' }

/** Resend: GET /suppressions, cursor-paginated on `after`. */
async function fromResend() {
  const all = []
  let after = null
  for (let page = 0; page < 200; page++) {
    const qs = new URLSearchParams({ limit: '100' })
    if (after) qs.set('after', after)
    const res = await fetch(`https://api.resend.com/suppressions?${qs}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    })
    if (!res.ok) throw new Error(`Resend GET /suppressions: ${res.status} ${(await res.text()).slice(0, 300)}`)
    const json = await res.json()
    const rows = json.data ?? []
    all.push(...rows.map(r => ({
      email: r.email,
      reason: REASON_BY_ORIGIN[r.origin] ?? 'manual',
      at: r.created_at ?? null,
    })))
    if (!json.has_more || !rows.length) break
    after = rows[rows.length - 1].id
    await new Promise(r => setTimeout(r, 150))   // 10 req/s team limit
  }
  return all
}

/** CSV: match headers loosely, because the dashboard export layout changes. */
function fromCsv(path) {
  const text = readFileSync(path, 'utf8')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const split = (l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)
    ?.map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()) ?? []
  const header = split(lines[0]).map(h => h.toLowerCase())
  const find = (...names) => header.findIndex(h => names.some(n => h.includes(n)))
  const iEmail  = find('email', 'recipient', 'to')
  const iReason = find('reason', 'type', 'status', 'origin', 'event')
  const iDate   = find('date', 'created', 'time', 'at')
  if (iEmail < 0) throw new Error(`No email-like column in ${path}. Headers: ${header.join(', ')}`)

  return lines.slice(1).map(split).map(c => {
    const raw = (c[iReason] ?? '').toLowerCase()
    const reason = /compl|spam|abuse/.test(raw) ? 'complained'
                 : /bounce|undeliver|hard|invalid/.test(raw) ? 'bounced'
                 : 'manual'
    return { email: c[iEmail], reason, at: iDate >= 0 ? (c[iDate] || null) : null }
  }).filter(r => r.email && r.email.includes('@'))
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

const rowsRaw = CSV ? fromCsv(CSV) : await fromResend()

// Deduplicate on lowercased email; email_suppression has UNIQUE(email).
// Prefer 'complained' over 'bounced' if an address appears as both: a complaint
// is the stronger signal and the one that costs the most reputation.
const rank = { complained: 3, bounced: 2, manual: 1 }
const byEmail = new Map()
for (const r of rowsRaw) {
  const e = r.email.toLowerCase().trim()
  const prev = byEmail.get(e)
  if (!prev || rank[r.reason] > rank[prev.reason]) byEmail.set(e, { ...r, email: e })
}
const rows = [...byEmail.values()]

const tally = rows.reduce((a, r) => ({ ...a, [r.reason]: (a[r.reason] ?? 0) + 1 }), {})
console.error(`source: ${CSV ? `CSV ${CSV}` : 'Resend API'}`)
console.error(`${rowsRaw.length} record(s) in, ${rows.length} unique address(es) out`)
console.error(`by reason: ${JSON.stringify(tally)}`)
if (!rows.length) {
  console.error('\nREFUSING to emit a cutover with zero suppression rows. That is exactly the')
  console.error('empty-table state this script exists to prevent. Check the export first.')
  process.exit(1)
}

const migration = readFileSync(
  new URL('../migrations/20260821_email_suppression_and_queue_v2.sql', import.meta.url), 'utf8')
  // Strip the file's own BEGIN/COMMIT so it nests inside ours.
  .replace(/^\s*BEGIN;\s*$/m, '')
  .replace(/^\s*COMMIT;\s*$/m, '')

const values = rows.map(r =>
  `  (${q(r.email)}, ${q(r.reason)}, ${r.at ? q(r.at) + '::timestamptz' : 'now()'})`
).join(',\n')

const sql = `-- ============================================================================
-- Email suppression cutover, generated ${'by scripts/buildSuppressionCutover.mjs'}
-- ${rows.length} suppressed address(es): ${JSON.stringify(tally)}
-- ============================================================================
-- ONE TRANSACTION. Postgres DDL is transactional, so no other session can see
-- email_suppression until COMMIT, and by then it is already populated. There is
-- no interval in which the table exists and is empty, which is the state that
-- would make canSendUserEmail report "nobody is suppressed" and resume sending
-- to every address that bounced or complained.
--
-- Run this whole file at once. Do not run it in pieces.
-- ============================================================================
BEGIN;
${migration}

-- ── Backfill, inside the same transaction as the CREATE ─────────────────────
INSERT INTO email_suppression (email, reason, suppressed_at) VALUES
${values}
ON CONFLICT (email) DO NOTHING;

-- Attach a user_id where the address matches an account, so the by-user-id
-- branch of canSendUserEmail works too, not only the by-email branch.
UPDATE email_suppression s
   SET user_id = u.id
  FROM auth.users u
 WHERE lower(u.email) = s.email
   AND s.user_id IS NULL;

-- ── Refuse to commit an empty or broken cutover ─────────────────────────────
DO $cutover$
DECLARE n int; m int;
BEGIN
  SELECT count(*) INTO n FROM email_suppression;
  SELECT count(*) INTO m FROM email_suppression WHERE user_id IS NOT NULL;
  IF n = 0 THEN
    RAISE EXCEPTION 'refusing to commit: email_suppression is empty, which is the exact state this cutover exists to avoid';
  END IF;
  RAISE NOTICE 'email_suppression committed with % address(es), % matched to an account', n, m;
END
$cutover$;

COMMIT;

-- ── Verify immediately after ────────────────────────────────────────────────
-- 1. The list is populated and locked:
--      select reason, count(*) from email_suppression group by reason;
--      select relrowsecurity from pg_class where relname='email_suppression';
--    Expect your counts above, and relrowsecurity = true.
--
-- 2. Nothing is reachable with the anon key:
--      node scripts/probeSuppressionTableExposure.mjs   (ALLOW_PROD=1)
--    Expect "No path reachable with the anon key."
--
-- 3. THE ONE THAT MATTERS. Prove a known bounced address is actually refused.
--    Take any address from the list, and its user_id if it has one:
--
--      select email, user_id, reason from email_suppression
--       where user_id is not null limit 1;
--
--    Then, in a node REPL with the production service key in env:
--
--      const { canSendUserEmail } = await import('./lib/server/emailGuard.js')
--      await canSendUserEmail('<that user_id>', { priority: 'normal', email: '<that email>' })
--
--    Expect: { ok: false, reason: 'Suppressed (bounced)' }
--    If it returns { ok: true }, STOP and do not let the crons run.
--
-- 4. And prove the guard still lets a clean address through, so you have not
--    simply broken sending:
--      await canSendUserEmail('<a user_id NOT in the list>', { priority: 'critical' })
--    Expect: { ok: true }
`

writeFileSync(OUT, sql)
console.error(`\nwrote ${OUT}  (${sql.length} bytes, ${rows.length} suppression rows)`)
console.error('Paste that file into Supabase SQL Editor and Run it as one statement batch.')
