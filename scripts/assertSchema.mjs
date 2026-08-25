#!/usr/bin/env node
/**
 * Fail the build when the code queries schema that does not exist.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Four separate features have shipped into a void by the same mechanism: a
 * migration was written, never applied, and supabase-js returned
 * `{ data: null, error }` where nobody looked at `error`. Nothing threw,
 * nothing alerted, and the feature simply never ran.
 *
 *   email_suppression / email_queue / app_config   lifecycle mail unsuppressed
 *   subscription.feature_usage                     every non-AI free limit
 *   user_data.email_digest                         weekly digest and recap
 *   user_data.courses                              17 of 27 crons
 *
 * The last one had been dead since 2026-06-27 and is visible in production logs
 * as `42703 column user_data.courses does not exist`, several times a day,
 * for two months.
 *
 * ── Why it derives expectations instead of listing them ─────────────────────
 * A hand-maintained list of required tables rots, and it rots in the direction
 * that hurts: somebody adds `.select('..., courses')` and does not think to add
 * `courses` to the list, which is the exact inattention that caused the bug.
 * So this parses every `.from()` chain in api/ and lib/server/ and derives what
 * the code needs. Adding a reference automatically adds an expectation.
 *
 * ── What it checks ──────────────────────────────────────────────────────────
 *   - every table named in `.from('t')`
 *   - every column named in `.select()` on that chain
 *   - every column filtered on with .eq/.neq/.gt/.in/... on that chain
 *   - every TOP-LEVEL key of an .insert()/.update()/.upsert() object literal
 *     (top level only: nested keys are JSONB payload, not columns)
 *   - every function named in `.rpc('fn')`
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/assertSchema.mjs
 *   node scripts/assertSchema.mjs --json          machine-readable
 *   node scripts/assertSchema.mjs --list          print what the code expects
 *
 * Exit 0 clean, 1 on drift, 2 on a config problem. Read-only: it issues
 * information_schema reads and nothing else.
 *
 * In CI, run it against production before a deploy. It is one round trip plus a
 * parse of about 60 files, so it costs well under a second.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs'
import { join, relative } from 'path'

const ROOTS = ['api', 'lib/server']
const ALLOWLIST_PATH = 'scripts/schema-drift-allowlist.json'
const asJson = process.argv.includes('--json')
const listOnly = process.argv.includes('--list')

// ── 1. Derive what the code expects ─────────────────────────────────────────

const CHAIN = /\.from\(\s*['"]([a-zA-Z_]\w*)['"]\s*\)/g
const SELECT = /\.select\(\s*[`'"]([^`'"]*)[`'"]/g
const FILTER = /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|order|not)\(\s*['"](\w+)['"]/g
const RPC = /\.rpc\(\s*['"](\w+)['"]\s*(?:,\s*\{([^}]*)\})?/g

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(js|mjs)$/.test(e) && !/\.test\./.test(e)) out.push(p)
  }
  return out
}

/** Keys at brace-depth 1 of an object literal whose opening `{` was consumed. */
function topLevelKeys(seg) {
  let depth = 1, buf = ''
  for (const ch of seg) {
    if ('{[('.includes(ch)) depth++
    else if (']})'.includes(ch)) { depth--; if (depth === 0) break }
    else if (depth === 1) buf += ch
    if (buf.length > 4000) break
  }
  const keys = []
  for (const m of buf.matchAll(/(?:^|[,\n])\s*([A-Za-z_]\w*)\s*:/g)) keys.push(m[1])
  // shorthand `{ user_id, plan }`
  for (const m of buf.matchAll(/(?:^|[,\n])\s*([A-Za-z_]\w*)\s*(?=[,\n]|$)/g)) {
    if (!['true', 'false', 'null', 'undefined'].includes(m[1])) keys.push(m[1])
  }
  return keys
}

const expected = new Map()   // table -> Map(column -> Set(location))
const expectedRpcs = new Map()

function note(table, column, loc) {
  if (!expected.has(table)) expected.set(table, new Map())
  if (column === null) return
  const cols = expected.get(table)
  if (!cols.has(column)) cols.set(column, new Set())
  cols.get(column).add(loc)
}

