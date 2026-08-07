/**
 * pushPlanToSchedule.js - the one place a coach plan becomes calendar blocks.
 *
 * Study Coach and Grade Hub both used to do this, with different date maths,
 * so the same plan produced two different schedules depending on which button
 * you pressed. There is now one implementation and both call it.
 *
 * What it does NOT do is decide which day a session falls on. Sessions carry a
 * scheduledDate assigned at generation (and rewritten by catch-up); this
 * function only finds a free time-of-day for each one, shifting to a later day
 * only when the student's own calendar leaves no room.
 */

import { addDays, flattenSessions, parseISO } from '../../lib/shared/coachPlan.js'

const MIN_BREAK = 30        // minutes required between two study sessions
const MAX_STUDY_PER_DAY = 2 // across all plans, not just this one
const MAX_SHIFT_DAYS = 6    // how far a blocked session may slide

const TIME_WINDOWS = {
  Morning:   { start: 8 * 60,  end: 12 * 60 },
  Afternoon: { start: 13 * 60, end: 18 * 60 },
  Evening:   { start: 18 * 60, end: 22 * 60 },
}

const minsToTime = (mins) => {
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  return `${h24 % 12 || 12}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`
}

const parseTimeStr = (t) => {
  const match = t?.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!match) return null
  let h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12
  if (match[3].toUpperCase() === 'AM' && h === 12) h = 0
  return h * 60 + m
}

/** Trim a label at a word boundary so a calendar row never ends mid-word. */
function truncateAtWord(s, max) {
  if (!s || s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[,:;-]+$/, '') + '…'
}

/**
 * The calendar block id for a plan session. Derived purely from the plan, with
 * no timestamp in it, so completing a block can be traced back to the session
 * that produced it. This is what makes the completion write-back possible.
 */
export function calendarIdFor(courseKey, sessionId) {
  return `coach-${courseKey}-${sessionId}`
}

/** True when a calendar session came from this plan. */
export function isPlanBlock(session, courseKey) {
  return !!session?.fromCoachPlan && String(session.id || '').startsWith(`coach-${courseKey}-`)
}

/**
 * Turns a stored plan into calendar blocks.
 *
 * Returns { sessions, skipped }. `skipped` names any session that could not be
 * placed at all, so the caller can tell the student instead of quietly
 * dropping work.
 */
export function buildScheduleBlocks({
  plan,
  course,
  courseKey,
  courseIdx,
  preferredTime = 'Morning',
  googleEvents = [],
  existingSessions = [],
  restDays = [],
  sessionLen = 60,
  includeDone = false,
} = {}) {
  const flat = flattenSessions(plan)
  const pending = includeDone ? flat : flat.filter(f => !f.session.done)
  if (!pending.length) return { sessions: [], skipped: [] }

  const preferred = TIME_WINDOWS[preferredTime] ?? TIME_WINDOWS.Morning
  const windowOrder = [preferred, ...Object.values(TIME_WINDOWS).filter(w => w !== preferred)]

  // Busy map: Google events block time outright; existing study sessions also
  // demand a break either side. Blocks belonging to THIS plan are excluded,
  // because we are about to replace them rather than schedule around them.
  const busyByDate = {}
  const studyCountByDate = {}
  const addBusy = (dateKey, startMin, endMin, isStudy = false) => {
    if (!busyByDate[dateKey]) busyByDate[dateKey] = []
    busyByDate[dateKey].push({ startMin, endMin, isStudy })
  }

  googleEvents.forEach(e => {
    if (!e.start?.includes('T')) return
    const dateKey = e.start.split('T')[0]
    const parse = iso => { const dt = new Date(iso); return dt.getHours() * 60 + dt.getMinutes() }
    addBusy(dateKey, parse(e.start), e.end ? parse(e.end) : parse(e.start) + 60, false)
  })

  existingSessions.forEach(s => {
    if (!s.dateStr || !s.startTime) return
    if (isPlanBlock(s, courseKey)) return // ours; being replaced
    const startMin = parseTimeStr(s.startTime)
    if (startMin === null) return
    addBusy(s.dateStr, startMin, startMin + (s.duration || sessionLen), true)
    studyCountByDate[s.dateStr] = (studyCountByDate[s.dateStr] || 0) + 1
  })

  const findSlot = (dateKey, dur) => {
    if (restDays.includes(dateKey)) return null
    if ((studyCountByDate[dateKey] || 0) >= MAX_STUDY_PER_DAY) return null
    const busy = [...(busyByDate[dateKey] || [])].sort((a, b) => a.startMin - b.startMin)
    for (const window of windowOrder) {
      let s = window.start
      while (s + dur <= window.end) {
        const e = s + dur
        const conflict = busy.find(b => {
          const afterBreak = b.isStudy ? MIN_BREAK : 0
          return s < b.endMin + afterBreak && e > b.startMin
        })
        if (!conflict) return s
        s = conflict.endMin + (conflict.isStudy ? MIN_BREAK : 0)
      }
    }
    return null
  }

  const total = flat.length
  const blocks = []
  const skipped = []

  for (const { session, ordinal } of pending) {
    const dur = Number(session.duration) || sessionLen
    const wanted = parseISO(session.scheduledDate) ? session.scheduledDate : null
    if (!wanted) { skipped.push(session); continue }

    let placedDate = null
    let placedStart = null
    for (let shift = 0; shift <= MAX_SHIFT_DAYS; shift++) {
      const dateKey = addDays(wanted, shift)
      const startMin = findSlot(dateKey, dur)
      if (startMin !== null) { placedDate = dateKey; placedStart = startMin; break }
    }
    if (placedDate === null) { skipped.push(session); continue }

    addBusy(placedDate, placedStart, placedStart + dur, true)
    studyCountByDate[placedDate] = (studyCountByDate[placedDate] || 0) + 1

    const focusSuffix = session.focusArea ? ` · ${truncateAtWord(session.focusArea, 28)}` : ''
    blocks.push({
      id: calendarIdFor(courseKey, session.id),
      dateStr: placedDate,
      courseId: courseIdx,
      courseName: course?.name,
      color: course?.color,
      sessionType: `Session ${ordinal} of ${total}${focusSuffix}`,
      duration: dur,
      startTime: minsToTime(placedStart),
      endTime: minsToTime(placedStart + dur),
      isManual: true,
      fromCoachPlan: true,
      planSessionId: session.id,
      planSessionNum: ordinal,
      planTotalSessions: total,
      focusArea: session.focusArea,
      goal: session.goal,
      keyTopics: session.keyTopics,
      studyMethod: session.studyMethod,
    })
  }

  return { sessions: blocks, skipped }
}
