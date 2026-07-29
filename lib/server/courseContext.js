// The course brain.
//
// getCourseContext(userId, courseId) is the single server-side assembler
// for everything the app knows about one student's one course. Every AI
// endpoint that touches course data should get its context from here.
//
// Non-negotiables:
//   - courseId is required at the module boundary and must be the stable
//     string course.id from plan.courses[]. The module throws if it's
//     missing or does not resolve to a course this user owns.
//   - No fabricated data. Every section is either populated with real
//     data + provenance, or listed in `missing` with an honest reason.
//   - Cross-course leakage is the worst failure. Every query is scoped
//     by (userId, courseId) at the source, not filtered downstream.
//
// The killswitch:
//   `course_brain_materials` in app_config.feature_flags disables the
//   materials section. Defensive: missing table, missing row, missing
//   key, or any query error → treated as ENABLED. The kill switch only
//   fires on an explicit `false`.

import { createClient } from '@supabase/supabase-js'
import { getRelevantExcerpts } from './uploadContext.js'
import { SIGNAL_TYPE_SCORE_RULES } from './topicSignals.js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const DEFAULT_BUDGET_CHARS = 30000
const DEFAULT_SECTIONS = ['identity', 'deadlines', 'grades', 'topics', 'sessions', 'plan', 'materials']
const SESSIONS_CAP = 20
const KILLSWITCH_TTL_MS = 60_000

// Mastery computation constants. The window + row limit are the read-side
// bound on topic_signals size; deletion of old rows is deliberately not
// done in v1, so old data simply falls out of scope for the current
// prompt. Half-life of the decay function (e^(-days/30)) is ~20.8 days.
const SIGNAL_WINDOW_DAYS = 180
const SIGNAL_ROW_LIMIT = 2000
const MASTERY_DECAY_DAYS = 30
// Minimum sum of (weight × decay) before we render a numeric mastery
// score. Below this, the topic is shown as "insufficient data" so we
// never fabricate a number from a single stale signal. 1.0 is roughly
// one full-strength recent server-graded signal, or two recent quiz
// answers, or three or four older signals.
const MIN_EVIDENCE = 1.0

let _killswitchCache = null
let _killswitchFetchedAt = 0

// Per-request memoization. The request object (or any stable key) is
// used to scope the cache; a fresh request re-assembles. Two AI calls
// in one request share.
const _requestCache = new WeakMap()

function normalizeName(s) {
  return String(s || '').trim().toLowerCase()
}

function isDatePast(dateStr, now = new Date()) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  return d < now
}

// Returns true if materials are enabled. Any read failure degrades to
// enabled — the killswitch only trips on an explicit false.
async function materialsEnabled() {
  const now = Date.now()
  if (_killswitchCache !== null && now - _killswitchFetchedAt < KILLSWITCH_TTL_MS) {
    return _killswitchCache
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('app_config')
      .select('feature_flags')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      _killswitchCache = true
      _killswitchFetchedAt = now
      return true
    }
    const flags = data?.feature_flags ?? {}
    if ('course_brain_materials' in flags && flags.course_brain_materials === false) {
      _killswitchCache = false
    } else {
      _killswitchCache = true
    }
    _killswitchFetchedAt = now
    return _killswitchCache
  } catch {
    _killswitchCache = true
    _killswitchFetchedAt = now
    return true
  }
}

// Loads the user's plan and pulls the target course out. Returns
// { plan, course, courseIndex } or throws with an actionable error.
async function loadUserAndCourse(userId, courseId) {
  const { data, error } = await supabaseAdmin
    .from('user_data')
    .select('plan, syllabus_events, completed_sessions, session_recalls, coach_plans')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`getCourseContext: user_data load failed: ${error.message}`)
  if (!data) throw new Error(`getCourseContext: no user_data row for user ${userId}`)

  const courses = Array.isArray(data.plan?.courses) ? data.plan.courses : []
  const courseIndex = courses.findIndex(c => c && String(c.id) === String(courseId))
  if (courseIndex === -1) {
    throw new Error(`getCourseContext: course ${courseId} not found for user ${userId}`)
  }
  return {
    plan: data.plan,
    course: courses[courseIndex],
    courseIndex,
    courseList: courses,
    coursesLength: courses.length,
    syllabusEvents: Array.isArray(data.syllabus_events) ? data.syllabus_events : [],
    completedSessions: Array.isArray(data.completed_sessions) ? data.completed_sessions : [],
    sessionRecalls: Array.isArray(data.session_recalls) ? data.session_recalls : [],
    coachPlans: data.coach_plans ?? {},
    firstName: data.plan?.firstName,
    learningStyle: data.plan?.learningStyle,
    yearLevel: data.plan?.yearLevel,
  }
}

// Classify one JSONB row (session or recall) against the target course.
//
// Dual-branch discipline: string ids are matched first, numeric indexes
// are legacy behavior kept exactly as-is so un-backfilled rows continue to
// resolve. A string id that does NOT match any course in the user's
// current plan is a stale-id orphan: fall back to case-insensitive
// courseName match, and count it either way.
//
// Returns:
//   { matches: boolean, orphanKind: null | 'stale-id' | 'index-out-of-range' | 'missing-id' }
function classifyCourseRow(row, targetCourseId, targetCourseIndex, coursesLength, validCourseIdSet, targetNameNorm) {
  if (!row) return { matches: false, orphanKind: null }
  const raw = row.courseId

  // String branch: newly-written rows and successfully-backfilled rows.
  if (typeof raw === 'string' && raw) {
    if (raw === String(targetCourseId)) return { matches: true, orphanKind: null }
    if (validCourseIdSet.has(raw)) return { matches: false, orphanKind: null }
    // Stale/garbage string id. Row does not point to any course this user
    // owns. Fall back to name match and warn.
    const nameMatches = targetNameNorm && normalizeName(row.courseName) === targetNameNorm
    return { matches: !!nameMatches, orphanKind: 'stale-id' }
  }

  // Numeric branch: legacy un-backfilled rows.
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw === targetCourseIndex) return { matches: true, orphanKind: null }
    if (raw < 0 || raw >= coursesLength) return { matches: false, orphanKind: 'index-out-of-range' }
    // In-range but points to a different course by index. Clean miss.
    return { matches: false, orphanKind: null }
  }

  // Missing / non-string non-number courseId. Zero rows in prod today but
  // stay defensive.
  const nameMatches = targetNameNorm && normalizeName(row.courseName) === targetNameNorm
  return { matches: !!nameMatches, orphanKind: 'missing-id' }
}

