#!/usr/bin/env node
// One-time backfill: stamp stable string course.id on legacy JSONB rows
// and any nullable course_id column that has been added by the
// 20260728_course_identity_v1.sql migration.
//
// Covers:
//   1. user_data.completed_sessions[]     rewrite numeric courseId -> string id
//   2. user_data.session_recalls[]        rewrite numeric courseId -> string id
//   3. user_data.syllabus_events[]        stamp courseId next to existing courseIdx
//   4. public.struggle_topics.course_id   stamp course_id column (0 rows in prod)
//
// Every rewrite preserves the original numeric value in legacyCourseIndex
// (JSONB rows only) so a later analysis can tell what the row used to be.
//
// Discipline:
//   - Cross-check by courseName before trusting a numeric index. Never
//     trust the index blindly, because the whole reason the bug exists
//     is that the index was trusted.
//   - Rows with no resolvable course are left UNTOUCHED and counted.
//   - Rows that already carry a valid string courseId are left UNTOUCHED
//     and counted as already-migrated.
//   - Dry-run is the default. Actual writes require --execute.
//
// Not deployed. Run locally with:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/backfillCourseIds.mjs [--execute]

import { createClient } from '@supabase/supabase-js'

const EXECUTE = process.argv.includes('--execute')
const VERBOSE = process.argv.includes('--verbose')

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  process.exit(1)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

function normalizeName(s) {
  return String(s || '').trim().toLowerCase()
}

function line(title) {
  console.log('\n' + '='.repeat(80))
  console.log(title)
  console.log('='.repeat(80))
}

// Resolve a JSONB row's course to its stable string id.
//
// Returns:
//   { resolvedId: string | null, method: 'already-string' | 'by-index-with-name' | 'by-name' | 'general' | 'unresolvable' }
function resolveRow(row, courses, opts = {}) {
  const rawId = row?.courseId
  const rawName = row?.courseName

  // 1. Already a valid string id -> leave alone.
  if (typeof rawId === 'string' && rawId) {
    const hit = courses.find(c => c && String(c.id) === rawId)
    if (hit) return { resolvedId: rawId, method: 'already-string' }
    // Garbage/stale string id. Fall through to name matching.
  }

  // Special-case: an unscoped syllabus event with courseName === 'General'
  // has no course by design. Do not try to resolve; count separately.
  if (opts.treatGeneralAsScoped === false && normalizeName(rawName) === 'general') {
    return { resolvedId: null, method: 'general' }
  }

  // 2. Numeric index -> cross-check name before trusting.
  if (typeof rawId === 'number' && Number.isFinite(rawId) && rawId >= 0 && rawId < courses.length) {
    const atIdx = courses[rawId]
    if (atIdx && atIdx.id) {
      const nameHere = normalizeName(atIdx.name)
      const nameGiven = normalizeName(rawName)
      if (!nameGiven || nameHere === nameGiven) {
        return { resolvedId: atIdx.id, method: 'by-index-with-name' }
      }
    }
  }

  // 3. Fall back to unique name match.
  const target = normalizeName(rawName)
  if (target) {
    const matches = courses.filter(c => c && normalizeName(c.name) === target && c.id)
    if (matches.length === 1) return { resolvedId: matches[0].id, method: 'by-name' }
  }

  return { resolvedId: null, method: 'unresolvable' }
}

