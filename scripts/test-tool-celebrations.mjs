/**
 * Tests for celebrationFor(), the single decision point that turns a tool
 * completion into a reward, a repair prompt, or nothing.
 *
 * Runs in plain node with no bundler. That is why TIER and the thresholds live
 * in their own module: importing the controller would drag in canvas-confetti,
 * PostHog and the DOM.
 *
 *   npm run test:celebrations
 */

import assert from 'node:assert/strict'
import { celebrationFor } from '../src/lib/toolCelebrations.js'
import { TIER, WEAK_PCT, STRONG_PCT } from '../src/lib/celebrationTiers.js'

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

const SCORED_TOOLS = ['quizBurst', 'timeAttack', 'teachItBack', 'brainDump', 'connections', 'diagnostic']
const ARTIFACT_TOOLS = ['cheatSheet', 'examRescue', 'podcast', 'essayArchitect', 'diagrams', 'problemSolver']

// ── Nothing at all ──────────────────────────────────────────────────────────

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

check('a silent re-dispatch produces no response', () => {
  // Brain Dump retries its evidence write and re-fires for the streak. The
  // student must not be shown a second response to one score.
  assert.equal(celebrationFor({ tool: 'brainDump', score: 40, silent: true }), null)
})

// ── Artifact tools point forward, never backward ────────────────────────────

check('every artifact tool returns a reward with forward-looking body', () => {
  for (const tool of ARTIFACT_TOOLS) {
    const c = celebrationFor({ tool, topic: 'the Krebs cycle' })
    assert.equal(c.kind, 'reward', `${tool} should be a reward`)
    assert.equal(c.tier, TIER.SMALL, `${tool} should be SMALL`)
    assert.ok(c.title && c.title.length > 0, `${tool} needs a title`)
    assert.ok(c.body && c.body.length > 0, `${tool} needs a forward-looking body`)
  }
})

check('artifact copy still works with no topic at all', () => {
  for (const tool of ARTIFACT_TOOLS) {
    const c = celebrationFor({ tool })
    assert.ok(c.body && !c.body.includes('undefined') && !c.body.includes('null'),
      `${tool} degraded badly without a topic: ${c.body}`)
  }
})

check('no artifact tool ever reaches MEDIUM', () => {
  for (const tool of ARTIFACT_TOOLS) {
    // Even if something erroneously attaches a perfect score to an artifact.
    assert.equal(celebrationFor({ tool, score: 100 }).tier, TIER.SMALL, tool)
  }
})

// ── Wins name the material ──────────────────────────────────────────────────

check('a perfect quiz names the topic and earns MEDIUM', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 8, total: 8, topic: 'enzyme kinetics' })
  assert.equal(c.kind, 'reward')
  assert.equal(c.tier, TIER.MEDIUM)
  assert.equal(c.title, '8 of 8 on enzyme kinetics.')
})

check('without a topic the win still reads as a result', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 8, total: 8 })
  assert.equal(c.title, '8 of 8 correct.')
})

check('exactly at the strong threshold earns MEDIUM', () => {
  assert.equal(celebrationFor({ tool: 'quizBurst', score: 9, total: 10 }).tier, TIER.MEDIUM)
})

check('just under the strong threshold stays SMALL but still celebrates', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 8, total: 10, topic: 'glycolysis' })
  assert.equal(c.kind, 'reward')
  assert.equal(c.tier, TIER.SMALL)
  assert.equal(c.title, '8 of 10 on glycolysis.')
})

check('a marked tool reads as a percent', () => {
  const c = celebrationFor({ tool: 'brainDump', score: 74, topic: 'the Krebs cycle' })
  assert.equal(c.title, '74 percent on the Krebs cycle.')
})

// ── Trajectory ──────────────────────────────────────────────────────────────

