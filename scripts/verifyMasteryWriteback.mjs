#!/usr/bin/env node
// Standalone verifier for the mastery-writeback-v1 build.
//
// Runs without Supabase or network. Env vars for the supabase client
// are stubbed so the module-load side-effects in courseContext.js do
// not blow up; no query is actually issued because we call the pure
// compute/prepare functions directly.
//
// Covers the QA checklist items from the Phase 2 spec:
//   1. Per-course scoping (no cross-course leakage).
//   2. Minimum-evidence threshold.
//   3. Legacy user with zero signals.
//   4. Recency decay.
//   5. Server-graded weighted higher than client-graded (same score).
//   6. Client self-supplied source is forced; scores are clamped.
//   7. Budget-aware topics rendering with 30 mastery-bearing topics.
//   8. HONEST ABSENCES intact when topic-signals load fails.
//   9. Attack test: forged batch claiming source='server_graded' with
//      out-of-range scores lands as client_graded_server_generated
//      with clamped values, and server-only types are rejected.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://harness.local'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'harness'

const { computeTopicMastery, formatCourseContextForPrompt } = await import('../lib/server/courseContext.js')
const { prepareClientSignalRows, SIGNAL_TYPE_SCORE_RULES } = await import('../lib/server/topicSignals.js')

let PASS = 0
let FAIL = 0

function assert(cond, label, detail) {
  if (cond) {
    console.log(`  PASS  ${label}`)
    PASS += 1
  } else {
    console.log(`  FAIL  ${label}`)
    if (detail) console.log('        ', typeof detail === 'string' ? detail : JSON.stringify(detail))
    FAIL += 1
  }
}

function section(name) {
  console.log(`\n== ${name} ==`)
}

const NOW = new Date('2026-07-29T12:00:00Z')

function iso(daysAgo) {
  return new Date(NOW.getTime() - daysAgo * 86400_000).toISOString()
}

function sig({ topic, type, score, daysAgo, source }) {
  return {
    topic,
    topic_key: topic.trim().toLowerCase(),
    signal_type: type,
    source: source || SIGNAL_TYPE_SCORE_RULES[type].source,
    score,
    created_at: iso(daysAgo),
  }
}

// ── 1. Per-course scoping (no cross-course leakage) ────────────────────────
section('1. Per-course scoping (no leakage across courses)')
{
  // computeTopicMastery is a pure per-course reducer; the loader query is
  // scoped by (user_id, course_id) at the source. We simulate the loader
  // returning ONLY the target course's rows and verify that a mastery
  // computed from those rows matches expectations. Then we verify that
  // if a caller ever mixed courses, the compute function would still
  // group by topic key (which is not enough on its own to prevent leak,
  // hence the SQL-level scoping in loadTopicSignals).
  const courseARows = [
    sig({ topic: 'Krebs cycle',   type: 'quiz_answer', score: 1, daysAgo: 1 }),
    sig({ topic: 'Krebs cycle',   type: 'quiz_answer', score: 1, daysAgo: 2 }),
    sig({ topic: 'Glycolysis',    type: 'teach_it_back', score: 0.9, daysAgo: 3 }),
  ]
  const courseAMastery = computeTopicMastery(courseARows, NOW)
  const krebs = courseAMastery.find(m => m.key === 'krebs cycle')
  assert(krebs && krebs.mastery >= 90 && krebs.sufficient, 'Course A: Krebs cycle mastery >= 90 with sufficient evidence', krebs)
  assert(!courseAMastery.some(m => m.key === 'quantum tunneling'), 'Course A: no topics from Course B leaked in', courseAMastery.map(m => m.key))

  // Prove that computeTopicMastery groups only by topic_key so if the loader
  // is broken (mixes courses), the compute layer would happily merge them.
  // This is by design; the SQL WHERE clause is the guarantee. We surface
  // this as documentation.
  const mixedRows = [
    ...courseARows,
    sig({ topic: 'Quantum tunneling', type: 'quiz_answer', score: 0, daysAgo: 1 }),
  ]
  const mixed = computeTopicMastery(mixedRows, NOW)
  assert(mixed.some(m => m.key === 'quantum tunneling'), 'Compute layer does not enforce course scope by itself (loader must); documented', null)

  // SQL scope proof: the loader query in courseContext.js filters by
  // (user_id, course_id) at the source. This is a static-code check.
  const src = await import('node:fs').then(m => m.promises.readFile('lib/server/courseContext.js', 'utf8'))
  const hasEqCourse = /\.from\('topic_signals'\)[\s\S]{0,400}\.eq\('user_id',\s*userId\)[\s\S]{0,400}\.eq\('course_id',\s*courseId\)/.test(src)
  assert(hasEqCourse, 'loadTopicSignals query scopes by (user_id, course_id)', null)
}

