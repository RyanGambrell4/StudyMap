/**
 * Brain Dump flow rules.
 *
 * The two things worth guarding here are the ones that used to lose student
 * work: leaving the writing screen, and submitting without a topic. The old
 * modal hid its close button during the timer and scored blank-topic dumps
 * into nothing.
 */
import { describe, it, expect } from 'vitest'
import {
  SCREENS,
  SCREEN_HASH,
  DUMP_SECONDS,
  FINAL_STRETCH_SECONDS,
  resolveBackAction,
  canSubmit,
  canStart,
  isFinalStretch,
  formatClock,
  progressFraction,
  pickerTopics,
} from './brainDumpFlow'
import { shapeBrainDumpResult, buildWriteBackRecord, isRetryableWriteFailure } from '../../lib/shared/brainDumpResult.js'

describe('timer', () => {
  it('is fixed at three minutes', () => {
    expect(DUMP_SECONDS).toBe(180)
  })

  it('enters the final stretch at 30 seconds and not at 31', () => {
    expect(isFinalStretch(FINAL_STRETCH_SECONDS)).toBe(true)
    expect(isFinalStretch(FINAL_STRETCH_SECONDS + 1)).toBe(false)
  })

  it('leaves the final stretch at zero, where the dump submits itself', () => {
    expect(isFinalStretch(0)).toBe(false)
  })

  it('formats the clock the way the design shows it', () => {
    expect(formatClock(100)).toBe('1:40')
    expect(formatClock(24)).toBe('0:24')
    expect(formatClock(180)).toBe('3:00')
    expect(formatClock(0)).toBe('0:00')
  })

  it('clamps the progress bar to its track', () => {
    expect(progressFraction(180)).toBe(1)
    expect(progressFraction(90)).toBe(0.5)
    expect(progressFraction(0)).toBe(0)
    expect(progressFraction(-5)).toBe(0)
    expect(progressFraction(999)).toBe(1)
  })
})

describe('browser back', () => {
  it('triggers the confirm path from the writing screen', () => {
    expect(resolveBackAction(SCREENS.WRITING)).toBe('confirm-discard')
  })

  it('confirms from the writing screen even with nothing typed yet', () => {
    // The clock is running; that is state worth confirming away.
    expect(resolveBackAction(SCREENS.WRITING)).toBe('confirm-discard')
  })

  it('is ignored while scoring is in flight', () => {
    expect(resolveBackAction(SCREENS.SCORING)).toBe('ignore')
  })

  it('returns to the map from the result screen without a confirm', () => {
    expect(resolveBackAction(SCREENS.RESULT)).toBe('exit-to-map')
  })

  it('leaves the flow from the pick screen', () => {
    expect(resolveBackAction(SCREENS.PICK)).toBe('exit-to-map')
  })

  it('gives every screen its own history hash', () => {
    const hashes = Object.values(SCREEN_HASH)
    expect(new Set(hashes).size).toBe(hashes.length)
    expect(hashes).toHaveLength(Object.keys(SCREENS).length)
  })
})

describe('submit invariant', () => {
  it('refuses to submit without a topic', () => {
    expect(canSubmit({ topic: '', text: 'lots of writing here' })).toBe(false)
    expect(canSubmit({ topic: '   ', text: 'lots of writing here' })).toBe(false)
  })

  it('refuses to submit without text', () => {
    expect(canSubmit({ topic: 'Osmosis', text: '' })).toBe(false)
    expect(canSubmit({ topic: 'Osmosis', text: '   ' })).toBe(false)
  })

  it('allows submit as soon as anything is typed against a topic', () => {
    expect(canSubmit({ topic: 'Osmosis', text: 'a' })).toBe(true)
  })

  it('will not start the timer without a topic', () => {
    expect(canStart({ topic: '' })).toBe(false)
    expect(canStart({ topic: 'Osmosis' })).toBe(true)
  })
})

describe('picker topics', () => {
  it('puts topics with evidence ahead of plan topics', () => {
    expect(pickerTopics({ planTopics: ['Mitosis'], evidenceTopics: ['Osmosis'] }))
      .toEqual(['Osmosis', 'Mitosis'])
  })

  it('dedupes case-insensitively without inventing anything', () => {
    expect(pickerTopics({ planTopics: ['osmosis', 'Mitosis'], evidenceTopics: ['Osmosis'] }))
      .toEqual(['Osmosis', 'Mitosis'])
  })

  it('returns an empty list when a course has no plan and no evidence', () => {
    expect(pickerTopics({})).toEqual([])
  })
})

