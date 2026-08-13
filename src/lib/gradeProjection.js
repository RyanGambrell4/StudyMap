/**
 * gradeProjection - the one number in this app she already cares about.
 *
 * XP is a number the app invented. Her projected grade is a number that
 * already governs her life, and she refreshes a grade portal to see it. Making
 * it move in response to studying is not gamification, it is a mirror.
 *
 * WHY THIS WRAPPER EXISTS
 *
 * `getProjectedGrade(components, overrides)` in utils/gradeCalc.js scores every
 * ungraded component as ZERO unless the caller passes an explicit override for
 * it. That is correct for the Grade Hub, where the student is dragging
 * what-if sliders and supplies the overrides herself. It is useless as a
 * dashboard number: a student in week 3 with one graded quiz would be shown a
 * projection near zero, which is both wrong and demoralising.
 *
 * So the question this module answers is: what do we expect her to score on
 * the work that has not been graded yet? In order of how much we trust it:
 *
 *   1. Her recall on this course's material. This is the point of the whole
 *      feature. Study moves mastery, mastery moves the projection.
 *   2. Failing that, her current grade. "The rest goes like the part we have
 *      already seen" is the honest default when we know nothing about recall.
 *   3. Failing both, nothing. We do not show a projection we cannot support.
 *
 * Never invent a projection out of an empty course. A number she cannot trace
 * to something she did is worse than no number.
 */

import { getProjectedGrade, getCurrentGrade, letterGrade } from '../utils/gradeCalc'
import { getAverageMastery } from './masteryStore'

const SNAPSHOT_KEY = 'studyedge_projection_snapshots_v1'

/** Movement smaller than this is noise, not news. */
export const MIN_MOVE_PCT = 0.5

function componentsFor(course) {
  const list = course?.gradeData?.components
  return Array.isArray(list) ? list : []
}

function isGraded(c) {
  return Boolean(c?.graded) && c?.grade !== null && c?.grade !== undefined
}

/**
 * Project one course's final grade, using recall as the estimate for work that
 * has not been graded yet.
 *
 * @returns {null | {
 *   projected: number, letter: string, basis: 'mastery'|'current',
 *   expectedOnRemaining: number, masteryPct: number|null,
 *   gradedWeight: number, remainingWeight: number, courseId: string|null
 * }}
 */
export function projectCourseGrade(course) {
  const components = componentsFor(course)
  if (!components.length) return null

  const totalWeight = components.reduce((s, c) => s + (Number(c?.weight) || 0), 0)
  if (totalWeight <= 0) return null

  const graded = components.filter(isGraded)
  const gradedWeight = graded.reduce((s, c) => s + (Number(c.weight) || 0), 0)
  const remainingWeight = Math.max(0, totalWeight - gradedWeight)

  const courseId = course?.id ?? null
  const masteryPct = getAverageMastery(courseId)
  const currentPct = getCurrentGrade(components)

  // The ladder. Mastery first, because that is the number studying moves.
  let expectedOnRemaining = null
  let basis = null
  if (typeof masteryPct === 'number' && Number.isFinite(masteryPct)) {
    expectedOnRemaining = masteryPct
    basis = 'mastery'
  } else if (typeof currentPct === 'number' && Number.isFinite(currentPct)) {
    expectedOnRemaining = currentPct
    basis = 'current'
  } else {
    // Nothing graded and nothing recalled. There is no honest projection here.
    return null
  }

  const overrides = {}
  for (const c of components) {
    if (!isGraded(c)) overrides[c.id] = expectedOnRemaining
  }

  const projected = getProjectedGrade(components, overrides)
  if (projected === null || !Number.isFinite(projected)) return null

  return {
    projected: Math.round(projected * 10) / 10,
    letter: letterGrade(projected),
    basis,
    expectedOnRemaining: Math.round(expectedOnRemaining),
    masteryPct: typeof masteryPct === 'number' ? Math.round(masteryPct) : null,
    gradedWeight,
    remainingWeight,
    courseId,
  }
}

// ── Movement ────────────────────────────────────────────────────────────────

function readSnapshots() {
  try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? '{}') ?? {} } catch { return {} }
}

function writeSnapshots(next) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
}

/**
 * Compare a fresh projection against the last one we recorded for this course.
 * Pure except for the read, so the caller decides when to commit the new value.
 *
 * @returns {null | { before, after, delta, crossedLetter, letterBefore, letterAfter }}
 */
export function getProjectionMove(courseId, projection, snapshots = readSnapshots()) {
  if (!projection || courseId == null) return null
  const prev = snapshots[String(courseId)]
  if (typeof prev?.projected !== 'number') return null

  const before = prev.projected
  const after = projection.projected
  const delta = Math.round((after - before) * 10) / 10
  if (Math.abs(delta) < MIN_MOVE_PCT) return null

  const letterBefore = letterGrade(before)
  const letterAfter = projection.letter
  return {
    before, after, delta,
    letterBefore, letterAfter,
    crossedLetter: letterBefore !== letterAfter,
  }
}

/** Commit the current projection as the new baseline for future comparisons. */
export function recordProjection(courseId, projection, now = Date.now()) {
  if (!projection || courseId == null) return
  const snapshots = readSnapshots()
  snapshots[String(courseId)] = { projected: projection.projected, at: now }
  writeSnapshots(snapshots)
}

// ── Copy ────────────────────────────────────────────────────────────────────

/**
 * The one line she gets when studying actually moved her grade.
 *
 * Shape: what she just did, then what it moved. Her material's language, her
 * course's name, one sentence, no praise.
 *
 *   "78 percent on enzyme kinetics moves your BIOL 2030 projection to B+."
 *
 * Returns null when there is nothing true to say. Never fabricate movement:
 * a projection line she cannot trace to the session she just finished is the
 * fastest way to make the number meaningless.
 */
export function projectionMoveLine({ move, courseName, topic, scorePct } = {}) {
  if (!move) return null

  const course = typeof courseName === 'string' && courseName.trim() ? courseName.trim() : null
  const subject = typeof topic === 'string' && topic.trim() ? topic.trim() : null
  const target = course ? `your ${course} projection` : 'your projection'

  // Only claim the session caused it when we know what the session scored.
  const cause = typeof scorePct === 'number' && Number.isFinite(scorePct)
    ? `${Math.round(scorePct)} percent${subject ? ` on ${subject}` : ''}`
    : null

  if (move.delta > 0) {
    if (cause) return `${cause} moves ${target} to ${move.letterAfter}.`
    return `${target.charAt(0).toUpperCase() + target.slice(1)} is up to ${move.letterAfter}.`
  }

  // Downward movement is still information, and hiding it would make the
  // number a cheerleader rather than a mirror. Stated flatly, with no blame.
  if (cause) return `${cause} puts ${target} at ${move.letterAfter}.`
  return `${target.charAt(0).toUpperCase() + target.slice(1)} is now ${move.letterAfter}.`
}

export default {
  projectCourseGrade,
  getProjectionMove,
  recordProjection,
  projectionMoveLine,
  MIN_MOVE_PCT,
}