// Looks up a course's stable id from its (case-insensitive, trimmed)
// name. Returns null if no unique match. Exported for the migration
// so client sites that only have a name can bridge to courseId.
export async function resolveCourseId(userId, courseName) {
  if (!userId || !courseName) return null
  const target = normalizeName(courseName)
  if (!target) return null
  const { data, error } = await supabaseAdmin
    .from('user_data')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  const courses = Array.isArray(data.plan?.courses) ? data.plan.courses : []
  const matches = courses.filter(c => c && normalizeName(c.name) === target)
  if (matches.length !== 1) return null
  return matches[0].id ?? null
}

// ── Section builders ─────────────────────────────────────────────────────────

function buildIdentity(course) {
  return {
    courseId: course.id,
    name: course.name,
    code: course.code || null,
    difficulty: course.difficulty || null,
    targetGradeLetter: course.targetGrade || null,
    classSchedule: course.classSchedule || null,
    provenance: 'user_data',
  }
}

function buildDeadlines(course, syllabusEvents, courseName, validCourseIdSet = null) {
  const items = []
  const now = new Date()

  if (course.examDate) {
    items.push({
      title: 'Course exam',
      date: course.examDate,
      type: 'exam',
      weight: null,
      status: isDatePast(course.examDate, now) ? 'past' : 'upcoming',
      source: 'course.examDate',
    })
  }

  if (Array.isArray(course.exams)) {
    for (const e of course.exams) {
      if (!e?.date) continue
      items.push({
        title: e.name || 'Exam',
        date: e.date,
        type: 'exam',
        weight: e.weight ?? null,
        status: isDatePast(e.date, now) ? 'past' : 'upcoming',
        source: 'course.exams[]',
        confidence: e.confidence || null,
        yearAmbiguous: !!e.yearAmbiguous,
        sourceSnippet: e.sourceSnippet || null,
      })
    }
  }

  const targetName = normalizeName(courseName)
  const targetId = String(course.id || '')
  for (const ev of syllabusEvents) {
    if (!ev?.date) continue
    // Prefer stable courseId when present AND valid in the current plan.
    // A stale/garbage id falls through to name matching. This preserves
    // legacy behavior for un-backfilled rows (which have no courseId).
    const rawId = ev.courseId
    if (typeof rawId === 'string' && rawId) {
      if (rawId === targetId) {
        // matches this course by stable id
      } else if (validCourseIdSet && validCourseIdSet.has(rawId)) {
        continue
      } else if (normalizeName(ev.courseName) !== targetName) {
        continue
      }
    } else if (normalizeName(ev.courseName) !== targetName) {
      continue
    }
    items.push({
      title: ev.name || ev.type || 'Deadline',
      date: ev.date,
      type: (ev.type || 'deadline').toLowerCase(),
      weight: ev.weight ?? null,
      status: isDatePast(ev.date, now) ? 'past' : 'upcoming',
      source: 'syllabus_events',
    })
  }

  const seen = new Map()
  for (const item of items) {
    const key = `${item.date}|${normalizeName(item.title)}`
    const rank = item.source === 'course.exams[]' ? 3 : item.source === 'syllabus_events' ? 2 : 1
    const existing = seen.get(key)
    if (!existing || existing.rank < rank) seen.set(key, { item, rank })
  }
  const merged = Array.from(seen.values())
    .map(v => v.item)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return { items: merged }
}

function computeGradeFromComponents(components) {
  if (!Array.isArray(components) || !components.length) return null
  const graded = components.filter(c => c && c.graded && c.grade !== null && c.grade !== undefined)
  if (!graded.length) return null
  const totalWeight = graded.reduce((s, c) => s + (c.weight || 0), 0)
  if (totalWeight === 0) return null
  return graded.reduce((s, c) => s + c.grade * c.weight, 0) / totalWeight
}

function letterToPct(letter) {
  const map = { 'A+': 90, 'A': 85, 'A-': 80, 'B+': 77, 'B': 73, 'B-': 70, 'C+': 67, 'C': 63, 'C-': 60, 'D+': 55, 'D': 50 }
  if (!letter) return null
  return map[letter] ?? null
}

function buildGrades(course) {
  const gradeData = course.gradeData || {}
  const components = (gradeData.components || []).map(c => ({
    id: c.id,
    component: c.component,
    weight: c.weight,
    grade: c.grade ?? null,
    graded: !!c.graded,
    type: c.type || null,
    source: 'gradeData.components',
  }))

  const computedPct = computeGradeFromComponents(components)
  const studentEnteredOverride = course.currentGradeOverride || null
  const overridePct = letterToPct(studentEnteredOverride)

  let effectiveCurrentGrade = null
  if (studentEnteredOverride) {
    effectiveCurrentGrade = { value: studentEnteredOverride, source: 'student_entered' }
  } else if (computedPct !== null) {
    effectiveCurrentGrade = { value: Math.round(computedPct * 10) / 10, source: 'computed' }
  }

  let discrepancyNote = null
  if (studentEnteredOverride && computedPct !== null && overridePct !== null) {
    const delta = Math.abs(computedPct - overridePct)
    if (delta >= 3) {
      discrepancyNote =
        `Student entered "${studentEnteredOverride}" (~${overridePct}%) but graded components compute to ${computedPct.toFixed(1)}%. Ask the student to reconcile before quoting a single number.`
    }
  }

  const targetPct = typeof gradeData.targetGrade === 'number' ? gradeData.targetGrade : null
  const targetLetter = course.targetGrade || null
  const gap = effectiveCurrentGrade && effectiveCurrentGrade.source === 'computed' && targetPct !== null
    ? Math.round((targetPct - effectiveCurrentGrade.value) * 10) / 10
    : null

  return {
    components,
    computedCurrentGradePct: computedPct !== null ? Math.round(computedPct * 10) / 10 : null,
    studentEnteredOverride,
    effectiveCurrentGrade,
    discrepancyNote,
    targetGrade: { letter: targetLetter, pct: targetPct },
    gap,
  }
}

