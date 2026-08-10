/**
 * Knowledge Map derivation rules.
 *
 * Every claim the map makes about a topic comes out of these functions, so
 * the boundaries are pinned here: what counts as evidence, what 80 means,
 * when evidence goes stale, and which topic earns the hero card.
 */
import { describe, it, expect } from 'vitest'
import {
  deriveStatus,
  selectHero,
  courseAggregate,
  normalizeEvidence,
  aggregateEvidence,
  buildEvidenceLine,
  sparklinePoints,
  formatAge,
  isStale,
} from './knowledgeMap'
import { KM_SOLID_AT, KM_STALE_DAYS } from '../theme/tokens'

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n) => NOW - n * DAY

const signal = (over = {}) => ({
  topic: 'Phospholipid bilayer',
  courseId: 'bio-101',
  courseName: 'Cell Biology',
  signalType: 'brain_dump_score',
  score: 71,
  at: daysAgo(1),
  ...over,
})

describe('deriveStatus', () => {
  it('reads untested with no evidence at all', () => {
    const d = deriveStatus([], { now: NOW })
    expect(d.status).toBe('untested')
    expect(d.score).toBeNull()
    expect(d.stale).toBe(false)
    expect(d.evidenceLine.text).toBe('No evidence yet')
  })

  it('reads solid at exactly the 80 boundary', () => {
    const d = deriveStatus([signal({ score: KM_SOLID_AT })], { now: NOW })
    expect(d.status).toBe('solid')
    expect(d.score).toBe(80)
  })

  it('reads shaky one point below the boundary', () => {
    const d = deriveStatus([signal({ score: KM_SOLID_AT - 1 })], { now: NOW })
    expect(d.status).toBe('shaky')
    expect(d.score).toBe(79)
  })

  it('uses the latest scored evidence, not the best or the average', () => {
    const d = deriveStatus([
      signal({ score: 95, at: daysAgo(9) }),
      signal({ score: 41, at: daysAgo(2) }),
    ], { now: NOW })
    expect(d.status).toBe('shaky')
    expect(d.score).toBe(41)
  })

  it('counts unscored evidence as activity but never lets it reach solid', () => {
    const d = deriveStatus([
      signal({ signalType: 'brain_dump_gap', score: 0, at: daysAgo(2) }),
    ], { now: NOW })
    expect(d.status).toBe('untested')
    expect(d.score).toBeNull()
    expect(d.eventCount).toBe(1)
    // Names the event, carries no number.
    expect(d.evidenceLine.text).toBe('Brain Dump, 2 days ago')
    expect(d.evidenceLine.text).not.toMatch(/\d+(?!\s*days)/)
  })

  it('keeps unscored evidence from masking a real score', () => {
    const d = deriveStatus([
      signal({ score: 88, at: daysAgo(5) }),
      signal({ signalType: 'brain_dump_gap', score: 0, at: daysAgo(1) }),
    ], { now: NOW })
    expect(d.status).toBe('solid')
    expect(d.score).toBe(88)
  })
})

describe('staleness', () => {
  it('is not stale at exactly 14 days', () => {
    expect(isStale(daysAgo(KM_STALE_DAYS), NOW)).toBe(false)
    const d = deriveStatus([signal({ score: 91, at: daysAgo(KM_STALE_DAYS) })], { now: NOW })
    expect(d.stale).toBe(false)
    expect(d.evidenceLine.staleSuffix).toBeNull()
  })

  it('is stale one day past the boundary', () => {
    expect(isStale(daysAgo(KM_STALE_DAYS + 1), NOW)).toBe(true)
  })

  it('keeps the status it earned and only marks it stale', () => {
    const d = deriveStatus([signal({ score: 91, at: daysAgo(30) })], { now: NOW })
    expect(d.status).toBe('solid')
    expect(d.stale).toBe(true)
    expect(d.evidenceLine.staleSuffix).toBe('(a while ago)')
  })

  it('never marks an untested topic stale', () => {
    const d = deriveStatus([
      signal({ signalType: 'brain_dump_gap', score: 0, at: daysAgo(90) }),
    ], { now: NOW })
    expect(d.status).toBe('untested')
    expect(d.stale).toBe(false)
  })
})

