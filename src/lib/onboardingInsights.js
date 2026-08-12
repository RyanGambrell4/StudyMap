/**
 * onboardingInsights - builds the three insight cards for Act 4 from the user's
 * own answers.
 *
 * Pure. No network, no randomness, no time dependency beyond the exam date the
 * user gave us, so it is trivially testable and always renders the same cards
 * for the same answers.
 *
 * HARD REQUIREMENT: there is no generic fallback path. Every one of the 31
 * possible non-empty struggle combinations resolves to a specific card, because
 * card one is always keyed off a selected struggle via a fixed priority order.
 * The defensive branch when `struggles` is somehow empty derives from the
 * learning style answer instead, which is still the user's own input.
 *
 * Specific, sourced from their input, mildly uncomfortable, immediately
 * followed by a solution. That is the formula. Generic tips destroy the screen.
 */

// Explicit .js extension so this module is loadable by plain Node as well as
// Vite, which is what lets `npm run test:insights` run without a bundler.
import { daysBetween, toDateStr, formatShortDate } from '../utils/dateUtils.js'

// ── Grade model ─────────────────────────────────────────────────────────────
// Numeric anchors for the projection chart. "unsure" maps to a C+ per the brief.

const CURRENT_GRADE_VALUE = { A: 94, B: 85, C: 75, D: 64, unsure: 77 }
const TARGET_GRADE_VALUE  = { A: 93, B: 86, C: 76, pass: 70 }

export function currentGradeValue(state) {
  return CURRENT_GRADE_VALUE[state?.currentGrade] ?? 77
}

export function targetGradeValue(state) {
  const target = TARGET_GRADE_VALUE[state?.targetGrade] ?? 86
  // The projection must never sit below where they already are.
  return Math.max(target, currentGradeValue(state) + 2)
}

/** Hours a week the plan assumes for this target. Modeled, and labelled as such. */
export function recommendedHours(state) {
  const gap = targetGradeValue(state) - currentGradeValue(state)
  const base = state?.targetGrade === 'pass' ? 5 : state?.targetGrade === 'C' ? 6 : 8
  const extra = Math.round(Math.max(0, gap) / 4)
  return Math.min(20, base + extra)
}

export function daysUntilExam(state) {
  if (!state?.examDate) return null
  const d = daysBetween(toDateStr(new Date()), state.examDate)
  return Number.isFinite(d) ? Math.max(0, d) : null
}

// ── Card one: the struggle ──────────────────────────────────────────────────
// Priority order decides which selected struggle leads when several are picked.
// Ordered by how directly the plan can act on it.

const STRUGGLE_PRIORITY = ['reread', 'start', 'cram', 'time', 'distract']

const STRUGGLE_CARD = {
  reread: {
    headline: 'You are rereading, not retrieving.',
    body: 'You said your notes do not stick. Rereading feels productive and produces almost no recall. Your plan replaces it with active retrieval from day one.',
  },
  start: {
    headline: 'You are losing time deciding what to study.',
    body: 'You said you have no idea where to start. That decision costs more than the studying does. Your plan picks the next topic for you, every session, in exam-weight order.',
  },
  cram: {
    headline: 'Cramming is why it disappears after the exam.',
    body: 'You said you cram the night before. Massed practice gets you through one test and almost nothing past it. Your plan spaces the same material so it is still there in the final.',
  },
  time: {
    headline: 'You are running out of runway, not effort.',
    body: 'You said you run out of time before the exam. That is a sequencing problem. Your plan works backward from your exam date so the heaviest topics land first.',
  },
  distract: {
    headline: 'Ten minutes in, you are gone.',
    body: 'You said you get distracted within ten minutes. Long open-ended sessions cause that. Your plan is built from short timed blocks with one target each.',
  },
}

