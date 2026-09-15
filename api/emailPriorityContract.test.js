/**
 * Pins two shipped bugs that between them meant the single most important
 * email in the product had never been sent to anybody.
 *
 * 1. `priority: 'high'` was passed by NINE endpoints and was not a key in
 *    PRIORITY_GAP_HOURS, so it hit a `?? 48` fallback and silently behaved as
 *    'normal'. On a day-over-day trial drip that means each email suppresses
 *    the next one.
 *
 * 2. api/trial-warning.js -- the "your trial ends in 24 hours, your card is
 *    about to be charged" notice -- skipped every row whose
 *    `subscription.plan` was not 'free'. The Stripe webhook stores a live
 *    trial as plan 'pro' / status 'trialing', and the send window
 *    (trialUsedAt 144-168h ago) only ever contains live trials. The two
 *    conditions were mutually exclusive, so the email could never fire.
 *
 * Both are source-level contracts because the targeting logic lives inline in
 * the handler. Same approach as api/emailRelayPolicy.test.js.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const guardSrc = readFileSync('lib/server/emailGuard.js', 'utf8')

/** Priority names emailGuard actually understands, read from the map itself. */
function knownPriorities() {
  const block = guardSrc.match(/const PRIORITY_GAP_HOURS = \{([\s\S]*?)\}/)
  expect(block, 'PRIORITY_GAP_HOURS should still exist').toBeTruthy()
  return block[1]
    .split('\n')
    .map(l => l.match(/^\s*([a-z]+)\s*:/))
    .filter(Boolean)
    .map(m => m[1])
}

function sourceFiles() {
  const out = []
  for (const dir of ['api', 'lib/server']) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.js') && !f.endsWith('.test.js')) out.push(join(dir, f))
    }
  }
  return out
}

describe('email priority contract', () => {
  it('defines critical, high, normal and low', () => {
    const known = knownPriorities()
    expect(known).toEqual(expect.arrayContaining(['critical', 'high', 'normal', 'low']))
  })

  it('never falls back silently on an unknown priority', () => {
    // The `?? 48` that made bug 1 invisible must not come back.
    expect(guardSrc).not.toMatch(/PRIORITY_GAP_HOURS\[priority\]\s*\?\?/)
    expect(guardSrc).toMatch(/assertKnownPriority/)
  })

  it('every priority passed anywhere is one emailGuard understands', () => {
    const known = new Set(knownPriorities())
    const offenders = []

    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/priority:\s*'([a-z]+)'/g)) {
        // Skip prose inside comments -- only flag real call sites.
        const line = src.slice(0, m.index).split('\n').pop()
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) continue
        if (!known.has(m[1])) offenders.push(`${file}: priority '${m[1]}'`)
      }
    }

    expect(offenders, `unknown priorities:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('trial-warning actually targets live trials', () => {
  const src = readFileSync('api/trial-warning.js', 'utf8')

  it('selects trialing users, not free-plan users', () => {
    expect(src).toMatch(/sub\.status !== 'trialing'/)
  })

  it('does not reinstate the inverted plan filter', () => {
    // This single line is what stopped the charge notice ever sending.
    expect(src).not.toMatch(/const plan = sub\.plan/)
    expect(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')).not.toMatch(/plan !== 'free'/)
  })

  it('sends at critical priority so the frequency gap cannot suppress it', () => {
    // day5-social-proof fires ~24h earlier off the signup date. At any
    // throttled priority it wins the race and the user is charged unwarned.
    expect(src).toMatch(/priority:\s*'critical'/)
  })
})

describe('the other trial-drip endpoints still target trialing users', () => {
  it.each(['day1-trial-tips', 'day2-trial-progress', 'day3-trial-tips'])('%s', (name) => {
    const src = readFileSync(`api/${name}.js`, 'utf8')
    expect(src).toMatch(/status !== 'trialing'/)
  })
})
