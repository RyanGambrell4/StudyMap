import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * Guards a bug class, not four instances of it.
 *
 * verifyAuth() and reserveAiUsage() both return a RESULT OBJECT. Their failure
 * values are:
 *
 *   { ok: false, status: 401, error: 'Unauthorized' }
 *   { ok: false, status: 402, error: '...', usage: {...} }
 *
 * Both are truthy. So this, which four endpoints shipped, never rejects
 * anything and leaves an object where a user id is expected:
 *
 *   const userId = await verifyAuth(req)
 *   if (!userId) return res.status(401).json({ error: 'Unauthorized' })
 *
 * api/streak-broken-trigger.js combined that with a recipient read from the
 * request body, which made it an open email relay: any unauthenticated caller
 * could send mail from our domain to any address. The other three
 * (referral-stats, log-struggle, push-subscribe) were reachable without
 * authentication and wrote or read with "[object Object]" as the user id.
 *
 * The failure mode is silent in every direction. It does not throw, it does not
 * fail a build, and the endpoint returns 200. Only a check like this catches it.
 */

const DIRS = [
  { url: new URL('../../api/', import.meta.url), label: 'api' },
  { url: new URL('./', import.meta.url), label: 'lib/server' },
]

// canSendUserEmail belongs here for the same reason: it returns
// { ok, reason } and its failure value is truthy, so `if (!ok)` silently
// discards a suppression decision and the send proceeds to an address that has
// already bounced or complained.
const GUARDED = ['verifyAuth', 'reserveAiUsage', 'canSendUserEmail']

// Strip line and block comments so prose that quotes the broken pattern (this
// file, and the fix commits that explain what they fixed) is not an offender.
function codeOf(url, file) {
  return readFileSync(new URL(file, url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n')
}

const sources = DIRS.flatMap(({ url, label }) =>
  readdirSync(url)
    .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map(f => ({ name: `${label}/${f}`, code: codeOf(url, f) }))
)

describe('auth result objects are never used as booleans', () => {
  it('has files to check', () => {
    expect(sources.length).toBeGreaterThan(40)
  })

  for (const fn of GUARDED) {
    it(`every ${fn}() result is checked with .ok`, () => {
      const offenders = []
      for (const { name, code } of sources) {
        const re = new RegExp(`const\\s+(\\w+)\\s*=\\s*await\\s+${fn}\\(`, 'g')
        for (const m of code.matchAll(re)) {
          const bound = m[1]
          if (!new RegExp(`\\b${bound}\\.ok\\b`).test(code)) {
            offenders.push(`${name}: '${bound}' from ${fn}() is never checked via .ok`)
          }
        }
      }
      expect(offenders).toEqual([])
    })

    it(`no truthiness test against a ${fn}() result`, () => {
      const offenders = []
      for (const { name, code } of sources) {
        const re = new RegExp(`const\\s+(\\w+)\\s*=\\s*await\\s+${fn}\\(`, 'g')
        for (const m of code.matchAll(re)) {
          const b = m[1]
          // `if (!x)`, `if (x)`, `x ? :`, `!x &&`, `|| !x` - all of which read
          // the object rather than its .ok field.
          const truthy = new RegExp(
            `if\\s*\\(\\s*!?${b}\\s*\\)|[^.\\w]!${b}\\s*(&&|\\|\\||\\))|[^.\\w]${b}\\s*\\?`
          )
          if (truthy.test(code)) {
            offenders.push(`${name}: '${b}' from ${fn}() is used as a boolean`)
          }
        }
      }
      expect(offenders).toEqual([])
    })

    it(`no inline truthiness test on await ${fn}()`, () => {
      const offenders = sources
        .filter(({ code }) =>
          new RegExp(`if\\s*\\(\\s*!?\\s*await\\s+${fn}\\(`).test(code)
        )
        .map(({ name }) => name)
      expect(offenders).toEqual([])
    })
  }
})
