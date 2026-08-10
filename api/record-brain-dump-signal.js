// Retry the evidence write for a Brain Dump that was already scored.
//
// Why this exists: when the topic_signals write fails, the result screen says
// so and offers a retry. That retry used to re-post the dump text to
// /api/brain-dump-score, which re-ran the whole scoring: another model call,
// another AI credit, another feature-usage increment, and a different score
// than the one on screen. The student was charged for a database problem.
//
// This endpoint writes the signal and nothing else. No model call, no credit.
//
// The trust model is the reason it takes an artifact id rather than a score.
// brain_dump_score is server_graded at full weight, so a client-supplied
// score would let anyone POST a 100 for any topic; recordClientSignalBatch
// refuses server_graded types for exactly this reason. Here the only thing
// the client provides is the id of a row it already owns, and the score,
// topic, and course are read back out of generated_artifacts, which was
// written server-side by the scoring endpoint. The RLS-equivalent check is
// explicit: the artifact must belong to the authenticated user.

import { verifyAuth } from '../lib/server/usage.js'
import { recordTopicSignal } from '../lib/server/topicSignals.js'
import { isRetryableWriteFailure } from '../lib/shared/brainDumpResult.js'
import { createClient } from '@supabase/supabase-js'

let _client = null
function getAdminClient() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  }
  return _client
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { artifactId } = req.body || {}
  if (!artifactId || typeof artifactId !== 'string') {
    return res.status(400).json({ error: 'artifactId is required' })
  }

  const supabase = getAdminClient()
  const { data: artifact, error: readError } = await supabase
    .from('generated_artifacts')
    .select('id, user_id, course_id, course_name, topic, payload')
    .eq('id', artifactId)
    .eq('user_id', auth.userId)
    .eq('artifact_type', 'brain_dump')
    .maybeSingle()

  if (readError) {
    console.error('[record-brain-dump-signal] artifact read failed', readError)
    return res.status(500).json({ error: 'Could not read that Brain Dump.', recorded: false, retryable: true })
  }
  // Also the not-found case for an artifact owned by someone else: the
  // user_id filter above makes those indistinguishable, which is the point.
  if (!artifact) return res.status(404).json({ error: 'Brain Dump not found.', recorded: false, retryable: false })

  const topic = typeof artifact.topic === 'string' ? artifact.topic.trim() : ''
  const score = artifact.payload?.score
  if (!topic || typeof score !== 'number' || !Number.isFinite(score)) {
    return res.status(422).json({
      error: 'That Brain Dump has no topic or no score to record.',
      recorded: false,
      retryable: false,
    })
  }

  const write = await recordTopicSignal({
    userId: auth.userId,
    courseId: artifact.course_id,
    courseName: artifact.course_name,
    topic,
    signalType: 'brain_dump_score',
    rawScore: Math.max(0, Math.min(1, score / 100)),
    metadata: {
      compared_against_material: Boolean(artifact.payload?.comparedAgainstMaterial),
      material_files: Array.isArray(artifact.payload?.materialFiles) ? artifact.payload.materialFiles : [],
      retried_from_artifact: artifact.id,
    },
  })

  if (!write.ok) {
    console.error('[record-brain-dump-signal] signal write failed', write)
    return res.status(200).json({
      recorded: false,
      retryable: isRetryableWriteFailure(write.code),
    })
  }

  return res.status(200).json({ recorded: true, retryable: false })
}
