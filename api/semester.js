// /api/semester -- semester-view data for My Semester (Layer 1).
//
// Three DB queries assemble the full response:
//   1. generated_artifacts: per-course asset counts and type breakdown
//   2. topic_signals: per-course distinct-topic counts
//   3. user_data: plan (courses, gradeData), completed_sessions,
//      syllabus_events, and grade baselines
//
// No N+1 loops. All per-course aggregation happens server-side.
// The client renders the semester card list from this single response.

import { verifyAuth } from '../lib/server/usage.js'
import { createClient } from '@supabase/supabase-js'

let _client = null
function getAdminClient() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  return _client
}

function computeGradeFromComponents(components) {
  if (!Array.isArray(components) || !components.length) return null
  const graded = components.filter(c => c && c.graded && c.grade !== null && c.grade !== undefined)
  if (!graded.length) return null
  const totalWeight = graded.reduce((s, c) => s + (c.weight || 0), 0)
  if (!totalWeight) return null
  return graded.reduce((s, c) => s + c.grade * c.weight, 0) / totalWeight
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  const now = new Date(new Date().toISOString().split('T')[0] + 'T12:00:00')
  return Math.round((d - now) / 86400000)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
  const { userId } = auth

  const supabase = getAdminClient()

  const [artifactRes, signalRes, userRes, baselineRes] = await Promise.all([
    supabase
      .from('generated_artifacts')
      .select('course_id, artifact_type')
      .eq('user_id', userId),
    supabase
      .from('topic_signals')
      .select('course_id, topic_key')
      .eq('user_id', userId),
    supabase
      .from('user_data')
      .select('plan, completed_sessions, syllabus_events')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('course_grade_baselines')
      .select('course_id, baseline_grade')
      .eq('user_id', userId),
  ])

  if (userRes.error) return res.status(500).json({ error: 'Failed to load user data' })

  const plan = userRes.data?.plan ?? {}
  const courses = Array.isArray(plan.courses) ? plan.courses : []
  const completedSessions = Array.isArray(userRes.data?.completed_sessions) ? userRes.data.completed_sessions : []
  const syllabusEvents = Array.isArray(userRes.data?.syllabus_events) ? userRes.data.syllabus_events : []

  // Build per-course lookup maps from the aggregate queries
  const assetCounts = {}       // courseId -> total count
  const assetTypeCounts = {}   // courseId -> { type -> count }
  for (const row of (artifactRes.data ?? [])) {
    const id = row.course_id
    assetCounts[id] = (assetCounts[id] ?? 0) + 1
    if (!assetTypeCounts[id]) assetTypeCounts[id] = {}
    assetTypeCounts[id][row.artifact_type] = (assetTypeCounts[id][row.artifact_type] ?? 0) + 1
  }

  const topicCounts = {}  // courseId -> Set of topic_key
  for (const row of (signalRes.data ?? [])) {
    if (!topicCounts[row.course_id]) topicCounts[row.course_id] = new Set()
    topicCounts[row.course_id].add(row.topic_key)
  }

  const sessionCounts = {}  // courseId -> count
  for (const s of completedSessions) {
    const id = s.courseId ? String(s.courseId) : null
    if (!id) continue
    sessionCounts[id] = (sessionCounts[id] ?? 0) + 1
  }

  const baselines = {}  // courseId -> baseline_grade
  for (const row of (baselineRes.data ?? [])) {
    baselines[row.course_id] = row.baseline_grade
  }

  // Next upcoming deadline per course (future events only)
  const today = new Date().toISOString().split('T')[0]
  const deadlines = {}  // courseId -> { title, date, daysUntil }
  for (const ev of syllabusEvents) {
    if (!ev.date || ev.date < today) continue
    const courseId = ev.courseId || null
    if (!courseId) continue
    if (!deadlines[courseId] || ev.date < deadlines[courseId].date) {
      deadlines[courseId] = {
        title: ev.title || ev.type || 'Event',
        date: ev.date,
        daysUntil: daysUntil(ev.date),
      }
    }
  }

  // Earliest event date for "weeks in" calculation
  let earliestMs = null
  for (const row of (artifactRes.data ?? [])) {
    if (row.created_at) {
      const t = new Date(row.created_at).getTime()
      if (!earliestMs || t < earliestMs) earliestMs = t
    }
  }
  for (const s of completedSessions) {
    if (s.dateStr) {
      const t = new Date(s.dateStr + 'T12:00:00').getTime()
      if (!earliestMs || t < earliestMs) earliestMs = t
    }
  }
  const weeksIn = earliestMs
    ? Math.max(0, Math.floor((Date.now() - earliestMs) / (7 * 24 * 60 * 60 * 1000)))
    : 0

  // Totals
  const totalAssets = Object.values(assetCounts).reduce((a, b) => a + b, 0)
  const totalSessions = Object.values(sessionCounts).reduce((a, b) => a + b, 0)

  // Per-course card data
  const courseData = courses.map(course => {
    const id = String(course.id)
    const components = course.gradeData?.components ?? []
    const currentGrade = computeGradeFromComponents(components)
    const baseline = baselines[id] ?? null
    const delta = currentGrade !== null && baseline !== null
      ? Math.round((currentGrade - baseline) * 10) / 10
      : null

    return {
      id,
      name: course.name,
      code: course.code || null,
      color: course.color || null,
      targetGrade: course.targetGrade || course.gradeData?.targetGrade || null,
      currentGrade: currentGrade !== null ? Math.round(currentGrade * 10) / 10 : null,
      baselineGrade: baseline,
      delta,
      assetCount: assetCounts[id] ?? 0,
      sessionCount: sessionCounts[id] ?? 0,
      topicCount: topicCounts[id]?.size ?? 0,
      nextDeadline: deadlines[id] ?? null,
    }
  })

  return res.status(200).json({
    courses: courseData,
    totals: { assets: totalAssets, sessions: totalSessions, weeksIn },
  })
}
