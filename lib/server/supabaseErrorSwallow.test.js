/**
 * Ratchet on the `const { data } = await supabase...` pattern.
 *
 * supabase-js does not throw. Every query returns `{ data, error }`, so a
 * destructure that takes only `data` turns three very different outcomes into
 * one indistinguishable `null`:
 *
 *   - the query ran and matched no rows
 *   - the table does not exist (nobody applied the migration)
 *   - the read was denied or timed out
 *
 * That is how email_suppression stayed missing in production for a month while
 * every suppression check cheerfully reported "nobody is suppressed".
 *
 * There are 50 of these in the codebase, not the eight in the suppression
 * path. Rewriting all of them at once is a worse trade than it looks: on many
 * of them (auth.admin.getUserById in a cron loop, for instance) `null` really
 * does mean "skip this user", and a blind mechanical edit across 30 files would
 * be a large untested diff through the entire billing and lifecycle surface.
 *
 * So this test does the thing that actually holds: it pins the current set and
 * fails when a new one appears. Fix them opportunistically when you are already
 * in the file, and delete the entry here when you do. The count only goes down.
 *
 * The ones that gate a real decision are already handled and are asserted
 * clean below: the two suppression reads in lib/server/emailGuard.js, the
 * webhook idempotency check in api/stripe.js, and the cancel-before-delete read
 * in api/delete-account.js. (emailGuard still has one entry, its
 * `last_emailed_at` throttle read, which fails open on purpose.)
 *
 * scripts/check-schema.mjs catches the other half of the problem: it asks a
 * live project whether every table and column the code reads actually exists.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOTS = ['api', 'lib', 'src', 'scripts']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.claude'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(js|mjs|jsx)$/.test(entry) && !/\.test\.(js|jsx)$/.test(entry)) out.push(full)
  }
  return out
}

function findSwallows() {
  const hits = []
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      // Comments stripped: several files now document the bad pattern in order
      // to explain why it is bad, and a grep over raw source fires on the
      // explanation, which pushes the next person to delete the reasoning to
      // get green.
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
      for (const m of src.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*await\b/g)) {
        const pattern = m.group?.(1) ?? m[1]
        if (!/\bdata\b/.test(pattern)) continue
        if (/\berror\b/.test(pattern)) continue
        const after = src.slice(m.index + m[0].length, m.index + m[0].length + 300)
        if (!/\.from\(|\.rpc\(|auth\.admin\.|storage\.from\(/.test(after)) continue
        hits.push(file)
      }
    }
  }
  return hits
}

// Current known total. Lower it whenever you fix one. Never raise it.
const BASELINE = 50

// Files that still contain at least one. Remove a file when it reaches zero.
const KNOWN_FILES = [
  'api/buddy.js', 'api/day1-trial-tips.js', 'api/day2-trial-progress.js',
  'api/day3-trial-tips.js', 'api/early-activation.js',
  'api/exam-approaching.js', 'api/exam-countdown.js', 'api/exam-tomorrow.js',
  'api/feedback.js', 'api/first-plan.js', 'api/first-session-email.js',
  'api/founder-outreach.js', 'api/no-course-24h.js',
  'api/onboarding-complete.js', 'api/paywall-hit-email.js', 'api/rate-app.js',
  'api/re-engage.js', 'api/referral-stats.js', 'api/resend-webhook.js',
  'api/streak-broken.js', 'api/stripe.js', 'api/struggle-digest.js',
  'api/trial-expired.js', 'api/trial-report-card.js', 'api/trial-warning.js',
  'api/weekly-digest.js', 'api/weekly-recap.js', 'api/welcome-email.js',
  'lib/server/courseContext.js', 'lib/server/emailGuard.js',
  'lib/server/featureFlags.js', 'lib/server/oneTimeOffer.js',
  'lib/server/supabaseErrors.js', 'lib/server/usage.js'
]

describe('supabase error-swallow ratchet', () => {
  it('does not grow past the known baseline', () => {
    const hits = findSwallows()
    expect(
      hits.length,
      `Found ${hits.length} supabase calls that destructure data without error ` +
      `(baseline ${BASELINE}). If you added one, handle the error instead: ` +
      `use reportQueryError from lib/server/supabaseErrors.js. ` +
      `If you fixed one, lower BASELINE in this file.`
    ).toBeLessThanOrEqual(BASELINE)
  })

  it('does not appear in a file that had none', () => {
    const files = [...new Set(findSwallows().map(f => f.replace(/\\/g, '/')))]
    const unexpected = files.filter(f => !KNOWN_FILES.includes(f))
    expect(unexpected, `New file(s) started swallowing supabase errors: ${unexpected.join(', ')}`).toEqual([])
  })

  it('keeps the specific reads that gate a real decision bound to their error', () => {
    // These decide whether to mail a bounced address, whether a Stripe webhook
    // delivery is a duplicate, and whether an account is safe to delete. A
    // silent null in any of them is a production incident, so assert on the
    // exact read rather than on the file: emailGuard and stripe.js each still
    // contain other, deliberately fail-open reads.
    const guarded = [
      ['lib/server/emailGuard.js', /from\('email_suppression'\)/g, 2],
      // Only the duplicate-detection SELECT. The four INSERTs that stamp an
      // event as processed are writes, not decisions, and are not in scope here.
      ['api/stripe.js', /from\('stripe_idempotency'\)\s*\n\s*\.select\(/g, 1],
      ['api/delete-account.js', /from\('user_data'\)\s*\n\s*\.select\('subscription'\)/g, 1],
    ]
    for (const [file, pattern, expected] of guarded) {
      const src = readFileSync(file, 'utf8')
      const matches = [...src.matchAll(pattern)]
      expect(matches.length, `${file}: expected ${expected} guarded read(s)`).toBe(expected)
      for (const m of matches) {
        // Walk back to the destructure that owns this call and require `error`.
        const head = src.slice(Math.max(0, m.index - 260), m.index)
        const destructure = head.lastIndexOf('{')
        const pattern_ = head.slice(destructure)
        expect(pattern_, `${file}: the read at offset ${m.index} must bind error`).toMatch(/\berror\b/)
      }
    }
  })
})
