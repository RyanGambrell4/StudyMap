// Persistent per-course upload registry writer.
// Client extracts text browser-side (extractText.js), POSTs metadata + text here,
// we insert a row in course_uploads. No raw files are stored server-side.
import { verifyAuth } from '../lib/server/usage.js'

import { supabaseAdmin as supabase } from '../lib/server/supabaseAdmin.js'
const ALLOWED_TYPES = ['pdf', 'docx', 'pptx', 'txt', 'md']
const ALLOWED_KINDS = ['material', 'syllabus']
const MAX_CHARS = 200000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { courseId, filename, fileType, kind, extractedText, status, errorMessage } = req.body ?? {}

  if (!courseId || typeof courseId !== 'string') {
    return res.status(400).json({ error: 'courseId is required' })
  }
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'filename is required' })
  }
  if (!fileType || !ALLOWED_TYPES.includes(String(fileType).toLowerCase())) {
    return res.status(400).json({ error: `fileType must be one of ${ALLOWED_TYPES.join(', ')}` })
  }

  const resolvedKind = ALLOWED_KINDS.includes(kind) ? kind : 'material'
  const finalStatus = status === 'failed' ? 'failed' : 'processed'
  const text = typeof extractedText === 'string' ? extractedText.slice(0, MAX_CHARS) : ''
  if (finalStatus === 'processed' && !text.trim()) {
    return res.status(400).json({ error: 'extractedText is required for processed uploads' })
  }

  const { data, error } = await supabase.from('course_uploads').insert({
    user_id: auth.userId,
    course_id: courseId,
    filename: filename.slice(0, 255),
    file_type: String(fileType).toLowerCase(),
    kind: resolvedKind,
    char_count: text.length,
    extracted_text: text,
    status: finalStatus,
    error_message: finalStatus === 'failed' ? (typeof errorMessage === 'string' ? errorMessage.slice(0, 500) : null) : null,
  }).select('id, filename, file_type, kind, uploaded_at, char_count, status, error_message').single()

  if (error) {
    console.error('[upload-material] supabase error:', error)
    return res.status(500).json({ error: 'Failed to save upload' })
  }

  return res.status(200).json({ ok: true, upload: data })
}
