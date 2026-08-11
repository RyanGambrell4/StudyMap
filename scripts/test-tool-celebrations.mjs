/**
 * Tests for celebrationFor(), the single decision point that turns a tool
 * completion into a reward tier for twelve tools.
 *
 * Runs in plain node with no bundler. That is why TIER lives in its own module:
 * importing the controller would drag in canvas-confetti, PostHog and the DOM.
 *
 *   npm run test:celebrations
 */

import assert from 'node:assert/strict'
import { celebrationFor } from '../src/lib/toolCelebrations.js'
import { TIER } from '../src/lib/celebrationTiers.js'

let passed = 0
function check(name, fn) {
  try {
    fn()
    passed++
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(`      ${err.message}`)
    process.exitCode = 1
  }
}

// ── Unknown and self-celebrating tools produce nothing ──────────────────────

check('unknown tool is ignored', () => {
  assert.equal(celebrationFor({ tool: 'notARealTool' }), null)
})

check('missing tool is ignored', () => {
  assert.equal(celebrationFor({}), null)
  assert.equal(celebrationFor(), null)
})

check('focusMode is skipped so it cannot double fire', () => {
  assert.equal(celebrationFor({ tool: 'focusMode' }), null)
})

check('practiceExam is skipped so it cannot double fire', () => {
  assert.equal(celebrationFor({ tool: 'practiceExam', score: 95, total: 100 }), null)
})

// ── Unscored tools get their flat tier ──────────────────────────────────────

check('cheat sheet is SMALL with artifact copy', () => {
  const c = celebrationFor({ tool: 'cheatSheet' })
  assert.equal(c.tier, TIER.SMALL)
  assert.equal(c.title, 'Cheat sheet ready')
  assert.equal(c.body, null)
})

check('no tool is MEDIUM without a score', () => {
  for (const tool of ['cheatSheet', 'examRescue', 'podcast', 'essayArchitect', 'diagrams', 'problemSolver', 'quizBurst']) {
    const c = celebrationFor({ tool })
    assert.equal(c.tier, TIER.SMALL, `${tool} should be SMALL unscored`)
  }
})

// ── Scored out of a total ───────────────────────────────────────────────────

check('a perfect quiz earns MEDIUM', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 8, total: 8 })
  assert.equal(c.tier, TIER.MEDIUM)
  assert.equal(c.body, '8 of 8 correct.')
})

check('exactly at the threshold earns MEDIUM', () => {
  // 9/10 is 90 percent, the boundary. Boundaries are where this gets fudged.
  assert.equal(celebrationFor({ tool: 'quizBurst', score: 9, total: 10 }).tier, TIER.MEDIUM)
})

check('just under the threshold stays SMALL', () => {
  // 8/10 is 80 percent.
  assert.equal(celebrationFor({ tool: 'quizBurst', score: 8, total: 10 }).tier, TIER.SMALL)
})

check('a bad run still gets acknowledged, quietly', () => {
  const c = celebrationFor({ tool: 'timeAttack', score: 2, total: 14 })
  assert.equal(c.tier, TIER.SMALL)
  assert.equal(c.title, 'Time attack done')
  assert.equal(c.body, '2 of 14 correct.')
})

check('zero correct is a score, not a missing score', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 0, total: 6 })
  assert.equal(c.body, '0 of 6 correct.')
})

// ── Scored as a percentage ──────────────────────────────────────────────────

check('a marked tool passes a bare percent', () => {
  const c = celebrationFor({ tool: 'brainDump', score: 74 })
  assert.equal(c.tier, TIER.SMALL)
  assert.equal(c.body, '74 percent.')
})

check('a strong marked score earns MEDIUM', () => {
  assert.equal(celebrationFor({ tool: 'teachItBack', score: 93 }).tier, TIER.MEDIUM)
})

check('100 percent is treated as a percent, not discarded', () => {
  const c = celebrationFor({ tool: 'connections', score: 100 })
  assert.equal(c.tier, TIER.MEDIUM)
  assert.equal(c.body, '100 percent.')
})

// ── Bad input degrades to the flat tier rather than throwing ────────────────

check('a total of zero does not divide by zero', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 0, total: 0 })
  assert.equal(c.tier, TIER.SMALL)
  assert.equal(c.body, null, 'a zero total carries no usable score')
})

check('a non numeric score is ignored', () => {
  const c = celebrationFor({ tool: 'brainDump', score: 'good' })
  assert.equal(c.tier, TIER.SMALL)
  assert.equal(c.body, null)
})

check('an out of range bare score is ignored rather than trusted', () => {
  // Nothing should send 250, but if something does it is not 250 percent.
  const c = celebrationFor({ tool: 'brainDump', score: 250 })
  assert.equal(c.body, null)
})

console.log(`${passed} assertions passed`)