// ── 2. Minimum-evidence threshold ──────────────────────────────────────────
section('2. Minimum-evidence threshold (below MIN_EVIDENCE = insufficient_data)')
{
  const rows = [
    // One brain_dump_gap at weight 0.5, one day old → decayed weight ~0.483.
    // Below MIN_EVIDENCE = 1.0 → must render as insufficient_data.
    sig({ topic: 'Weak topic', type: 'brain_dump_gap', score: 0, daysAgo: 1 }),
  ]
  const m = computeTopicMastery(rows, NOW)
  const t = m[0]
  assert(t && t.level === 'insufficient_data' && t.mastery === null,
    'One brain_dump_gap alone renders as insufficient_data (mastery=null)', t)

  // Two quiz answers same-day → weight 0.8 × 1.0 × 2 = 1.6 → sufficient.
  const rows2 = [
    sig({ topic: 'Real topic', type: 'quiz_answer', score: 1, daysAgo: 0 }),
    sig({ topic: 'Real topic', type: 'quiz_answer', score: 0, daysAgo: 0 }),
  ]
  const m2 = computeTopicMastery(rows2, NOW)
  assert(m2[0].sufficient && m2[0].mastery === 50, 'Two same-day quiz answers cross MIN_EVIDENCE (50/100)', m2[0])
}

// ── 3. Legacy user (zero signals) ──────────────────────────────────────────
section('3. Legacy user with zero signals')
{
  const m = computeTopicMastery([], NOW)
  assert(m.length === 0, 'computeTopicMastery([]) returns empty array', m)

  // In assemble(), an empty masteryRows means buildTopics preserves the
  // pre-existing plan-derived topics behaviour. Static check on the code:
  const src = await import('node:fs').then(m => m.promises.readFile('lib/server/courseContext.js', 'utf8'))
  const preservesProvenance = /source:\s*'derived'/.test(src)
  assert(preservesProvenance, "Plan-derived rows still tagged source='derived' when no mastery", null)
}

// ── 4. Recency decay (same signal, recent vs old) ─────────────────────────
section('4. Recency decay (30-day half-life-ish)')
{
  const recent = computeTopicMastery([
    sig({ topic: 'Decay demo', type: 'quiz_answer', score: 1, daysAgo: 0 }),
    sig({ topic: 'Decay demo', type: 'quiz_answer', score: 1, daysAgo: 0 }),
  ], NOW)
  const old = computeTopicMastery([
    sig({ topic: 'Decay demo', type: 'quiz_answer', score: 1, daysAgo: 60 }),
    sig({ topic: 'Decay demo', type: 'quiz_answer', score: 1, daysAgo: 60 }),
  ], NOW)
  assert(recent[0].sufficient && !old[0].sufficient,
    'Recent 2× quiz answers cross MIN_EVIDENCE; same 2 at 60d decay below threshold',
    { recent: recent[0], old: old[0] })

  // Mixed: recent strong + old weak. The recent should dominate.
  const mixed = computeTopicMastery([
    sig({ topic: 'Mixed', type: 'quiz_answer', score: 1, daysAgo: 0 }),
    sig({ topic: 'Mixed', type: 'quiz_answer', score: 1, daysAgo: 0 }),
    sig({ topic: 'Mixed', type: 'quiz_answer', score: 0, daysAgo: 60 }),
    sig({ topic: 'Mixed', type: 'quiz_answer', score: 0, daysAgo: 60 }),
  ], NOW)
  assert(mixed[0].mastery > 70, 'Recent strong dominates old weak in mastery calculation', mixed[0])
}