// Loads topic_signals rows scoped to (userId, courseId), most-recent first,
// bounded by SIGNAL_WINDOW_DAYS and SIGNAL_ROW_LIMIT. Never throws; a
// load error becomes an empty result plus a warning code so the caller
// can degrade gracefully to the plan-derived topic list.
async function loadTopicSignals(userId, courseId) {
  try {
    const cutoffMs = Date.now() - SIGNAL_WINDOW_DAYS * 86400_000
    const cutoffIso = new Date(cutoffMs).toISOString()
    const { data, error } = await supabaseAdmin
      .from('topic_signals')
      .select('topic, topic_key, signal_type, source, score, created_at')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .gt('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(SIGNAL_ROW_LIMIT)
    if (error) return { rows: [], loadError: error.message || 'unknown' }
    return { rows: Array.isArray(data) ? data : [], loadError: null }
  } catch (e) {
    return { rows: [], loadError: String(e?.message || e) }
  }
}

// Turns a list of topic_signals rows (newest first) into per-topic
// mastery entries with recency-weighted score, evidence, trend, and
// last-touched. Below MIN_EVIDENCE we return an entry marked
// insufficient_data with mastery=null so the renderer can be explicit
// that we have signals but not enough to justify a number.
export function computeTopicMastery(signals, nowInput = new Date()) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput)
  const buckets = new Map()

  for (const row of signals) {
    const rules = SIGNAL_TYPE_SCORE_RULES[row?.signal_type]
    if (!rules) continue
    const key = row.topic_key || String(row.topic || '').trim().toLowerCase()
    if (!key) continue
    const ts = row.created_at ? new Date(row.created_at) : null
    const daysAgo = ts && !isNaN(ts.getTime())
      ? Math.max(0, (now.getTime() - ts.getTime()) / 86400_000)
      : SIGNAL_WINDOW_DAYS * 2
    const decayed = rules.weight * Math.exp(-daysAgo / MASTERY_DECAY_DAYS)
    const score = Number(row.score)
    if (!Number.isFinite(score)) continue

    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        // Rows come in DESC order, so the first row we see for a key is
        // the most recent; use its topic string as the display name.
        displayName: row.topic || key,
        signals: [],
        sumWeightedScore: 0,
        sumWeight: 0,
        lastTouchedAt: row.created_at || null,
      })
    }
    const b = buckets.get(key)
    b.sumWeightedScore += decayed * score
    b.sumWeight += decayed
    b.signals.push({ signalType: row.signal_type, score, decayedWeight: decayed })
  }

  const out = []
  for (const b of buckets.values()) {
    const evidence = b.sumWeight
    let mastery = null
    let level
    let sufficient = false
    if (evidence >= MIN_EVIDENCE && b.sumWeight > 0) {
      const raw = b.sumWeightedScore / b.sumWeight
      mastery = Math.round(Math.max(0, Math.min(1, raw)) * 100)
      level = mastery < 35 ? 'weak' : mastery < 65 ? 'developing' : mastery < 85 ? 'solid' : 'strong'
      sufficient = true
    } else {
      level = 'insufficient_data'
    }
    // Trend uses raw scores (no decay) on the most recent 3 vs the prior
    // 3 to 5. Under 6 total signals there is not enough history to call
    // a direction so we return 'new'.
    let trend = 'new'
    if (b.signals.length >= 6) {
      const recent = b.signals.slice(0, 3)
      const prior = b.signals.slice(3, Math.min(b.signals.length, 8))
      const mr = recent.reduce((s, x) => s + x.score, 0) / recent.length
      const mp = prior.reduce((s, x) => s + x.score, 0) / prior.length
      const delta = mr - mp
      trend = delta > 0.1 ? 'up' : delta < -0.1 ? 'down' : 'flat'
    }
    out.push({
      key: b.key,
      name: b.displayName,
      mastery,
      level,
      sufficient,
      evidence: Math.round(evidence * 100) / 100,
      signalCount: b.signals.length,
      lastTouchedAt: b.lastTouchedAt,
      trend,
    })
  }
  return out
}

