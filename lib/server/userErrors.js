/**
 * User-facing error copy for the AI endpoints.
 *
 * Every string in this file is read by a student, so none of them contain a
 * parameter name, a status code, an exception message, or a stack. The
 * machine-readable half of the contract is `code`, which the client switches on
 * to decide what to show. api/userErrorCopy.test.js fails the build if a
 * message here ever starts looking like a variable name again.
 *
 * What this replaces: `Missing courseId (or unique courseName)` was returned
 * verbatim to users by 16 endpoints, and `String(err?.message || err)` handed
 * them raw exception text from the course-context loader.
 *
 * Rule for adding to this file: if you cannot imagine the sentence in a support
 * reply, it does not belong here. Put the detail in the server log instead,
 * which is what `logDetail` on each helper is for.
 */

export const USER_ERRORS = {
  /**
   * The request had no course attached and none could be resolved. With the
   * first-course gate in place a signed-in user always has at least one course,
   * so in practice this now means the caller failed to pass one. The client
   * treats this code as "open the course picker", not as an error to display.
   */
  course_required: {
    status: 400,
    code: 'course_required',
    error: 'Choose a course first. Everything here is built from that course, so I need to know which one you mean.',
  },

  /**
   * A course was named but does not belong to this user, or was deleted between
   * the client rendering and the request landing.
   */
  course_not_found: {
    status: 404,
    code: 'course_not_found',
    error: 'I could not find that course on your account. Pick it again from your course list and I will pick up where you left off.',
  },

  /**
   * Course context failed to load. Almost always transient.
   */
  course_context_failed: {
    status: 400,
    code: 'course_context_failed',
    error: 'I could not load that course just now. Give it another go in a moment.',
  },

  /**
   * The AI provider errored, timed out, or returned something unusable.
   */
  generation_failed: {
    status: 502,
    code: 'generation_failed',
    error: 'That did not generate properly. Try it again, and nothing was counted against your plan.',
  },

  /**
   * Something we did not anticipate.
   */
  unexpected: {
    status: 500,
    code: 'unexpected',
    error: 'Something went wrong on our end. Try that again in a moment.',
  },

  /**
   * The request arrived without the material the tool needs. Phrased as a thing
   * the student can act on rather than as the name of the field that was empty.
   */
  missing_input: {
    status: 400,
    code: 'missing_input',
    error: 'I need a bit more to work with. Add a topic, some notes, or a file and try again.',
  },

  /**
   * The uploaded text was too short or unreadable.
   */
  unreadable_input: {
    status: 400,
    code: 'unreadable_input',
    error: 'I could not read enough from that. Try a different file, or paste the text in directly.',
  },
}

/**
 * Send a user-facing error and keep the real cause in the server log.
 *
 *   return sendUserError(res, 'course_required', { endpoint: 'quiz-burst' })
 *
 * `logDetail` never reaches the response body.
 */
export function sendUserError(res, kind, logDetail) {
  const spec = USER_ERRORS[kind] ?? USER_ERRORS.unexpected
  if (logDetail !== undefined) {
    const detail = logDetail instanceof Error
      ? (logDetail.stack ?? logDetail.message)
      : (typeof logDetail === 'string' ? logDetail : JSON.stringify(logDetail))
    console.error(`[user-error:${spec.code}] ${detail}`)
  }
  return res.status(spec.status).json({ error: spec.error, code: spec.code })
}