describe('evidence lines', () => {
  it('formats a scored line as source, score, age', () => {
    const d = deriveStatus([signal({ score: 58, at: daysAgo(6) })], { now: NOW })
    expect(d.evidenceLine.text).toBe('Brain Dump 58, 6 days ago')
  })

  it('says today rather than 0 days ago', () => {
    expect(formatAge(NOW, NOW)).toBe('today')
    const d = deriveStatus([signal({ score: 71, at: NOW })], { now: NOW })
    expect(d.evidenceLine.text).toBe('Brain Dump 71, today')
  })

  it('singularises one day', () => {
    expect(formatAge(daysAgo(1), NOW)).toBe('1 day ago')
  })

  it('returns the no-evidence line when there is nothing', () => {
    expect(buildEvidenceLine({ latestScored: null, latestEvent: null, now: NOW }).text)
      .toBe('No evidence yet')
  })
})

describe('aggregateEvidence', () => {
  it('folds per-question rows from one sitting into a single scored event', () => {
    const base = daysAgo(4)
    const rows = [
      { ...signal({ signalType: 'practice_exam_answer', score: 100, at: base }) },
      { ...signal({ signalType: 'practice_exam_answer', score: 100, at: base + 1000 }) },
      { ...signal({ signalType: 'practice_exam_answer', score: 100, at: base + 2000 }) },
      { ...signal({ signalType: 'practice_exam_answer', score: 0, at: base + 3000 }) },
    ]
    const events = aggregateEvidence(rows)
    expect(events).toHaveLength(1)
    expect(events[0].source).toBe('Practice Exam')
    expect(events[0].score).toBe(75)
    expect(events[0].questionCount).toBe(4)
  })

  it('splits two sittings of the same topic into two events', () => {
    const rows = [
      { ...signal({ signalType: 'quiz_answer', score: 100, at: daysAgo(10) }) },
      { ...signal({ signalType: 'quiz_answer', score: 0, at: daysAgo(2) }) },
    ]
    expect(aggregateEvidence(rows)).toHaveLength(2)
  })

  it('drops per-question rows with no timestamp rather than dating them', () => {
    const rows = [{ ...signal({ signalType: 'quiz_answer', score: 100, at: null }) }]
    expect(aggregateEvidence(rows)).toHaveLength(0)
  })
})

describe('selectHero', () => {
  const topic = (name, evidence) => ({ topic: name, evidence })

  it('puts shaky ahead of untested and untested ahead of solid', () => {
    const hero = selectHero([
      topic('Solid thing', [signal({ score: 92, at: daysAgo(1) })]),
      topic('Untested thing', []),
      topic('Shaky thing', [signal({ score: 44, at: daysAgo(1) })]),
    ], { now: NOW })
    expect(hero.mode).toBe('check')
    expect(hero.topic.topic).toBe('Shaky thing')
  })

  it('prefers untested over solid when nothing is shaky', () => {
    const hero = selectHero([
      topic('Solid thing', [signal({ score: 92, at: daysAgo(1) })]),
      topic('Untested thing', []),
    ], { now: NOW })
    expect(hero.topic.topic).toBe('Untested thing')
  })

  it('breaks ties among shaky topics with the stalest evidence', () => {
    const hero = selectHero([
      topic('Recent shaky', [signal({ score: 50, at: daysAgo(1) })]),
      topic('Old shaky', [signal({ score: 50, at: daysAgo(20) })]),
    ], { now: NOW })
    expect(hero.topic.topic).toBe('Old shaky')
  })

  it('falls back to alphabetical when rank and date match', () => {
    const hero = selectHero([
      topic('Zebra finches', [signal({ score: 50, at: daysAgo(3) })]),
      topic('Alpha decay', [signal({ score: 50, at: daysAgo(3) })]),
    ], { now: NOW })
    expect(hero.topic.topic).toBe('Alpha decay')
  })

  it('congratulates when every topic is solid and fresh, offering the stalest for a refresh', () => {
    const hero = selectHero([
      topic('Fresh one', [signal({ score: 90, at: daysAgo(1) })]),
      topic('Less fresh', [signal({ score: 95, at: daysAgo(8) })]),
    ], { now: NOW })
    expect(hero.mode).toBe('congratulate')
    expect(hero.headline).toBe('Nothing is shaky. Keep it that way.')
    expect(hero.topic.topic).toBe('Less fresh')
  })

  it('does not congratulate when a solid topic has gone stale', () => {
    const hero = selectHero([
      topic('Aged solid', [signal({ score: 90, at: daysAgo(40) })]),
    ], { now: NOW })
    expect(hero.mode).toBe('check')
  })

  it('returns null with no topics', () => {
    expect(selectHero([], { now: NOW })).toBeNull()
  })

  it('cites a real recorded event in its evidence copy', () => {
    const hero = selectHero([
      topic('Cell membrane transport', [
        signal({ signalType: 'quiz_answer', score: 45, at: daysAgo(12), topic: 'Cell membrane transport' }),
      ]),
    ], { now: NOW })
    expect(hero.evidence).toBe('Scored 45 in a quiz 12 days ago. Nothing since.')
  })
})