for (const root of ROOTS) {
  if (!existsSync(root)) continue
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    const lineAt = (i) => src.slice(0, i).split('\n').length
    for (const m of src.matchAll(CHAIN)) {
      const table = m[1]
      const loc = `${relative(process.cwd(), file)}:${lineAt(m.index)}`
      note(table, null, loc)
      // Bound the window at the next .from() so chains do not bleed together.
      let window = src.slice(m.index + m[0].length, m.index + m[0].length + 900)
      const nxt = window.search(/\.from\(\s*['"]/)
      if (nxt > -1) window = window.slice(0, nxt)

      for (const s of window.matchAll(SELECT)) {
        if (['*', ''].includes(s[1].trim())) continue
        for (let col of s[1].split(/,(?![^(]*\))/)) {
          col = col.trim().split(':')[0].split('(')[0].trim()
          if (col && /^\w+$/.test(col) && col !== '*') note(table, col, loc)
        }
      }
      for (const f of window.matchAll(FILTER)) note(table, f[1], loc)
      for (const op of ['insert', 'update', 'upsert']) {
        const re = new RegExp(`\\.${op}\\(\\s*(?:\\[\\s*)?\\{`, 'g')
        for (const om of window.matchAll(re)) {
          for (const k of topLevelKeys(window.slice(om.index + om[0].length))) note(table, k, loc)
        }
      }
    }
    for (const m of src.matchAll(RPC)) {
      const loc = `${relative(process.cwd(), file)}:${lineAt(m.index)}`
      if (!expectedRpcs.has(m[1])) expectedRpcs.set(m[1], { locs: new Set(), args: new Set() })
      const e = expectedRpcs.get(m[1])
      e.locs.add(loc)
      // Argument names matter as much as the function name: PostgREST resolves
      // an overload by named arguments, so a renamed parameter is drift too.
      for (const am of (m[2] ?? '').matchAll(/(?:^|[,\n])\s*([A-Za-z_]\w*)\s*[:,\n]/g)) e.args.add(am[1])
    }
  }
}

if (listOnly) {
  for (const [t, cols] of [...expected].sort()) {
    console.log(`${t}  (${cols.size} column reference${cols.size === 1 ? '' : 's'})`)
    for (const c of [...cols.keys()].sort()) console.log(`    ${c}`)
  }
  console.log(`\nrpc: ${[...expectedRpcs.keys()].sort().join(', ') || '(none)'}`)
  process.exit(0)
}

// ── 2. Read the live schema ─────────────────────────────────────────────────

const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL_ || !KEY) {
  console.error('assertSchema: need SUPABASE_URL and SUPABASE_SERVICE_KEY.')
  console.error('In CI, point these at the environment you are about to deploy to.')
  process.exit(2)
}

async function probe(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (res.ok) return { ok: true }
  let code = null, message = (await res.text()).slice(0, 200)
  try { const j = JSON.parse(message); code = j.code ?? null; message = j.message ?? message } catch { /* raw */ }
  return { ok: false, status: res.status, code, message }
}

const problems = []

for (const [table, cols] of expected) {
  const t = await probe(`${table}?select=*&limit=0`)
  if (!t.ok) {
    problems.push({
      kind: 'table', table, column: null,
      locations: [...new Set([...cols.values()].flatMap(s => [...s]))].sort(),
      detail: `${t.code ?? t.status}: ${t.message}`,
    })
    continue
  }
  // One probe per column. Cheap, and it names the exact column rather than
  // failing the whole select and leaving you to bisect it by hand.
  for (const [col, locs] of cols) {
    const c = await probe(`${table}?select=${encodeURIComponent(col)}&limit=0`)
    if (!c.ok) {
      problems.push({ kind: 'column', table, column: col, locations: [...locs].sort(), detail: `${c.code ?? c.status}: ${c.message}` })
    }
  }
}

for (const [fn, e] of expectedRpcs) {
  // Probe with the argument NAMES the code actually passes, nulled out.
  // PostgREST resolves overloads by argument name, so probing with {} reports a
  // signature mismatch on a function that exists perfectly well. Sending the
  // real names checks the function AND its parameter names in one call, which
  // is what the code depends on anyway.
  const args = Object.fromEntries([...e.args].map(a => [a, null]))
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const body = await res.text()
  // PGRST202 with these names means no function of that name and shape exists.
  // Any other error (null-argument rejections, type errors) proves it resolved.
  if (res.status === 404 || body.includes('PGRST202')) {
    problems.push({
      kind: 'rpc', table: `rpc:${fn}`, column: null,
      locations: [...e.locs].sort(),
      detail: `not found with argument names (${[...e.args].join(', ') || 'none'}): ${body.slice(0, 140)}`,
    })
  }
}

// ── 3. Allowlist, so a known-pending migration does not block every build ────
//
// Deliberately not a silent skip. An entry needs a reason and an expiry, and an
// expired entry fails the build, so "we will apply it later" cannot quietly
// become "nobody ever applied it", which is how all four of these started.
let allowlist = { entries: [] }
if (existsSync(ALLOWLIST_PATH)) allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'))

const today = new Date().toISOString().slice(0, 10)
const keyOf = (p) => p.column ? `${p.table}.${p.column}` : p.table
const allowed = new Map(allowlist.entries.map(e => [e.ref, e]))

const blocking = [], waived = [], expired = []
for (const p of problems) {
  const e = allowed.get(keyOf(p))
  if (!e) blocking.push(p)
  else if (e.expires < today) expired.push({ ...p, entry: e })
  else waived.push({ ...p, entry: e })
}

if (asJson) {
  console.log(JSON.stringify({ blocking, waived, expired }, null, 2))
} else {
  const show = (p) => {
    console.log(`\n  ${keyOf(p)}`)
    console.log(`    ${p.detail}`)
    for (const l of p.locations.slice(0, 8)) console.log(`      ${l}`)
    if (p.locations.length > 8) console.log(`      ... and ${p.locations.length - 8} more`)
  }
  console.log(`schema assertion against ${URL_}`)
  console.log(`${expected.size} table(s) and ${[...expected.values()].reduce((n, c) => n + c.size, 0)} column reference(s) derived from ${ROOTS.join(', ')}\n`)

  if (blocking.length) {
    console.log('MISSING, and not allow-listed. The code queries these; production does not have them.')
    blocking.forEach(show)
  }
  if (expired.length) {
    console.log('\n\nALLOW-LISTED BUT EXPIRED. The waiver ran out; either apply the migration or renew it deliberately.')
    expired.forEach(p => { show(p); console.log(`      waiver expired ${p.entry.expires}: ${p.entry.reason}`) })
  }
  if (waived.length) {
    console.log('\n\nknown missing, waived:')
    waived.forEach(p => console.log(`  ${keyOf(p)}  until ${p.entry.expires}  ${p.entry.reason}`))
  }
  const failing = blocking.length + expired.length
  console.log(failing
    ? `\n\nFAIL: ${failing} reference(s) resolve to nothing.`
    : `\n\nPASS: every table, column and function the code queries exists.`)
}

process.exit(blocking.length + expired.length ? 1 : 0)
