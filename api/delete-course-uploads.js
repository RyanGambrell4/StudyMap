// Delete uploads:
//   POST { courseId, uploadId? }
// If uploadId is provided, deletes just that one row (must belong to caller).
// Otherwise, deletes every upload for the given course.
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../lib/server/usage.js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { courseId, uploadId } = req.body ?? {}

  if (uploadId) {
    const { error, count } = await supabase.from('course_uploads')
      .delete({ count: 'exact' })
      .eq('user_id', auth.userId)
      .eq('id', uploadId)
    if (error) {
      console.error('[delete-course-uploads] supabase error:', error)
      return res.status(500).json({ error: 'Failed to delete upload' })
    }
    return res.status(200).json({ ok: true, deleted: count ?? 0 })
  }

  if (!courseId || typeof courseId !== 'string') {
    return res.status(400).json({ error: 'courseId or uploadId is required' })
  }

  const { error, count } = await supabase.from('course_uploads')
    .delete({ count: 'exact' })
    .eq('user_id', auth.userId)
    .eq('course_id', courseId)

  if (error) {
    console.error('[delete-course-uploads] supabase error:', error)
    return res.status(500).json({ error: 'Failed to delete uploads' })
  }
  return res.status(200).json({ ok: true, deleted: count ?? 0 })
}
