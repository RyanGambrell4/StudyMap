#!/usr/bin/env node
// Comparison harness for the course-brain migration.
//
// For a given (userId, courseId), prints two things side by side for each
// representative endpoint (cheat-sheet and generate-session-blueprint):
//   1. The context object that the endpoint TODAY would receive from the
//      client (assembled from raw user_data + course_uploads to mimic
//      what the browser sends).
//   2. The context object that getCourseContext(userId, courseId) now
//      produces, plus the formatted prompt block.
//
// Then a superset-check: every top-level field the endpoint TODAY reads
// must be represented in the new context. Anything missing is a bug.
//
// Not deployed. Run locally with:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/compareCourseContext.mjs <userId> <courseId> [topic]

import { createClient } from '@supabase/supabase-js'
import { getCourseContext, formatCourseContextForPrompt } from '../lib/server/courseContext.js'

const [, , userId, courseId, topic] = process.argv
if (!userId || !courseId) {
  console.error('Usage: node scripts/compareCourseContext.mjs <userId> <courseId> [topic]')
  process.exit(1)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

function line(title) {
  console.log('\n' + '═'.repeat(80))
  console.log(title)
  console.log('═'.repeat(80))
}

function present(v) {
  if (v === null || v === undefined) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return String(v).length > 0
}

async function main() {
  const { data: row, error } = await supabase
    .from('user_data')
    .select('plan, syllabus_events, completed_sessions, session_recalls, coach_plans')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!row) throw new Error(`No user_data row for ${userId}`)

  const courses = row.plan?.courses || []
  const course = courses.find(c => String(c.id) === String(courseId))
  const courseIndex = courses.findIndex(c => String(c.id) === String(courseId))
  if (!course) throw new Error(`Course ${courseId} not on this user's plan`)

  const sessionsForCourse = (row.completed_sessions || []).filter(s => Number(s.courseId) === courseIndex)
  const coachPlanForCourse = row.coach_plans?.[courseId] || null
  const syllabusForCourse = (row.syllabus_events || []).filter(e => e?.courseName?.toLowerCase()?.trim() === course.name?.toLowerCase()?.trim())

  // ── Assemble what today's cheat-sheet ctx object looks like ────────────────
  const legacyCtx = {
    courseName: course.name,
    courseId: course.id,
    firstName: row.plan?.firstName,
    yearLevel: row.plan?.yearLevel,
    learningStyle: row.plan?.learningStyle,
    targetGrade: course.gradeData?.targetGrade ?? null,
    currentGradePct: null,
    gradeGap: null,
    examDate: course.examDate,
    nextExamTitle: (course.exams?.[0]?.name) || null,
    daysUntilExam: null,
    upcomingDeadlines: syllabusForCourse.slice(0, 6).map(e => ({ dateStr: e.date, title: e.name, type: e.type })),
    studyGoal: coachPlanForCourse?.formData?.emphasisTopics || null,
    recentRecallAvg: null,
    emphasisTopics: (coachPlanForCourse?.formData?.emphasisTopics || '').split(',').map(s => s.trim()).filter(Boolean),
    struggles: coachPlanForCourse?.struggles || [],
    strengths: [],
    weeklyFocus: coachPlanForCourse?.plan?.weeklyFocus?.[0] || null,
    syllabusEvents: syllabusForCourse.slice(0, 12).map(e => ({ dateStr: e.date, title: e.name, type: e.type })),
    weakTopics: [],
    strongTopics: [],
    recentQuizMisses: [],
    brainDumpGaps: [],
    brainDumpHistory: [],
    hardNotes: (coachPlanForCourse?.pendingHardNotes || []).map(n => ({ note: n.note, sessionLabel: n.sessionLabel })),
  }

  // ── New course brain output ───────────────────────────────────────────────
  const brain = await getCourseContext(userId, courseId, { topic: topic || null })
  const prompt = formatCourseContextForPrompt(brain)

  line('LEGACY CTX (what today\'s cheat-sheet / quiz-burst / etc. receive from the client)')
  console.log(JSON.stringify(legacyCtx, null, 2))

  line('NEW CourseContext (what getCourseContext now produces server-side)')
  console.log(JSON.stringify(brain, null, 2))

  line('NEW formatCourseContextForPrompt(...) output')
  console.log(prompt)

  line('SUPERSET CHECK: every field present in legacy ctx must have a home in the new context')
  const checks = [
    ['courseName', () => brain.identity?.name],
    ['courseId', () => brain.identity?.courseId],
    ['firstName', () => brain.meta?._internal?.firstName],
    ['yearLevel', () => brain.meta?._internal?.yearLevel],
    ['learningStyle', () => brain.meta?._internal?.learningStyle],
    ['targetGrade', () => brain.grades?.targetGrade?.pct ?? brain.grades?.targetGrade?.letter],
    ['examDate', () => brain.deadlines?.items?.find(d => d.source === 'course.examDate' || d.source === 'course.exams[]')?.date],
    ['upcomingDeadlines', () => brain.deadlines?.items?.length ? true : null],
    ['emphasisTopics', () => brain.plan?.weeklyFocus?.length || (brain.topics?.items?.length ? true : null)],
    ['struggles', () => brain.plan?.struggles?.length ? true : null],
    ['syllabusEvents', () => brain.deadlines?.items?.some(d => d.source === 'syllabus_events') ? true : null],
    ['weeklyFocus', () => brain.plan?.weeklyFocus?.length ? true : null],
    ['hardNotes', () => brain.plan?.pendingHardNotes?.length ? true : null],
  ]
  const rows = []
  let missingCount = 0
  for (const [field, extract] of checks) {
    const legacyHas = present(legacyCtx[field])
    let newVal
    try { newVal = extract() } catch { newVal = null }
    const newHas = present(newVal)
    const status = !legacyHas ? 'n/a (legacy empty)' : newHas ? 'ok' : 'MISSING'
    if (status === 'MISSING') missingCount++
    rows.push({ field, legacyHas, newHas, status })
  }
  console.table(rows)
  if (missingCount) {
    console.log(`\nSuperset FAILED: ${missingCount} legacy field(s) missing in new context.`)
    process.exitCode = 2
  } else {
    console.log('\nSuperset OK: all legacy fields represented in the new context.')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
