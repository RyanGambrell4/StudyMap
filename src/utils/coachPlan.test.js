import { describe, it, expect } from 'vitest'
import {
  computePlanMath, progressSegments, formatHours, flattenSessions, nextSession,
  assignScheduledDates, catchUpReschedule, setSessionDone, spreadIndices,
  dateRange, daysBetween, addDays,
} from '../../lib/shared/coachPlan.js'
import {
  buildInputTopics, resolveProvenance, validatePlan, normalize, totalPlannedMinutes,
} from '../../lib/server/coachPlanValidate.js'

// The worked example the design spec pins every number to (spec section 1):
// "total 12 at 45 min, done 4, expectedByToday 7 -> behind 3, remaining 8,
//  stillScheduled 5, hoursRemaining 6.0, daysToExam 9. Bar 33.3% + 25% + 41.7%"
const TODAY = '2026-11-25'
const EXAM = '2026-12-04'

const TOPICS = ['Cell structure', 'Membrane transport', 'Glycolysis', 'Krebs cycle', 'Cell signaling', 'Mitosis']
const STRUGGLES = ['Membrane transport', 'Glycolysis']

function makePlan({ total = 12, doneCount = 0, duration = 45, dates = null } = {}) {
  const weeks = []
  for (let w = 0; w < total / 4; w++) {
    weeks.push({
      week: `Week ${w + 1}`,
      startDate: addDays('2026-11-16', w * 7),
      endDate: addDays('2026-11-16', w * 7 + 6),
      theme: `Theme ${w + 1}`,
      sessions: Array.from({ length: 4 }, (_, s) => {
        const ordinal = w * 4 + s
        return {
          id: `s${ordinal + 1}`,
          sessionLabel: `Session ${ordinal + 1}`,
          focusArea: TOPICS[ordinal % TOPICS.length],
          goal: 'Recall it without notes.',
          keyTopics: [TOPICS[ordinal % TOPICS.length]],
          studyMethod: ordinal % 4 === 3 ? 'Cumulative review' : 'Active recall',
          sessionType: ordinal % 4 === 3 ? 'Cumulative review' : 'New content',
          duration,
          scheduledDate: dates ? dates[ordinal] : addDays('2026-11-17', ordinal),
          done: ordinal < doneCount,
        }
      }),
    })
  }
  return { summary: 'x', weeklyFocus: weeks, priorityTopics: [], warningZones: [] }
}

describe('formatHours (spec: "2 significant decimals (9.0, 5.25, 6.0)")', () => {
  it('renders the three values the spec names', () => {
    expect(formatHours(9)).toBe('9.0')
    expect(formatHours(5.25)).toBe('5.25')
    expect(formatHours(6)).toBe('6.0')
  })
  it('keeps one decimal minimum and trims only the second zero', () => {
    expect(formatHours(5.5)).toBe('5.5')
    expect(formatHours(0)).toBe('0.0')
  })
})

