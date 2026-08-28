/**
 * Course lookup accepts both shapes the product actually stores.
 *
 * `plan.courses[].id` is an opaque string like "mtayo3uplg2", but every session
 * the scheduler has ever written stores `courseId` as the course's ARRAY INDEX.
 * Verified in production on 2026-08-28: of 861 sessions across all 35 users who
 * have any, 861 carry a number and none carry the opaque id.
 *
 * A strict id match therefore could never succeed for a session-launched
 * request, so every AI tool opened from inside a focus session failed with
 * "course N not found" — silently, for every user. It surfaced only because the
 * one paying customer hit it 31 times in thirteen minutes.
 *
 * These tests pin both halves: the index fallback must keep working (or every
 * historical session breaks again), and the opaque id must keep winning when
 * both could match (or a course whose id is "3" gets shadowed by index 3).
 */
import { describe, it, expect, vi } from 'vitest'

// This module (and uploadContext.js, which it imports) builds a Supabase client
// at import time, which throws without env vars. resolveCourseIndex is pure and
// never touches it, so a stub is enough to let the module load.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))

const { resolveCourseIndex } = await import('./courseContext.js')

// Shaped like the real thing: opaque string ids, in order.
const COURSES = [
  { id: 'mtayo3uplg2', name: 'AP Human Geography' },
  { id: 'mtbzjqafxct', name: 'Honors Algebra II' },
  { id: 'mtbzod8ogwe', name: 'Pre-AP English II' },
  { id: 'mtbzwn5rf51', name: 'Pre-AP Geometry' },
]

describe('resolveCourseIndex: the opaque id still wins', () => {
  it('finds a course by its real id', () => {
    expect(resolveCourseIndex(COURSES, 'mtbzod8ogwe')).toBe(2)
  })

  it('matches a numeric id stored as a string', () => {
    const courses = [{ id: 'abc' }, { id: 7 }]
    expect(resolveCourseIndex(courses, '7')).toBe(1)
    expect(resolveCourseIndex(courses, 7)).toBe(1)
  })

  it('SECURITY OF CORRECTNESS: an id of "3" beats index 3', () => {
    // If the fallback ran first, this would return 3 (Pre-AP Geometry) instead
    // of the course the caller actually named. Order matters here.
    const courses = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: '3' }]
    expect(resolveCourseIndex(courses, '3')).toBe(4)
  })
})

describe('resolveCourseIndex: the legacy session shape still resolves', () => {
  it('treats a number as an array index when no id matches', () => {
    // This is the shape all 861 production sessions use.
    expect(resolveCourseIndex(COURSES, 3)).toBe(3)
    expect(resolveCourseIndex(COURSES, 0)).toBe(0)
  })

  it('accepts a stringified index too', () => {
    expect(resolveCourseIndex(COURSES, '2')).toBe(2)
  })

  it('rejects an index past the end rather than guessing', () => {
    expect(resolveCourseIndex(COURSES, 4)).toBe(-1)
    expect(resolveCourseIndex(COURSES, 99)).toBe(-1)
  })

  it('rejects negatives and fractions', () => {
    expect(resolveCourseIndex(COURSES, -1)).toBe(-1)
    expect(resolveCourseIndex(COURSES, 1.5)).toBe(-1)
  })

  it('does not coerce a non-numeric string into an index', () => {
    expect(resolveCourseIndex(COURSES, 'not-a-course')).toBe(-1)
  })
})

describe('resolveCourseIndex: bad input does not throw', () => {
  it('handles an empty or missing course list', () => {
    expect(resolveCourseIndex([], 0)).toBe(-1)
    expect(resolveCourseIndex(null, 0)).toBe(-1)
    expect(resolveCourseIndex(undefined, 'abc')).toBe(-1)
  })

  it('handles a missing courseId', () => {
    expect(resolveCourseIndex(COURSES, null)).toBe(-1)
    expect(resolveCourseIndex(COURSES, undefined)).toBe(-1)
    expect(resolveCourseIndex(COURSES, '')).toBe(-1)
  })

  it('skips malformed course entries', () => {
    // A null entry must not throw, and must not be matched by index either —
    // returning an index that points at null would move the crash downstream.
    const courses = [null, { id: 'real' }]
    expect(resolveCourseIndex(courses, 'real')).toBe(1)
  })

  it('does not let courseId 0 be mistaken for absent', () => {
    // Index 0 is the single most common session courseId in production.
    // A falsy check would drop it.
    expect(resolveCourseIndex(COURSES, 0)).toBe(0)
  })
})
