/**
 * Wiring tests: the plan's state transitions driven by real actions and real
 * date maths, never by setting a state prop directly.
 *
 * These exercise the same functions the components call, in the same order the
 * UI calls them, so a break in the loop (complete a session, come back, hero
 * has not moved) fails here rather than in the browser.
 */
import { describe, it, expect } from 'vitest'
import {
  computePlanMath, setSessionDone, nextSession, catchUpReschedule,
  flattenSessions, addDays, assignScheduledDates,
} from '../../lib/shared/coachPlan.js'
import { buildInputTopics, validatePlan } from '../../lib/server/coachPlanValidate.js'
import { buildScheduleBlocks, calendarIdFor, isPlanBlock } from './pushPlanToSchedule.js'

const TODAY = '2026-11-25'
const EXAM = '2026-12-20'
const COURSE_KEY = 'course-abc'
const TOPICS = ['Cell structure', 'Membrane transport', 'Glycolysis', 'Krebs cycle']

const course = { id: COURSE_KEY, name: 'Cell Biology', color: { dot: '#7C5CFA' } }

/** A freshly generated plan, built the way the API builds one. */
function freshPlan({ today = TODAY, examDate = EXAM, weeks = 3, perWeek = 4 } = {}) {
  const plan = {
    goal: 'Score at least 85 on the final.',
    examDate,
    weeklyFocus: Array.from({ length: weeks }, (_, w) => ({
      week: `Week ${w + 1}`,
      startDate: addDays(today, 1 + w * 7),
      endDate: addDays(today, 7 + w * 7),
      theme: `Theme ${w + 1}`,
      sessions: Array.from({ length: perWeek }, (_, s) => {
        const i = w * perWeek + s
        const topic = TOPICS[i % TOPICS.length]
        return {
          id: `cs-w${w + 1}-s${s + 1}`,
          sessionLabel: `Session ${s + 1}`,
          focusArea: topic,
          goal: `Recall ${topic} without notes.`,
          keyTopics: [topic],
          studyMethod: s === perWeek - 1 ? 'Cumulative review' : 'Active recall',
          sessionType: s === perWeek - 1 ? 'Cumulative review' : 'New content',
          provenanceLabel: topic,
          duration: 45,
          done: false,
          doneAt: null,
        }
      }),
    })),
  }
  assignScheduledDates(plan, { today, examDate })
  const inputTopics = buildInputTopics({ emphasisTopics: TOPICS.join(', '), struggles: ['Glycolysis'] })
  const { ok, plan: validated } = validatePlan(plan, { inputTopics, today, examDate, sessionMinutes: 45 })
  expect(ok).toBe(true)
  return validated
}

describe('start a session, complete it, come back', () => {
  it('the hero advances and every count moves', () => {
    let plan = freshPlan()
    const before = computePlanMath(plan, { today: TODAY, examDate: EXAM })
    const first = nextSession(plan)

    expect(before.done).toBe(0)
    expect(before.state).toBe('fresh')
    expect(first.ordinal).toBe(1)

    // What the Start button hands to the blueprint, then what Focus Mode
    // hands back on completion.
    const launched = { planSessionId: first.session.id, planCourseKey: COURSE_KEY }
    plan = setSessionDone(plan, launched.planSessionId, true, { at: `${TODAY}T10:00:00Z` })

    const after = computePlanMath(plan, { today: TODAY, examDate: EXAM })
    expect(after.done).toBe(1)                              // "1 of 12"
    expect(after.hoursRemaining).toBeCloseTo(before.hoursRemaining - 0.75)
    expect(nextSession(plan).ordinal).toBe(2)               // hero moved on
    expect(nextSession(plan).session.id).not.toBe(first.session.id)
    expect(after.state).toBe('mid')
  })

  it('completion survives a round trip through the stored plan shape', () => {
    let plan = freshPlan()
    const id = nextSession(plan).session.id
    plan = setSessionDone(plan, id, true)
    const roundTripped = JSON.parse(JSON.stringify(plan)) // what Supabase stores
    expect(computePlanMath(roundTripped, { today: TODAY, examDate: EXAM }).done).toBe(1)
    expect(nextSession(roundTripped).session.id).not.toBe(id)
  })
})

