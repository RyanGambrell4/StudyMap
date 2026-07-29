// Captures the grade baseline for one course -- the computed grade at the
// moment the student first has any graded component. Written once per
// (user, course) via INSERT ... ON CONFLICT DO NOTHING; subsequent calls
// are harmless no-ops.
//
// The server computes the grade from user_data components using the same
// computeGradeFromComponents path courseContext uses. The client supplies
// only courseId -- it never supplies the grade number, so a student
// cannot manufacture a fake starting point.
//
// Called client-side from GradeHubView on mount, fire-and-forget.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
  const { userId } = auth

  const { courseId } = req.body || {}
  if (!courseId || typeof courseId !== 'string') {
    return res.status(400).json({ error: 'courseId is required' })
  }

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('user_data')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return res.status(500).json({ error: 'Failed to load user data' })
  if (!data) return res.status(404).json({ error: 'User data not found' })

  const courses = Array.isArray(data.plan?.courses) ? data.plan.courses : []
  const course = courses.find(c => c && String(c.id) === String(courseId))
  if (!course) return res.status(404).json({ error: 'Course not found' })

  const components = course.gradeData?.components ?? []
  const grade = computeGradeFromComponents(components)
  if (grade === null) {
    return res.status(200).json({ captured: false, reason: 'no_graded_components' })
  }

  const { error: insertErr } = await supabase
    .from('course_grade_baselines')
    .insert({
      user_id: userId,
      course_id: courseId,
      baseline_grade: Math.round(grade * 10) / 10,
    })

  if (insertErr) {
    // 23505 = unique_violation (already exists) -- not an error for this endpoint.
    if (insertErr.code === '23505') {
      return res.status(200).json({ captured: false, reason: 'already_exists' })
    }
    console.error('[capture-grade-baseline] insert failed', insertErr)
    return res.status(500).json({ error: 'Failed to save baseline' })
  }

  return res.status(200).json({ captured: true, baseline: Math.round(grade * 10) / 10 })
}
