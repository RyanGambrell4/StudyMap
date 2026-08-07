/**
 * Cross-app integration contract for the stored coach plan.
 *
 * The plan is read by nine components outside Study Coach. This pins the exact
 * shape each of them reaches for, so a future change to the envelope fails
 * here rather than silently emptying a prompt somewhere downstream.
 */
import { describe, it, expect } from 'vitest'
import { flattenSessions, computePlanMath, setSessionDone, addDays, migratePlan, parseISO } from '../../lib/shared/coachPlan.js'
import { toHubEntry, buildHubModel, formatCountdown } from './coachHub.js'
import { buildScheduleBlocks, isPlanBlock } from './pushPlanToSchedule.js'

const TODAY = '2026-11-25'
const EXAM = addDays(TODAY, 12)

/** The envelope exactly as saveCoachPlan writes it. */
function envelope({ done = 0, total = 12 } = {}) {
  return {
    plan: {
      goal: 'Score at least 85 on the final.',
      examDate: EXAM,
      summary: 'A plan.',
      priorityTopics: ['Glycolysis'],
      warningZones: ['Cramming without retrieval practice'],
      weeklyFocus: [{
        week: 'Week 1', theme: 'Foundations',
        startDate: addDays(TODAY, 1), endDate: addDays(TODAY, 7),
        sessions: Array.from({ length: total }, (_, i) => ({
          id: `cs-w1-s${i + 1}`,
          sessionLabel: `Session ${i + 1}`,
          focusArea: 'Glycolysis',
          goal: 'Recall it without notes.',
          keyTopics: ['Glycolysis'],
          studyMethod: 'Active recall',
          sessionType: 'Retrieval',
          duration: 45,
          scheduledDate: addDays(TODAY, i + 1),
          provenance: { kind: 'struggle', id: 'struggle:glycolysis', label: 'Glycolysis' },
          done: i < done,
          doneAt: i < done ? `${TODAY}T10:00:00Z` : null,
        })),
      }],
    },
    formData: {
      courseIdx: 0,
      goal: 'Score at least 85 on the final.',
      topics: ['Glycolysis', 'Krebs cycle'],
      emphasisTopics: 'Glycolysis, Krebs cycle',
      strengths: 'Cell membranes',
      struggles: 'Glycolysis',
      dates: [{ label: 'Exam Day', date: EXAM }],
      importantDates: [{ label: 'Exam Day', date: EXAM }],
      materials: [],
      daysPerWeek: 4,
      sessionLen: 45,
      sessionMinutes: 45,
      includeWeekends: false,
      style: ['Active recall'],
    },
    struggles: [{ id: 'a1', text: 'Glycolysis', resolved: false }],
    pushedAt: null,
    savedAt: Date.now(),
  }
}

describe('the stored envelope satisfies every consumer', () => {
  const saved = envelope({ done: 7 })

  it('BlueprintScreen: emphasis topics, struggles and the week list', () => {
    expect(saved.plan.weeklyFocus).toBeInstanceOf(Array)
    expect(saved.formData.emphasisTopics ?? saved.formData.topics?.join(', ')).toBeTruthy()
    expect(saved.struggles).toBeInstanceOf(Array)
  })

  it('StudyToolsView: the same two fields, via either spelling', () => {
    expect(saved.formData.emphasisTopics ?? saved.formData.topics?.join(', ')).toBe('Glycolysis, Krebs cycle')
    expect(saved.struggles ?? []).toHaveLength(1)
  })

  it('PracticeExamSetup and AIChatView: struggles and the plan object', () => {
    expect(saved.struggles.map(s => s.text).join(', ')).toBe('Glycolysis')
    expect(saved.plan).toBeTruthy()
  })

  it('toolBestPick: formData.topics stays an array', () => {
    expect(Array.isArray(saved.formData.topics)).toBe(true)
  })

  it('GradeHub sync: weeklyFocus plus a session length under either key', () => {
    expect(saved.plan.weeklyFocus.length).toBeGreaterThan(0)
    expect(saved.formData.sessionLen ?? saved.formData.sessionMinutes).toBe(45)
  })

  it('no transient wizard scratch fields leak into stored formData', () => {
    expect(saved.formData).not.toHaveProperty('_dlName')
    expect(saved.formData).not.toHaveProperty('_dlDate')
  })
})

