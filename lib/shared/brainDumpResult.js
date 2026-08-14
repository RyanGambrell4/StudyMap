// Shaping and gating for a Brain Dump result.
//
// Lives in lib/shared because both sides need the same rule: the server
// applies it before responding, and the client asserts against it before
// rendering. The rule is small and absolute.
//
//   The "You missed" list may only exist when the dump was actually compared
//   against the student's own uploaded material.
//
// comparedAgainstMaterial is computed from the presence of retrieved excerpts,
// never from anything the model said. A model that returns a missed list
// anyway has its list dropped here. The alternative is presenting a model's
// guess at a syllabus to a student as "your material", which is the one thing
// this screen must never do.

// Max items kept per list. Enough to be useful, short enough to read.
const MAX_COVERED = 8
const MAX_MISSED = 6

function cleanString(s) {
  return typeof s === 'string' && s.trim() ? s.trim() : null
}

export function shapeBrainDumpResult(raw, { comparedAgainstMaterial, materialFiles = [], courseName = null } = {}) {
  const result = { ...(raw && typeof raw === 'object' ? raw : {}) }

  result.covered = Array.isArray(result.covered)
    ? result.covered.map(cleanString).filter(Boolean).slice(0, MAX_COVERED)
    : []

  if (comparedAgainstMaterial) {
    result.missed = Array.isArray(result.missed)
      ? result.missed
          .map(m => {
            const point = cleanString(m?.point)
            if (!point) return null
            return { point, source: cleanString(m?.source) }
          })
          .filter(Boolean)
          .slice(0, MAX_MISSED)
      : []
  } else {
    // Not emptied, removed. An empty array reads as "nothing was missed",
    // which is a claim we have no standing to make.
    delete result.missed
  }

  result.material = {
    compared: Boolean(comparedAgainstMaterial),
    files: (Array.isArray(materialFiles) ? materialFiles : []).map(cleanString).filter(Boolean).slice(0, MAX_MISSED),
    courseName: cleanString(courseName),
  }

  return result
}

// Postgres error codes that mean the write will fail the same way every time:
// the table, column, or allowed-value set is not what the code expects. A
// student clicking retry against one of these gets the same failure forever,
// so the UI must not offer the button.
//
//   23514 check_violation      signal_type not in the constraint's list,
//                              which is what a missing migration looks like
//   42P01 undefined_table
//   42703 undefined_column
//   42501 insufficient_privilege
const PERMANENT_WRITE_FAILURES = new Set(['23514', '42P01', '42703', '42501'])

/**
 * Whether a failed evidence write is worth retrying.
 *
 * Anything not in the permanent set is treated as retryable, including an
 * unrecognised code: offering a retry that fails is a smaller harm than
 * hiding one that would have worked.
 */
export function isRetryableWriteFailure(code) {
  if (code == null) return true
  return !PERMANENT_WRITE_FAILURES.has(String(code))
}

// The evidence record a scored dump becomes on the map. One shape, built in
// one place, so the write and the optimistic client-side render cannot drift.
export function buildWriteBackRecord({ topic, courseId, courseName, score, at }) {
  const cleanTopic = cleanString(topic)
  if (!cleanTopic) return null
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  return {
    topic: cleanTopic,
    courseId: courseId ?? null,
    courseName: cleanString(courseName),
    signalType: 'brain_dump_score',
    source: 'Brain Dump',
    score: Math.round(score),
    at: typeof at === 'number' && Number.isFinite(at) ? at : null,
  }
}