describe('computePlanMath', () => {
  // Dated so that on TODAY (Nov 25) exactly 7 sessions have passed and the
  // exam (Dec 4) is 9 days out, matching the spec example on every number.
  const SPEC_DATES = Array.from({ length: 12 }, (_, i) => addDays('2026-11-19', i))

  it('reproduces the spec worked example for the behind state (3c)', () => {
    const plan = makePlan({ doneCount: 4, dates: SPEC_DATES })
    const m = computePlanMath(plan, { today: TODAY, examDate: EXAM })
    expect(m.total).toBe(12)
    expect(m.done).toBe(4)
    expect(m.expectedByToday).toBe(7)
    expect(m.behind).toBe(3)
    expect(m.remaining).toBe(8)
    expect(m.stillScheduled).toBe(5)
    expect(formatHours(m.hoursRemaining)).toBe('6.0')
    expect(m.daysToExam).toBe(9)
    expect(m.state).toBe('behind')
  })

  it('produces the spec bar widths 33.3 / 25 / 41.7', () => {
    const plan = makePlan({ doneCount: 4, dates: SPEC_DATES })
    const segs = progressSegments(computePlanMath(plan, { today: TODAY, examDate: EXAM }))
    expect(segs.map(s => s.key)).toEqual(['done', 'behind', 'stillScheduled'])
    expect(segs.map(s => +s.pct.toFixed(1))).toEqual([33.3, 25.0, 41.7])
    expect(segs.reduce((a, s) => a + s.count, 0)).toBe(12)
  })

  it('fresh plan (3a): nothing done, one full remaining track, 9.0 hours', () => {
    const plan = makePlan({ doneCount: 0, dates: Array.from({ length: 12 }, (_, i) => addDays('2026-11-26', i)) })
    const m = computePlanMath(plan, { today: TODAY, examDate: EXAM })
    expect(m.state).toBe('fresh')
    expect(m.done).toBe(0)
    expect(m.behind).toBe(0)
    expect(formatHours(m.hoursRemaining)).toBe('9.0')
    const segs = progressSegments(m)
    expect(segs.map(s => s.key)).toEqual(['remaining'])
    expect(segs[0].pct).toBe(100)
  })

  it('mid-plan (3b): 5 done leaves 5.25 hours', () => {
    const plan = makePlan({ doneCount: 5, dates: Array.from({ length: 12 }, (_, i) => addDays('2026-11-20', i)) })
    const m = computePlanMath(plan, { today: '2026-11-24', examDate: EXAM })
    expect(m.done).toBe(5)
    expect(formatHours(m.hoursRemaining)).toBe('5.25')
  })

  it('complete (3d): bar fully done, hours studied 9.0', () => {
    const plan = makePlan({ doneCount: 12 })
    const m = computePlanMath(plan, { today: '2026-12-02', examDate: EXAM })
    expect(m.state).toBe('complete')
    expect(m.complete).toBe(true)
    expect(m.isBehind).toBe(false)
    expect(formatHours(m.hoursStudied)).toBe('9.0')
    expect(m.daysToExam).toBe(2)
    expect(progressSegments(m).map(s => s.key)).toEqual(['done'])
  })

  it('suppresses the behind state entirely when there is no exam date', () => {
    const plan = makePlan({ doneCount: 0 })
    const m = computePlanMath(plan, { today: '2026-11-30', examDate: null })
    expect(m.hasExamDate).toBe(false)
    expect(m.expectedByToday).toBeGreaterThan(0) // dates have passed...
    expect(m.behind).toBe(0)                     // ...but there is no horizon to be behind against
    expect(m.isBehind).toBe(false)
    expect(m.daysToExam).toBe(null)
    expect(m.state).toBe('fresh')
  })

  it('segments always sum to total in every state', () => {
    for (const doneCount of [0, 1, 4, 11, 12]) {
      const plan = makePlan({ doneCount })
      const m = computePlanMath(plan, { today: '2026-11-23', examDate: EXAM })
      expect(progressSegments(m).reduce((a, s) => a + s.count, 0)).toBe(12)
      expect(m.done + m.behind + m.stillScheduled).toBe(12)
    }
  })

  it('sessions x duration equals total hours', () => {
    const plan = makePlan({ doneCount: 0 })
    expect(totalPlannedMinutes(plan)).toBe(12 * 45)
    const m = computePlanMath(plan, { today: TODAY, examDate: EXAM })
    expect(m.hoursRemaining * 60).toBe(12 * 45)
  })
})

describe('nextSession', () => {
  it('returns the first not-done session, and advances when it is completed', () => {
    let plan = makePlan({ doneCount: 5 })
    expect(nextSession(plan).session.id).toBe('s6')
    plan = setSessionDone(plan, 's6', true, { at: '2026-11-25T10:00:00Z' })
    expect(nextSession(plan).session.id).toBe('s7')
    expect(computePlanMath(plan, { today: TODAY, examDate: EXAM }).done).toBe(6)
  })

  it('returns null once everything is done', () => {
    expect(nextSession(makePlan({ doneCount: 12 }))).toBe(null)
  })

  it('setSessionDone is a no-op for an unknown id', () => {
    const plan = makePlan({ doneCount: 2 })
    expect(setSessionDone(plan, 'nope', true)).toBe(plan)
  })
})

describe('assignScheduledDates', () => {
  it('bounds every session between tomorrow and the day before the exam', () => {
    const plan = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: EXAM })
    const dates = flattenSessions(plan).map(f => f.session.scheduledDate)
    expect(dates.every(d => d > TODAY)).toBe(true)
    expect(dates.every(d => d < EXAM)).toBe(true)
    expect(dates).toEqual([...dates].sort())
  })

  it('is deterministic for the same inputs', () => {
    const a = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: EXAM })
    const b = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: EXAM })
    expect(flattenSessions(a).map(f => f.session.scheduledDate))
      .toEqual(flattenSessions(b).map(f => f.session.scheduledDate))
  })

  it('falls back to the week scaffold when no exam date is given', () => {
    const plan = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: null })
    expect(flattenSessions(plan).every(f => !!f.session.scheduledDate)).toBe(true)
  })
})

