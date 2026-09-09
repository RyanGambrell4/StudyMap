import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every endpoint that can spend money at Anthropic must be both gated and
 * visible. This is the test that stops the other six tasks from rotting: it
 * fails the build the day someone adds endpoint number thirty without a usage
 * gate, or with a gate but no cost telemetry.
 *
 * Two independent obligations, asserted separately so a failure says which one
 * is missing:
 *
 *   a gate       reserveAiUsage (or the older all-in-one verifyAndCheckAiUsage)
 *                so the call is metered against somebody's allowance
 *   telemetry    logAiCall, so the spend is attributable to an endpoint and a
 *                user afterwards
 *
 * The gate half is deliberately looser than aiUsageOnFailure.test.js, which
 * checks that the gate is committed only on success. This one only checks that
 * a gate exists at all; that file checks it is used correctly.
 */

const API_DIR = 'api'

const files = readdirSync(API_DIR)
  .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
  .sort()

/** Files that reach Anthropic, by the two ways this codebase does it. */
const spendsMoney = files.filter(f => {
  const src = readFileSync(join(API_DIR, f), 'utf8')
  return src.includes('api.anthropic.com') || src.includes('new Anthropic')
})

describe('every Anthropic endpoint is gated and instrumented', () => {
  it('finds the endpoints, so the assertions below cannot pass vacuously', () => {
    // 29 at the time of writing. A bare `toBeGreaterThan(0)` would keep passing
    // if the detection broke and matched nothing.
    expect(spendsMoney.length).toBeGreaterThanOrEqual(29)
  })

  it.each(spendsMoney)('%s reserves usage', (file) => {
    const src = readFileSync(join(API_DIR, file), 'utf8')
    const gated = src.includes('reserveAiUsage') || src.includes('verifyAndCheckAiUsage')
    expect(gated, `${file} calls Anthropic without a usage gate`).toBe(true)
  })

  it.each(spendsMoney)('%s logs its cost', (file) => {
    const src = readFileSync(join(API_DIR, file), 'utf8')
    expect(
      src.includes('logAiCall'),
      `${file} calls Anthropic without logAiCall, so its spend is invisible`,
    ).toBe(true)
  })

  it('imports logAiCall from aiCost.js, not the latency-only one in axiom.js', () => {
    // axiom.js exports a logAiCall of its own that carries no cost. A file that
    // imported only that one would satisfy the grep above while still leaving
    // its spend unattributed, so the import has to be checked, not just the
    // call. Files may import both; two do, under an alias.
    const offenders = spendsMoney.filter(f => {
      const src = readFileSync(join(API_DIR, f), 'utf8')
      return !src.includes("from '../lib/server/aiCost.js'")
    })
    expect(offenders, `these import a logAiCall that has no cost data: ${offenders.join(', ')}`).toEqual([])
  })
})