// ── 5. Server-graded weighted higher than client-graded ───────────────────
section('5. Weight differential (server_graded 1.0 vs client_graded_server_generated 0.8)')
{
  // Two topics, each with two same-day full-score signals: teach_it_back
  // (server, weight 1.0) vs quiz_answer (client, weight 0.8). Both should
  // hit mastery = 100 (since score is 1 in both). The evidence should
  // differ: teach ~ 2.0, quiz ~ 1.6.
  const teach = computeTopicMastery([
    sig({ topic: 'Teach', type: 'teach_it_back', score: 1, daysAgo: 0 }),
    sig({ topic: 'Teach', type: 'teach_it_back', score: 1, daysAgo: 0 }),
  ], NOW)
  const quiz = computeTopicMastery([
    sig({ topic: 'Quiz', type: 'quiz_answer', score: 1, daysAgo: 0 }),
    sig({ topic: 'Quiz', type: 'quiz_answer', score: 1, daysAgo: 0 }),
  ], NOW)
  assert(teach[0].evidence > quiz[0].evidence,
    `Server-graded evidence (${teach[0].evidence}) > client-graded (${quiz[0].evidence})`,
    { teach: teach[0], quiz: quiz[0] })

  // Mixed contest: one teach_it_back score=0 vs one quiz_answer score=1
  // (same topic, same day). Teach should dominate the weighted mean.
  const contest = computeTopicMastery([
    sig({ topic: 'Contest', type: 'teach_it_back', score: 0, daysAgo: 0 }),
    sig({ topic: 'Contest', type: 'quiz_answer',   score: 1, daysAgo: 0 }),
  ], NOW)
  // (1.0 * 0 + 0.8 * 1) / (1.0 + 0.8) = 0.444 → 44
  assert(contest[0].mastery < 50, 'Server_graded 0 dominates client_graded 1 (44/100)', contest[0])
}

// ── 6. Client self-supplied source is forced, scores clamped ──────────────
section('6. prepareClientSignalRows enforces trust model')
{
  const forged = [
    { signalType: 'quiz_answer', courseId: 'c1', courseName: 'Chem 101', topic: 'Krebs cycle',   rawScore: 1,    source: 'server_graded' },
    { signalType: 'quiz_answer', courseId: 'c1', courseName: 'Chem 101', topic: 'Glycolysis',    rawScore: 999,  source: 'server_graded' },
    { signalType: 'quiz_answer', courseId: 'c1', courseName: 'Chem 101', topic: 'Overshoot',     rawScore: -5,   source: 'server_graded' },
    { signalType: 'quiz_answer', courseId: 'c1', courseName: 'Chem 101', topic: '  Whitespace  ',rawScore: 0.5,  source: 'server_graded' },
  ]
  const { rows, errors } = prepareClientSignalRows('u1', forged)
  assert(rows.length === 4 && errors.length === 0, 'All 4 valid entries written', { rows: rows.length, errors })
  assert(rows.every(r => r.source === 'client_graded_server_generated'),
    "Every row source forced to 'client_graded_server_generated' regardless of body", rows.map(r => r.source))
  assert(rows[1].score === 1 && rows[2].score === 0, 'Scores clamped to [0, 1] (999→1, -5→0)', { s1: rows[1].score, s2: rows[2].score })
  assert(rows[3].topic === 'Whitespace', 'Topic trimmed', rows[3].topic)
}

// ── 7. Server-only signal types rejected through client path ──────────────
section('7. Server-only signal_type refused via client batch')
{
  const attempt = [
    { signalType: 'brain_dump_gap',       courseId: 'c1', courseName: 'C', topic: 'x', rawScore: 0 },
    { signalType: 'teach_it_back',        courseId: 'c1', courseName: 'C', topic: 'y', rawScore: 1 },
    { signalType: 'repair_misconception', courseId: 'c1', courseName: 'C', topic: 'z', rawScore: 0 },
    { signalType: 'quiz_answer',          courseId: 'c1', courseName: 'C', topic: 'ok', rawScore: 1 },
  ]
  const { rows, errors } = prepareClientSignalRows('u1', attempt)
  assert(rows.length === 1 && rows[0].topic === 'ok', 'Only the client-writable type landed', rows)
  const rejectedCodes = errors.filter(e => e.code === 'server_only_type').length
  assert(rejectedCodes === 3, 'Exactly 3 server-only rejections logged', errors)
}