describe('spreadIndices', () => {
  it('spaces evenly and always lands the last item on the last day', () => {
    expect(spreadIndices(4, 8)).toEqual([0, 2, 5, 7])
    expect(spreadIndices(1, 5)).toEqual([4])
    expect(spreadIndices(3, 3)).toEqual([0, 1, 2])
  })
  it('packs at most two per day when items exceed days', () => {
    const idx = spreadIndices(10, 5)
    expect(idx[idx.length - 1]).toBe(4)
    const perDay = {}
    idx.forEach(i => { perDay[i] = (perDay[i] || 0) + 1 })
    expect(Math.max(...Object.values(perDay))).toBeLessThanOrEqual(2)
  })
})

describe('catchUpReschedule (spec section 2)', () => {
  it('redistributes remaining sessions across the days before the exam and clears behind', () => {
    const plan = makePlan({ doneCount: 4 })
    const today = '2026-11-23'
    expect(computePlanMath(plan, { today, examDate: EXAM }).behind).toBe(3)

    const { plan: next, changed } = catchUpReschedule(plan, { today, examDate: EXAM })
    expect(changed).toBe(true)

    const m = computePlanMath(next, { today, examDate: EXAM })
    expect(m.behind).toBe(0)             // nothing is overdue any more
    expect(m.state).toBe('mid')
    expect(m.total).toBe(12)             // rule 4: content is never dropped
    expect(m.done).toBe(4)               // completed work is untouched
  })

  it('keeps every pending session inside (today, examDate)', () => {
    const { plan: next } = catchUpReschedule(makePlan({ doneCount: 4 }), { today: '2026-11-23', examDate: EXAM })
    flattenSessions(next).filter(f => !f.session.done).forEach(f => {
      expect(f.session.scheduledDate > '2026-11-23').toBe(true)
      expect(f.session.scheduledDate < EXAM).toBe(true)
    })
  })

  it('never moves a completed session', () => {
    const before = makePlan({ doneCount: 4 })
    const beforeDates = flattenSessions(before).filter(f => f.session.done).map(f => f.session.scheduledDate)
    const { plan: after } = catchUpReschedule(before, { today: '2026-11-23', examDate: EXAM })
    const afterDates = flattenSessions(after).filter(f => f.session.done).map(f => f.session.scheduledDate)
    expect(afterDates).toEqual(beforeDates)
  })

  it('shortens review sessions before merging when the window is tight', () => {
    // 8 pending sessions, only 3 usable days -> compression required.
    const plan = makePlan({ doneCount: 4 })
    const { plan: next, shortened } = catchUpReschedule(plan, { today: '2026-11-30', examDate: '2026-12-04' })
    expect(shortened).toBeGreaterThan(0)
    const reviews = flattenSessions(next).filter(f => !f.session.done && /review/i.test(f.session.sessionType))
    reviews.forEach(r => expect(r.session.duration).toBeLessThanOrEqual(30))
  })

  it('pins a mock exam to the final available day', () => {
    const plan = makePlan({ doneCount: 4 })
    const flat = flattenSessions(plan)
    const last = flat[flat.length - 1].session
    last.focusArea = 'Full mock exam'
    last.sessionType = 'Mock test'
    const { plan: next } = catchUpReschedule(plan, { today: '2026-11-23', examDate: EXAM })
    const mock = flattenSessions(next).find(f => f.session.sessionType === 'Mock test')
    expect(mock.session.scheduledDate).toBe('2026-12-03') // the day before the exam
  })

  it('does nothing without an exam date', () => {
    const plan = makePlan({ doneCount: 4 })
    expect(catchUpReschedule(plan, { today: TODAY, examDate: null }).changed).toBe(false)
  })

  it('redistribution sums correctly: total minutes are preserved or reduced, never inflated', () => {
    const plan = makePlan({ doneCount: 4 })
    const before = totalPlannedMinutes(plan)
    const { plan: next } = catchUpReschedule(plan, { today: '2026-11-30', examDate: '2026-12-04' })
    expect(totalPlannedMinutes(next)).toBeLessThanOrEqual(before)
    expect(totalPlannedMinutes(next)).toBeGreaterThan(0)
  })
})

describe('date helpers', () => {
  it('daysBetween / addDays / dateRange agree', () => {
    expect(daysBetween('2026-11-25', '2026-12-04')).toBe(9)
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(dateRange('2026-12-01', '2026-12-03')).toEqual(['2026-12-01', '2026-12-02', '2026-12-03'])
    expect(dateRange('2026-12-03', '2026-12-01')).toEqual([])
  })
})

// ── Grounding ────────────────────────────────────────────────────────────────