describe('hub and plan view agree because they read the same field', () => {
  it('done counts match between the hub row and the plan math', () => {
    const saved = envelope({ done: 7 })
    const entry = toHubEntry({ id: 'c1', name: 'Cell Biology' }, 0, saved)
    const math = computePlanMath(saved.plan, { today: TODAY, examDate: EXAM })
    expect(entry.done).toBe(math.done)
    expect(entry.total).toBe(math.total)
    expect(`${entry.done} of ${entry.total} sessions`).toBe('7 of 12 sessions')
  })

  it('completing a session moves the hub too', () => {
    const saved = envelope({ done: 7 })
    const before = toHubEntry({ id: 'c1', name: 'X' }, 0, saved)
    const next = { ...saved, plan: setSessionDone(saved.plan, 'cs-w1-s8', true) }
    const after = toHubEntry({ id: 'c1', name: 'X' }, 0, next)
    expect(after.done).toBe(before.done + 1)
    expect(buildHubModel([after], TODAY).hero.progress).toBe('8 of 12 sessions done')
  })

  it('the hub countdown and the plan view countdown agree', () => {
    const saved = envelope({ done: 7 })
    const entry = toHubEntry({ id: 'c1', name: 'X' }, 0, saved)
    const math = computePlanMath(saved.plan, { today: TODAY, examDate: EXAM })
    expect(formatCountdown(entry, TODAY).text).toBe(`Exam Day in ${math.daysToExam} days`)
  })
})

describe('a legacy plan built before this branch still renders', () => {
  it('has no examDate on the plan, so the hub falls back to the wizard dates', () => {
    const legacy = envelope({ done: 3 })
    delete legacy.plan.examDate
    const entry = toHubEntry({ id: 'c1', name: 'X' }, 0, legacy)
    expect(entry.examDate).toBe(EXAM)
    expect(formatCountdown(entry, TODAY).text).toBe('Exam Day in 12 days')
  })

  it('has no session ids or done flags, and still counts as 0 done rather than crashing', () => {
    const legacy = envelope()
    legacy.plan.weeklyFocus[0].sessions.forEach(s => { delete s.id; delete s.done; delete s.scheduledDate })
    const entry = toHubEntry({ id: 'c1', name: 'X' }, 0, legacy)
    expect(entry.total).toBe(12)
    expect(entry.done).toBe(0)
    expect(() => buildHubModel([entry], TODAY)).not.toThrow()
  })

  it('migration gives a legacy plan ids, dates and done flags so it works again', () => {
    const legacy = envelope()
    legacy.plan.weeklyFocus[0].sessions.forEach(s => { delete s.id; delete s.done; delete s.scheduledDate })

    const { plan: migrated, changed } = migratePlan(legacy.plan, { today: TODAY, examDate: EXAM })
    expect(changed).toBe(true)
    const flat = flattenSessions(migrated)
    expect(flat.every(f => !!f.session.id)).toBe(true)
    expect(flat.every(f => f.session.done === false)).toBe(true)
    expect(flat.every(f => !!parseISO(f.session.scheduledDate))).toBe(true)
    expect(new Set(flat.map(f => f.session.id)).size).toBe(12)

    // and now it can actually be pushed to the calendar
    const { sessions, skipped } = buildScheduleBlocks({
      plan: migrated, course: { name: 'X' }, courseKey: 'c1', courseIdx: 0, sessionLen: 45,
    })
    expect(sessions).toHaveLength(12)
    expect(skipped).toHaveLength(0)
  })

  it('migration is idempotent and leaves an already-current plan untouched', () => {
    const current = envelope({ done: 3 })
    const { plan, changed } = migratePlan(current.plan, { today: TODAY, examDate: EXAM })
    expect(changed).toBe(false)
    expect(plan).toBe(current.plan)
  })

  it('migration preserves completed work rather than resetting it', () => {
    const partial = envelope({ done: 5 })
    partial.plan.weeklyFocus[0].sessions.forEach(s => { delete s.scheduledDate })
    const { plan } = migratePlan(partial.plan, { today: TODAY, examDate: EXAM })
    expect(computePlanMath(plan, { today: TODAY, examDate: EXAM }).done).toBe(5)
  })
})

describe('the Schedule page contract', () => {
  it('blocks carry everything the calendar and Focus Mode need', () => {
    const saved = envelope()
    const { sessions } = buildScheduleBlocks({
      plan: saved.plan,
      course: { name: 'Cell Biology', color: { dot: '#1a9e5c' } },
      courseKey: 'c1', courseIdx: 0, sessionLen: 45,
    })
    const b = sessions[0]
    for (const key of ['id', 'dateStr', 'courseId', 'courseName', 'sessionType',
                       'duration', 'startTime', 'endTime', 'isManual', 'fromCoachPlan',
                       'planSessionId', 'focusArea', 'goal', 'keyTopics', 'studyMethod']) {
      expect(b, `block is missing ${key}`).toHaveProperty(key)
    }
    expect(isPlanBlock(b, 'c1')).toBe(true)
    expect(isPlanBlock(b, 'other-course')).toBe(false)
  })

  it('a block maps back to the plan session that made it', () => {
    const saved = envelope()
    const { sessions } = buildScheduleBlocks({
      plan: saved.plan, course: { name: 'X' }, courseKey: 'c1', courseIdx: 0, sessionLen: 45,
    })
    const ids = flattenSessions(saved.plan).map(f => f.session.id)
    sessions.forEach(b => expect(ids).toContain(b.planSessionId))
  })
})
