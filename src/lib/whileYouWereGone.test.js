import { describe, it, expect } from 'vitest'
import { buildWhileYouWereGone, MIN_RIPENED } from './whileYouWereGone'

const NOW = Date.parse('2026-08-12T20:00:00.000Z')
const HOUR = 3600_000
const LAST_VISIT = NOW - 48 * HOUR

function card(topic, hoursAgo) {
  return { topic, dueAt: NOW - hoursAgo * HOUR }
}

describe('buildWhileYouWereGone', () => {
  it('says nothing on a first ever visit', () => {
    // There was no "gone" to report on. Manufacturing an event here would be
    // the app's first lie to her.
    expect(buildWhileYouWereGone({ due: [card('glycolysis', 1)], lastVisit: null, now: NOW })).toBeNull()
  })

  it('says nothing when nothing is due', () => {
    expect(buildWhileYouWereGone({ due: [], lastVisit: LAST_VISIT, now: NOW })).toBeNull()
  })

  it('ignores cards that were already due before she left', () => {
    // These are not news. Reporting them every visit is how a signal becomes
    // wallpaper.
    const stale = [card('glycolysis', 100), card('glycolysis', 90), card('krebs', 80)]
    expect(buildWhileYouWereGone({ due: stale, lastVisit: LAST_VISIT, now: NOW })).toBeNull()
  })

  it('stays quiet below the interrupt threshold', () => {
    const one = [card('glycolysis', 1)]
    expect(one.length).toBeLessThan(MIN_RIPENED)
    expect(buildWhileYouWereGone({ due: one, lastVisit: LAST_VISIT, now: NOW })).toBeNull()
  })

  it('names the topic when one owns the ripened cards', () => {
    const due = [card('glycolysis', 5), card('glycolysis', 4), card('glycolysis', 3)]
    const r = buildWhileYouWereGone({ due, lastVisit: LAST_VISIT, now: NOW })
    expect(r.line).toBe('3 cards on glycolysis came due.')
    expect(r.topic).toBe('glycolysis')
    expect(r.count).toBe(3)
  })

  it('uses the singular correctly', () => {
    const due = [card('glycolysis', 5), card('glycolysis', 4), card('krebs', 3)]
    const r = buildWhileYouWereGone({ due, lastVisit: LAST_VISIT, now: NOW })
    expect(r.line).toBe('2 cards on glycolysis came due, and 1 more elsewhere.')
  })

  it('falls back to a countable line when no topic owns it', () => {
    const due = [card('a', 5), card('b', 4), card('c', 3)]
    const r = buildWhileYouWereGone({ due, lastVisit: LAST_VISIT, now: NOW })
    expect(r.line).toBe('3 cards came due since you were last here.')
    expect(r.topic).toBeNull()
  })

  it('ignores cards not yet due, so it never reports the future as the past', () => {
    const future = [{ topic: 'glycolysis', dueAt: NOW + 10 * HOUR }, { topic: 'glycolysis', dueAt: NOW + 20 * HOUR }]
    expect(buildWhileYouWereGone({ due: future, lastVisit: LAST_VISIT, now: NOW })).toBeNull()
  })

  it('survives malformed entries rather than throwing', () => {
    const messy = [null, {}, { topic: 'x', dueAt: 'nope' }, card('glycolysis', 2), card('glycolysis', 1)]
    const r = buildWhileYouWereGone({ due: messy, lastVisit: LAST_VISIT, now: NOW })
    expect(r.line).toBe('2 cards on glycolysis came due.')
  })

  it('never mentions the gap, and never scolds', () => {
    const due = [card('glycolysis', 5), card('glycolysis', 4)]
    const r = buildWhileYouWereGone({ due, lastVisit: NOW - 40 * 24 * HOUR, now: NOW })
    for (const bad of ['days', 'weeks', 'missed', 'behind', 'finally', 'again', 'should']) {
      expect(r.line.toLowerCase()).not.toMatch(new RegExp(`\\b${bad}\\b`))
    }
    expect(r.line).not.toContain('!')
    expect(r.line).not.toMatch(/[–—]/u)
  })
})