describe('push to schedule', () => {
  const pushArgs = plan => ({
    plan, course, courseKey: COURSE_KEY, courseIdx: 0,
    preferredTime: 'Morning', googleEvents: [], restDays: [], sessionLen: 45,
  })

  it('produces blocks with the plan\'s own dates, durations and titles', () => {
    const plan = freshPlan()
    const { sessions, skipped } = buildScheduleBlocks(pushArgs(plan))
    expect(skipped).toHaveLength(0)
    expect(sessions).toHaveLength(12)

    const flat = flattenSessions(plan)
    sessions.forEach((block, i) => {
      expect(block.dateStr).toBe(flat[i].session.scheduledDate)
      expect(block.duration).toBe(45)
      expect(block.sessionType).toContain(`Session ${i + 1} of 12`)
      expect(block.sessionType).toContain(flat[i].session.focusArea)
      expect(block.startTime).toMatch(/AM|PM/)
      expect(block.planSessionId).toBe(flat[i].session.id)
    })
  })

  it('pushing twice replaces rather than stacks', () => {
    const plan = freshPlan()
    const first = buildScheduleBlocks(pushArgs(plan)).sessions
    // The reducer OutputView runs: drop this plan's blocks, add the new ones.
    let calendar = [...first]
    const second = buildScheduleBlocks({ ...pushArgs(plan), existingSessions: calendar }).sessions
    calendar = [...calendar.filter(s => !isPlanBlock(s, COURSE_KEY)), ...second]

    expect(calendar).toHaveLength(12)
    expect(new Set(calendar.map(s => s.id)).size).toBe(12)
    expect(first.map(s => s.id)).toEqual(second.map(s => s.id)) // ids are stable
  })

  it('block ids are derived from session ids, with no timestamp', () => {
    const plan = freshPlan()
    const { sessions } = buildScheduleBlocks(pushArgs(plan))
    sessions.forEach(b => {
      expect(b.id).toBe(calendarIdFor(COURSE_KEY, b.planSessionId))
      expect(b.id).not.toMatch(/\d{13}/) // no Date.now() baked in
    })
  })

  it('skips nothing it cannot place silently: a fully blocked day reports back', () => {
    const plan = freshPlan()
    // Fill every window on every day with immovable events.
    const busy = []
    for (let i = 0; i < 40; i++) {
      const d = addDays(TODAY, i)
      busy.push({ start: `${d}T00:00:00`, end: `${d}T23:59:00`, title: 'Blocked' })
    }
    const { sessions, skipped } = buildScheduleBlocks({ ...pushArgs(plan), googleEvents: busy })
    expect(sessions).toHaveLength(0)
    expect(skipped).toHaveLength(12) // surfaced, not dropped
  })

  it('only completed-plan blocks are excluded, done sessions are not re-pushed', () => {
    let plan = freshPlan()
    plan = setSessionDone(plan, 'cs-w1-s1', true)
    const { sessions } = buildScheduleBlocks(pushArgs(plan))
    expect(sessions).toHaveLength(11)
    expect(sessions.some(s => s.planSessionId === 'cs-w1-s1')).toBe(false)
  })
})

describe('catch up', () => {
  it('clears the behind state, moves the stored dates, and the calendar follows', () => {
    // Make the student behind: nothing done, but a week of sessions has passed.
    const plan = freshPlan({ today: addDays(TODAY, -10) })
    const today = TODAY
    const behindMath = computePlanMath(plan, { today, examDate: EXAM })
    expect(behindMath.state).toBe('behind')
    expect(behindMath.behind).toBeGreaterThan(0)

    const datesBefore = flattenSessions(plan).map(f => f.session.scheduledDate)

    const { plan: next, changed } = catchUpReschedule(plan, { today, examDate: EXAM })
    expect(changed).toBe(true)

    // 1. stored plan dates changed
    const datesAfter = flattenSessions(next).map(f => f.session.scheduledDate)
    expect(datesAfter).not.toEqual(datesBefore)

    // 2. behind state cleared
    const afterMath = computePlanMath(next, { today, examDate: EXAM })
    expect(afterMath.behind).toBe(0)
    expect(afterMath.isBehind).toBe(false)

    // 3. calendar blocks change to match
    const blocksBefore = buildScheduleBlocks({ plan, course, courseKey: COURSE_KEY, courseIdx: 0, sessionLen: 45 }).sessions
    const blocksAfter = buildScheduleBlocks({ plan: next, course, courseKey: COURSE_KEY, courseIdx: 0, sessionLen: 45 }).sessions
    expect(blocksAfter.map(b => b.dateStr)).not.toEqual(blocksBefore.map(b => b.dateStr))
    blocksAfter.forEach(b => {
      expect(b.dateStr > today).toBe(true)
      expect(b.dateStr < EXAM).toBe(true)
    })
  })

  it('is unavailable without an exam date, and no behind state exists to trigger it', () => {
    const plan = freshPlan({ today: addDays(TODAY, -10), examDate: null })
    plan.examDate = null
    const math = computePlanMath(plan, { today: TODAY, examDate: null })
    expect(math.hasExamDate).toBe(false)
    expect(math.isBehind).toBe(false)
    expect(catchUpReschedule(plan, { today: TODAY, examDate: null }).changed).toBe(false)
  })
})

