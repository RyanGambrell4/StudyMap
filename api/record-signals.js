// Batched client-graded topic-signal endpoint.
//
// Used by the client after it locally grades server-generated questions
// (quiz-burst blocks, practice-exam results). The topic strings on each
// question came from a server endpoint originally, so we trust the
// labeling; only the correctness score was produced in the browser,
// which is why every row lands as source='client_graded_server_generated'
// regardless of what the request body claims.
//
// Hard rules enforced here (defence in depth over the DB CHECK
// constraints and the helper's own guards):
//   - Auth required (verifyAuth). No boost consumed; this is a bookkeeping
//     endpoint, not an AI call.
//   - Body must be { signals: [...] } with 1 to 50 entries. Larger
//     batches are rejected at the boundary before any DB work.
//   - Each entry must declare signal_type from the client-writable
//     whitelist. server_graded types are refused outright.
//   - Score is clamped to [0, 1]; entries without a valid numeric score
//     are dropped.
//   - courseId must be a non-empty string. Numeric array indexes are
//     rejected (this is enforced by the helper as well).
//   - source is forced to 'client_graded_server_generated'. A client
//     claiming source='server_graded' has no effect.

import { verifyAuth } from '../lib/server/usage.js'
import { recordClientSignalBatch, SIGNAL_TYPE_SCORE_RULES } from '../lib/server/topicSignals.js'

const MAX_BATCH = 50

// Only these signal_type values are ever writable through this endpoint.
// Types not in this set (brain_dump_gap, teach_it_back,
// repair_misconception) are server-graded and land through their own
// endpoints on the same request lifecycle as the AI grading call.
const CLIENT_WRITABLE_TYPES = Object.entries(SIGNAL_TYPE_SCORE_RULES)
  .filter(([, r]) => r.source === 'client_graded_server_generated')
  .map(([t]) => t)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { signals } = req.body || {}
  if (!Array.isArray(signals)) {
    return res.status(400).json({ error: 'Body must include signals: []' })
  }
  if (signals.length === 0) {
    return res.status(400).json({ error: 'signals array is empty' })
  }
  if (signals.length > MAX_BATCH) {
    return res.status(400).json({ error: `Batch exceeds max of ${MAX_BATCH} signals` })
  }

  // Pre-filter obvious garbage before the helper sees the batch, so we
  // return a clean 400 for wholly invalid submissions rather than a
  // half-success. The helper still validates each row.
  const filtered = signals.filter((s) => s && typeof s === 'object' && CLIENT_WRITABLE_TYPES.includes(s.signalType))
  if (filtered.length === 0) {
    return res.status(400).json({
      error: 'No entries had an allowed signalType',
      allowed_types: CLIENT_WRITABLE_TYPES,
    })
  }

  const result = await recordClientSignalBatch(auth.userId, filtered)
  if (!result.ok && result.code !== 'all_rejected') {
    console.error('[record-signals] batch failed', result)
    return res.status(500).json({ error: 'Failed to record signals' })
  }

  return res.status(200).json({
    written: result.written || 0,
    rejected: result.rejected || 0,
    errors: result.errors || [],
  })
}
