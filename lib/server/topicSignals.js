// Server-side writer for public.topic_signals.
//
// Two entry points:
//   recordTopicSignal(...)         Single-row write used by server-graded
//                                  endpoints (brain-dump-score,
//                                  teach-it-back, repair-misconception).
//   recordClientSignalBatch(...)   Batch write used by /api/record-signals
//                                  for signals graded in the browser
//                                  against server-generated question topics
//                                  (quiz-burst, practice-exam).
//
// Trust model:
//   The source column on each row records how much the mastery
//   computation should trust it. That column is derived from signal_type
//   via SIGNAL_TYPE_SCORE_RULES, never from the request body. The batch
//   writer additionally refuses any signal_type whose declared source is
//   'server_graded', so a hostile client that forges a server_graded
//   payload cannot land it through /api/record-signals.

import { createClient } from '@supabase/supabase-js'

let _client = null
function getAdminClient() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  }
  return _client
}

// Full type table. Every type resolves to an explicit numeric score at
// write time so no nulls flow into the mastery sum downstream.
//
//   score:  fixed 0..1 number written for this type, or null if the
//           caller supplies rawScore (which we clamp to 0..1).
//   weight: base weight used by lib/server/courseContext.js before
//           recency decay is applied. Higher = more trust.
//   source: recorded on the row. server_graded types are only writable
//           through recordTopicSignal (server-side endpoints).
//           client_graded_server_generated types are only writable
//           through recordClientSignalBatch (the /api/record-signals
//           batch endpoint) and the source is forced regardless of what
//           the request body claims.
//
// Rationale for brain_dump_gap using score=0 at weight=0.5: a gap is
// evidence of not knowing, so it must contribute a low score, but a
// single brain-dump listing three orphan topics should not nuke a
// mastery number that is otherwise supported by solid quiz answers.
// Half weight lets gaps flag a topic without dominating.
export const SIGNAL_TYPE_SCORE_RULES = {
  brain_dump_gap:       { score: 0.0, weight: 0.5, source: 'server_graded' },
  teach_it_back:        { score: null, weight: 1.0, source: 'server_graded' },
  repair_misconception: { score: 0.2, weight: 1.0, source: 'server_graded' },
  quiz_answer:          { score: null, weight: 0.8, source: 'client_graded_server_generated' },
  practice_exam_answer: { score: null, weight: 0.8, source: 'client_graded_server_generated' },
}

function clamp01(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return null
  if (num < 0) return 0
  if (num > 1) return 1
  return num
}

function normalizeTopic(s) {
  return String(s == null ? '' : s).trim()
}

// Single-row server-side insert. Returns { ok, id? , error?, code? }.
// Never throws; server endpoints call this fire-and-forget style
// (await, log on failure) so a signal-write failure never blocks the
// user-facing response.
export async function recordTopicSignal({
  userId,
  courseId,
  courseName,
  topic,
  signalType,
  rawScore,
  metadata,
}) {
  const rules = SIGNAL_TYPE_SCORE_RULES[signalType]
  if (!rules) return { ok: false, error: `unknown signal_type ${signalType}`, code: 'bad_type' }
  if (!userId) return { ok: false, error: 'missing userId', code: 'bad_input' }
  if (typeof courseId !== 'string' || !courseId) {
    return { ok: false, error: 'courseId must be a non-empty string', code: 'bad_course_id' }
  }
  if (!courseName) return { ok: false, error: 'missing courseName', code: 'bad_input' }
  const trimmed = normalizeTopic(topic)
  if (!trimmed) return { ok: false, error: 'topic is empty', code: 'bad_topic' }

  let score
  if (rules.score !== null) {
    score = rules.score
  } else {
    score = clamp01(rawScore)
    if (score === null) return { ok: false, error: 'rawScore required for this signal_type', code: 'bad_score' }
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('topic_signals')
    .insert({
      user_id: userId,
      course_id: courseId,
      course_name: String(courseName),
      topic: trimmed,
      signal_type: signalType,
      source: rules.source,
      score,
      metadata: metadata || {},
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message, code: error.code || 'db_error' }
  return { ok: true, id: data.id }
}

// Pure row-preparation step for client-originated batches. Exposed
// separately from recordClientSignalBatch so tests can verify the
// trust-model rules (forced source, clamping, type whitelist) without
// needing a live database. Returns { rows, errors }.
export function prepareClientSignalRows(userId, entries) {
  const rows = []
  const errors = []
  if (!userId) return { rows, errors: [{ i: -1, code: 'missing_user' }] }
  if (!Array.isArray(entries)) return { rows, errors: [{ i: -1, code: 'bad_input' }] }

  entries.forEach((raw, i) => {
    const rules = SIGNAL_TYPE_SCORE_RULES[raw?.signalType]
    if (!rules) { errors.push({ i, code: 'bad_type' }); return }
    if (rules.source !== 'client_graded_server_generated') {
      // A hostile client cannot claim server-side trust for a type that
      // is only written by server endpoints. Silently drop this row and
      // record the rejection code for observability.
      errors.push({ i, code: 'server_only_type' })
      return
    }

    if (typeof raw.courseId !== 'string' || !raw.courseId) {
      errors.push({ i, code: 'bad_course_id' })
      return
    }
    if (!raw.courseName) { errors.push({ i, code: 'missing_field' }); return }
    const trimmed = normalizeTopic(raw.topic)
    if (!trimmed) { errors.push({ i, code: 'bad_topic' }); return }

    let score
    if (rules.score !== null) {
      score = rules.score
    } else {
      score = clamp01(raw.rawScore)
      if (score === null) { errors.push({ i, code: 'bad_score' }); return }
    }

    rows.push({
      user_id: userId,
      course_id: raw.courseId,
      course_name: String(raw.courseName),
      topic: trimmed,
      signal_type: raw.signalType,
      // Forced regardless of what raw.source says. This is the single
      // point in the code that decides trust; even if the request body
      // claims 'server_graded' with a wildcard score, it lands here as
      // client_graded_server_generated and inherits the weight-0.8
      // trust level of that source in the mastery computation.
      source: 'client_graded_server_generated',
      score,
      metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    })
  })

  return { rows, errors }
}

// Batch insert for client-originated signals. Forces source to
// 'client_graded_server_generated' regardless of caller-supplied value.
// Refuses any signal_type whose declared source is 'server_graded'.
// Returns { ok, written, rejected, errors: [{i, code}] }.
export async function recordClientSignalBatch(userId, entries) {
  if (!userId) return { ok: false, error: 'missing userId', code: 'bad_input' }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: 'entries must be a non-empty array', code: 'bad_input' }
  }

  const { rows, errors } = prepareClientSignalRows(userId, entries)

  if (rows.length === 0) {
    return { ok: false, written: 0, rejected: errors.length, errors, code: 'all_rejected' }
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('topic_signals')
    .insert(rows)
    .select('id')

  if (error) {
    return { ok: false, error: error.message, code: error.code || 'db_error', errors }
  }
  return { ok: true, written: data?.length ?? 0, rejected: errors.length, errors }
}