describe('regeneration', () => {
  it('replaces the plan and orphans no calendar blocks', () => {
    let plan = freshPlan()
    plan = setSessionDone(plan, 'cs-w1-s1', true)
    let calendar = buildScheduleBlocks({ plan, course, courseKey: COURSE_KEY, courseIdx: 0, sessionLen: 45 }).sessions

    // Regenerate: the view clears this plan's blocks, then pushes the new plan.
    const regenerated = freshPlan({ weeks: 2, perWeek: 3 })
    calendar = calendar.filter(s => !isPlanBlock(s, COURSE_KEY))
    expect(calendar).toHaveLength(0) // nothing from the old plan survives

    const fresh = buildScheduleBlocks({ plan: regenerated, course, courseKey: COURSE_KEY, courseIdx: 0, sessionLen: 45 }).sessions
    expect(fresh).toHaveLength(6)
    expect(computePlanMath(regenerated, { today: TODAY, examDate: EXAM }).done).toBe(0)
  })
})

describe('full state machine, reached only by real actions', () => {
  it('fresh to mid to behind to caught-up to complete', () => {
    // fresh
    let plan = freshPlan({ today: addDays(TODAY, -10) })
    let today = addDays(TODAY, -10)
    expect(computePlanMath(plan, { today, examDate: EXAM }).state).toBe('fresh')

    // mid: complete one session for real
    plan = setSessionDone(plan, nextSession(plan).session.id, true)
    expect(computePlanMath(plan, { today, examDate: EXAM }).state).toBe('mid')

    // behind: let real time pass, do nothing
    today = TODAY
    const behind = computePlanMath(plan, { today, examDate: EXAM })
    expect(behind.state).toBe('behind')
    expect(behind.behind).toBeGreaterThanOrEqual(1)

    // caught up: run the real redistribution
    plan = catchUpReschedule(plan, { today, examDate: EXAM }).plan
    expect(computePlanMath(plan, { today, examDate: EXAM }).state).toBe('mid')

    // complete: finish every remaining session
    for (const { session } of flattenSessions(plan)) {
      if (!session.done) plan = setSessionDone(plan, session.id, true)
    }
    const done = computePlanMath(plan, { today, examDate: EXAM })
    expect(done.state).toBe('complete')
    expect(done.done).toBe(done.total)
    expect(nextSession(plan)).toBe(null)
  })
})

describe('struggle-driven provenance', () => {
  it('a topic in the Struggle Tracker produces sessions marked as such', () => {
    const plan = freshPlan()
    const glycolysis = flattenSessions(plan).filter(f => f.session.focusArea === 'Glycolysis')
    expect(glycolysis.length).toBeGreaterThan(0)
    glycolysis.forEach(f => {
      expect(f.session.provenance.kind).toBe('struggle')
      expect(f.session.provenance.label).toBe('Glycolysis')
    })
    // Topics the student listed but never flagged stay plain.
    const krebs = flattenSessions(plan).filter(f => f.session.focusArea === 'Krebs cycle')
    krebs.forEach(f => expect(f.session.provenance.kind).toBe('topic'))
  })

  it('the topics strip marks exactly the struggle-derived topics and nothing else', () => {
    const plan = freshPlan()
    // The same derivation the view uses.
    const seen = new Map()
    for (const { session } of flattenSessions(plan)) {
      const p = session.provenance
      if (p?.id && !seen.has(p.id)) seen.set(p.id, { label: p.label, marked: p.kind === 'struggle' })
    }
    const strip = [...seen.values()]
    expect(strip.filter(t => t.marked).map(t => t.label)).toEqual(['Glycolysis'])
    expect(strip).toHaveLength(4)
  })
})