describe('results list gating', () => {
  const raw = {
    score: 71,
    covered: ['Amphipathic structure', 'Self assembly in water'],
    missed: [{ point: 'Flippases', source: 'Week 4 notes' }],
  }

  it('keeps the missed list when the dump was compared against material', () => {
    const out = shapeBrainDumpResult(raw, {
      comparedAgainstMaterial: true,
      materialFiles: ['Week 4 notes.pdf'],
      courseName: 'Cell Biology',
    })
    expect(out.missed).toHaveLength(1)
    expect(out.missed[0]).toEqual({ point: 'Flippases', source: 'Week 4 notes' })
    expect(out.material.compared).toBe(true)
    expect(out.material.files).toEqual(['Week 4 notes.pdf'])
  })

  it('removes the missed list entirely when there was no material', () => {
    const out = shapeBrainDumpResult(raw, { comparedAgainstMaterial: false, courseName: 'Cell Biology' })
    expect('missed' in out).toBe(false)
    expect(out.material.compared).toBe(false)
  })

  it('drops a model-supplied missed list rather than trusting it', () => {
    const hostile = { score: 60, covered: [], missed: [{ point: 'Invented gap', source: 'Your notes' }] }
    const out = shapeBrainDumpResult(hostile, { comparedAgainstMaterial: false })
    expect(out.missed).toBeUndefined()
  })

  it('keeps the covered list either way, since it comes from the student text', () => {
    const withMaterial = shapeBrainDumpResult(raw, { comparedAgainstMaterial: true })
    const without = shapeBrainDumpResult(raw, { comparedAgainstMaterial: false })
    expect(withMaterial.covered).toHaveLength(2)
    expect(without.covered).toHaveLength(2)
  })

  it('nulls a missed source it cannot cite rather than making one up', () => {
    const out = shapeBrainDumpResult(
      { missed: [{ point: 'Real gap' }] },
      { comparedAgainstMaterial: true },
    )
    expect(out.missed[0].source).toBeNull()
  })

  it('survives a malformed response without throwing', () => {
    const out = shapeBrainDumpResult(null, { comparedAgainstMaterial: true })
    expect(out.covered).toEqual([])
    expect(out.missed).toEqual([])
  })
})

describe('retryable write failures', () => {
  it('does not offer a retry for a check-constraint violation, which is a missing migration', () => {
    expect(isRetryableWriteFailure('23514')).toBe(false)
  })

  it('does not offer a retry for a missing table, column, or denied privilege', () => {
    expect(isRetryableWriteFailure('42P01')).toBe(false)
    expect(isRetryableWriteFailure('42703')).toBe(false)
    expect(isRetryableWriteFailure('42501')).toBe(false)
  })

  it('offers a retry for a transient failure', () => {
    expect(isRetryableWriteFailure('08006')).toBe(true)
    expect(isRetryableWriteFailure('57014')).toBe(true)
    expect(isRetryableWriteFailure('db_error')).toBe(true)
  })

  it('offers a retry for an unrecognised or absent code', () => {
    // Offering a retry that fails is a smaller harm than hiding one that
    // would have worked.
    expect(isRetryableWriteFailure(undefined)).toBe(true)
    expect(isRetryableWriteFailure(null)).toBe(true)
    expect(isRetryableWriteFailure('something-new')).toBe(true)
  })

  it('compares codes as strings, so a numeric code still classifies', () => {
    expect(isRetryableWriteFailure(23514)).toBe(false)
  })
})

describe('write-back record shape', () => {
  it('builds the evidence record a scored dump becomes', () => {
    const rec = buildWriteBackRecord({
      topic: '  Phospholipid bilayer ',
      courseId: 'bio-101',
      courseName: 'Cell Biology',
      score: 71,
      at: 1000,
    })
    expect(rec).toEqual({
      topic: 'Phospholipid bilayer',
      courseId: 'bio-101',
      courseName: 'Cell Biology',
      signalType: 'brain_dump_score',
      source: 'Brain Dump',
      score: 71,
      at: 1000,
    })
  })

  it('refuses to build a record without a topic', () => {
    expect(buildWriteBackRecord({ topic: '', score: 71, at: 1 })).toBeNull()
  })

  it('refuses to build a record without a score', () => {
    expect(buildWriteBackRecord({ topic: 'Osmosis', score: null, at: 1 })).toBeNull()
  })

  it('nulls an absent timestamp rather than stamping now', () => {
    expect(buildWriteBackRecord({ topic: 'Osmosis', score: 71 }).at).toBeNull()
  })
})