// ── 8. Attack: numeric courseId rejected ───────────────────────────────────
section('8. Numeric courseId rejected (no legacy indexes in new writes)')
{
  const attempt = [
    { signalType: 'quiz_answer', courseId: 0, courseName: 'C', topic: 't', rawScore: 1 },
    { signalType: 'quiz_answer', courseId: '0', courseName: 'C', topic: 't', rawScore: 1 },
    { signalType: 'quiz_answer', courseId: '', courseName: 'C', topic: 't', rawScore: 1 },
    { signalType: 'quiz_answer', courseId: 'stable-uuid-1', courseName: 'C', topic: 't', rawScore: 1 },
  ]
  const { rows, errors } = prepareClientSignalRows('u1', attempt)
  assert(rows.length === 2, 'Numeric and empty courseIds rejected; both string ids accepted', { rows: rows.length, errors })
  const badIdErrs = errors.filter(e => e.code === 'bad_course_id').length
  assert(badIdErrs === 2, 'Two bad_course_id errors logged', errors)
}

// ── 9. Budget respect: 30 mastery-bearing topics still trim correctly ─────
section('9. Budget-aware rendering with 30 mastery-bearing topics')
{
  // Build a synthetic brain context. We don't run getCourseContext; we
  // construct a minimal ctx object that mirrors the shape the renderer
  // expects, focusing on topics.items.
  const items = []
  for (let i = 0; i < 30; i++) {
    items.push({
      name: `Topic number ${i}`,
      mastery: i * 3,
      masteryLevel: i * 3 < 35 ? 'weak' : i * 3 < 65 ? 'developing' : i * 3 < 85 ? 'solid' : 'strong',
      evidence: 2.5,
      signalCount: 4,
      trend: 'flat',
      isStruggle: false,
      sessionCount: 0,
      lastTouchedAt: '2026-07-25T00:00:00Z',
      provenance: 'session_result',
      source: 'signals',
    })
  }
  const ctx = {
    identity: { name: 'Chem 101', courseId: 'c1', provenance: 'user_data' },
    grades: { effectiveCurrentGrade: null, computedCurrentGradePct: null, studentEnteredOverride: null, discrepancyNote: null, targetGrade: { letter: null, pct: null }, gap: null, components: [] },
    deadlines: { items: [] },
    topics: { items },
    sessions: { recent: [], recentRecallAvg: null, brainDumps: [], warnings: [] },
    plan: null,
    materials: null,
    warnings: [],
    missing: [
      { section: 'deadlines', reason: 'no_data', hint: 'No exam date' },
      { section: 'plan', reason: 'no_coach_plan', hint: 'No coach plan.' },
    ],
    meta: { userId: 'u1', courseId: 'c1', generatedAt: NOW.toISOString(), sectionsRequested: ['identity','grades','deadlines','topics','sessions','plan','materials'], budgetChars: 30000, killswitchState: 'enabled', _internal: {} },
  }

  const bigPrompt = formatCourseContextForPrompt(ctx, { budgetChars: 30000 })
  const smallPrompt = formatCourseContextForPrompt(ctx, { budgetChars: 800 })

  assert(bigPrompt.includes('TOPICS:'), 'Large-budget prompt includes TOPICS header', null)
  assert(bigPrompt.includes('mastery=0/100 (weak)'), 'Large-budget prompt shows the weakest topic first', null)
  assert(bigPrompt.includes('mastery=87/100 (strong)'), 'Large-budget prompt shows the strongest topic (kept intact when budget allows)', null)
  assert(smallPrompt.includes('TOPICS:'), 'Small-budget prompt still emits TOPICS section', null)
  assert(/more topics trimmed for budget/.test(smallPrompt), 'Small-budget prompt trims from the bottom', null)
  assert(smallPrompt.includes('mastery=0/100 (weak)'), 'Small-budget prompt keeps the lowest-mastery row (weak-first order)', null)
  assert(!/mastery=87\/100/.test(smallPrompt), 'Small-budget prompt drops highest-mastery rows first', null)

  // HONEST ABSENCES must survive.
  assert(bigPrompt.includes('HONEST ABSENCES'), 'HONEST ABSENCES block still emitted', null)
  assert(smallPrompt.includes('HONEST ABSENCES'), 'HONEST ABSENCES preserved even under small budget (fixed section)', null)

  // GRADES section is fixed; deadlines is fixed; neither should ever be
  // partially trimmed.
  assert(bigPrompt.includes('DEADLINES:') && smallPrompt.includes('DEADLINES:'), 'Deadlines section present under both budgets', null)
}

