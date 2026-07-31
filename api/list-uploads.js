// List uploads for a course, or fetch a single upload's full text.
// GET /api/list-uploads?courseId=X          -> metadata list (no text)
// GET /api/list-uploads?courseId=X&full=1   -> includes extracted_text
// GET /api/list-uploads?uploadId=Y          -> single row with extracted_text
import { verifyAuth } from '../lib/server/usage.js'

import { supabaseAdmin as supabase } from '../lib/server/supabaseAdmin.js'
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { courseId, uploadId, full } = req.query ?? {}

  if (uploadId) {
    const { data, error } = await supabase.from('course_uploads')
      .select('id, course_id, filename, file_type, kind, uploaded_at, char_count, extracted_text, status, error_message')
      .eq('user_id', auth.userId)
      .eq('id', uploadId)
      .maybeSingle()
    if (error) {
      console.error('[list-uploads] supabase error:', error)
      return res.status(500).json({ error: 'Failed to load upload' })
    }
    if (!data) return res.status(404).json({ error: 'Upload not found' })
    return res.status(200).json({ upload: data })
  }

  if (!courseId || typeof courseId !== 'string') {
    return res.status(400).json({ error: 'courseId or uploadId is required' })
  }

  const selectCols = full === '1' || full === 'true'
    ? 'id, filename, file_type, kind, uploaded_at, char_count, extracted_text, status, error_message'
    : 'id, filename, file_type, kind, uploaded_at, char_count, status, error_message'

  const { data, error } = await supabase.from('course_uploads')
    .select(selectCols)
    .eq('user_id', auth.userId)
    .eq('course_id', courseId)
    .order('uploaded_at', { ascending: false })

  if (error) {
    console.error('[list-uploads] supabase error:', error)
    return res.status(500).json({ error: 'Failed to load uploads' })
  }

  return res.status(200).json({ uploads: data ?? [] })
}