check('a strong run references topics locked this week', () => {
  const c = celebrationFor(
    { tool: 'quizBurst', score: 8, total: 8, topic: 'enzyme kinetics' },
    { topicsLockedThisWeek: 3 },
  )
  assert.equal(c.body, 'Third topic you have locked this week.')
})

check('a merely fine run does not claim a topic was locked', () => {
  const c = celebrationFor(
    { tool: 'quizBurst', score: 7, total: 10, topic: 'glycolysis' },
    { topicsLockedThisWeek: 3, sessionsThisWeek: 5 },
  )
  assert.equal(c.body, '5 sessions this week.', 'should fall through to sessions, not "locked"')
})

check('with no trajectory facts the reward ships one line, not padding', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 8, total: 8, topic: 'enzyme kinetics' })
  assert.equal(c.body, null)
})

check('thin trajectory numbers are not worth saying', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 8, total: 8 }, { sessionsThisWeek: 1, streakDays: 1 })
  assert.equal(c.body, null)
})

// ── The floor: below WEAK_PCT there is no celebration at all ────────────────

check('a sub-floor score returns repair, never a reward', () => {
  const c = celebrationFor({ tool: 'brainDump', score: 41, topic: 'the Krebs cycle' })
  assert.equal(c.kind, 'repair')
  assert.equal(c.concept, 'the Krebs cycle')
  assert.equal(c.tier, undefined, 'a repair must carry no tier')
})

check('no tier of any size fires below the floor, for any scored tool', () => {
  for (const tool of SCORED_TOOLS) {
    for (const pct of [0, 12, 41, 59]) {
      const c = celebrationFor({ tool, score: pct, topic: 'a topic' })
      assert.equal(c.kind, 'repair', `${tool} at ${pct} should repair`)
      assert.equal(c.tier, undefined, `${tool} at ${pct} must not carry a tier`)
    }
  }
})

check('the floor boundary belongs to the reward side', () => {
  assert.equal(celebrationFor({ tool: 'quizBurst', score: WEAK_PCT, topic: 't' }).kind, 'reward')
  assert.equal(celebrationFor({ tool: 'quizBurst', score: WEAK_PCT - 1, topic: 't' }).kind, 'repair')
})

check('repair prefers the named gap over the session topic', () => {
  const c = celebrationFor({
    tool: 'quizBurst', score: 2, total: 10,
    topic: 'Chapter 7', gaps: ['the electron transport chain', 'oxidative phosphorylation'],
  })
  assert.equal(c.concept, 'the electron transport chain')
  assert.equal(c.alsoConcept, 'oxidative phosphorylation')
})

check('repair names at most two concepts, because three is a list', () => {
  const c = celebrationFor({
    tool: 'quizBurst', score: 1, total: 10,
    gaps: ['one', 'two', 'three', 'four'],
  })
  assert.equal(c.concept, 'one')
  assert.equal(c.alsoConcept, 'two')
  assert.equal(Object.prototype.hasOwnProperty.call(c, 'thirdConcept'), false)
})

check('repair falls back to the course weak spot when the tool sent no topic', () => {
  const c = celebrationFor({ tool: 'connections', score: 30 }, { fallbackConcept: 'osmosis' })
  assert.equal(c.kind, 'repair')
  assert.equal(c.concept, 'osmosis')
})

check('with nothing specific to name, the app says nothing rather than something vague', () => {
  // A dead button or a generic "keep going" are both worse than silence.
  assert.equal(celebrationFor({ tool: 'connections', score: 30 }), null)
})

check('repair carries a label for its one button', () => {
  const c = celebrationFor({ tool: 'brainDump', score: 41, topic: 'the Krebs cycle' })
  assert.ok(c.actionLabel && c.actionLabel.length > 0)
})

// ── Bad input degrades rather than throwing or inventing ────────────────────

check('a total of zero does not divide by zero or invent a failure', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 0, total: 0 })
  assert.equal(c.kind, 'reward', 'a broken denominator is not a bad score')
  assert.equal(c.tier, TIER.SMALL)
})