// Rewrite one JSONB array. Returns { rewritten, counts, sample }.
// The value already-string rows carry through unchanged; numeric rows
// get { ...row, courseId: <string>, legacyCourseIndex: <original number> }.
function backfillArray(arr, courses, opts = {}) {
  const counts = {
    total: 0,
    alreadyString: 0,
    byIndexWithName: 0,
    byName: 0,
    general: 0,
    unresolvable: 0,
  }
  const rewritten = []
  const sample = { rewrites: [], unresolvable: [] }
  for (const row of arr || []) {
    counts.total += 1
    const resolved = resolveRow(row, courses, opts)
    if (resolved.method === 'already-string') {
      counts.alreadyString += 1
      rewritten.push(row)
      continue
    }
    if (resolved.method === 'general') {
      counts.general += 1
      rewritten.push(row)
      continue
    }
    if (!resolved.resolvedId) {
      counts.unresolvable += 1
      rewritten.push(row)
      if (sample.unresolvable.length < 3) {
        sample.unresolvable.push({ courseId: row.courseId, courseName: row.courseName })
      }
      continue
    }
    if (resolved.method === 'by-index-with-name') counts.byIndexWithName += 1
    if (resolved.method === 'by-name') counts.byName += 1
    const next = {
      ...row,
      courseId: resolved.resolvedId,
    }
    if (typeof row.courseId === 'number' && Number.isFinite(row.courseId)) {
      next.legacyCourseIndex = row.courseId
    }
    rewritten.push(next)
    if (sample.rewrites.length < 3) {
      sample.rewrites.push({
        from: row.courseId,
        to: resolved.resolvedId,
        name: row.courseName,
        method: resolved.method,
      })
    }
  }
  return { rewritten, counts, sample }
}