// ── 10. HONEST ABSENCES intact when topic_signals load fails ──────────────
section('10. Empty mastery + plan-derived topics still render honestly')
{
  const items = [
    // Two plan-derived rows, no mastery. Simulates a legacy user or a
    // topic_signals load error path (loadError already becomes a warning).
    { name: 'Priority topic A', isStruggle: false, sessionCount: 0, lastTouchedAt: null, provenance: 'coach_plan.plan.priorityTopics', source: 'derived' },
    { name: 'Weekly focus B',   isStruggle: false, sessionCount: 0, lastTouchedAt: null, provenance: 'coach_plan.weeklyFocus.keyTopics', source: 'derived' },
  ]
  const ctx = {
    identity: { name: 'Bio 201', courseId: 'c1', provenance: 'user_data' },
    grades: { effectiveCurrentGrade: null, computedCurrentGradePct: null, studentEnteredOverride: null, discrepancyNote: null, targetGrade: { letter: null, pct: null }, gap: null, components: [] },
    deadlines: { items: [] },
    topics: { items },
    sessions: { recent: [], recentRecallAvg: null, brainDumps: [], warnings: [] },
    plan: null,
    materials: null,
    warnings: [{ code: 'topic_signals_load_failed', detail: 'PGRST-simulated' }],
    missing: [{ section: 'plan', reason: 'no_coach_plan', hint: 'No coach plan.' }],
    meta: { userId: 'u1', courseId: 'c1', generatedAt: NOW.toISOString(), sectionsRequested: ['topics'], budgetChars: 30000, killswitchState: 'enabled', _internal: {} },
  }
  const out = formatCourseContextForPrompt(ctx, { budgetChars: 30000 })
  assert(out.includes('Priority topic A') && out.includes('Weekly focus B'),
    'Plan-derived topics render even when mastery is unavailable', null)
  assert(!/mastery=/.test(out.split('TOPICS:')[1].split('\n\n')[0]),
    'No mastery numbers fabricated in the TOPICS block when no signals present', null)
  assert(out.includes('topic_signals_load_failed'), 'Load-failure warning surfaced in DATA WARNINGS', null)
}

// ── 11. Trend calculation ─────────────────────────────────────────────────
section('11. Trend calculation (needs >= 6 signals)')
{
  // Recent 3 = 1,1,1 mean 1.0 ; prior 3 = 0,0,0 mean 0.0 → delta 1.0 → 'up'
  const upRows = [
    sig({ topic: 'Trend up', type: 'quiz_answer', score: 1, daysAgo: 0 }),
    sig({ topic: 'Trend up', type: 'quiz_answer', score: 1, daysAgo: 1 }),
    sig({ topic: 'Trend up', type: 'quiz_answer', score: 1, daysAgo: 2 }),
    sig({ topic: 'Trend up', type: 'quiz_answer', score: 0, daysAgo: 3 }),
    sig({ topic: 'Trend up', type: 'quiz_answer', score: 0, daysAgo: 4 }),
    sig({ topic: 'Trend up', type: 'quiz_answer', score: 0, daysAgo: 5 }),
  ]
  const upM = computeTopicMastery(upRows, NOW)
  assert(upM[0].trend === 'up', "Six signals with recent stronger than prior => trend 'up'", upM[0])

  const flatRows = [
    sig({ topic: 'Flat', type: 'quiz_answer', score: 1, daysAgo: 0 }),
    sig({ topic: 'Flat', type: 'quiz_answer', score: 1, daysAgo: 1 }),
  ]
  const flatM = computeTopicMastery(flatRows, NOW)
  assert(flatM[0].trend === 'new', "Fewer than 6 signals => trend 'new'", flatM[0])
}

console.log(`\n== TOTAL ==`)
console.log(`  ${PASS} pass, ${FAIL} fail`)
if (FAIL > 0) process.exit(1)
