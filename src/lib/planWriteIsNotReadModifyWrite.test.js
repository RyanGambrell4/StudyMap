/**
 * Why the plan write is not the clobber that the subscription write is.
 *
 * A previous run flagged that onboarding's plan write and the gate's plan write
 * "look like the same read-modify-write clobber class as the subscription
 * column", and declined to claim it without proof. This settles it: it is not,
 * and these tests pin the two properties that make it not.
 *
 * ── The clobber, for comparison ─────────────────────────────────────────────
 * commitReservation in lib/server/usage.js genuinely is read-modify-write, and
 * the gap is an entire AI generation:
 *
 *   const { data: row } = await supabase.from('user_data').select('subscription')
 *   ...tens of seconds...
 *   const updatedSub = { ...sub, aiQueriesUsed: used + 1 }
 *   await supabase.from('user_data').upsert({ subscription: updatedSub })
 *
 * Anything written to that column inside the gap is erased. Reproduced in
 * scripts/verifyAiQuotaAccounting.mjs, checks 5 and 6.
 *
 * ── Why savePlan is a different shape ───────────────────────────────────────
 * savePlan(plan) does `_upsert({ plan })`. It never reads `plan` back from the
 * database first. The object it writes is assembled in App.jsx from React
 * state, which is the single source of truth for that column in a given tab.
 * There is no read, so there is no window between a read and a write, so there
 * is no race of that kind to lose.
 *
 * Two further facts, both checked below:
 *
 *   1. handleOnboardingComplete does not call savePlan at all. It sets React
 *      state and calls saveEmailDigest. So in the onboarding-then-gate sequence
 *      there is only ONE plan writer, and a single writer cannot race itself.
 *
 *   2. _upsert names the columns it sends, so `_upsert({ plan })` cannot touch
 *      `subscription` or any other sibling column. Verified live as well:
 *      scripts/verifyAiQuotaAccounting.mjs check 2 asserts a seeded
 *      stripeCustomerId survives a write from a different code path.
 *
 * ── What the error actually was ─────────────────────────────────────────────
 * The `[db] upsert error` observed at onboarding completion was not the plan
 * write. It was saveEmailDigest -> _upsert({ email_digest }), against a column
 * that does not exist in production or staging:
 *
 *   PGRST204  Could not find the 'email_digest' column of 'user_data'
 *             in the schema cache                                    HTTP 400
 *
 * Reproduced directly against staging. The same missing column also makes
 * api/weekly-digest.js and api/weekly-recap.js return 500 on every Sunday run,
 * because both select it and weekly-digest filters `.eq('email_digest', true)`.
 *
 * ── What IS still true, and is a different problem ──────────────────────────
 * savePlan is last-write-wins across CLIENTS. Two tabs open, each with its own
 * React `courses` array, and the second to save overwrites the first. That is a
 * multi-client concurrency issue, not a read-modify-write race, it needs a
 * different fix (per-course rows, or a version column), and it is rarer because
 * it needs two concurrent sessions for one account. Recorded here so the
 * distinction does not get lost.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

const db = stripComments(readFileSync('src/lib/db.js', 'utf8'))
const app = stripComments(readFileSync('src/App.jsx', 'utf8'))

describe('savePlan writes, it does not read-modify-write', () => {
  it('does not read the plan column before writing it', () => {
    const fn = db.match(/export async function savePlan\([\s\S]*?\n\}/)
    expect(fn, 'savePlan not found; update this test if it moved').toBeTruthy()
    const body = fn[0]
    expect(body, 'savePlan must not select before it writes; that reintroduces the race')
      .not.toMatch(/\.select\(/)
    expect(body, 'savePlan must not fetch the current row before writing')
      .not.toMatch(/\.from\(['"]user_data['"]\)/)
    // It should hand the caller's object straight to _upsert.
    expect(body).toMatch(/_upsert\(\{\s*plan\s*\}\)/)
  })

  it('_upsert names the columns it sends, so siblings cannot be clobbered', () => {
    const fn = db.match(/async function _upsert\([\s\S]*?\n\}/)
    expect(fn, '_upsert not found; update this test if it moved').toBeTruthy()
    const body = fn[0]
    // Spreading `fields` means only the keys the caller passed are written.
    expect(body).toMatch(/\.\.\.fields/)
    // A blanket write of the whole row would defeat that.
    expect(body, '_upsert must not write a whole-row snapshot').not.toMatch(/\.\.\._cache\b/)
  })
})

describe('the onboarding-then-gate sequence has exactly one plan writer', () => {
  it('handleOnboardingComplete does not write the plan', () => {
    const fn = app.match(/const handleOnboardingComplete = \([\s\S]*?\n  \}/)
    expect(fn, 'handleOnboardingComplete not found; update this test if it moved').toBeTruthy()
    expect(
      fn[0],
      'handleOnboardingComplete must not call savePlan. If it starts to, it becomes a ' +
      'second writer racing the gate and this analysis needs redoing.'
    ).not.toMatch(/\bsavePlan\(/)
  })

  it('handleAddCourse writes the new array it just built, not stale state', () => {
    const fn = app.match(/const handleAddCourse = \([\s\S]*?\n  \}/)
    expect(fn, 'handleAddCourse not found; update this test if it moved').toBeTruthy()
    // `courses` here would be the pre-update state and would drop the new course.
    expect(fn[0]).toMatch(/savePlan\(\{\s*\n?\s*courses:\s*newCourses/)
  })
})