function buildTopics(course, coachPlanForCourse, sessionsForCourse, struggleTopicSet, masteryRows = []) {
  // Topics come from real topic sources only. completed_sessions.sessionType
  // is a session LABEL ("Session 1", "Past Exam Paper", "Custom Study") not a
  // topic — derived-topic verification against production data caught this.
  const seen = new Map()
  const addTopic = (name, provenance) => {
    const key = normalizeName(name)
    if (!key || seen.has(key)) return
    seen.set(key, {
      name,
      sessionCount: 0,
      lastTouchedAt: null,
      isStruggle: struggleTopicSet.has(key),
      provenance,
      source: 'derived',
    })
  }

  for (const wk of (coachPlanForCourse?.plan?.weeklyFocus || [])) {
    for (const t of (wk?.keyTopics || [])) addTopic(t, 'coach_plan.weeklyFocus.keyTopics')
  }
  for (const t of (coachPlanForCourse?.plan?.priorityTopics || [])) {
    addTopic(t, 'coach_plan.plan.priorityTopics')
  }
  for (const s of (coachPlanForCourse?.plan?.sessions || [])) {
    if (s?.topic) addTopic(s.topic, 'coach_plan.plan.sessions[].topic')
  }
  for (const name of struggleTopicSet) {
    if (!seen.has(name)) {
      seen.set(name, {
        name,
        sessionCount: 0,
        lastTouchedAt: null,
        isStruggle: true,
        provenance: 'struggle_topics',
        source: 'derived',
      })
    }
  }

  // Best-effort session correlation: increment sessionCount when a
  // completed_session's sessionType contains a known topic name as a substring.
  for (const s of sessionsForCourse) {
    const label = normalizeName(s?.sessionType || '')
    if (!label) continue
    for (const [key, entry] of seen) {
      if (label.includes(key)) {
        entry.sessionCount += 1
        if (!entry.lastTouchedAt || String(s.dateStr) > String(entry.lastTouchedAt)) {
          entry.lastTouchedAt = s.dateStr
        }
      }
    }
  }

  // Merge mastery from topic_signals. Two cases:
  //   1. Topic already in `seen` (plan- or struggle-derived). Enrich the
  //      existing row with mastery + evidence + trend. If evidence is
  //      sufficient, upgrade source to 'signals' and append
  //      'session_result' to provenance so the reader can tell this row
  //      is now backed by real learning data, not just a plan mention.
  //   2. Topic only in signals (an orphan from brain-dump gaps or
  //      practice-exam questions the plan does not cover). Add a fresh
  //      row with source='signals', provenance='session_result'.
  for (const m of masteryRows) {
    if (!m || !m.key) continue
    if (seen.has(m.key)) {
      const entry = seen.get(m.key)
      entry.mastery = m.mastery
      entry.masteryLevel = m.level
      entry.evidence = m.evidence
      entry.signalCount = m.signalCount
      entry.trend = m.trend
      if (m.lastTouchedAt) entry.lastTouchedAt = m.lastTouchedAt
      if (m.sufficient) {
        entry.source = 'signals'
        entry.provenance = `${entry.provenance} + session_result`
      }
    } else {
      seen.set(m.key, {
        name: m.name,
        sessionCount: 0,
        lastTouchedAt: m.lastTouchedAt,
        isStruggle: struggleTopicSet.has(m.key),
        provenance: 'session_result',
        source: 'signals',
        mastery: m.mastery,
        masteryLevel: m.level,
        evidence: m.evidence,
        signalCount: m.signalCount,
        trend: m.trend,
      })
    }
  }

  return { items: Array.from(seen.values()) }
}

function buildSessions(sessionsForCourse, sessionRecallsForCourse, orphanCount) {
  const sorted = sessionsForCourse
    .slice()
    .sort((a, b) => String(b.dateStr || '').localeCompare(String(a.dateStr || '')))
    .slice(0, SESSIONS_CAP)
  const recent = sorted.map(s => ({
    id: s.id,
    dateStr: s.dateStr,
    sessionType: s.sessionType ?? null,
    duration: s.duration ?? null,
    recallScore: s.recallScore ?? null,
    rating: s.rating ?? null,
    hard_notes: s.hard_notes ?? null,
    source: 'completed_sessions',
  }))
  const withScore = sorted.filter(s => typeof s.recallScore === 'number')
  const recentRecallAvg = withScore.length
    ? Math.round((withScore.reduce((a, b) => a + b.recallScore, 0) / withScore.length) * 100) / 100
    : null
  const brainDumps = sessionRecallsForCourse
    .slice()
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 5)
    .map(r => ({
      timestamp: r.timestamp,
      sessionType: r.sessionType || null,
      text: String(r.text || '').slice(0, 800),
      source: 'session_recalls',
    }))
  const warnings = []
  if (orphanCount > 0) warnings.push({ code: 'orphan_index', count: orphanCount })
  return { recent, recentRecallAvg, brainDumps, warnings }
}

function buildPlanSection(coachPlanForCourse) {
  if (!coachPlanForCourse) return null
  const p = coachPlanForCourse.plan || {}
  const fd = coachPlanForCourse.formData || {}
  const emphasisRaw = typeof fd.emphasisTopics === 'string' ? fd.emphasisTopics : ''
  const emphasisTopics = emphasisRaw
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean)

  // Struggles live in two places: top-level `.struggles` array (populated by
  // /api/log-struggle when the tutor flags a topic) AND formData.struggles
  // (multi-line string, populated at plan-creation form time). Merge both,
  // de-duped case-insensitive. Real-data harness caught this — production
  // has formData.struggles populated but top-level empty.
  const strugglesSet = new Map()
  const addStruggle = s => {
    const norm = String(s || '').trim()
    if (!norm) return
    const key = norm.toLowerCase()
    if (!strugglesSet.has(key)) strugglesSet.set(key, norm)
  }
  if (Array.isArray(coachPlanForCourse.struggles)) coachPlanForCourse.struggles.forEach(addStruggle)
  if (typeof fd.struggles === 'string') fd.struggles.split(/\n/).forEach(addStruggle)

  return {
    nextSession: p.nextSession || null,
    sessionsRemaining: p.sessionsRemaining ?? null,
    lastRebalancedAt: p.lastRebalancedAt || null,
    weeklyFocus: Array.isArray(p.weeklyFocus) ? p.weeklyFocus : null,
    emphasisTopics,
    studyGoal: fd.studyGoal || fd.goal || null,
    struggles: Array.from(strugglesSet.values()),
    pendingHardNotes: Array.isArray(coachPlanForCourse.pendingHardNotes) ? coachPlanForCourse.pendingHardNotes : [],
    source: 'coach_plans[courseId]',
  }
}

async function buildMaterials(userId, courseId, topic, budgetChars, killswitchOn) {
  if (!killswitchOn) {
    return { section: null, missingReason: 'killswitch_off' }
  }
  try {
    const excerpts = await getRelevantExcerpts(userId, courseId, topic, budgetChars)
    if (!excerpts.length) return { section: null, missingReason: 'no_uploads' }
    return {
      section: {
        excerpts,
        totalUploads: new Set(excerpts.map(e => e.uploadId)).size,
        source: 'course_uploads',
      },
      missingReason: null,
    }
  } catch (err) {
    return { section: null, missingReason: 'query_error', error: String(err?.message || err) }
  }
}

