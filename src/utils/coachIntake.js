/**
 * coachIntake.js - the live feedback logic for intake step 1.
 *
 * Transcribed from design/study-coach-flow/IntakeStep1.dc.html. Kept pure so
 * the per-card counts, the footer status line and the submit-enable rule can
 * be tested without rendering anything.
 *
 * This replaces the old "Plan confidence" score, which was fiction: it
 * double-counted struggles, its last two terms were always truthy because
 * daysPerWeek and sessionLen have defaults, and the hub passed a hardcoded 9
 * so it always displayed 100 percent. Counts of real inputs replace it.
 */

/** Struggle areas as the generator reads them: comma or newline separated. */
export function struggleAreas(text) {
  return String(text ?? '')
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** Deadlines that are actually usable: both a label and a date. */
export function validDeadlines(dates) {
  return (dates ?? []).filter(d => d?.date && String(d?.label ?? '').trim())
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The green check and count in each card's top right corner. Null means the
 * card has nothing in it yet and shows no feedback at all.
 */
export function cardFeedback(form, courses = []) {
  const courseName = form?.courseIdx >= 0 ? courses[form.courseIdx]?.name ?? null : null
  const goalSet = !!String(form?.goal ?? '').trim()

  const card1 = courseName && goalSet
    ? 'Course and goal set'
    : (courseName || (goalSet ? 'Goal set' : null))

  const c2 = []
  const topics = form?.topics ?? []
  const areas = struggleAreas(form?.struggles)
  if (topics.length) c2.push(plural(topics.length, 'topic'))
  if (areas.length) c2.push(plural(areas.length, 'struggle area'))

  const c3 = []
  const deadlines = validDeadlines(form?.dates)
  if (deadlines.length) c3.push(plural(deadlines.length, 'deadline'))
  if (form?.daysPerWeek) c3.push(`${form.daysPerWeek} days a week`)
  if (form?.sessionLen) c3.push(`${form.sessionLen} min sessions`)

  return {
    card1,
    card2: c2.length ? c2.join(', ') : null,
    card3: c3.length ? c3.join(', ') : null,
  }
}

/**
 * The sticky footer: whether Review my input is enabled, and the status line.
 *
 * Incomplete states name exactly what is missing rather than saying something
 * vague, so the student never has to hunt for the blocked field.
 */
export function footerState(form, courses = []) {
  const hasCourse = form?.courseIdx >= 0 && !!courses[form.courseIdx]
  const goalSet = !!String(form?.goal ?? '').trim()
  const ready = hasCourse && goalSet

  if (!ready) {
    const missing = [
      !hasCourse ? 'Pick a course' : null,
      !goalSet ? 'describe your goal' : null,
    ].filter(Boolean)
    const phrase = missing.length === 2
      ? 'Pick a course and describe your goal'
      : missing[0].charAt(0).toUpperCase() + missing[0].slice(1)
    return { ready: false, line: `${phrase} to continue` }
  }

  const parts = []
  const topics = form?.topics ?? []
  const areas = struggleAreas(form?.struggles)
  const deadlines = validDeadlines(form?.dates)
  if (topics.length) parts.push(plural(topics.length, 'topic'))
  if (areas.length) parts.push(plural(areas.length, 'struggle area'))
  if (deadlines.length) parts.push(plural(deadlines.length, 'deadline'))

  let line
  if (parts.length === 0) line = 'Course and goal set. Topics and deadlines will sharpen the plan.'
  else if (parts.length === 1) line = `Working with ${parts[0]}`
  else line = `Working with ${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`

  return { ready: true, line }
}

/** The single trust line. Every other disclaimer on this page was removed. */
export const TRUST_LINE = "The plan uses only what's on this page."

/**
 * The contract from Phase 1 recon: every input step 1 owns, and the form key
 * it writes to. The rebuild is a reorganisation, so this list may not shrink.
 * A test asserts the generator payload still carries all of it.
 */
export const INTAKE_FIELDS = [
  'courseIdx',
  'goal',
  'topics',
  'strengths',
  'struggles',
  'dates',
  'materials',
  'daysPerWeek',
  'sessionLen',
  'includeWeekends',
  'style',
]
