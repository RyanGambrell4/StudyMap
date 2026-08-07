/**
 * coachHub.js - the logic behind the My Plans hub.
 *
 * Kept pure and separate from the component so hero selection, the countdown,
 * and row ordering can be unit tested. Transcribed from the approved export in
 * design/study-coach-flow/ (StudyCoachHub.dc.html, all four states).
 *
 * Progress counts come from one place only: the `done` flags on the stored
 * plan, the same field the plan view reads. There is no second source.
 */

import { parseISO, daysBetween, flattenSessions } from '../../lib/shared/coachPlan.js'

/** Deadlines this close render amber. From the export: 6 days is amber, 19 is not. */
export const URGENT_DAYS = 7

/**
 * Reads a course's plan envelope into the shape the hub renders from.
 *
 * `done` and `total` come from the plan's own session flags. `examDate` comes
 * from the plan, falling back to the wizard inputs that produced it, so a plan
 * built before exam dates were stored on the plan still shows a countdown.
 */
export function toHubEntry(course, idx, saved) {
  const plan = saved?.plan ?? null
  const sessions = plan ? flattenSessions(plan) : []
  const dates = saved?.formData?.dates ?? saved?.formData?.importantDates ?? []
  const named = dates.filter(d => d?.date && parseISO(d.date))

  // Prefer the plan's own examDate; otherwise the earliest dated milestone.
  let examDate = plan?.examDate && parseISO(plan.examDate) ? plan.examDate : null
  let examLabel = 'Exam Day'
  if (!examDate && named.length) {
    const sorted = [...named].sort((a, b) => a.date.localeCompare(b.date))
    examDate = sorted[0].date
    examLabel = sorted[0].label || 'Exam Day'
  } else if (examDate) {
    const match = named.find(d => d.date === examDate)
    if (match?.label) examLabel = match.label
  }

  return {
    course,
    idx,
    courseKey: course?.id ?? idx,
    name: course?.name ?? '',
    dot: course?.color?.dot ?? null,
    hasPlan: !!plan,
    plan,
    examDate,
    examLabel,
    total: sessions.length,
    done: sessions.filter(s => s.session.done).length,
  }
}

/**
 * Days until an entry's deadline. Null when there is no date.
 * Negative values are meaningful here (the caller decides how to render them);
 * formatCountdown is what guarantees a negative number never reaches the page.
 */
export function daysUntil(entry, today) {
  if (!entry?.examDate) return null
  return daysBetween(today, entry.examDate)
}

/**
 * The deadline text for a course row.
 *
 * Production rendered "-81d" in orange because the old code subtracted dates
 * and printed the result. A past deadline is not a negative countdown, it is a
 * different fact, so it gets different words and never a number.
 */
export function formatCountdown(entry, today) {
  const days = daysUntil(entry, today)
  if (days === null) return { text: 'No deadline yet', urgent: false, passed: false }
  if (days < 0) return { text: 'Exam passed', urgent: false, passed: true }
  const label = entry.examLabel || 'Exam Day'
  if (days === 0) return { text: `${label} today`, urgent: true, passed: false }
  if (days === 1) return { text: `${label} in 1 day`, urgent: true, passed: false }
  return { text: `${label} in ${days} days`, urgent: days <= URGENT_DAYS, passed: false }
}

/**
 * Picks the course the hero card speaks about.
 *
 *   1. Only courses with plans qualify.
 *   2. The nearest future deadline wins.
 *   3. With plans but no future deadline, the plan with the most remaining
 *      sessions wins, because that is where the work is.
 *   4. No plans at all returns null, which is the First time state.
 *
 * Ties break on course index so the choice is stable across renders.
 */
export function selectHeroCourse(entries, today) {
  const planned = (entries ?? []).filter(e => e.hasPlan)
  if (!planned.length) return null

  const upcoming = planned
    .map(e => ({ e, days: daysUntil(e, today) }))
    .filter(x => x.days !== null && x.days >= 0)

  if (upcoming.length) {
    upcoming.sort((a, b) => (a.days - b.days) || (a.e.idx - b.e.idx))
    return upcoming[0].e
  }

  const byRemaining = [...planned].sort((a, b) =>
    ((b.total - b.done) - (a.total - a.done)) || (a.idx - b.idx)
  )
  return byRemaining[0]
}

/**
 * Orders the course list: most urgent first, then plans with no future
 * deadline, then passed deadlines, then courses with no plan at all.
 *
 * The export encodes this by pushing the passed-deadline row to the end of the
 * planned block while the normal state splices its row in by date.
 */
export function sortCourseRows(entries, today) {
  const rank = (e) => {
    if (!e.hasPlan) return 3
    const days = daysUntil(e, today)
    if (days === null) return 1
    if (days < 0) return 2
    return 0
  }
  return [...(entries ?? [])].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    if (ra === 0) return (daysUntil(a, today) - daysUntil(b, today)) || (a.idx - b.idx)
    return a.idx - b.idx
  })
}

/** Progress text for a list row. The hero uses its own longer phrasing. */
export function rowProgress(entry) {
  if (!entry.hasPlan) return 'No plan yet'
  return `${entry.done} of ${entry.total} sessions`
}

/**
 * Everything the hub renders, derived in one pass.
 *
 * `state` is one of 'first-time' | 'caught-up' | 'normal', which is what
 * selects the hero treatment. A passed deadline is a row condition, not a hub
 * state: the export's "Deadline passed" mockup keeps the normal hero.
 */
export function buildHubModel(entries, today) {
  const hero = selectHeroCourse(entries, today)
  const rows = sortCourseRows(hero ? entries.filter(e => e !== hero) : entries, today)

  if (!hero) {
    return {
      state: 'first-time',
      hero: {
        eyebrow: 'GET STARTED',
        title: 'Build your first plan.',
        sub: 'Tell me your topics, goal, and deadlines. The plan is built only from what you share, nothing invented.',
        button: 'Build a plan',
        numeral: null,
        progress: null,
      },
      heroEntry: null,
      listEyebrow: 'YOUR COURSES',
      rows,
    }
  }

  const days = daysUntil(hero, today)
  const complete = hero.total > 0 && hero.done === hero.total
  const pct = hero.total ? Math.round((hero.done / hero.total) * 100) : 0
  const showNumeral = days !== null && days >= 0

  return {
    state: complete ? 'caught-up' : 'normal',
    heroEntry: hero,
    listEyebrow: 'ALL COURSES',
    rows,
    hero: {
      eyebrow: 'UP NEXT',
      title: hero.name,
      numeral: showNumeral ? String(days) : null,
      caption: showNumeral
        ? `day${days === 1 ? '' : 's'} until ${hero.examLabel || 'Exam Day'}`
        : null,
      urgentNumeral: showNumeral && days <= URGENT_DAYS,
      progress: complete
        ? `All ${hero.total} sessions done. You're ready.`
        : `${hero.done} of ${hero.total} sessions done`,
      progressDone: complete,
      pct: complete ? 100 : pct,
      button: complete ? 'Review plan' : 'Open plan',
    },
  }
}