async function loadStruggleTopics(userId, courseId, courseName, validCourseIdSet = null) {
  try {
    // Select course_id too. The column is nullable and was added in
    // 20260728_course_identity_v1.sql; PostgREST returns null for rows
    // that predate it. If the column is somehow absent (a downgraded
    // environment), the request errors and we degrade to the name-only
    // path in the catch block below.
    const { data, error } = await supabaseAdmin
      .from('struggle_topics')
      .select('course_name, topic, course_id')
      .eq('user_id', userId)
    if (error) {
      const { data: fallback } = await supabaseAdmin
        .from('struggle_topics')
        .select('course_name, topic')
        .eq('user_id', userId)
      return classifyStruggleRows(fallback || [], null, courseName, null)
    }
    return classifyStruggleRows(data || [], courseId, courseName, validCourseIdSet)
  } catch {
    return { forCourse: new Set(), warnings: [] }
  }
}

function classifyStruggleRows(rows, targetCourseId, targetCourseName, validCourseIdSet) {
  const target = normalizeName(targetCourseName)
  const targetIdStr = targetCourseId != null ? String(targetCourseId) : null
  const forCourse = new Set()
  const orphanNames = new Set()
  let staleIdCount = 0
  for (const row of rows) {
    const rawId = row?.course_id
    if (typeof rawId === 'string' && rawId) {
      if (targetIdStr && rawId === targetIdStr) {
        forCourse.add(normalizeName(row.topic))
        continue
      }
      if (validCourseIdSet && validCourseIdSet.has(rawId)) {
        // Belongs to a different course by stable id. Clean miss.
        continue
      }
      // Stale/garbage id. Fall back to name matching per read-side spec.
      staleIdCount += 1
      const rn = normalizeName(row.course_name)
      if (rn && rn === target) {
        forCourse.add(normalizeName(row.topic))
      } else if (row.course_name) {
        orphanNames.add(row.course_name)
      }
      continue
    }
    // Legacy row: no course_id. Name-only match.
    const rn = normalizeName(row?.course_name)
    if (rn === target) forCourse.add(normalizeName(row.topic))
    else if (row?.course_name) orphanNames.add(row.course_name)
  }
  const warnings = []
  if (orphanNames.size) {
    warnings.push({ code: 'orphan_struggle_topics', count: orphanNames.size, courseNamesSeen: Array.from(orphanNames) })
  }
  if (staleIdCount) {
    warnings.push({ code: 'stale_course_id_struggle_topics', count: staleIdCount })
  }
  return { forCourse, warnings }
}

// ── Public entry point ──────────────────────────────────────────────────────

export async function getCourseContext(userId, courseId, options = {}) {
  if (!userId) throw new Error('getCourseContext: userId is required')
  if (!courseId) throw new Error('getCourseContext: courseId is required')

  const sections = options.sections && Array.isArray(options.sections) && options.sections.length
    ? options.sections
    : DEFAULT_SECTIONS
  const topic = options.topic || null
  const budgetChars = typeof options.budgetChars === 'number' ? options.budgetChars : DEFAULT_BUDGET_CHARS
  const cacheKey = JSON.stringify({ userId, courseId, sections: sections.slice().sort(), topic, budgetChars })

  const requestKey = options.request || options.req || null
  if (requestKey) {
    if (!_requestCache.has(requestKey)) _requestCache.set(requestKey, new Map())
    const bag = _requestCache.get(requestKey)
    if (bag.has(cacheKey)) return bag.get(cacheKey)
    const built = await assemble(userId, courseId, sections, topic, budgetChars)
    bag.set(cacheKey, built)
    return built
  }
  return assemble(userId, courseId, sections, topic, budgetChars)
}