describe('buildInputTopics', () => {
  it('builds a closed set from the student topic list and Struggle Tracker', () => {
    const set = buildInputTopics({ emphasisTopics: TOPICS.join(', '), struggles: STRUGGLES })
    expect(set.filter(t => t.kind === 'topic')).toHaveLength(6)
    expect(set.filter(t => t.kind === 'struggle')).toHaveLength(2)
    expect(set.every(t => t.id && t.label)).toBe(true)
  })
  it('normalizes case and punctuation', () => {
    expect(normalize('The Krebs Cycle.')).toBe('the krebs cycle')
  })
})

describe('resolveProvenance', () => {
  const set = buildInputTopics({ emphasisTopics: TOPICS.join(', '), struggles: STRUGGLES })

  it('traces a session to the student topic it covers', () => {
    const p = resolveProvenance({ focusArea: 'Cell structure and organelles', keyTopics: ['Cell structure'] }, set)
    expect(p).toMatchObject({ kind: 'topic', label: 'Cell structure' })
  })

  it('prefers the Struggle Tracker when a topic is also a struggle', () => {
    const p = resolveProvenance({ focusArea: 'Glycolysis step by step', keyTopics: ['Glycolysis'] }, set)
    expect(p.kind).toBe('struggle')
    expect(p.label).toBe('Glycolysis')
  })

  it('returns null for material the student never mentioned', () => {
    expect(resolveProvenance({ focusArea: 'Calvin cycle deep dive', keyTopics: ['Calvin cycle'] }, set)).toBe(null)
  })

  it('matches across case and plurals', () => {
    expect(resolveProvenance({ focusArea: 'MITOSIS', keyTopics: [] }, set).label).toBe('Mitosis')
  })
})

describe('validatePlan', () => {
  const inputTopics = buildInputTopics({ emphasisTopics: TOPICS.join(', '), struggles: STRUGGLES })
  const opts = { inputTopics, today: TODAY, examDate: EXAM, sessionMinutes: 45 }

  it('accepts a grounded plan and stamps provenance on every session', () => {
    const plan = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: EXAM })
    const r = validatePlan(plan, opts)
    expect(r.ok).toBe(true)
    expect(r.violations).toEqual([])
    const flat = flattenSessions(r.plan)
    expect(flat).toHaveLength(12)
    expect(flat.every(f => !!f.session.provenance?.id)).toBe(true)
    expect(flat.every(f => ['topic', 'struggle'].includes(f.session.provenance.kind))).toBe(true)
  })

  it('rejects a hallucinated topic and names it in the violation', () => {
    const plan = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: EXAM })
    const target = flattenSessions(plan)[2].session
    target.focusArea = 'Quantum entanglement in ribosomes'
    target.keyTopics = ['Quantum entanglement']
    const r = validatePlan(plan, opts)
    expect(r.ok).toBe(false)
    expect(r.violations.join(' ')).toMatch(/Session 3/)
    expect(r.violations.join(' ')).toMatch(/Quantum entanglement/)
  })

  it('rejects a session dated after the exam', () => {
    const plan = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: EXAM })
    flattenSessions(plan)[0].session.scheduledDate = '2026-12-20'
    const r = validatePlan(plan, opts)
    expect(r.ok).toBe(false)
    expect(r.violations.join(' ')).toMatch(/after the exam/)
  })

  it('rejects a session dated in the past', () => {
    const plan = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: EXAM })
    flattenSessions(plan)[0].session.scheduledDate = '2020-01-01'
    expect(validatePlan(plan, opts).violations.join(' ')).toMatch(/in the past/)
  })

  it('rejects an implausible duration and a wrong session count', () => {
    const plan = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: EXAM })
    flattenSessions(plan)[1].session.duration = 9999
    const r = validatePlan(plan, { ...opts, expectedSessionCount: 15 })
    expect(r.violations.join(' ')).toMatch(/implausible duration/)
    expect(r.violations.join(' ')).toMatch(/12 sessions but 15 were requested/)
  })

  it('rejects an empty plan', () => {
    expect(validatePlan({ weeklyFocus: [] }, opts).ok).toBe(false)
  })

  it('strips the model-supplied provenance hint so only server-resolved provenance survives', () => {
    const plan = assignScheduledDates(makePlan({ dates: Array(12).fill(null) }), { today: TODAY, examDate: EXAM })
    flattenSessions(plan)[0].session.provenanceLabel = 'Something the model made up'
    const r = validatePlan(plan, opts)
    expect(flattenSessions(r.plan)[0].session.provenanceLabel).toBeUndefined()
    expect(flattenSessions(r.plan)[0].session.provenance.label).toBe('Cell structure')
  })
})
