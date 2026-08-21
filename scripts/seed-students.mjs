#!/usr/bin/env node
/**
 * Seed the staging database with the student states needed to verify the app.
 *
 * Deterministic: same emails, same course ids, same dates relative to today.
 * Idempotent: re-running updates rows in place rather than creating duplicates.
 * Staging only: refuses to run against production, by project ref.
 *
 *   node scripts/seed-students.mjs            # seed
 *   node scripts/seed-students.mjs --list     # print logins without writing
 *   node scripts/seed-students.mjs --reset    # delete seeded users first
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_KEY. Run it through .env.local:
 *   node --env-file=.env.local scripts/seed-students.mjs
 *
 * ── An honest limit you need to know about ──────────────────────────────────
 * Not all student state lives in the database. src/lib/masteryStore.js,
 * src/lib/studyHistory.js and the review-queue scheduling are localStorage.
 * A server-side seed physically cannot produce "topic cold at 11 days",
 * "9 day streak" or "cards ripened while away" on its own.
 *
 * So this script does two things. It writes everything that IS server side,
 * and it emits scripts/seed-localstorage.json holding the browser half for each
 * student. Load a student, then paste their payload into the console (the file
 * carries a one-line snippet) to complete the state. Anything marked
 * browserOnly in the output below is in that file, not in the database.
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { assertNotProduction } from './lib/envGuard.mjs'

const LIST_ONLY = process.argv.includes('--list')
const RESET     = process.argv.includes('--reset')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
  console.error('Try: node --env-file=.env.local scripts/seed-students.mjs')
  process.exit(1)
}

// Hard stop before anything is written.
const ref = assertNotProduction(url, 'seed-students')

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const PASSWORD = 'StudyEdgeSeed!2026'
const DAY = 86400000
const today = new Date()
const iso  = (d) => new Date(d).toISOString()
const day  = (offset) => iso(today.getTime() + offset * DAY)
const dateOnly = (offset) => new Date(today.getTime() + offset * DAY).toISOString().split('T')[0]

const COLORS = ['#3B82F6', '#6366F1', '#059669', '#D97706', '#EC4899', '#0891B2']
const course = (n, name, examInDays, extra = {}) => ({
  id: `seed-course-${n}`,
  name,
  code: '',
  examDate: dateOnly(examInDays),
  difficulty: 'Medium',
  targetGrade: 'A',
  color: { name: 'custom', dot: COLORS[(n - 1) % COLORS.length] },
  ...extra,
})

const baseSchedule = { hoursPerWeek: 15, preferredTime: 'Evening' }
const plan = (courses, extra = {}) => ({
  courses,
  schedule: baseSchedule,
  learningStyle: null,
  yearLevel: '2nd Year',
  schoolType: 'uni',
  completedIds: [],
  assignments: [],
  savedAt: Date.now(),
  ...extra,
})

const sub = (extra = {}) => ({
  plan: 'free',
  status: 'active',
  aiQueriesUsed: 0,
  aiQueriesResetAt: null,
  stripeSubId: null,
  stripeCustomerId: null,
  billingPeriod: null,
  currentPeriodEnd: null,
  lastAiCallAt: null,
  feature_usage: {},
  ...extra,
})

// ── The students ────────────────────────────────────────────────────────────

const STUDENTS = [
  {
    key: 'fresh',
    email: 'seed-fresh@studyedge.test',
    why: 'Fresh signup, zero courses. The state 516 of 809 real accounts are in, and what the first-course gate must catch.',
    row: { plan: null, subscription: sub() },
  },
  {
    key: 'one-course-syllabus',
    email: 'seed-one-course@studyedge.test',
    why: 'One course created from a parsed syllabus, no study sessions yet.',
    row: {
      plan: plan([course(1, 'Organic Chemistry II', 30)]),
      subscription: sub({ aiQueriesUsed: 1, aiQueriesResetAt: day(-1), firstGenerationAt: day(-1) }),
      syllabus_events: [
        { title: 'Midterm 1', date: dateOnly(10), type: 'Exam',       courseId: 'seed-course-1' },
        { title: 'Final',     date: dateOnly(30), type: 'Final Exam', courseId: 'seed-course-1' },
      ],
    },
    uploads: [{ course_id: 'seed-course-1', filename: 'ochem2-syllabus.pdf', file_type: 'pdf', kind: 'syllabus', char_count: 8400 }],
  },
  {
    key: 'mid-semester',
    email: 'seed-mid-semester@studyedge.test',
    why: 'Mid semester, three courses. One topic last practised 11 days ago, so it should read as cold.',
    row: {
      plan: plan([
        course(1, 'Organic Chemistry II', 21),
        course(2, 'Cell Biology', 35),
        course(3, 'Statistics for Life Sciences', 48),
      ], { completedIds: ['s1', 's2', 's3', 's4', 's5'] }),
      subscription: sub({ aiQueriesUsed: 3, aiQueriesResetAt: day(-6), firstGenerationAt: day(-14) }),
      completed_sessions: [-14, -11, -8, -5, -2].map((d, i) => ({
        id: `s${i + 1}`, courseId: 'seed-course-1', dateStr: dateOnly(d), durationMin: 45, completedAt: day(d),
      })),
    },
    // 11 days cold is the point of this fixture, so the signal carries that date.
    signals: [
      { course_id: 'seed-course-1', course_name: 'Organic Chemistry II', topic: 'Stereochemistry',   signal_type: 'quiz_answer', source: 'server_graded', score: 0.35, created_at: day(-11) },
      { course_id: 'seed-course-1', course_name: 'Organic Chemistry II', topic: 'Reaction Mechanisms', signal_type: 'quiz_answer', source: 'server_graded', score: 0.82, created_at: day(-2) },
    ],
    browserOnly: { mastery: { 'seed-course-1': { Stereochemistry: { score: 38, updatedAt: day(-11) }, 'Reaction Mechanisms': { score: 84, updatedAt: day(-2) } } } },
  },
  {
    key: 'exam-shock',
    email: 'seed-exam-shock@studyedge.test',
    why: 'Just scored 41 percent on a practice exam in a topic that was previously strong. The drop is the signal.',
    row: {
      plan: plan([course(1, 'Cell Biology', 12)]),
      subscription: sub({ aiQueriesUsed: 4, aiQueriesResetAt: day(-3), firstGenerationAt: day(-20) }),
    },
    signals: [
      { course_id: 'seed-course-1', course_name: 'Cell Biology', topic: 'Glycolysis', signal_type: 'practice_exam_answer', source: 'server_graded', score: 0.88, created_at: day(-16) },
      { course_id: 'seed-course-1', course_name: 'Cell Biology', topic: 'Glycolysis', signal_type: 'practice_exam_answer', source: 'server_graded', score: 0.41, created_at: day(0) },
    ],
    artifacts: [{ course_id: 'seed-course-1', course_name: 'Cell Biology', artifact_type: 'practice_exam', title: 'Practice Exam 2', topic: 'Glycolysis', payload: { score: 41, total: 20, correct: 8 } }],
    browserOnly: { mastery: { 'seed-course-1': { Glycolysis: { score: 41, updatedAt: day(0), previous: 88 } } } },
  },
  {
    key: 'streak-9',
    email: 'seed-streak@studyedge.test',
    why: '9 day streak with a review due this morning. Tests that the return loop does not break the streak.',
    row: {
      plan: plan([course(1, 'Statistics for Life Sciences', 25)], { completedIds: Array.from({ length: 9 }, (_, i) => `st${i}`) }),
      subscription: sub({ aiQueriesUsed: 2, aiQueriesResetAt: day(-4), firstGenerationAt: day(-9) }),
      completed_sessions: Array.from({ length: 9 }, (_, i) => ({
        id: `st${i}`, courseId: 'seed-course-1', dateStr: dateOnly(-(8 - i)), durationMin: 30, completedAt: day(-(8 - i)),
      })),
    },
    browserOnly: { streak: { count: 9, lastStudiedAt: day(-1) }, reviewDue: [{ courseId: 'seed-course-1', topic: 'Hypothesis Testing', dueAt: day(0) }] },
  },
  {
    key: 'lapsed-14',
    email: 'seed-lapsed@studyedge.test',
    why: 'Lapsed 14 days. Cards ripened while away, so the return should lead with what is now due rather than with guilt.',
    row: {
      plan: plan([course(1, 'Organic Chemistry II', 18), course(2, 'Cell Biology', 26)]),
      subscription: sub({ aiQueriesUsed: 3, aiQueriesResetAt: day(-40), firstGenerationAt: day(-40) }),
      completed_sessions: [-40, -32, -22, -15].map((d, i) => ({
        id: `lp${i}`, courseId: 'seed-course-1', dateStr: dateOnly(d), durationMin: 40, completedAt: day(d),
      })),
    },
    signals: [
      { course_id: 'seed-course-1', course_name: 'Organic Chemistry II', topic: 'Aldol Condensation', signal_type: 'teach_it_back', source: 'server_graded', score: 0.55, created_at: day(-15) },
    ],
    browserOnly: { lastActiveAt: day(-14), reviewDue: [
      { courseId: 'seed-course-1', topic: 'Aldol Condensation', dueAt: day(-9) },
      { courseId: 'seed-course-1', topic: 'Grignard Reagents',  dueAt: day(-4) },
      { courseId: 'seed-course-2', topic: 'Mitosis',            dueAt: day(-1) },
    ] },
  },
  {
    key: 'quota-partial',
    email: 'seed-quota-partial@studyedge.test',
    why: 'Free tier, 3 of 5 AI actions consumed this month. The remaining count on screen must read 2.',
    row: {
      plan: plan([course(1, 'Cell Biology', 20)]),
      subscription: sub({ aiQueriesUsed: 3, aiQueriesResetAt: day(-5), firstGenerationAt: day(-5) }),
    },
  },
  {
    key: 'quota-wall',
    email: 'seed-quota-wall@studyedge.test',
    why: 'Free tier at the wall, 5 of 5 used. Next AI action must 402, and the copy must not name a parameter.',
    row: {
      plan: plan([course(1, 'Organic Chemistry II', 15)]),
      subscription: sub({ aiQueriesUsed: 5, aiQueriesResetAt: day(-5), firstGenerationAt: day(-5) }),
    },
  },
  {
    key: 'course-no-win',
    email: 'seed-course-no-win@studyedge.test',
    why: 'Has a course but has NEVER had a generation succeed (no firstGenerationAt). This is the control for the card-ask rule: the paywall must refuse to open for this account, and openPaywall should log paywall_suppressed_no_win instead.',
    row: {
      plan: plan([course(1, 'Cell Biology', 22)]),
      subscription: sub({ aiQueriesUsed: 2, aiQueriesResetAt: day(-3) }),
    },
  },
  {
    key: 'zero-course-returning',
    email: 'seed-zero-course-returning@studyedge.test',
    why: 'An EXISTING account with zero courses that has already spent quota. This is the population the quota repair script targets, and it must hit the same first-course gate as a brand new signup.',
    row: {
      plan: plan([]),
      subscription: sub({ aiQueriesUsed: 4, aiQueriesResetAt: day(-9) }),
    },
  },
]

// ── Apply ───────────────────────────────────────────────────────────────────

async function findUser(email) {
  // listUsers is paginated; staging is small enough that one page is plenty.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  return data.users.find(u => u.email === email) ?? null
}

async function upsertStudent(s) {
  let user = await findUser(s.email)

  if (RESET && user) {
    await db.auth.admin.deleteUser(user.id)
    user = null
  }

  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email: s.email,
      password: PASSWORD,
      email_confirm: true,          // no inbox anywhere in this flow
    })
    if (error) throw new Error(`createUser ${s.email}: ${error.message}`)
    user = data.user
  }

  // user_data. Service role, so the subscription guard trigger lets this through.
  const { error: udErr } = await db.from('user_data').upsert(
    { user_id: user.id, ...s.row, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  if (udErr) throw new Error(`user_data ${s.email}: ${udErr.message}`)

  // Child rows are deleted then reinserted so re-running does not accumulate.
  if (s.signals) {
    await db.from('topic_signals').delete().eq('user_id', user.id)
    const { error } = await db.from('topic_signals').insert(
      s.signals.map(x => ({ ...x, user_id: user.id, metadata: {} })))
    if (error) throw new Error(`topic_signals ${s.email}: ${error.message}`)
  }
  if (s.artifacts) {
    await db.from('generated_artifacts').delete().eq('user_id', user.id)
    const { error } = await db.from('generated_artifacts').insert(
      s.artifacts.map(x => ({ ...x, user_id: user.id })))
    if (error) throw new Error(`generated_artifacts ${s.email}: ${error.message}`)
  }
  if (s.uploads) {
    await db.from('course_uploads').delete().eq('user_id', user.id)
    const { error } = await db.from('course_uploads').insert(
      s.uploads.map(x => ({ ...x, user_id: user.id, extracted_text: 'Seeded syllabus text.', status: 'processed' })))
    if (error) throw new Error(`course_uploads ${s.email}: ${error.message}`)
  }

  return user.id
}

console.log(`target project ref: ${ref} (production is refused by envGuard)`)
console.log(`password for every seeded account: ${PASSWORD}\n`)

if (LIST_ONLY) {
  for (const s of STUDENTS) console.log(`${s.email.padEnd(42)} ${s.why}`)
  process.exit(0)
}

const browserPayloads = {}
let made = 0
for (const s of STUDENTS) {
  try {
    await upsertStudent(s)
    const courses = s.row.plan?.courses?.length ?? 0
    const used = s.row.subscription?.aiQueriesUsed ?? 0
    console.log(`  ${s.key.padEnd(24)} ${s.email.padEnd(42)} courses=${courses} aiUsed=${used}/5`)
    if (s.browserOnly) browserPayloads[s.email] = s.browserOnly
    made++
  } catch (err) {
    console.error(`  FAILED ${s.key}: ${err.message}`)
  }
}

writeFileSync('scripts/seed-localstorage.json', JSON.stringify({
  note: 'Browser half of the seeded state. Mastery, streaks and the review queue are localStorage, not database, so they cannot be seeded server side.',
  howToApply: "Log in as the student, open devtools console, then: Object.entries(payload).forEach(([k,v]) => localStorage.setItem(k, JSON.stringify(v)))",
  keyMap: { mastery: 'se_mastery_v2', streak: 'se_streak_v1', reviewDue: 'se_review_queue_v1', lastActiveAt: 'se_last_active_v1' },
  students: browserPayloads,
}, null, 2))

console.log(`\n${made}/${STUDENTS.length} students seeded.`)
console.log('Browser half written to scripts/seed-localstorage.json')