async function assemble(userId, courseId, sections, topic, budgetChars) {
  const wanted = new Set(sections)
  const missing = []
  const warnings = []

  const loaded = await loadUserAndCourse(userId, courseId)
  const { course, courseIndex, courseList, coursesLength, syllabusEvents, completedSessions, coachPlans } = loaded

  const validCourseIdSet = new Set(courseList.filter(c => c && c.id).map(c => String(c.id)))
  const targetNameNorm = normalizeName(course.name)

  const identity = wanted.has('identity') ? buildIdentity(course) : null
  if (!wanted.has('identity')) missing.push({ section: 'identity', reason: 'not_requested', hint: '' })

  let deadlines = null
  if (wanted.has('deadlines')) {
    deadlines = buildDeadlines(course, syllabusEvents, course.name, validCourseIdSet)
    if (!deadlines.items.length) {
      missing.push({ section: 'deadlines', reason: 'no_data', hint: 'No exam date or syllabus events on file for this course. Do not invent one.' })
    }
    // Orphan bookkeeping for syllabus_events:
    // - A row whose courseName does not match any current course, AND whose
    //   courseId (if any) is not in the plan, is a name-orphan.
    // - A row whose courseId is a valid-but-different course is not an
    //   orphan; it just belongs to that other course.
    const orphanNames = new Set()
    for (const ev of syllabusEvents) {
      if (!ev) continue
      const rawId = ev.courseId
      if (typeof rawId === 'string' && rawId && validCourseIdSet.has(rawId)) continue
      if (!ev.courseName) continue
      const rn = normalizeName(ev.courseName)
      if (rn && rn !== targetNameNorm) orphanNames.add(ev.courseName)
    }
    if (orphanNames.size) warnings.push({ code: 'orphan_syllabus_events', count: orphanNames.size, courseNamesSeen: Array.from(orphanNames) })
  }

  const grades = wanted.has('grades') ? buildGrades(course) : null
  if (wanted.has('grades') && !grades.components.length && !grades.studentEnteredOverride) {
    missing.push({ section: 'grades', reason: 'no_data', hint: 'No graded components and no student-entered grade override. Do not guess a current grade.' })
  }

  // Dual-branch session + recall filter. String-id match runs first;
  // numeric-index match is the legacy fallback. A string id not in this
  // user's plan is treated as absent per the read-side spec: fall back to
  // name matching and count in orphan warnings.
  const sessionsForCourse = []
  const sessionRecallsForCourse = []
  let orphanIndexCount = 0
  let orphanStaleIdCount = 0
  let orphanMissingIdCount = 0

  for (const s of completedSessions) {
    const c = classifyCourseRow(s, course.id, courseIndex, coursesLength, validCourseIdSet, targetNameNorm)
    if (c.matches) sessionsForCourse.push(s)
    if (c.orphanKind === 'index-out-of-range') orphanIndexCount += 1
    else if (c.orphanKind === 'stale-id') orphanStaleIdCount += 1
    else if (c.orphanKind === 'missing-id') orphanMissingIdCount += 1
  }
  for (const r of loaded.sessionRecalls) {
    const c = classifyCourseRow(r, course.id, courseIndex, coursesLength, validCourseIdSet, targetNameNorm)
    if (c.matches) sessionRecallsForCourse.push(r)
    if (c.orphanKind === 'index-out-of-range') orphanIndexCount += 1
    else if (c.orphanKind === 'stale-id') orphanStaleIdCount += 1
    else if (c.orphanKind === 'missing-id') orphanMissingIdCount += 1
  }
  const orphanSessions = orphanIndexCount
  if (orphanStaleIdCount) warnings.push({ code: 'orphan_stale_course_id', count: orphanStaleIdCount })
  if (orphanMissingIdCount) warnings.push({ code: 'orphan_missing_course_id', count: orphanMissingIdCount })

  const struggleData = await loadStruggleTopics(userId, course.id, course.name, validCourseIdSet)
  for (const w of struggleData.warnings) warnings.push(w)

  // Topic-level mastery signals. Only load when topics are requested;
  // failure degrades to plan-derived topics only (loadError becomes a
  // warning code but does not throw).
  let masteryRows = []
  if (wanted.has('topics')) {
    const signalData = await loadTopicSignals(userId, course.id)
    if (signalData.loadError) {
      warnings.push({ code: 'topic_signals_load_failed', detail: signalData.loadError })
    }
    if (signalData.rows.length) {
      masteryRows = computeTopicMastery(signalData.rows)
    }
  }

  const coachPlanForCourse = coachPlans?.[courseId] || null
  const topics = wanted.has('topics')
    ? buildTopics(course, coachPlanForCourse, sessionsForCourse, struggleData.forCourse, masteryRows)
    : null
  if (wanted.has('topics') && (!topics.items.length)) {
    missing.push({ section: 'topics', reason: 'no_plan_and_no_session_history', hint: 'No topic list yet — do not name topics the student never told us about.' })
  }

  const sessionsSection = wanted.has('sessions')
    ? buildSessions(sessionsForCourse, sessionRecallsForCourse, orphanSessions)
    : null
  if (wanted.has('sessions') && !sessionsSection.recent.length) {
    missing.push({ section: 'sessions', reason: 'no_history', hint: 'Student has completed no sessions in this course yet.' })
  }

  const planSection = wanted.has('plan') ? buildPlanSection(coachPlanForCourse) : null
  if (wanted.has('plan') && !planSection) {
    missing.push({ section: 'plan', reason: 'no_coach_plan', hint: 'No coach plan for this course.' })
  }

  let materialsSection = null
  let killswitchState = 'enabled'
  if (wanted.has('materials')) {
    const on = await materialsEnabled()
    killswitchState = on ? 'enabled' : 'disabled'
    const mat = await buildMaterials(userId, courseId, topic, budgetChars, on)
    materialsSection = mat.section
    if (mat.missingReason) {
      const hintByReason = {
        killswitch_off: 'Uploaded materials are unavailable right now — do not cite any file.',
        no_uploads: 'Student has not uploaded any materials for this course. Do not invent citations.',
        query_error: 'Materials query failed — proceed without citations.',
      }
      missing.push({
        section: 'materials',
        reason: mat.missingReason,
        hint: hintByReason[mat.missingReason] || 'Materials unavailable.',
        error: mat.error || null,
      })
    }
  }

  return {
    identity,
    deadlines,
    grades,
    topics,
    sessions: sessionsSection,
    plan: planSection,
    materials: materialsSection,
    warnings,
    missing,
    meta: {
      userId,
      courseId,
      generatedAt: new Date().toISOString(),
      sectionsRequested: sections,
      budgetChars,
      killswitchState,
      _internal: {
        courseIndex,
        coursesLength,
        firstName: loaded.firstName || null,
        learningStyle: loaded.learningStyle || null,
        yearLevel: loaded.yearLevel || null,
      },
    },
  }
}

// ── Prompt formatting ────────────────────────────────────────────────────────

// Renders a CourseContext into a single prompt block. Deterministic order:
// identity, grades, deadlines, topics, sessions, plan, materials, missing.
// When over budgetChars, trims materials first, then sessions detail, then
// topics detail. Deadlines and grades are never trimmed.
//
// Caller is expected to prepend ANTI_GUESSING_RULES to the system prompt;
// this function does not restate them.
export function formatCourseContextForPrompt(ctx, opts = {}) {
  if (!ctx) return 'COURSE CONTEXT: unavailable.'
  const budgetChars = typeof opts.budgetChars === 'number' ? opts.budgetChars : (ctx.meta?.budgetChars ?? 30000)

  const identityBlock = renderIdentity(ctx.identity, ctx.meta?._internal)
  const gradesBlock = renderGrades(ctx.grades)
  const deadlinesBlock = renderDeadlines(ctx.deadlines)
  const planBlock = renderPlan(ctx.plan)
  const missingBlock = renderMissing(ctx.missing)
  const warningsBlock = renderWarnings(ctx.warnings)

  const fixed = [identityBlock, gradesBlock, deadlinesBlock, planBlock, missingBlock, warningsBlock].filter(Boolean)
  let fixedChars = fixed.reduce((s, b) => s + b.length + 2, 0)
  let remaining = Math.max(0, budgetChars - fixedChars)

  let topicsBlock = renderTopics(ctx.topics, remaining)
  remaining = Math.max(0, remaining - (topicsBlock ? topicsBlock.length + 2 : 0))

  let sessionsBlock = renderSessions(ctx.sessions, remaining)
  remaining = Math.max(0, remaining - (sessionsBlock ? sessionsBlock.length + 2 : 0))

  let materialsBlock = renderMaterials(ctx.materials, remaining)

  const parts = [identityBlock, gradesBlock, deadlinesBlock, topicsBlock, sessionsBlock, planBlock, materialsBlock, warningsBlock, missingBlock]
    .filter(Boolean)

  return parts.join('\n\n')
}

