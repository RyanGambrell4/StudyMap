/**
 * courseRegistry - the current courses, readable from outside React.
 *
 * Courses live in OutputView's state. The celebration listener is not a
 * component and cannot reach them, but it needs a course's grade components to
 * work out whether a session just moved her projection.
 *
 * The alternative was widening the `studyedge:tool-session-complete` payload
 * with grade data at all twelve dispatch sites. That spreads one concern
 * across twelve files and gets stale the moment a thirteenth tool is added.
 * One seam, kept in sync by one effect, is the smaller thing to maintain.
 *
 * This is a read-through cache of React state, not a store. Nothing writes
 * courses here; OutputView mirrors them in and everything else only reads.
 */

let courses = []

/** Mirror the current courses in. Called from OutputView on every change. */
export function setCourses(next) {
  courses = Array.isArray(next) ? next : []
}

export function getCourses() {
  return courses
}

/**
 * Find a course by id. Ids arrive from event payloads as strings and are
 * sometimes numbers in state, so compare loosely on the string form rather
 * than trusting either side.
 */
export function getCourseById(courseId) {
  if (courseId == null) return null
  const wanted = String(courseId)
  return courses.find(c => c != null && String(c.id) === wanted) ?? null
}

export default { setCourses, getCourses, getCourseById }
