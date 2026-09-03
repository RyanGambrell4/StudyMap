import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * Policy lock: email confirmation gates money, not use.
 *
 * It used to gate the whole product. verifyAuth() defaulted to
 * requireEmailConfirmed:true and reserveAiUsage() rejected any unconfirmed
 * account outright, so a new email signup was parked on a confirmation screen
 * before it had seen anything, and could not have used the product if it had
 * got past one. 90 people reached that screen in a 90 day window; 3 confirmed.
 *
 * These are source-level assertions on purpose. What changed is a default
 * parameter and a cross-file wiring decision, and both are invisible to a
 * behavioural test that stubs the auth layer - stubbing verifyBearer is exactly
 * what would hide a regression here. The point is that a future change to this
 * policy has to be deliberate rather than incidental.
 */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const apiDir = new URL('../../api/', import.meta.url)
const apiFiles = readdirSync(apiDir)
  .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))

// Scan code, not prose. The fixes for these endpoints quote the broken pattern
// in a comment explaining what it was, which a naive scan reads as an offender.
const codeOf = (f) =>
  readFileSync(new URL(f, apiDir), 'utf8')
    .split('\n')
    .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

// Endpoints that keep requiring a confirmed email, and why. Anything that sends
// email, spends money, writes to shared storage, or can read another user's
// data does not get to ride on the relaxed default.
//
// generate-podcast is deliberately NOT in this list. It was, on the reasoning
// that it spent money unmetered. It is now metered on main at cost 3 through
// reserveAiUsage, which is a real control, where a confirmation flag that
// auto-confirm satisfies is not.
const STILL_GATED = {
  'paywall-hit-email.js':      'sends email from our domain',
  'streak-broken-trigger.js':  'sends email from our domain',
}

describe('email confirmation policy', () => {
  it('verifyAuth admits an unconfirmed user by default', () => {
    expect(read('./usage.js')).toMatch(
      /verifyAuth\(req, \{ requireEmailConfirmed = false \} = \{\}\)/
    )
  })

  it('reserveAiUsage no longer rejects on an unconfirmed email', () => {
    // The 403 that used to live in reserveAiUsage is gone. Its message is the
    // stable marker; if it comes back, this fails.
    expect(read('./usage.js')).not.toMatch(/before using AI features/)
  })

  it('checkout still requires a confirmed email', () => {
    const src = read('../../api/stripe.js')
    expect(src).toMatch(/checkoutUser\.email_confirmed_at/)
    expect(src).toMatch(/email_unconfirmed/)
  })

  it('the checkout caller sends a bearer token, or the gate is dead code', () => {
    // api/stripe.js guards with `if (checkoutToken && body.userId)`, so a caller
    // that omits the header skips both the ownership check and the confirmation
    // gate. No caller sent it before this change.
    expect(read('../../src/lib/subscription.js')).toMatch(
      /Authorization: `Bearer \$\{accessToken\}`/
    )
  })

  for (const [file, why] of Object.entries(STILL_GATED)) {
    it(`${file} stays gated: ${why}`, () => {
      expect(read(`../../api/${file}`)).toMatch(
        /verifyAuth\(req, \{ requireEmailConfirmed: true \}\)/
      )
    })
  }
})

describe('verifyAuth is not misused', () => {
  /**
   * verifyAuth returns an object, and its failure value
   * ({ ok:false, status:401, error:'Unauthorized' }) is truthy. Four endpoints
   * wrote `const userId = await verifyAuth(req)` followed by `if (!userId)`,
   * a test that can never be true. Those endpoints ran unauthenticated, with an
   * object standing in for the user id. streak-broken-trigger combined that
   * with `to: req.body.email` and was an open email relay.
   */
  it('no endpoint treats the return value as a truthy user id', () => {
    const offenders = apiFiles.filter(f =>
      /const\s+(\w+)\s*=\s*await verifyAuth\([^)]*\)\s*\n\s*if \(!\1\)/.test(codeOf(f))
    )
    expect(offenders).toEqual([])
  })

  it('every verifyAuth result is checked via .ok', () => {
    const offenders = apiFiles.filter(f => {
      const src = codeOf(f)
      if (!src.includes('await verifyAuth(')) return false
      const name = src.match(/const\s+(\w+)\s*=\s*await verifyAuth\(/)?.[1]
      return name ? !new RegExp(`${name}\\.ok`).test(src) : false
    })
    expect(offenders).toEqual([])
  })

  it('streak-broken-trigger resolves the recipient from auth, not the body', () => {
    const src = read('../../api/streak-broken-trigger.js')
    expect(src).toMatch(/getUserById\(userId\)/)
    // The body must no longer be able to name the recipient.
    expect(src).not.toMatch(/const \{ streak, email \} = req\.body/)
  })
})
