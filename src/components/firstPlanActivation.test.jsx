import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Activation contract: setup ends by generating, not by landing.
 *
 * In the three weeks after CourseRequiredGate shipped, 63 people added a course
 * and 21 ever generated anything. The syllabus upload path already built a plan
 * on completion; the typed-course-name path did not, so most new accounts
 * reached a working dashboard with nothing in it and left.
 *
 * These assertions pin the pieces that are easy to break silently later:
 * the trigger, the ordering that makes the request possible at all, and the
 * failure behaviour.
 */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('first course generates a plan', () => {
  const output = read('./OutputView.jsx')
  const app = read('../App.jsx')

  it('onboarding carries courseName and examDate into the app', () => {
    // The old handler destructured neither, so both were collected and dropped.
    expect(app).toMatch(/handleOnboardingComplete = \(\{[^}]*courseName[^}]*examDate[^}]*\}\)/s)
  })

  it('no longer resets the account to zero courses on onboarding completion', () => {
    // setCourses([]) plus "n_courses is 0 here by definition" was the bug.
    expect(app).not.toMatch(/setCourses\(\[\]\)\n\s*setInitialCompletedIds/)
  })

  it('a first course from either path is armed through armFirstPlan', () => {
    // Both entry points must go through the module that owns the ordering
    // invariant. The ordering itself is asserted behaviourally in
    // src/lib/firstCoursePlan.test.js - source matching cannot prove an await
    // happened, which is exactly how the previous version of this test passed
    // against racy code.
    expect(app).toMatch(/armFirstPlan\(\{ persisted: saved, courseId: course\.id/)
    expect(app).toMatch(/armFirstPlan\(\{ persisted: seedSaved, courseId: seededCourse\.id/)
  })

  it('never arms the generation outside armFirstPlan', () => {
    // A direct setAutoPlanCourseId call would bypass the await entirely.
    const direct = [...app.matchAll(/setAutoPlanCourseId\(/g)].length
    const declaration = [...app.matchAll(/useState\(null\)/g)].length
    // Two references are legitimate: the useState declaration and the reset in
    // onAutoPlanSettled. Any more means something is arming it directly.
    expect(app).not.toMatch(/if \(isFirstCourse\) setAutoPlanCourseId/)
    expect(direct).toBeLessThanOrEqual(3)
    expect(declaration).toBeGreaterThan(0)
  })

  it('marks the generation only after a good response, via the shared counter', () => {
    // incrementAIQuery is what stamps firstGenerationAt and fires
    // first_generation_succeeded. Calling it before the response would credit
    // a win to a request that had not returned.
    const i = output.indexOf("incrementAIQuery('first_course_plan')")
    const ok = output.indexOf('if (res.ok && plan.weeklyFocus)')
    expect(ok).toBeGreaterThan(-1)
    expect(i).toBeGreaterThan(ok)
  })

  it('does not consume the free coachPlan allowance', () => {
    // Free tier is one coach plan total. The auto-plan is not something the
    // student asked for, so it must not spend their single manual build.
    expect(output).not.toMatch(/incrementFeatureUsage\('coachPlan'\)/)
  })

  it('skips silently when the user has no AI quota', () => {
    expect(output).toMatch(/if \(!canUseAI\(\)\) \{[\s\S]{0,200}first_plan_skipped/)
  })

  it('always clears the loading screen, so a failure lands on the dashboard', () => {
    expect(output).toMatch(/finally \{[\s\S]{0,400}setFirstPlan\(null\)/)
  })

  it('guards against StrictMode double-invocation spending two AI actions', () => {
    expect(output).toMatch(/autoPlanRunFor\.current === autoPlanCourseId/)
  })
})

describe('FirstPlanGenerating', () => {
  const src = read('./FirstPlanGenerating.jsx')

  it('is light theme, per the project-wide rule', () => {
    expect(src).not.toMatch(/dark:/)
    expect(src).toMatch(/background: T\.bg/)
  })

  it('uses design tokens rather than its own palette', () => {
    // Any bare hex that is not one of the two neutral track/scrim values would
    // be a new per-component palette, which the design system forbids.
    const hexes = [...src.matchAll(/#[0-9A-Fa-f]{6}/g)].map(m => m[0])
    expect(hexes).toEqual(['#EFF1F4'])
  })

  it('respects reduced motion', () => {
    expect(src).toMatch(/prefers-reduced-motion: reduce/)
  })

  it('announces itself to assistive tech', () => {
    expect(src).toMatch(/role="status"/)
    expect(src).toMatch(/aria-live="polite"/)
  })

  it('has no emoji and no em dashes in copy, per the house rules', () => {
    expect(src).not.toMatch(/—/)
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})
