/**
 * coachPlanValidate.js - the gate a generated plan must pass before it is
 * stored or shown.
 *
 * The rule this file exists to enforce: nothing in a plan may originate from
 * the model's imagination. Every topic traces to something the student typed
 * (their topic list or a Struggle Tracker entry), every date sits inside the
 * window the student gave us, and every session carries a provenance field
 * naming the input that produced it.
 *
 * Provenance is assigned here, server-side and deterministically, rather than
 * trusted from the model. If we cannot trace a session back to an input, that
 * is a validation failure, not something to paper over with a default.
 */

import { parseISO, flattenSessions } from '../shared/coachPlan.js'

// ── Normalisation ────────────────────────────────────────────────────────────
// Matching is deliberately forgiving about case, punctuation and plurals, and
// deliberately strict about everything else. "Krebs Cycle", "krebs cycle" and
// "the Krebs cycle." all match the input topic "Krebs cycle"; "Calvin cycle"
// does not.

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function singular(word) {
  if (word.length > 3 && word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.length > 3 && word.endsWith('ses')) return word.slice(0, -2)
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

function stem(s) {
  return normalize(s).split(' ').map(singular).join(' ')
}

/** True when `needle` appears in `haystack` as a whole phrase, or vice versa. */
function phraseMatch(a, b) {
  const sa = stem(a)
  const sb = stem(b)
  if (!sa || !sb) return false
  if (sa === sb) return true
  const wrap = s => ` ${s} `
  return wrap(sa).includes(wrap(sb)) || wrap(sb).includes(wrap(sa))
}

// ── The input set ────────────────────────────────────────────────────────────

function slug(s) {
  return normalize(s).replace(/\s+/g, '-').slice(0, 48) || 'unknown'
}

/**
 * Builds the closed set of things a plan is allowed to talk about: the
 * student's own topic list plus their Struggle Tracker entries. Nothing else
 * is a valid provenance source.
 */
export function buildInputTopics({ emphasisTopics = '', struggles = [] } = {}) {
  const out = []
  const seen = new Set()

  const push = (label, kind) => {
    const clean = String(label ?? '').trim()
    if (!clean) return
    const key = `${kind}:${stem(clean)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ id: `${kind}:${slug(clean)}`, kind, label: clean })
  }

  const topicList = Array.isArray(emphasisTopics)
    ? emphasisTopics
    : String(emphasisTopics || '').split(/[,;\n]/)
  topicList.forEach(t => push(t, 'topic'))
  ;(Array.isArray(struggles) ? struggles : [struggles]).forEach(t => push(t, 'struggle'))

  return out
}

/**
 * Finds the input that best explains a session. Struggle entries win ties, so
 * a session covering a topic the student also flagged as a struggle is marked
 * as coming from the Struggle Tracker, which is what the amber dot in the
 * topics strip reads.
 */
export function resolveProvenance(session, inputTopics) {
  if (!inputTopics.length) return null
  const haystack = [
    session?.provenanceLabel,
    session?.focusArea,
    ...(Array.isArray(session?.keyTopics) ? session.keyTopics : []),
    session?.sessionLabel,
  ].filter(Boolean)

  const hits = inputTopics.filter(t => haystack.some(h => phraseMatch(h, t.label)))
  if (!hits.length) return null
  const preferred = hits.find(h => h.kind === 'struggle') ?? hits[0]
  return { kind: preferred.kind, id: preferred.id, label: preferred.label }
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a generated plan against the student's inputs and stamps
 * provenance on every session it can trace.
 *
 * Returns { ok, violations, plan }. `violations` are phrased as instructions,
 * because they are fed back into the model verbatim on the repair pass.
 */
export function validatePlan(plan, {
  inputTopics = [],
  today,
  examDate = null,
  sessionMinutes = 60,
  expectedSessionCount = null,
} = {}) {
  const violations = []
  const flat = flattenSessions(plan)

  if (!flat.length) {
    return { ok: false, violations: ['The plan contained no sessions. Generate the full schedule.'], plan }
  }

  // 1. Grounding: every session must trace to a student input.
  if (inputTopics.length) {
    const allowed = inputTopics.map(t => t.label).join(', ')
    for (const { session, ordinal } of flat) {
      const prov = resolveProvenance(session, inputTopics)
      if (prov) {
        session.provenance = prov
      } else {
        violations.push(
          `Session ${ordinal} ("${session.focusArea || session.sessionLabel || 'untitled'}") does not reference any topic the student provided. ` +
          `Rewrite it to cover one of these verbatim: ${allowed}.`
        )
      }
      delete session.provenanceLabel
    }
  }

  // 2. Invented topics: keyTopics may only name things the student gave us.
  if (inputTopics.length) {
    for (const { session, ordinal } of flat) {
      const bad = (session.keyTopics || []).filter(
        t => !inputTopics.some(input => phraseMatch(t, input.label))
      )
      if (bad.length) {
        violations.push(
          `Session ${ordinal} lists topics the student never mentioned: ${bad.join(', ')}. Remove them or replace them with the student's own topics.`
        )
      }
    }
  }

  // 3. Dates: inside [today, examDate].
  for (const { session, ordinal } of flat) {
    const d = session.scheduledDate
    if (!parseISO(d)) {
      violations.push(`Session ${ordinal} has no valid scheduledDate.`)
      continue
    }
    if (d < today) {
      violations.push(`Session ${ordinal} is scheduled for ${d}, which is in the past. Schedule it on or after ${today}.`)
    }
    if (examDate && parseISO(examDate) && d > examDate) {
      violations.push(`Session ${ordinal} is scheduled for ${d}, after the exam on ${examDate}. Move it before the exam.`)
    }
  }

  // 4. Internal consistency: durations sane, count as requested.
  for (const { session, ordinal } of flat) {
    const dur = Number(session.duration)
    if (!Number.isFinite(dur) || dur <= 0 || dur > 300) {
      violations.push(`Session ${ordinal} has an implausible duration (${session.duration}). Use ${sessionMinutes} minutes.`)
    }
  }
  if (expectedSessionCount != null && flat.length !== expectedSessionCount) {
    violations.push(`The plan has ${flat.length} sessions but ${expectedSessionCount} were requested. Emit exactly ${expectedSessionCount}.`)
  }

  // 5. Provenance must end up populated on every session.
  if (inputTopics.length) {
    const missing = flat.filter(f => !f.session.provenance).length
    if (missing && !violations.length) {
      violations.push(`${missing} sessions are missing provenance.`)
    }
  }

  return { ok: violations.length === 0, violations, plan }
}

/** Turns violations into the repair instruction appended to the retry prompt. */
export function buildRepairPrompt(violations) {
  return `Your previous plan was rejected. Fix every problem listed below and return the corrected JSON in exactly the same shape. Change nothing else.

${violations.map((v, i) => `${i + 1}. ${v}`).join('\n')}

Remember: you may only reference topics the student provided, verbatim. If there are too few topics to fill the schedule, repeat topics with different study methods rather than inventing new material. Output the JSON now.`
}

/** Consistency check the plan view relies on: sessions x duration = total hours. */
export function totalPlannedMinutes(plan) {
  return flattenSessions(plan).reduce((sum, f) => sum + (Number(f.session.duration) || 0), 0)
}
