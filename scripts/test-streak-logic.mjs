/**
 * Streak rules test. Plain Node, no test framework.
 *
 *   node scripts/test-streak-logic.mjs
 *
 * These rules are date arithmetic that is invisible until it is wrong for a
 * user a week later, which is exactly the class of bug that killed the streak
 * the first time. Everything here is pure, so it is cheap to pin down.
 */

import assert from 'node:assert/strict'
import {
  derive,
  isAlive,
  applyCompletion,
  freezeTarget,
  applyFreezeTo,
  grantWeeklyFreeze,
  MAX_FREEZES,
  EMPTY_STREAK,
} from '../src/lib/streakLogic.js'
import { addDays } from '../src/utils/dateUtils.js'

const T = '2026-03-15'            // "today" for every case below
const d = (n) => addDays(T, n)

let checks = 0
function check(name, fn) { fn(); checks++; void name }

// ── Building a run ──────────────────────────────────────────────────────────

check('first ever completion starts at 1', () => {
  const s = applyCompletion(EMPTY_STREAK, T)
  assert.equal(s.currentStreak, 1)
  assert.equal(s.lastCompletedDate, T)
  assert.equal(s.personalBest, 1)
})

check('consecutive day extends the run', () => {
  let s = applyCompletion(EMPTY_STREAK, d(-2))
  s = applyCompletion(s, d(-1))
  s = applyCompletion(s, T)
  assert.equal(s.currentStreak, 3)
})

check('a gap restarts at 1', () => {
  let s = applyCompletion(EMPTY_STREAK, d(-5))
  s = applyCompletion(s, T)
  assert.equal(s.currentStreak, 1)
})

check('same day twice is a no-op and keeps identity', () => {
  const s = applyCompletion(EMPTY_STREAK, T)
  assert.equal(applyCompletion(s, T), s)
})

check('personal best survives a reset', () => {
  let s = EMPTY_STREAK
  for (let i = 9; i >= 0; i--) s = applyCompletion(s, d(-i - 10))
  assert.equal(s.currentStreak, 10)
  s = applyCompletion(s, T)          // long gap, run restarts
  assert.equal(s.currentStreak, 1)
  assert.equal(s.personalBest, 10)
})

// ── Decay: the bug that made the number a lie ───────────────────────────────

check('a run fed today is alive', () => {
  assert.equal(isAlive({ lastCompletedDate: T, currentStreak: 4 }, T), true)
})

check('a run fed yesterday is still alive', () => {
  assert.equal(isAlive({ lastCompletedDate: d(-1), currentStreak: 4 }, T), true)
})

check('a run fed two days ago is dead', () => {
  assert.equal(isAlive({ lastCompletedDate: d(-2), currentStreak: 4 }, T), false)
})

check('a lapsed run displays 0, not the stale number', () => {
  const v = derive({ lastCompletedDate: d(-9), currentStreak: 12, personalBest: 12 }, T)
  assert.equal(v.currentStreak, 0)
  assert.equal(v.lapsedStreak, 12)
})

check('an alive run displays its real length and mourns nothing', () => {
  const v = derive({ lastCompletedDate: d(-1), currentStreak: 6, personalBest: 6 }, T)
  assert.equal(v.currentStreak, 6)
  assert.equal(v.lapsedStreak, 0)
})

check('a fresh account has nothing to mourn', () => {
  const v = derive(EMPTY_STREAK, T)
  assert.equal(v.currentStreak, 0)
  assert.equal(v.lapsedStreak, 0)
  assert.equal(v.completedToday, false)
})

check('completedToday is only true on the day itself', () => {
  assert.equal(derive({ lastCompletedDate: T, currentStreak: 1 }, T).completedToday, true)
  assert.equal(derive({ lastCompletedDate: d(-1), currentStreak: 1 }, T).completedToday, false)
})

// ── Freezes ─────────────────────────────────────────────────────────────────

check('last studied yesterday: a freeze protects today', () => {
  assert.equal(freezeTarget({ lastCompletedDate: d(-1), currentStreak: 5 }, 1, T), T)
})

