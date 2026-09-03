/**
 * When to arm the first-course plan generation.
 *
 * This exists as its own function for one reason: the ordering it enforces is
 * an invariant that cannot be checked by reading the call site.
 *
 * The generation posts to /api/generate-study-coach-plan, which calls
 * getCourseContext(userId, courseId). That reads user_data.plan.courses back
 * from the database and THROWS `course <id> not found for user <id>` if the row
 * is not there. So the request must not be issued until the course write has
 * landed.
 *
 * The first version of this shipped as `savePlan(...)` on one line and
 * `setAutoPlanCourseId(...)` on the next, with nothing awaiting the write. Both
 * started at the same moment and the client's single upsert usually beat the
 * server's auth-then-reserve-then-read, so it usually worked. When it lost, the
 * generation failed with course_context_failed, the loading screen fell through
 * to the dashboard, and the result was indistinguishable from the empty
 * dashboard this whole feature exists to prevent. A test asserted that the
 * promise was returned; nothing asserted that it was awaited.
 */
export async function armFirstPlan({ persisted, courseId, arm }) {
  // The await IS the feature. Removing it restores the race.
  await persisted
  arm(courseId)
  return true
}
