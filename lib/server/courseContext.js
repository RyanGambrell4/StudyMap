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

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const DEFAULT_BUDGET_CHARS = 30000
const DEFAULT_SECTIONS = ['identity', 'deadlines', 'grades', 'topics', 'sessions', 'plan', 'materials']
const SESSIONS_CAP = 20
const KILLSWITCH_TTL_MS = 60_000

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

function buildDeadlines(course, syllabusEvents, courseName) {
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
  for (const ev of syllabusEvents) {
    if (!ev?.date) continue
    if (normalizeName(ev.courseName) !== targetName) continue
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

function buildTopics(course, coachPlanForCourse, sessionsForCourse, struggleTopicSet) {
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
  // Precise per-topic recall requires the mastery build (queued follow-up).
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

async function loadStruggleTopics(userId, courseName) {
  try {
    const { data, error } = await supabaseAdmin
      .from('struggle_topics')
      .select('course_name, topic')
      .eq('user_id', userId)
    if (error) return { forCourse: new Set(), warnings: [] }
    const target = normalizeName(courseName)
    const forCourse = new Set()
    const orphanNames = new Set()
    for (const row of (data || [])) {
      const rn = normalizeName(row.course_name)
      if (rn === target) forCourse.add(normalizeName(row.topic))
      else orphanNames.add(row.course_name)
    }
    return {
      forCourse,
      warnings: orphanNames.size
        ? [{ code: 'orphan_struggle_topics', count: orphanNames.size, courseNamesSeen: Array.from(orphanNames) }]
        : [],
    }
  } catch {
    return { forCourse: new Set(), warnings: [] }
  }
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
  const { course, courseIndex, coursesLength, syllabusEvents, completedSessions, coachPlans } = loaded

  const identity = wanted.has('identity') ? buildIdentity(course) : null
  if (!wanted.has('identity')) missing.push({ section: 'identity', reason: 'not_requested', hint: '' })

  let deadlines = null
  if (wanted.has('deadlines')) {
    deadlines = buildDeadlines(course, syllabusEvents, course.name)
    if (!deadlines.items.length) {
      missing.push({ section: 'deadlines', reason: 'no_data', hint: 'No exam date or syllabus events on file for this course. Do not invent one.' })
    }
    const targetName = normalizeName(course.name)
    const orphanNames = new Set()
    for (const ev of syllabusEvents) {
      if (!ev?.courseName) continue
      const rn = normalizeName(ev.courseName)
      if (rn !== targetName && rn) orphanNames.add(ev.courseName)
    }
    if (orphanNames.size) warnings.push({ code: 'orphan_syllabus_events', count: orphanNames.size, courseNamesSeen: Array.from(orphanNames) })
  }

  const grades = wanted.has('grades') ? buildGrades(course) : null
  if (wanted.has('grades') && !grades.components.length && !grades.studentEnteredOverride) {
    missing.push({ section: 'grades', reason: 'no_data', hint: 'No graded components and no student-entered grade override. Do not guess a current grade.' })
  }

  const sessionsForCourse = completedSessions.filter(s => s && Number(s.courseId) === courseIndex)
  const sessionRecallsForCourse = loaded.sessionRecalls.filter(r => r && Number(r.courseId) === courseIndex)
  const orphanSessions = completedSessions.filter(s => {
    const idx = Number(s?.courseId)
    return Number.isFinite(idx) && (idx < 0 || idx >= coursesLength)
  }).length

  const struggleData = await loadStruggleTopics(userId, course.name)
  for (const w of struggleData.warnings) warnings.push(w)

  const coachPlanForCourse = coachPlans?.[courseId] || null
  const topics = wanted.has('topics')
    ? buildTopics(course, coachPlanForCourse, sessionsForCourse, struggleData.forCourse)
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
  const rows = []
  for (const it of t.items) {
    const bits = [`source=${it.source}`]
    if (it.isStruggle) bits.push('struggle')
    if (it.sessionCount) bits.push(`sessions=${it.sessionCount}`)
    if (it.lastTouchedAt) bits.push(`last=${it.lastTouchedAt}`)
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
