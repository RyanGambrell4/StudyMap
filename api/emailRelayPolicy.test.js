import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Two source-level rules, both written after finding the same mistake twice.
 *
 * 1. A `to:` on an outbound email must never be a value that came out of
 *    req.body. api/streak-broken-trigger.js did exactly that and was an open
 *    relay against our sending domain. Fixing it did not fix the class:
 *    welcome-email, onboarding-complete and first-plan all still read `email`
 *    from the body. Each had a userId ownership check beside it, and each
 *    check was written `if (userId && userId !== auth.userId)` - skippable by
 *    omitting the field it guards on.
 *
 * 2. Anything returning an { ok } result has to be tested through `.ok`.
 *    verifyAuth was the first instance and cost four unauthenticated
 *    endpoints. canSendUserEmail was the second, in three of the same files,
 *    and meant no send has ever consulted the suppression list. Both failure
 *    values are objects, so `if (!x)` is dead code the compiler cannot see and
 *    the tests could not either, because in both cases the happy path is
 *    indistinguishable.
 *
 * These are greps, not behaviour tests, and that is on purpose: the failure
 * mode is a line that looks right, so the check has to run over the text.
 */

const API_DIR = join(process.cwd(), 'api')

/**
 * Comments have to come out before any of this runs.
 *
 * The fix for each of these bugs left a comment quoting the broken line, so a
 * scan over raw source flags the very files that were repaired and stays red
 * forever. Stripping block comments and whole-line `//` comments is enough
 * here and leaves `https://` inside string literals alone, which a naive
 * strip-to-end-of-line would not.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
}

const files = readdirSync(API_DIR)
  .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
  .map(f => ({ name: f, src: stripComments(readFileSync(join(API_DIR, f), 'utf8')) }))

describe('outbound email recipients', () => {
  it('never resolves the recipient from the request body', () => {
    const offenders = []

    for (const { name, src } of files) {
      if (!/emails\.send/.test(src)) continue

      // Names destructured out of req.body / a parsed body in this file.
      const bodyNames = new Set()
      for (const m of src.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*(?:req\.body|body)\b/g)) {
        for (const raw of m[1].split(',')) {
          const id = raw.split(':').pop().trim().split('=')[0].trim()
          if (id) bodyNames.add(id)
        }
      }
      if (!bodyNames.size) continue

      // Identifiers handed to `to:`.
      for (const m of src.matchAll(/^\s*to:\s*([A-Za-z_$][\w$]*)\s*,/gm)) {
        if (bodyNames.has(m[1])) offenders.push(`${name}: to: ${m[1]} (destructured from the request body)`)
      }
    }

    expect(
      offenders,
      'An email recipient must be resolved from the authenticated session ' +
      '(supabaseAdmin.auth.admin.getUserById) or from a server-side query, never from the request:\n' +
      offenders.join('\n'),
    ).toEqual([])
  })
})

describe('{ ok } results are checked through .ok', () => {
  // Every helper whose failure value is a truthy object.
  const GUARDS = ['verifyAuth', 'canSendUserEmail', 'reserveAiUsage', 'verifyAndCheckAiUsage']

  it('has no guard result tested for truthiness instead of .ok', () => {
    const offenders = []

    for (const { name, src } of files) {
      for (const guard of GUARDS) {
        // `const <id> = await <guard>(` — capture what the result is bound to.
        for (const m of src.matchAll(new RegExp(`(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+${guard}\\s*\\(`, 'g'))) {
          const bound = m[1]
          const rest = src.slice(m.index)
          // A bare `if (!bound)` or `if (bound)` on that binding is the bug.
          const bare = new RegExp(`if\\s*\\(\\s*!?${bound}\\s*[)&|]`)
          if (bare.test(rest.slice(0, 400))) {
            offenders.push(`${name}: \`${bound}\` from ${guard}() is tested for truthiness, not \`${bound}.ok\``)
          }
        }
      }
    }

    expect(
      offenders,
      'These helpers return { ok, ... } and their failure value is a truthy object, ' +
      'so a bare truthiness test never rejects anything:\n' + offenders.join('\n'),
    ).toEqual([])
  })
})

describe('canSendUserEmail call signature', () => {
  it('is never called with the retired positional arguments', () => {
    // canSendUserEmail(userId, { priority, email }). It used to be
    // (userId, campaign, cooldownMinutes); three files still passed a string
    // and a number, which the options destructure silently discarded, so the
    // cooldown every comment described was never applied.
    const offenders = []

    for (const { name, src } of files) {
      for (const m of src.matchAll(/canSendUserEmail\s*\(\s*[^,)]+,\s*(['"`]|\d)/g)) {
        offenders.push(`${name}: canSendUserEmail(..., ${m[1]}...) uses the retired positional signature`)
      }
    }

    expect(
      offenders,
      'canSendUserEmail takes (userId, { priority, email }):\n' + offenders.join('\n'),
    ).toEqual([])
  })
})
