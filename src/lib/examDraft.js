// In-progress practice exam, held locally so leaving the exam does not throw
// the student's answers away.
//
// Before this existed, Exit called onExit() straight through and the entry
// screen wiped the answer array. A student who tapped back to check something
// lost every answer with no warning and no way back.
//
// Local rather than in the user_data blob on purpose: this writes on every
// keystroke in a short-answer box, and the questions array is large. A draft is
// worth nothing once the exam is submitted, so it does not need to sync across
// devices. Anything the student actually finishes still goes to the server the
// way it always did.
//
// One draft at a time. Starting a new exam replaces whatever was there, which
// is why the entry screen asks before it does that.

const KEY = 'studyedge_practice_exam_draft'

// Bump when the shape changes so an old draft is dropped rather than restored
// into a screen that cannot read it.
const VERSION = 1

/**
 * Saves the in-progress exam. Never throws: a full or unavailable localStorage
 * must not be able to break the exam the student is sitting.
 */
export function saveExamDraft(draft) {
  try {
    if (!draft?.questions?.length) return false
    localStorage.setItem(KEY, JSON.stringify({
      version: VERSION,
      savedAt: Date.now(),
      courseId: draft.courseId ?? null,
      courseName: draft.courseName ?? null,
      questions: draft.questions,
      answers: Array.isArray(draft.answers) ? draft.answers : [],
      idx: Number.isFinite(draft.idx) ? draft.idx : 0,
      timerMinutes: Number.isFinite(draft.timerMinutes) ? draft.timerMinutes : null,
      secondsLeft: Number.isFinite(draft.secondsLeft) ? draft.secondsLeft : null,
      elapsedMs: Number.isFinite(draft.elapsedMs) ? draft.elapsedMs : 0,
      timings: Array.isArray(draft.timings) ? draft.timings : [],
    }))
    return true
  } catch { return false }
}

/**
 * Reads the draft back, or null when there is nothing usable.
 *
 * A draft is only usable if it still has questions and its answer array still
 * lines up with them. Anything else is treated as absent rather than restored
 * into a half-broken exam.
 */
export function loadExamDraft() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || d.version !== VERSION) return null
    if (!Array.isArray(d.questions) || d.questions.length === 0) return null

    const answers = Array.isArray(d.answers) ? d.answers : []
    // Pad or trim so the screen never indexes past the end.
    const aligned = d.questions.map((_, i) => (typeof answers[i] === 'string' ? answers[i] : ''))

    return {
      ...d,
      answers: aligned,
      idx: Number.isFinite(d.idx) ? Math.min(Math.max(0, d.idx), d.questions.length - 1) : 0,
      answeredCount: aligned.filter(a => a && a.trim().length > 0).length,
    }
  } catch { return null }
}

export function clearExamDraft() {
  try { localStorage.removeItem(KEY) } catch { /* nothing to clean up */ }
}

export function hasExamDraft() {
  return loadExamDraft() !== null
}

/** "3 of 20 answered", for the resume line on the entry screen. */
export function draftSummary(draft) {
  if (!draft) return null
  return `${draft.answeredCount} of ${draft.questions.length} answered`
}
