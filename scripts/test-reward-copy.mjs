/**
 * Tests for the return acknowledgement, the one line the app says when a
 * student comes back after four or more days away.
 *
 * The rules being enforced here are editorial as much as functional: the line
 * must never mention the gap, never scold, and never appear twice for the same
 * absence.
 *
 *   npm run test:rewards
 */

import assert from 'node:assert/strict'
import { buildReturnAck, AWAY_DAYS } from '../src/lib/returnAck.js'

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

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-08-12T23:00:00.000Z')

function sessionAgo(days, extra = {}) {
  return { tool: 'Quiz Burst', score: 80, topic: 'electron transport', date: new Date(NOW - days * DAY).toISOString(), ...extra }
}

// ── When it fires ───────────────────────────────────────────────────────────

check('no history means nothing to acknowledge', () => {
  assert.equal(buildReturnAck({ history: [], now: NOW }), null)
  assert.equal(buildReturnAck({ now: NOW }), null)
  assert.equal(buildReturnAck(), null)
})

check('a student who studied yesterday is not returning', () => {
  assert.equal(buildReturnAck({ history: [sessionAgo(1)], now: NOW }), null)
})

check('three days away is still not a return', () => {
  assert.equal(buildReturnAck({ history: [sessionAgo(3)], now: NOW }), null)
})

check('four days away is a return', () => {
  const ack = buildReturnAck({ history: [sessionAgo(AWAY_DAYS)], now: NOW })
  assert.ok(ack, 'should acknowledge at the boundary')
  assert.equal(ack.daysAway, AWAY_DAYS)
})

check('a long absence still gets one calm line', () => {
  const ack = buildReturnAck({ history: [sessionAgo(90)], now: NOW })
  assert.ok(ack)
  assert.equal(ack.line, 'Back. Let us pick up at electron transport.')
})

// ── What it says ────────────────────────────────────────────────────────────

check('the line names the topic she was last on', () => {
  const ack = buildReturnAck({ history: [sessionAgo(6, { topic: 'the Krebs cycle' })], now: NOW })
  assert.equal(ack.line, 'Back. Let us pick up at the Krebs cycle.')
  assert.equal(ack.topic, 'the Krebs cycle')
})

check('with no topic it still says one clean sentence', () => {
  const ack = buildReturnAck({ history: [sessionAgo(6, { topic: null })], now: NOW })
  assert.equal(ack.line, 'Back. Let us pick up where you stopped.')
  assert.ok(!ack.line.includes('undefined') && !ack.line.includes('null'))
})

check('a whitespace topic is treated as no topic', () => {
  const ack = buildReturnAck({ history: [sessionAgo(6, { topic: '   ' })], now: NOW })
  assert.equal(ack.topic, null)
  assert.ok(!ack.line.includes('  .'))
})

check('the line never mentions the gap, and never scolds', () => {
  const BANNED = [
    'days', 'day', 'week', 'weeks', 'while', 'missed', 'miss', 'lost',
    'streak', 'been', 'away', 'gone', 'sorry', 'finally', 'again',
  ]
  for (const days of [4, 5, 9, 30, 200]) {
    for (const topic of ['electron transport', null]) {
      const ack = buildReturnAck({ history: [sessionAgo(days, { topic })], now: NOW })
      const lower = ack.line.toLowerCase()
      for (const bad of BANNED) {
        assert.ok(!new RegExp(`\\b${bad}\\b`).test(lower), `"${bad}" appeared in: ${ack.line}`)
      }
      assert.ok(!ack.line.includes('!'), 'no exclamation marks')
      assert.ok(!/[–—]/.test(ack.line), 'no em or en dash')
    }
  }
})

// ── It is said exactly once ─────────────────────────────────────────────────

check('the same absence is not acknowledged twice', () => {
  const history = [sessionAgo(6)]
  const first = buildReturnAck({ history, now: NOW })
  assert.ok(first)
  const second = buildReturnAck({ history, now: NOW, ackedFor: first.sinceDate })
  assert.equal(second, null, 'a reload must not repeat the line')
})

check('a new absence later on is acknowledged again', () => {
  const old = buildReturnAck({ history: [sessionAgo(30)], now: NOW })
  // She comes back, studies, disappears again, returns. Different last session.
  const next = buildReturnAck({ history: [sessionAgo(5)], now: NOW, ackedFor: old.sinceDate })
  assert.ok(next, 'a genuinely new absence deserves the line again')
  assert.notEqual(next.sinceDate, old.sinceDate)
})

// ── Robustness ──────────────────────────────────────────────────────────────

check('the newest session wins even if history is out of order', () => {
  const history = [sessionAgo(40, { topic: 'old thing' }), sessionAgo(5, { topic: 'recent thing' }), sessionAgo(90)]
  const ack = buildReturnAck({ history, now: NOW })
  assert.equal(ack.topic, 'recent thing')
})

check('unparseable dates are skipped rather than throwing', () => {
  const history = [{ topic: 'junk', date: 'not a date' }, sessionAgo(7, { topic: 'real' })]
  const ack = buildReturnAck({ history, now: NOW })
  assert.equal(ack.topic, 'real')
})

check('history of only junk produces nothing', () => {
  assert.equal(buildReturnAck({ history: [{ date: 'nope' }, {}], now: NOW }), null)
})

check('a non array history does not throw', () => {
  assert.equal(buildReturnAck({ history: 'nope', now: NOW }), null)
  assert.equal(buildReturnAck({ history: null, now: NOW }), null)
})

console.log(`${passed} assertions passed`)
