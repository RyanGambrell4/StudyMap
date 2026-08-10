/**
 * onboardingPlan - the real backend work that runs underneath the build screen.
 *
 * ARCHITECTURAL NOTE, read before changing this.
 *
 * The brief requires two things that are currently in tension in this codebase:
 *
 *   1. No account until after the reveal (Act 1 to Act 4 run anonymous).
 *   2. The build screen does real backend work and shows a REAL topic count.
 *
 * Every AI endpoint in `api/` is gated behind `verifyAndCheckAiUsage`, so an
 * anonymous visitor cannot generate a plan. There is no anonymous
 * course-to-topics endpoint today.
 *
 * Rather than fabricate a topic count, which the brief forbids outright, this
 * resolves with `topicCount: null` when it cannot get a real one, and the build
 * screen drops the number from stage two ("Mapping Organic Chemistry to its
 * core topics"). The latency and the failure reason are reported to PostHog on
 * `build_screen_completed`, so the gap is measurable rather than invisible.
 *
 * To light up the real number: add an endpoint that maps a course name to a
 * topic count without requiring auth, and return it as `topicCount` here. No
 * component changes are needed.
 */

import { getAccessToken } from './supabase'

const PLAN_ENDPOINT = '/api/generate-study-coach-plan'

function countTopics(plan) {
  if (!plan) return null
  // The coach plan is week-shaped; topics live under each week.
  if (Array.isArray(plan.weeks)) {
    const set = new Set()
    plan.weeks.forEach((w) => {
      (w?.topics ?? []).forEach((t) => {
        const name = typeof t === 'string' ? t : t?.name
        if (name) set.add(String(name).trim().toLowerCase())
      })
    })
    if (set.size > 0) return set.size
  }
  if (Array.isArray(plan.topics) && plan.topics.length > 0) return plan.topics.length
  return null
}

function countQuestions(plan) {
  if (!plan) return null
  if (Number.isFinite(plan.questionCount)) return plan.questionCount
  if (Array.isArray(plan.weeks)) {
    const total = plan.weeks.reduce((sum, w) => sum + (Array.isArray(w?.sessions) ? w.sessions.length : 0), 0)
    if (total > 0) return total
  }
  return null
}

/**
 * @returns {Promise<{
 *   ok: boolean, reason: string|null, plan: object|null,
 *   topicCount: number|null, questionCount: number|null, latencyMs: number
 * }>}
 */
export async function buildOnboardingPlan(state, { signal } = {}) {
  const started = Date.now()
  const done = (extra) => ({
    ok: false, reason: null, plan: null, topicCount: null, questionCount: null,
    latencyMs: Date.now() - started, ...extra,
  })

  let token = null
  try { token = await getAccessToken() } catch { /* anonymous */ }

  // Anonymous is the expected path during onboarding. Not an error, just a
  // ceiling on what we can honestly claim on the build screen.
  if (!token) return done({ reason: 'anonymous' })

  try {
    const res = await fetch(PLAN_ENDPOINT, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        courseName: state?.course?.name ?? null,
        examDate: state?.examDate ?? null,
        currentGrade: state?.currentGrade ?? null,
        targetGrade: state?.targetGrade ?? null,
        studyHours: state?.studyHours ?? null,
        learningStyles: state?.learningStyles ?? [],
        struggles: state?.struggles ?? [],
        preferredTime: state?.studyTime ?? null,
      }),
    })

    if (!res.ok) return done({ reason: `http_${res.status}` })

    const plan = await res.json()
    return {
      ok: true,
      reason: null,
      plan,
      topicCount: countTopics(plan),
      questionCount: countQuestions(plan),
      latencyMs: Date.now() - started,
    }
  } catch (err) {
    return done({ reason: err?.name === 'AbortError' ? 'aborted' : 'network' })
  }
}

export default buildOnboardingPlan
