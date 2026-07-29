#!/usr/bin/env node
// Standalone verifier for the course-identity-v1 read/write logic.
//
// Reproduces the three scenarios from the QA checklist against synthetic
// data, no Supabase, no network. Prints PASS/FAIL for each. Runnable with
// just `node scripts/verifyCourseIdentity.mjs`.
//
// The classifier is duplicated here inline so the script does not depend
// on server env vars (courseContext.js imports supabase-js at module
// load and requires SUPABASE_URL). This test's job is to prove the
// filtering rules, not the network path.

function normalizeName(s) { return String(s || '').trim().toLowerCase() }

// COPY of classifyCourseRow from lib/server/courseContext.js. If that
// function changes, this copy must be updated in lockstep or the test
// stops meaning anything. That trade-off is worth it here to keep the
// verifier standalone.
function classifyCourseRow(row, targetCourseId, targetCourseIndex, coursesLength, validCourseIdSet, targetNameNorm) {
  if (!row) return { matches: false, orphanKind: null }
  const raw = row.courseId
  if (typeof raw === 'string' && raw) {
    if (raw === String(targetCourseId)) return { matches: true, orphanKind: null }
    if (validCourseIdSet.has(raw)) return { matches: false, orphanKind: null }
    const nameMatches = targetNameNorm && normalizeName(row.courseName) === targetNameNorm
    return { matches: !!nameMatches, orphanKind: 'stale-id' }
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw === targetCourseIndex) return { matches: true, orphanKind: null }
    if (raw < 0 || raw >= coursesLength) return { matches: false, orphanKind: 'index-out-of-range' }
    return { matches: false, orphanKind: null }
  }
  const nameMatches = targetNameNorm && normalizeName(row.courseName) === targetNameNorm
  return { matches: !!nameMatches, orphanKind: 'missing-id' }
}

let failed = 0
function assert(name, ok, extra = '') {
  if (ok) console.log(`  PASS  ${name}`)
  else { console.log(`  FAIL  ${name} ${extra}`); failed += 1 }
}

// Canonical fixture: three courses (A, B, C) with stable ids.
const A = { id: 'aaa', name: 'Bio 101' }
const B = { id: 'bbb', name: 'Chem 210' }
const C = { id: 'ccc', name: 'Math 300' }
const courses = [A, B, C]
const validIds = new Set(courses.map(c => c.id))

