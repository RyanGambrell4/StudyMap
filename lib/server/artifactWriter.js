// Server-side writer for public.generated_artifacts.
//
// saveArtifact({ userId, courseId, courseName, artifactType, title, topic, payload })
//   Returns { ok, id?, error? }. Never throws. Every generator endpoint
//   calls this fire-and-forget style: await, log on failure, student
//   always gets their artifact regardless of whether the write lands.
//
// artifact_type values (enforced here, no DB check constraint):
//   cheat_sheet | practice_exam | quiz_burst | diagram | podcast |
//   brain_dump  | essay_outline | mnemonic   | flashcard_set
//
// courseId must be the stable string course.id, never a numeric index.
// topic is nullable -- some artifact types (podcast) have no per-topic focus.

import { createClient } from '@supabase/supabase-js'

const VALID_TYPES = new Set([
  'cheat_sheet',
  'practice_exam',
  'quiz_burst',
  'diagram',
  'podcast',
  'brain_dump',
  'essay_outline',
  'mnemonic',
  'flashcard_set',
])

let _client = null
function getAdminClient() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  }
  return _client
}

export async function saveArtifact({ userId, courseId, courseName, artifactType, title, topic, payload }) {
  if (!userId)   return { ok: false, error: 'missing userId' }
  if (!courseId || typeof courseId !== 'string') {
    return { ok: false, error: 'courseId must be a non-empty string' }
  }
  if (!courseName) return { ok: false, error: 'missing courseName' }
  if (!VALID_TYPES.has(artifactType)) {
    return { ok: false, error: `unknown artifactType: ${artifactType}` }
  }
  if (!title || !title.trim()) return { ok: false, error: 'missing title' }
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'payload must be an object' }
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('generated_artifacts')
    .insert({
      user_id:       userId,
      course_id:     courseId,
      course_name:   String(courseName),
      artifact_type: artifactType,
      title:         title.trim(),
      topic:         topic ? String(topic).trim() || null : null,
      payload,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message, code: error.code }
  return { ok: true, id: data.id }
}