check('last studied two days ago: a freeze bridges yesterday', () => {
  assert.equal(freezeTarget({ lastCompletedDate: d(-2), currentStreak: 5 }, 1, T), d(-1))
})

check('a freeze cannot resurrect a run that lapsed long ago', () => {
  assert.equal(freezeTarget({ lastCompletedDate: d(-8), currentStreak: 20 }, 2, T), null)
})

check('no freeze is spendable with none in the bank', () => {
  assert.equal(freezeTarget({ lastCompletedDate: d(-1), currentStreak: 5 }, 0, T), null)
})

check('no freeze is spendable once today is already done', () => {
  assert.equal(freezeTarget({ lastCompletedDate: T, currentStreak: 5 }, 2, T), null)
})

check('a freeze keeps the run alive without lengthening it', () => {
  const before = { lastCompletedDate: d(-2), currentStreak: 7, personalBest: 7 }
  const after = applyFreezeTo(before, 1, T)
  assert.equal(after.currentStreak, 7)              // protected, not grown
  assert.equal(isAlive(after, T), true)
  assert.equal(derive(after, T).currentStreak, 7)
})

check('a freeze that does not apply changes nothing', () => {
  const before = { lastCompletedDate: d(-8), currentStreak: 20, personalBest: 20 }
  assert.equal(applyFreezeTo(before, 2, T), before)
})

check('studying after a bridging freeze continues the run', () => {
  let s = { lastCompletedDate: d(-2), currentStreak: 7, personalBest: 7 }
  s = applyFreezeTo(s, 1, T)                        // covers yesterday
  s = applyCompletion(s, T)
  assert.equal(s.currentStreak, 8)
})

// ── Freeze economy ──────────────────────────────────────────────────────────

check('one freeze per ISO week', () => {
  const a = grantWeeklyFreeze({ count: 0, weekEarned: null }, '2026-W11')
  assert.equal(a.count, 1)
  assert.equal(grantWeeklyFreeze(a, '2026-W11').count, 1)   // same week, no second grant
  assert.equal(grantWeeklyFreeze(a, '2026-W12').count, 2)
})

check('freezes are hard-capped, not accumulated all semester', () => {
  let f = { count: 0, weekEarned: null }
  for (let w = 1; w <= 20; w++) f = grantWeeklyFreeze(f, `2026-W${String(w).padStart(2, '0')}`)
  assert.equal(f.count, MAX_FREEZES)
})

// ── Year and month boundaries, where date maths usually breaks ──────────────

for (const [label, day] of [
  ['new year', '2027-01-01'],
  ['leap day', '2028-02-29'],
  ['march after leap', '2028-03-01'],
  ['month end', '2026-08-31'],
]) {
  check(`run continues across ${label}`, () => {
    const prev = addDays(day, -1)
    const s = applyCompletion({ lastCompletedDate: prev, currentStreak: 3, personalBest: 3 }, day)
    assert.equal(s.currentStreak, 4, `${label}: ${prev} -> ${day}`)
  })
  check(`decay is correct across ${label}`, () => {
    const stale = addDays(day, -2)
    assert.equal(derive({ lastCompletedDate: stale, currentStreak: 3 }, day).currentStreak, 0)
  })
}

// ── A full month walked day by day ─────────────────────────────────────────

check('30 consecutive days reaches 30 and never lapses', () => {
  let s = EMPTY_STREAK
  for (let i = 29; i >= 0; i--) {
    const day = d(-i)
    s = applyCompletion(s, day)
    assert.equal(derive(s, day).currentStreak, 30 - i)
  }
  assert.equal(s.currentStreak, 30)
})

check('one missed day mid-run kills it and the next session restarts at 1', () => {
  let s = EMPTY_STREAK
  for (let i = 10; i >= 6; i--) s = applyCompletion(s, d(-i))   // 5 day run ending d(-6)
  assert.equal(s.currentStreak, 5)
  assert.equal(derive(s, d(-4)).currentStreak, 0)               // d(-5) missed
  assert.equal(derive(s, d(-4)).lapsedStreak, 5)
  s = applyCompletion(s, d(-4))
  assert.equal(s.currentStreak, 1)
  assert.equal(s.personalBest, 5)
})

console.log(`PASS: ${checks} streak rules`)
