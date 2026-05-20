/**
 * adaptationEngine.js
 *
 * Rule engine: reads a recall score (0.0 to 1.0) after a Focus Mode session
 * and decides whether to inject a review session into the student's plan.
 *
 * Rules:
 *   score <= 0.40  =>  struggling badly. Inject tomorrow.
 *   score <= 0.60  =>  fuzzy. Inject in 2 days.
 *   score >  0.60  =>  no action needed.
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

function minsToAmPm(mins) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// Pick a review session type that makes sense given the original
function reviewSessionType(original) {
  if (!original || original === 'Custom Study') return 'Active Recall'
  if (/quiz|test|practice|exam/i.test(original)) return 'Practice Quiz'
  if (/flash/i.test(original)) return 'Flashcard Drill'
  if (/read|note|text/i.test(original)) return 'Re-read & Highlight'
  return 'Active Recall'
}

/**
 * @param {object} session        - The completed session object
 * @param {number} recallScore    - Float 0.0 to 1.0 from the slider
 * @param {Array}  courses        - Full courses array
 * @param {Array}  manualSessions - Existing manual sessions (to avoid duplicates)
 * @param {string} todayStr       - ISO date string YYYY-MM-DD
 * @param {string} preferredTime  - 'Morning' | 'Afternoon' | 'Evening'
 * @returns {{ injectedSession, reason, dayName: string } | null}
 */
export function runAdaptation(session, recallScore, courses, manualSessions, todayStr, preferredTime = 'Evening') {
  if (recallScore > 0.60) return null

  const course = courses[session.courseId]
  if (!course) return null

  // Do not inject if exam is within 2 days
  if (course.examDate) {
    const daysToExam = Math.round(
      (new Date(course.examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000
    )
    if (daysToExam <= 2) return null
  }

  // Bad score = tomorrow, fuzzy = 2 days out
  const daysOut = recallScore <= 0.40 ? 1 : 2
  const rawDate = addDays(todayStr, daysOut)
  const injectDate = skipSunday(rawDate)

  // Avoid duplicate adaptive session for same course on same day
  const alreadyExists = manualSessions.some(
    s => s.dateStr === injectDate && s.courseId === session.courseId && s.isAdaptive
  )
  if (alreadyExists) return null

  // Assign a real start time based on preferred study time
  const PREF_START = { Morning: 8 * 60, Afternoon: 13 * 60, Evening: 18 * 60 }
  const startMin = PREF_START[preferredTime] ?? 18 * 60
  const dur = Math.round((session.duration ?? 45) * 0.75) // shorter focused review

  const injected = {
    id: `adaptive-${session.courseId}-${injectDate}-${Date.now()}`,
    dateStr: injectDate,
    courseId: session.courseId,
    courseName: session.courseName,
    color: session.color,
    sessionType: reviewSessionType(session.sessionType),
    duration: dur,
    isManual: true,
    isAdaptive: true,
    startTime: minsToAmPm(startMin),
    endTime: minsToAmPm(startMin + dur),
  }

  const difficulty = recallScore <= 0.40 ? 'difficult' : 'a bit fuzzy'
  const what = session.sessionType && session.sessionType !== 'Custom Study'
    ? session.sessionType
    : 'that material'

  const reason = `You found ${what} ${difficulty} — we added a ${dur}-min ${injected.sessionType} on ${dayName(injectDate)} to lock it in.`

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