const STYLE_CARD = {
  visual:    { headline: 'You learn from the picture, not the paragraph.', body: 'You told us diagrams work best for you. Your plan leads with visual maps of each topic before the reading.' },
  practice:  { headline: 'You learn by doing the problems.', body: 'You told us practice problems work best for you. Your plan front-loads worked problems instead of notes.' },
  explain:   { headline: 'You learn it when you say it out loud.', body: 'You told us explaining works best for you. Your plan builds in teach-it-back prompts on every topic.' },
  flashcard: { headline: 'You learn it on the third pass, not the first.', body: 'You told us repetition works best for you. Your plan schedules spaced review automatically.' },
}

function struggleCard(state) {
  const picked = state?.struggles ?? []
  const lead = STRUGGLE_PRIORITY.find((k) => picked.includes(k))

  if (lead) {
    const card = STRUGGLE_CARD[lead]
    const others = picked.filter((k) => k !== lead).length
    return {
      id: `struggle_${lead}`,
      headline: card.headline,
      body: others > 0
        ? `${card.body} The other ${others === 1 ? 'habit' : `${others} habits`} you picked ${others === 1 ? 'is' : 'are'} handled in the same sequence.`
        : card.body,
      derivedFrom: 'struggles',
    }
  }

  // Defensive only. Step 7 enforces a minimum of one selection, so this branch
  // should be unreachable, but it still resolves to the user's own answer.
  const style = (state?.learningStyles ?? [])[0]
  const fallback = STYLE_CARD[style] ?? STYLE_CARD.practice
  return { id: `style_${style ?? 'practice'}`, headline: fallback.headline, body: fallback.body, derivedFrom: 'learningStyles' }
}

// ── Card two: the hours gap ─────────────────────────────────────────────────

function hoursCard(state) {
  const actual = Number(state?.studyHours ?? 0)
  const needed = recommendedHours(state)
  const course = state?.course?.name ?? 'this course'

  if (actual >= needed) {
    return {
      id: 'hours_sufficient',
      headline: `You are studying ${actual} hours a week. The hours are not the problem.`,
      body: `For ${course} at your target, ${needed} focused hours is usually enough. You are already past that, which means the returns have to come from what those hours contain, not how many there are.`,
      derivedFrom: 'studyHours',
    }
  }

  return {
    id: 'hours_gap',
    headline: `You are studying ${actual} ${actual === 1 ? 'hour' : 'hours'} a week for a course that needs ${needed}.`,
    body: `Not a lecture. Your plan fits the gap into the time you told us you have, in blocks short enough that you will actually sit down for them.`,
    derivedFrom: 'studyHours',
  }
}

// ── Card three: the map ─────────────────────────────────────────────────────

function mapCard(state, { topicCount = null } = {}) {
  const days = daysUntilExam(state)
  const course = state?.course?.name ?? 'This course'
  const when = state?.examDate ? formatShortDate(state.examDate) : null

  const topicClause = topicCount
    ? `${course} breaks into ${topicCount} topics. Your plan sequences them by exam weight instead of chapter order.`
    : `Your plan sequences ${course} by exam weight instead of chapter order, so the heaviest material is not last.`

  if (days === null) {
    return { id: 'map_no_date', headline: 'You have no map.', body: topicClause, derivedFrom: 'course' }
  }

  if (days === 0) {
    return { id: 'map_today', headline: 'Your exam is today.', body: `${topicClause} We will put the highest-weight material first.`, derivedFrom: 'examDate' }
  }

  return {
    id: 'map_days',
    headline: `You have ${days} ${days === 1 ? 'day' : 'days'} and no map.`,
    body: when ? `${topicClause} Everything is dated against ${when}.` : topicClause,
    derivedFrom: 'examDate',
  }
}

/**
 * Exactly three insights, always, derived from the user's own answers.
 *
 * @param {object} state       the onboarding answer object
 * @param {object} [opts]
 * @param {number} [opts.topicCount] real topic count when the plan has resolved
 * @returns {Array<{id:string, headline:string, body:string, derivedFrom:string}>}
 */
export function buildInsights(state, opts = {}) {
  return [struggleCard(state), hoursCard(state), mapCard(state, opts)]
}

export default buildInsights