check('a non numeric score is ignored', () => {
  const c = celebrationFor({ tool: 'brainDump', score: 'good' })
  assert.equal(c.kind, 'reward')
  assert.equal(c.tier, TIER.SMALL)
})

check('an out of range bare score is ignored rather than trusted', () => {
  const c = celebrationFor({ tool: 'brainDump', score: 250 })
  assert.equal(c.kind, 'reward', '250 is not 250 percent, and it is not a failure either')
})

check('a whitespace topic is treated as no topic', () => {
  const c = celebrationFor({ tool: 'quizBurst', score: 8, total: 8, topic: '   ' })
  assert.equal(c.title, '8 of 8 correct.')
})

check('an absurdly long topic is truncated, not rendered whole', () => {
  const long = 'a'.repeat(300)
  const c = celebrationFor({ tool: 'quizBurst', score: 8, total: 8, topic: long })
  assert.ok(c.title.length < 120, `title was ${c.title.length} chars`)
})

check('null detail does not throw', () => {
  assert.equal(celebrationFor(null), null)
  assert.equal(celebrationFor(undefined, undefined), null)
})

// ── No copy may contain an em dash, an en dash, or an emoji ─────────────────

const EM_OR_EN = /[–—]/
// Covers the emoji planes plus the common BMP pictographs and dingbats.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/u

function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) allStrings(v, out)
  return out
}

check('no reward or repair copy contains an em dash, en dash, or emoji', () => {
  const contexts = [
    {},
    { topicsLockedThisWeek: 3, sessionsThisWeek: 6, streakDays: 9 },
    { fallbackConcept: 'osmosis' },
  ]
  const details = []
  for (const tool of [...SCORED_TOOLS, ...ARTIFACT_TOOLS]) {
    for (const score of [undefined, 0, 41, 74, 100]) {
      for (const topic of [undefined, 'the Krebs cycle']) {
        details.push({ tool, score, topic, gaps: ['glycolysis', 'the citric acid cycle'] })
        details.push({ tool, score, total: 10, topic })
      }
    }
  }
  let checked = 0
  for (const d of details) {
    for (const ctx of contexts) {
      const plan = celebrationFor(d, ctx)
      if (!plan) continue
      for (const s of allStrings(plan)) {
        checked++
        assert.ok(!EM_OR_EN.test(s), `dash in: ${s}`)
        assert.ok(!EMOJI.test(s), `emoji in: ${s}`)
        assert.ok(!s.includes('undefined'), `undefined leaked into: ${s}`)
        assert.ok(!s.includes('null'), `null leaked into: ${s}`)
        assert.ok(s.trim().length > 0, 'empty string rendered')
      }
    }
  }
  assert.ok(checked > 400, `expected broad coverage, only checked ${checked} strings`)
})

check('no reward copy uses praise adjectives or exclamation marks', () => {
  const BANNED = ['amazing', 'great job', 'awesome', 'fantastic', 'well done', 'excellent', 'keep going', 'nice work', 'you got this']
  for (const tool of [...SCORED_TOOLS, ...ARTIFACT_TOOLS]) {
    for (const score of [undefined, 30, 74, 100]) {
      const plan = celebrationFor({ tool, score, topic: 'osmosis' }, { topicsLockedThisWeek: 3 })
      if (!plan) continue
      for (const s of allStrings(plan)) {
        assert.ok(!s.includes('!'), `exclamation in: ${s}`)
        const lower = s.toLowerCase()
        for (const bad of BANNED) {
          assert.ok(!lower.includes(bad), `praise phrase "${bad}" in: ${s}`)
        }
      }
    }
  }
})

check('thresholds are ordered and live in one module', () => {
  assert.ok(WEAK_PCT < STRONG_PCT)
  assert.equal(WEAK_PCT, 60)
  assert.equal(STRONG_PCT, 90)
})

console.log(`${passed} assertions passed`)