function renderIdentity(id, internal) {
  if (!id) return ''
  const lines = ['COURSE IDENTITY:']
  lines.push(`- Course: ${id.name}`)
  lines.push(`- Course ID: ${id.courseId}`)
  if (id.code) lines.push(`- Code: ${id.code}`)
  if (id.difficulty) lines.push(`- Difficulty: ${id.difficulty}`)
  if (id.targetGradeLetter) lines.push(`- Target letter grade: ${id.targetGradeLetter}`)
  if (internal?.firstName) lines.push(`- Student: ${internal.firstName}`)
  if (internal?.yearLevel) lines.push(`- Year: ${internal.yearLevel}`)
  if (internal?.learningStyle) lines.push(`- Learning style: ${internal.learningStyle}`)
  return lines.join('\n')
}

function renderGrades(g) {
  if (!g) return ''
  const lines = ['GRADES:']
  if (g.effectiveCurrentGrade) {
    lines.push(`- Current grade: ${g.effectiveCurrentGrade.value} (source: ${g.effectiveCurrentGrade.source})`)
  }
  if (g.computedCurrentGradePct !== null && g.studentEnteredOverride) {
    lines.push(`- Computed from graded components: ${g.computedCurrentGradePct}%`)
  }
  if (g.discrepancyNote) lines.push(`- DISCREPANCY: ${g.discrepancyNote}`)
  if (g.targetGrade?.pct != null) lines.push(`- Target: ${g.targetGrade.pct}%${g.targetGrade.letter ? ` (${g.targetGrade.letter})` : ''}`)
  else if (g.targetGrade?.letter) lines.push(`- Target: ${g.targetGrade.letter}`)
  if (g.gap !== null) {
    const dir = g.gap > 0 ? 'below target' : 'above target'
    lines.push(`- Gap: ${Math.abs(g.gap)} pts ${dir}`)
  }
  if (g.components?.length) {
    lines.push(`- Components (${g.components.length}):`)
    for (const c of g.components) {
      const gr = c.graded && c.grade !== null ? `${c.grade}%` : 'not yet graded'
      lines.push(`    · ${c.component} (${c.weight}%): ${gr}`)
    }
  }
  return lines.join('\n')
}

function renderDeadlines(d) {
  if (!d) return ''
  const lines = ['DEADLINES:']
  if (!d.items?.length) {
    lines.push('- (no exam date or syllabus events on file — do not invent one)')
    return lines.join('\n')
  }
  const now = new Date()
  for (const it of d.items) {
    let daysNote = ''
    const t = new Date(it.date)
    if (!isNaN(t.getTime())) {
      const days = Math.round((t - now) / 86400000)
      if (days > 0) daysNote = ` (${days} day${days === 1 ? '' : 's'} away)`
      else if (days === 0) daysNote = ' (today)'
      else daysNote = ` (${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago)`
    }
    const tags = [it.type, it.weight != null ? `${it.weight}%` : null, it.status, `source=${it.source}`].filter(Boolean).join(', ')
    lines.push(`- ${it.date}${daysNote} — ${it.title} (${tags})`)
  }
  return lines.join('\n')
}

function renderTopics(t, remainingChars) {
  if (!t) return ''
  if (!t.items?.length) return 'TOPICS: (no plan and no session history yet — do not name topics the student never told us about)'
  const header = 'TOPICS:'

  // Order matters for the trim strategy. When we have to drop rows,
  // we drop from the bottom, so the highest-value rows must be on top:
  //   bucket 0 — mastery-bearing rows sorted lowest mastery first
  //              (weak topics matter most for coaching)
  //   bucket 1 — insufficient-data rows (signals present but under threshold)
  //   bucket 2 — plan-derived rows with no signals at all
  const bucket = (x) => {
    if (x.mastery != null) return 0
    if (x.masteryLevel === 'insufficient_data' || (x.signalCount ?? 0) > 0) return 1
    return 2
  }
  const sorted = t.items.slice().sort((a, b) => {
    const ra = bucket(a)
    const rb = bucket(b)
    if (ra !== rb) return ra - rb
    if (ra === 0) return (a.mastery ?? 999) - (b.mastery ?? 999)
    return 0
  })

  const rows = []
  for (const it of sorted) {
    const bits = []
    if (it.mastery != null) {
      bits.push(`mastery=${it.mastery}/100 (${it.masteryLevel})`)
      if (it.trend && it.trend !== 'new') bits.push(`trend ${it.trend}`)
    } else if (it.masteryLevel === 'insufficient_data') {
      bits.push('mastery=insufficient data')
    }
    if ((it.signalCount ?? 0) > 0) bits.push(`signals=${it.signalCount}`)
    bits.push(`source=${it.source}`)
    if (it.isStruggle) bits.push('struggle')
    if (it.sessionCount) bits.push(`sessions=${it.sessionCount}`)
    if (it.lastTouchedAt) bits.push(`last=${String(it.lastTouchedAt).slice(0, 10)}`)
    rows.push(`- ${it.name} (${bits.join(', ')})`)
  }
  const full = [header, ...rows].join('\n')
  if (full.length <= remainingChars) return full
  const kept = []
  let used = header.length + 2
  for (const r of rows) {
    if (used + r.length + 1 > remainingChars) break
    kept.push(r)
    used += r.length + 1
  }
  return kept.length ? [header, ...kept, `- ...(+${rows.length - kept.length} more topics trimmed for budget)`].join('\n') : ''
}

