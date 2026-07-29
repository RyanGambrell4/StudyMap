// /api/semester-course?courseId=X -- course-view data for My Semester (Layer 2).
//
// Returns all data needed to render the three Layer 2 groups:
//   "From you"       -> course_uploads rows
//   "Made for you"   -> generated_artifacts rows (metadata only, no payload)
//   "What you know"  -> mastery grid, session history, brain dump excerpts
//
// Mastery is computed server-side via the same computeTopicMastery export
// from courseContext.js -- no forked formula, per ground rules.

import { verifyAuth } from '../lib/server/usage.js'
import { createClient } from '@supabase/supabase-js'
import { computeTopicMastery } from '../lib/server/courseContext.js'

let _client = null
function getAdminClient() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  return _client
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
  const { userId } = auth

  const { courseId } = req.query
  if (!courseId || typeof courseId !== 'string') {
    return res.status(400).json({ error: 'courseId query param required' })
  }

  const supabase = getAdminClient()

  const [artifactRes, uploadsRes, signalsRes, userRes, baselineRes] = await Promise.all([
    supabase
      .from('generated_artifacts')
      .select('id, artifact_type, title, topic, created_at')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false }),
    supabase
      .from('course_uploads')
      .select('id, filename, file_type, kind, char_count, uploaded_at')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('topic_signals')
      .select('signal_type, score, topic, topic_key, created_at')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .gte('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('user_data')
      .select('plan, completed_sessions, session_recalls, syllabus_events')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('course_grade_baselines')
      .select('baseline_grade, captured_at')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .maybeSingle(),
  ])

  if (userRes.error) return res.status(500).json({ error: 'Failed to load user data' })

  const plan = userRes.data?.plan ?? {}
  const courses = Array.isArray(plan.courses) ? plan.courses : []
  const course = courses.find(c => c && String(c.id) === String(courseId))
  if (!course) return res.status(404).json({ error: 'Course not found' })

  const allSessions = Array.isArray(userRes.data?.completed_sessions) ? userRes.data.completed_sessions : []
  const allRecalls  = Array.isArray(userRes.data?.session_recalls)    ? userRes.data.session_recalls    : []
  const syllabusEvents = Array.isArray(userRes.data?.syllabus_events) ? userRes.data.syllabus_events : []

  // Filter sessions and recalls to this course by stable courseId then name fallback
  const courseNameNorm = (course.name || '').trim().toLowerCase()
  function matchesCourse(row) {
    const rawId = row?.courseId
    if (typeof rawId === 'string' && rawId) return rawId === String(courseId)
    if (typeof rawId === 'number') {
      const idx = courses.findIndex(c => c && String(c.id) === String(courseId))
      return rawId === idx
    }
    return (row?.courseName || '').trim().toLowerCase() === courseNameNorm
  }

  const sessions = allSessions
    .filter(matchesCourse)
    .sort((a, b) => String(b.dateStr || '').localeCompare(String(a.dateStr || '')))
    .slice(0, 50)
    .map(s => ({
      id: s.id,
      dateStr: s.dateStr,
      sessionType: s.sessionType ?? null,
      duration: s.duration ?? null,
      recallScore: typeof s.recallScore === 'number' ? Math.round(s.recallScore * 100) : null,
    }))

  // Mastery grid via the canonical computeTopicMastery -- no fork
  const masteryRows = computeTopicMastery(signalsRes.data ?? [])

  // Upcoming deadlines for this course
  const today = new Date().toISOString().split('T')[0]
  const upcomingDeadlines = syllabusEvents
    .filter(ev => ev.date >= today && (ev.courseId === String(courseId) || (ev.courseName || '').trim().toLowerCase() === courseNameNorm))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)
    .map(ev => ({ title: ev.title || ev.type || 'Event', date: ev.date }))

  // Grade summary
  function computeGradeFromComponents(components) {
    if (!Array.isArray(components) || !components.length) return null
    const graded = components.filter(c => c && c.graded && c.grade !== null && c.grade !== undefined)
    if (!graded.length) return null
    const totalWeight = graded.reduce((s, c) => s + (c.weight || 0), 0)
    if (!totalWeight) return null
    return graded.reduce((s, c) => s + c.grade * c.weight, 0) / totalWeight
  }
  const components = course.gradeData?.components ?? []
  const currentGrade = computeGradeFromComponents(components)
  const baseline = baselineRes.data?.baseline_grade ?? null
  const delta = currentGrade !== null && baseline !== null
    ? Math.round((currentGrade - baseline) * 10) / 10
    : null

  return res.status(200).json({
    course: {
      id: String(courseId),
      name: course.name,
      code: course.code || null,
      color: course.color || null,
      targetGrade: course.targetGrade || course.gradeData?.targetGrade || null,
      currentGrade: currentGrade !== null ? Math.round(currentGrade * 10) / 10 : null,
      baselineGrade: baseline,
      delta,
    },
    uploads: uploadsRes.data ?? [],
    artifacts: artifactRes.data ?? [],
    mastery: masteryRows,
    sessions,
    upcomingDeadlines,
    stats: {
      assetCount: (artifactRes.data ?? []).length,
      sessionCount: sessions.length,
      topicCount: masteryRows.filter(m => m.sufficient).length,
    },
  })
}