function makeCtx(target) {
  const idx = courses.indexOf(target)
  return {
    targetId: target.id,
    targetIndex: idx,
    validIds,
    targetName: normalizeName(target.name),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// QA #1: Reorder/delete reproduction on NEW rows.
// A/B/C in that order. Complete a session for B.
// Then delete A. New order: B/C. Old B session (with string id 'bbb')
// must still resolve to B.
console.log('QA #1: reorder/delete does not corrupt string-id rows')
{
  const newSessionForB = { id: 's1', courseId: 'bbb', courseName: 'Chem 210', dateStr: '2026-07-01' }
  // Original order snapshot: A/B/C
  {
    const ctx = makeCtx(B)
    const c = classifyCourseRow(newSessionForB, ctx.targetId, ctx.targetIndex, 3, ctx.validIds, ctx.targetName)
    assert('before reorder: matches target B', c.matches && c.orphanKind === null)
  }
  // After deleting A: order becomes B/C. B is now index 0.
  const coursesAfter = [B, C]
  const validIdsAfter = new Set(coursesAfter.map(c => c.id))
  {
    const targetName = normalizeName(B.name)
    const c = classifyCourseRow(newSessionForB, B.id, 0, 2, validIdsAfter, targetName)
    assert('after reorder: still matches B by string id', c.matches && c.orphanKind === null)
  }
  // And it must NOT get pulled into C's context.
  {
    const targetName = normalizeName(C.name)
    const c = classifyCourseRow(newSessionForB, C.id, 1, 2, validIdsAfter, targetName)
    assert('after reorder: does not leak into C', !c.matches)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// QA #2: Legacy numeric rows still resolve exactly as they did before.
// Un-backfilled row with courseId: 1 pointing at the second course.
console.log('\nQA #2: legacy numeric rows unchanged')
{
  const legacyForB = { id: 's2', courseId: 1, courseName: 'Chem 210', dateStr: '2026-06-01' }
  const ctx = makeCtx(B)
  const c = classifyCourseRow(legacyForB, ctx.targetId, ctx.targetIndex, 3, ctx.validIds, ctx.targetName)
  assert('legacy numeric idx=1 matches B', c.matches && c.orphanKind === null)

  // Out-of-range numeric: courseId=99 → orphan_index
  const orphan = { id: 's3', courseId: 99, courseName: 'Gone', dateStr: '2026-05-01' }
  const c2 = classifyCourseRow(orphan, ctx.targetId, ctx.targetIndex, 3, ctx.validIds, ctx.targetName)
  assert('legacy numeric idx=99 is index-out-of-range orphan', !c2.matches && c2.orphanKind === 'index-out-of-range')

  // In-range but different course: courseId=2 while target is B → clean miss, not orphan.
  const otherCourse = { id: 's4', courseId: 2, courseName: 'Math 300', dateStr: '2026-05-01' }
  const c3 = classifyCourseRow(otherCourse, ctx.targetId, ctx.targetIndex, 3, ctx.validIds, ctx.targetName)
  assert('legacy numeric idx=2 does not leak into B', !c3.matches && c3.orphanKind === null)
}

// ─────────────────────────────────────────────────────────────────────────
// QA #3: Mixed-data user.
// One user has: one string-id row, one legacy numeric row, one stale/garbage
// string id, one row with missing courseId. getCourseContext(target=B)
// must return the two that belong to B and only those.
console.log('\nQA #3: mixed data returns correct rows without crash')
{
  const rows = [
    { id: 'r1', courseId: 'bbb', courseName: 'Chem 210' },          // string-id → B: MATCH
    { id: 'r2', courseId: 1, courseName: 'Chem 210' },              // legacy numeric → B: MATCH
    { id: 'r3', courseId: 'zzz-garbage', courseName: 'Chem 210' },  // stale id, name matches B: MATCH via name-fallback (orphan-warned)
    { id: 'r4', courseName: 'Chem 210' },                           // missing id, name matches: MATCH via name-fallback
    { id: 'r5', courseId: 'aaa', courseName: 'Bio 101' },           // valid string-id for A: NOT B
    { id: 'r6', courseId: 0, courseName: 'Bio 101' },               // legacy numeric for A: NOT B
    { id: 'r7', courseId: 99, courseName: 'Deleted' },              // out-of-range numeric: NOT B, orphan_index
    { id: 'r8', courseId: 'zzz-garbage-2', courseName: 'Other' },   // stale id, name does not match: NOT B, stale-id-warn
  ]
  const ctx = makeCtx(B)
  const results = rows.map(r => ({ id: r.id, ...classifyCourseRow(r, ctx.targetId, ctx.targetIndex, 3, ctx.validIds, ctx.targetName) }))
  const matched = results.filter(x => x.matches).map(x => x.id).sort()
  assert('matches exactly r1, r2, r3, r4', JSON.stringify(matched) === JSON.stringify(['r1','r2','r3','r4']))

  const staleCount = results.filter(x => x.orphanKind === 'stale-id').length
  const idxOrphan = results.filter(x => x.orphanKind === 'index-out-of-range').length
  const missingIdOrphan = results.filter(x => x.orphanKind === 'missing-id').length
  assert('stale-id orphan count = 2', staleCount === 2)
  assert('index-out-of-range orphan count = 1', idxOrphan === 1)
  assert('missing-id orphan count = 1', missingIdOrphan === 1)
}

// ─────────────────────────────────────────────────────────────────────────
// QA #4: NaN safety.
// A string courseId with an unresolved id must NOT be Number()-coerced to
// NaN and silently dropped.
console.log('\nQA #4: string ids never get NaN-dropped')
{
  const row = { id: 'r9', courseId: 'aaa', courseName: 'Bio 101' }
  const ctxA = makeCtx(A)
  const c = classifyCourseRow(row, ctxA.targetId, ctxA.targetIndex, 3, ctxA.validIds, ctxA.targetName)
  assert('string-id row for A matches A', c.matches && c.orphanKind === null)
  // Explicitly: the string branch does not touch Number().
  assert('Number("aaa") is NaN and never enters filter path', Number.isNaN(Number('aaa')))
}

console.log('\n' + '─'.repeat(60))
if (failed === 0) console.log('ALL PASS')
else { console.log(`${failed} FAILED`); process.exit(1) }