function renderSessions(s, remainingChars) {
  if (!s) return ''
  if (!s.recent?.length && !s.brainDumps?.length) return 'RECENT SESSIONS: (none)'
  const header = 'RECENT SESSIONS:'
  const rows = (s.recent || []).map(x => {
    const bits = [`${x.dateStr}`, x.sessionType || 'session', x.duration != null ? `${x.duration}min` : null,
      x.recallScore != null ? `recall=${(x.recallScore * 100).toFixed(0)}%` : null,
      x.rating != null ? `rating=${x.rating}/5` : null,
      x.hard_notes ? `notes="${String(x.hard_notes).slice(0, 100)}"` : null,
    ].filter(Boolean)
    return `- ${bits.join(' · ')}`
  })
  if (s.recentRecallAvg != null) {
    rows.unshift(`- avg recall across recent sessions: ${(s.recentRecallAvg * 100).toFixed(0)}%`)
  }
  if (s.brainDumps?.length) {
    rows.push('- Recent brain-dump text (unrated; student self-recall):')
    for (const b of s.brainDumps) {
      const when = b.timestamp ? new Date(b.timestamp).toISOString().slice(0, 10) : ''
      rows.push(`    · ${when}${b.sessionType ? ` (${b.sessionType})` : ''}: "${b.text.slice(0, 200)}"`)
    }
  }
  const full = [header, ...rows].join('\n')
  if (full.length <= remainingChars) return full
  const kept = []
  let used = header.length + 2
  for (const r of rows) {
    if (used + r.length + 1 > remainingChars) break
    kept.push(r)
    used += r.length + 1
  }
  return kept.length ? [header, ...kept, `- ...(+${rows.length - kept.length} lines trimmed for budget)`].join('\n') : ''
}

function renderPlan(p) {
  if (!p) return ''
  const lines = ['COACH PLAN:']
  if (p.nextSession) {
    lines.push(`- Next session: ${p.nextSession.topic || 'untitled'} (${p.nextSession.duration || '?'}min)`)
  }
  if (p.sessionsRemaining != null) lines.push(`- Sessions remaining: ${p.sessionsRemaining}`)
  if (p.lastRebalancedAt) lines.push(`- Last rebalanced: ${p.lastRebalancedAt}`)
  if (p.emphasisTopics?.length) {
    lines.push(`- Professor emphasis topics: ${p.emphasisTopics.join(', ')}`)
  }
  if (p.studyGoal) lines.push(`- Stated study goal: ${p.studyGoal}`)
  if (p.weeklyFocus?.length) {
    lines.push('- Weekly focus:')
    for (const w of p.weeklyFocus.slice(0, 6)) {
      const topics = (w.keyTopics || []).join(', ') || w.theme || ''
      lines.push(`    · Week ${w.weekNumber ?? '?'}: ${topics}`)
    }
  }
  if (p.struggles?.length) lines.push(`- Reported struggles: ${p.struggles.join(', ')}`)
  if (p.pendingHardNotes?.length) {
    lines.push('- Recent stuck flags:')
    for (const n of p.pendingHardNotes) lines.push(`    · "${n.note}" (${n.sessionLabel || 'session'})`)
  }
  return lines.join('\n')
}

function renderMaterials(m, remainingChars) {
  if (!m) return ''
  if (!m.excerpts?.length) return ''
  const header = `UPLOADED MATERIALS (${m.totalUploads} file${m.totalUploads === 1 ? '' : 's'}):`
  const parts = []
  let used = header.length + 2
  for (const e of m.excerpts) {
    const tag = `[Source: ${e.filename}, uploaded ${e.uploadedAt}, id=${e.uploadId}, kind=${e.kind}]`
    const block = `${tag}\n${e.text}`
    if (used + block.length + 4 > remainingChars) break
    parts.push(block)
    used += block.length + 4
  }
  if (!parts.length) return ''
  const trimmedCount = m.excerpts.length - parts.length
  const tail = trimmedCount ? `\n\n(+${trimmedCount} more excerpts trimmed for budget)` : ''
  return `${header}\n${parts.join('\n\n---\n\n')}${tail}`
}

function renderMissing(m) {
  if (!m || !m.length) return ''
  const real = m.filter(x => x.reason !== 'not_requested')
  if (!real.length) return ''
  const lines = ['HONEST ABSENCES (do not invent to fill these gaps):']
  for (const x of real) {
    const where = x.field ? `${x.section}.${x.field}` : x.section
    lines.push(`- ${where}: ${x.hint} (reason: ${x.reason})`)
  }
  return lines.join('\n')
}

function renderWarnings(w) {
  if (!w || !w.length) return ''
  const lines = ['DATA WARNINGS (for the record; may signal orphaned records):']
  for (const it of w) {
    if (it.code === 'orphan_syllabus_events') {
      lines.push(`- ${it.count} syllabus event(s) reference course names not in the current course list: ${(it.courseNamesSeen || []).slice(0, 4).join(', ')}${(it.courseNamesSeen || []).length > 4 ? ', ...' : ''}`)
    } else if (it.code === 'orphan_struggle_topics') {
      lines.push(`- ${it.count} struggle-topic row(s) reference course names not in the current course list: ${(it.courseNamesSeen || []).slice(0, 4).join(', ')}${(it.courseNamesSeen || []).length > 4 ? ', ...' : ''}`)
    } else if (it.code === 'orphan_index') {
      lines.push(`- ${it.count} completed session(s) carry course indexes past the end of the courses array (historical reorder or delete).`)
    } else {
      lines.push(`- ${it.code}${it.count != null ? ` × ${it.count}` : ''}`)
    }
  }
  return lines.join('\n')
}