describe('courseAggregate', () => {
  it('counts solid topics rather than averaging scores', () => {
    const agg = courseAggregate([
      { topic: 'a', evidence: [signal({ score: 90 })] },
      { topic: 'b', evidence: [signal({ score: 90 })] },
      { topic: 'c', evidence: [signal({ score: 10 })] },
      { topic: 'd', evidence: [] },
    ], { now: NOW })
    expect(agg).toEqual({ total: 4, solid: 2 })
  })

  it('reports zero of zero for a course with no topics', () => {
    expect(courseAggregate([], { now: NOW })).toEqual({ total: 0, solid: 0 })
  })
})

describe('normalizeEvidence', () => {
  it('fills absent optional fields with explicit nulls and never invents a score', () => {
    const { records } = normalizeEvidence([{ topic: 'Osmosis', signalType: 'brain_dump_gap' }])
    expect(records[0]).toMatchObject({
      topic: 'Osmosis',
      courseId: null,
      courseName: null,
      score: null,
      at: null,
      detail: null,
    })
  })

  it('leaves existing values untouched', () => {
    const input = [{
      topic: 'Osmosis', topicKey: 'osmosis', courseId: 'bio', courseName: 'Bio',
      signalType: 'brain_dump_score', score: 64, at: 123, detail: 'x', count: 2,
    }]
    const { records, changed } = normalizeEvidence(input)
    expect(records[0]).toEqual(input[0])
    expect(changed).toBe(false)
  })

  it('is idempotent: a second pass changes nothing', () => {
    const first = normalizeEvidence([{ topic: 'Osmosis', signalType: 'brain_dump_gap' }])
    expect(first.changed).toBe(true)
    const second = normalizeEvidence(first.records)
    expect(second.changed).toBe(false)
    expect(second.records).toEqual(first.records)
  })

  it('handles the partial case without touching the fields that are present', () => {
    const { records, changed } = normalizeEvidence([
      { topic: 'A', signalType: 'brain_dump_score', score: 71 },
      { topic: 'B', signalType: 'brain_dump_score', score: 55, at: 999, courseId: 'c1', courseName: 'C', topicKey: 'b', detail: null, count: null },
    ])
    expect(changed).toBe(true)
    expect(records[0].score).toBe(71)
    expect(records[0].at).toBeNull()
    expect(records[1].at).toBe(999)
    expect(records[1].courseId).toBe('c1')
  })

  it('drops rows with no topic rather than inventing one', () => {
    const { records } = normalizeEvidence([{ signalType: 'quiz_answer', score: 1 }, null, { topic: '   ' }])
    expect(records).toHaveLength(0)
  })

  it('treats a non-array input as empty', () => {
    expect(normalizeEvidence(undefined).records).toEqual([])
  })
})

describe('sparklinePoints', () => {
  it('returns nothing below three scored events', () => {
    const d = deriveStatus([
      signal({ score: 45, at: daysAgo(20) }),
      signal({ score: 62, at: daysAgo(10) }),
    ], { now: NOW })
    expect(sparklinePoints(d)).toBeNull()
  })

  it('returns points in chronological order at three scored events', () => {
    const d = deriveStatus([
      signal({ score: 45, at: daysAgo(20) }),
      signal({ score: 62, at: daysAgo(10) }),
      signal({ score: 71, at: daysAgo(1) }),
    ], { now: NOW })
    const pts = sparklinePoints(d)
    expect(pts).toHaveLength(3)
    expect(pts.map(p => p.score)).toEqual([45, 62, 71])
  })

  it('ignores unscored events when counting toward the threshold', () => {
    const d = deriveStatus([
      signal({ score: 45, at: daysAgo(20) }),
      signal({ score: 62, at: daysAgo(10) }),
      signal({ signalType: 'brain_dump_gap', score: 0, at: daysAgo(2) }),
    ], { now: NOW })
    expect(sparklinePoints(d)).toBeNull()
  })
})
