/**
 * adaptationEngine.js
 *
 * Rule engine: reads a recall score (0.0 to 1.0) after a Focus Mode session
 * and decides whether to inject a review session into the student's plan.
 *
 * Rules (thresholds never shown to students — only plain-language reasons):
 *   score <= 0.30  =>  struggling. Inject a review session within 24-48h.
 *   score >  0.30  =>  no action for V1 (spaced-repetition push-out is roadmap).
 */

function skipSunday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function dayName(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}

/**
 * @param {object} session       - The completed session object
 * @param {number} recallScore   - Float 0.0 to 1.0 from the slider
 * @param {Array}  courses       - Full courses array
 * @param {Array}  manualSessions - Existing manual sessions (to avoid duplicates)
 * @param {string} todayStr      - ISO date string YYYY-MM-DD
 * @returns {{ injectedSession, reason, dayName: string } | null}
 */
export function runAdaptation(session, recallScore, courses, manualSessions, todayStr) {
  if (recallScore > 0.30) return null

  const course = courses[session.courseId]
  if (!course) return null

  // Do not inject if exam is within 2 days
  if (course.examDate) {
    const daysToExam = Math.round(
      (new Date(course.examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000
    )
    if (daysToExam <= 2) return null
  }

  // Very low score (<=15%) = inject tomorrow, otherwise in 2 days
  const daysOut = recallScore <= 0.15 ? 1 : 2
  const rawDate = addDays(todayStr, daysOut)
  const injectDate = skipSunday(rawDate)

  // Avoid duplicate adaptive session for same course on same day
  const alreadyExists = manualSessions.some(
    s => s.dateStr === injectDate && s.courseId === session.courseId && s.isAdaptive
  )
  if (alreadyExists) return null

  const dur = Math.round((session.duration ?? 45) * 0.9)
  const injected = {
    id: `adaptive-${session.courseId}-${injectDate}-${Date.now()}`,
    dateStr: injectDate,
    courseId: session.courseId,
    courseName: session.courseName,
    color: session.color,
    sessionType: 'Review',
    duration: dur,
    isManual: true,
    isAdaptive: true,
    startTime: null,
    endTime: null,
  }

  const difficulty = recallScore <= 0.15 ? 'difficult' : 'tricky'
  const what = session.sessionType && session.sessionType !== 'Custom Study'
    ? session.sessionType
    : 'that material'

  const reason = `You found ${what} ${difficulty}, so we added a ${dur}-min review on ${dayName(injectDate)}.`

  return { injectedSession: injected, reason, dayName: dayName(injectDate) }
}

/**
 * Maps a slider value (0-100) to a recall score (0.0-1.0) and display label.
 */
export function sliderToRecall(value) {
  const score = value / 100
  let label
  if (score <= 0.20) label = 'Forgot it'
  else if (score <= 0.45) label = 'Fuzzy'
  else if (score <= 0.70) label = 'Mostly got it'
  else if (score <= 0.88) label = 'Got it'
  else label = 'Nailed it'
  return { score, label }
}