async function main() {
  line(EXECUTE ? 'BACKFILL: --execute MODE (writes will happen)' : 'BACKFILL: dry-run mode (no writes)')

  // Fetch every user_data row. Small enough (< 200 users) that we can just
  // load them all. If this ever grows, page it.
  const { data: userDataRows, error: udErr } = await supabase
    .from('user_data')
    .select('user_id, plan, completed_sessions, session_recalls, syllabus_events')
  if (udErr) {
    console.error('user_data load failed:', udErr)
    process.exit(1)
  }

  const perUser = []
  const totals = {
    completed_sessions:   { total: 0, alreadyString: 0, byIndexWithName: 0, byName: 0, unresolvable: 0 },
    session_recalls:      { total: 0, alreadyString: 0, byIndexWithName: 0, byName: 0, unresolvable: 0 },
    syllabus_events:      { total: 0, alreadyString: 0, byIndexWithName: 0, byName: 0, general: 0, unresolvable: 0 },
  }
  let writeErrors = 0

  for (const ud of (userDataRows || [])) {
    const courses = Array.isArray(ud.plan?.courses) ? ud.plan.courses : []

    const cs = backfillArray(ud.completed_sessions || [], courses)
    const sr = backfillArray(ud.session_recalls || [], courses)
    const se = backfillArray(ud.syllabus_events || [], courses, { treatGeneralAsScoped: false })

    // Roll into totals.
    for (const k of ['total', 'alreadyString', 'byIndexWithName', 'byName', 'unresolvable']) {
      totals.completed_sessions[k] += cs.counts[k]
      totals.session_recalls[k]    += sr.counts[k]
    }
    for (const k of ['total', 'alreadyString', 'byIndexWithName', 'byName', 'general', 'unresolvable']) {
      totals.syllabus_events[k] += se.counts[k]
    }

    const hadWork =
      cs.counts.byIndexWithName + cs.counts.byName +
      sr.counts.byIndexWithName + sr.counts.byName +
      se.counts.byIndexWithName + se.counts.byName > 0

    if (hadWork || cs.counts.unresolvable || sr.counts.unresolvable || se.counts.unresolvable) {
      perUser.push({ user_id: ud.user_id, cs, sr, se, courses: courses.map(c => ({ id: c?.id, name: c?.name })) })
    }

    if (EXECUTE && hadWork) {
      const patch = {}
      if (cs.counts.byIndexWithName + cs.counts.byName > 0) patch.completed_sessions = cs.rewritten
      if (sr.counts.byIndexWithName + sr.counts.byName > 0) patch.session_recalls    = sr.rewritten
      if (se.counts.byIndexWithName + se.counts.byName > 0) patch.syllabus_events    = se.rewritten
      const { error: upErr } = await supabase
        .from('user_data')
        .update(patch)
        .eq('user_id', ud.user_id)
      if (upErr) {
        writeErrors += 1
        console.error(`WRITE FAILED for user ${ud.user_id}:`, upErr.message)
      }
    }
  }

  // ── struggle_topics (0 rows expected as of 2026-07-28) ──
  const st = { total: 0, alreadyString: 0, byIndexWithName: 0, byName: 0, unresolvable: 0, missingUser: 0 }
  const stExecutedUpdates = []
  const { data: strugRows, error: stErr } = await supabase
    .from('struggle_topics')
    .select('user_id, course_name, topic, course_id')
  if (stErr) {
    console.warn('struggle_topics load failed (may indicate migration not yet run):', stErr.message)
  } else {
    // Build a per-user course map once.
    const userCoursesById = new Map((userDataRows || []).map(u => [
      u.user_id,
      Array.isArray(u.plan?.courses) ? u.plan.courses : [],
    ]))
    for (const row of (strugRows || [])) {
      st.total += 1
      if (typeof row.course_id === 'string' && row.course_id) {
        st.alreadyString += 1
        continue
      }
      const courses = userCoursesById.get(row.user_id)
      if (!courses) { st.missingUser += 1; continue }
      const target = normalizeName(row.course_name)
      const matches = courses.filter(c => c && normalizeName(c.name) === target && c.id)
      if (matches.length === 1) {
        st.byName += 1
        stExecutedUpdates.push({ user_id: row.user_id, course_name: row.course_name, topic: row.topic, course_id: matches[0].id })
      } else {
        st.unresolvable += 1
      }
    }
    if (EXECUTE) {
      for (const u of stExecutedUpdates) {
        const { error: upErr } = await supabase
          .from('struggle_topics')
          .update({ course_id: u.course_id })
          .eq('user_id', u.user_id)
          .eq('course_name', u.course_name)
          .eq('topic', u.topic)
        if (upErr) {
          writeErrors += 1
          console.error(`struggle_topics update failed for (${u.user_id}, ${u.course_name}, ${u.topic}):`, upErr.message)
        }
      }
    }
  }

  // ── Per-user report ──
  line('PER-USER BREAKDOWN')
  if (!perUser.length) {
    console.log('No user has rows requiring backfill or attention.')
  }
  for (const p of perUser) {
    console.log(`\nuser_id: ${p.user_id}`)
    console.log(`  courses (${p.courses.length}): ${p.courses.map(c => c.id).filter(Boolean).join(', ')}`)
    const fmt = (name, c) =>
      `  ${name.padEnd(20)} total=${c.total} already-string=${c.alreadyString} by-index=${c.byIndexWithName} by-name=${c.byName}${c.general !== undefined ? ` general=${c.general}` : ''} unresolvable=${c.unresolvable}`
    console.log(fmt('completed_sessions', p.cs.counts))
    console.log(fmt('session_recalls', p.sr.counts))
    console.log(fmt('syllabus_events', p.se.counts))
    if (VERBOSE) {
      const dump = (label, sample) => {
        if (sample.rewrites.length) console.log(`    ${label} sample rewrites:`, JSON.stringify(sample.rewrites))
        if (sample.unresolvable.length) console.log(`    ${label} sample unresolvable:`, JSON.stringify(sample.unresolvable))
      }
      dump('completed_sessions', p.cs.sample)
      dump('session_recalls', p.sr.sample)
      dump('syllabus_events', p.se.sample)
    }
  }

  // ── Totals ──
  line('TOTALS')
  const dump = (name, c) => console.log(
    `${name.padEnd(20)} total=${c.total} already-string=${c.alreadyString} by-index=${c.byIndexWithName} by-name=${c.byName}${c.general !== undefined ? ` general=${c.general}` : ''} unresolvable=${c.unresolvable}`
  )
  dump('completed_sessions', totals.completed_sessions)
  dump('session_recalls', totals.session_recalls)
  dump('syllabus_events', totals.syllabus_events)
  dump('struggle_topics', st)

  if (writeErrors) console.log(`\nWRITE ERRORS: ${writeErrors}`)
  if (!EXECUTE) console.log('\nDry-run only. Re-run with --execute to apply.')
}

main().catch(err => { console.error(err); process.exit(1) })
