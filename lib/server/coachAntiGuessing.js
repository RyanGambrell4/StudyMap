// Anti-guessing prompt guard for every coach-adjacent AI endpoint.
//
// Product rule (non-negotiable): the Study Coach may only surface content
// that comes from the student's own inputs — pasted topic text, extracted
// text from uploaded PDFs/DOCX/notes, syllabus events, marked struggles,
// prior recall data, or completed session records. It must NEVER emit
// subject-specific facts, subtopics, terminology, chapter names, exam-
// question types, mnemonics, or curricular structure from the model's
// world knowledge of the course name.
//
// Any endpoint that generates coach-facing content must:
//   1. Include ANTI_GUESSING_RULES in its system prompt verbatim.
//   2. Route the student's raw content through the prompt as the sole
//      grounding source.
//   3. When no student content is provided, either:
//        a. Skip the AI call entirely and return a content-neutral
//           structural response (blocks/durations/methods only), OR
//        b. Include NO_STUDENT_CONTENT_DIRECTIVE and enforce it in
//           schema/repair code so the output cannot contain subject
//           facts.

export const ANTI_GUESSING_RULES = `HARD ANTI-GUESSING RULES (violating any of these is a bug):
- You may ONLY use content that appears verbatim in the student inputs below (pasted topics, extracted upload text, syllabus events, struggle notes, recall history). Treat this as your entire universe of subject knowledge for this response.
- You may NOT introduce topics, subtopics, terms, chapter names, exam-question categories, formulas, mnemonics, or curriculum structure based on your own knowledge of the course name or subject area. The course name is a label, not a source of content.
- If the student's inputs do not mention a concept, that concept does not exist for this response.
- When you need a session focus and the student has not supplied a specific topic for that slot, describe a STUDY METHOD or ACTIVITY (e.g. "Active recall on this week's assigned reading", "Build flashcards from your notes", "Cumulative review of prior weeks") — never invent a subject-specific focus.
- keyTopics arrays must be a subset (case-insensitive) of terms present in the student inputs. Emit an empty array rather than fabricate.
- priorityTopics and warningZones must either derive from student inputs or be phrased as generic study-method guidance ("Cramming without retrieval practice", "Skipping cumulative review"). Never subject-specific.
- Being generic-but-honest always beats being specific-but-fabricated. Silence beats invention.`

// Compact one-liner for endpoints where the guard is enforced entirely in
// code (e.g. blueprint neutral-mode) but the model still needs the rule.
export const ANTI_GUESSING_ONELINE =
  'Use only the student-provided context below; never introduce subject facts, subtopics, or terminology from your own knowledge of the course name.'

// Directive appended to the user prompt when hasStudentContent === false.
export const NO_STUDENT_CONTENT_DIRECTIVE = `NO STUDENT CONTENT WAS PROVIDED.
Do not describe any subject-specific content. Every focusArea, keyTopics entry, priorityTopic, and warningZone must reference a study method or activity, not subject matter. Use the vocabulary in the allowed-methods list.`

// True when the student provided some grounding for the AI to draw on.
// Callers should pass ALL grounding fields they collected (any string
// present + non-empty counts as content).
export function hasStudentContent(...fields) {
  return fields.some(f => {
    if (f == null) return false
    if (typeof f === 'string') return f.trim().length > 0
    if (Array.isArray(f)) return f.length > 0
    return true
  })
}

// Post-hoc scrub: given a generated string field and the student's raw
// input text, ensure the field contains something the student wrote or
// looks like generic method language. Returns the field unchanged when
// it passes, or a safe generic replacement when it fails. Callers that
// need per-field policy should build their own; this is a safety net.
const GENERIC_METHOD_TOKENS = [
  'recall', 'retrieval', 'practice', 'review', 'flashcard', 'flashcards',
  'concept map', 'feynman', 'worked example', 'mixed problem', 'past exam',
  'timed drill', 'cumulative', 'mock test', 'spaced', 'notes',
  'lecture', 'reading', 'assignment', 'syllabus', 'material',
]

export function isMethodOnly(text) {
  const t = String(text || '').toLowerCase()
  if (!t) return true
  return GENERIC_METHOD_TOKENS.some(tok => t.includes(tok))
}

// True if the candidate content appears in the student's raw text
// (case-insensitive substring in either direction, minimum 3 chars).
export function isGroundedInStudent(candidate, ...studentTexts) {
  const c = String(candidate || '').toLowerCase().trim()
  if (c.length < 3) return true
  const bag = studentTexts.filter(Boolean).map(x => String(x).toLowerCase()).join('\n')
  if (!bag) return false
  // The candidate is grounded if any 4+ char word from it appears in the bag,
  // OR the bag contains the candidate as a substring.
  if (bag.includes(c)) return true
  const words = c.split(/[^a-z0-9]+/).filter(w => w.length >= 4)
  return words.some(w => bag.includes(w))
}
