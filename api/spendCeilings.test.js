import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Every path that spends money must have a ceiling of some kind. There are
 * exactly two acceptable kinds:
 *
 *   reserveAiUsage()          the monthly allowance, for work worth charging for
 *   checkFeatureRateLimit()   its own per-feature ceiling, for work we choose
 *                             not to charge for but still must not leave open
 *
 * The bug this locks down is the second one going missing. Skipping
 * reserveAiUsage also skips checkAiRateLimit, so "this one is free" silently
 * became "this one has no limit at all" — which is how predict-grade ended up
 * the only AI call in the product with no ceiling, behind a comment asserting
 * it did no AI work.
 */

const API_DIR = join(process.cwd(), 'api')
const read = f => readFileSync(join(API_DIR, f), 'utf8')

// ── checkFeatureRateLimit behaviour ─────────────────────────────────────────

let counters
vi.mock('../lib/server/redis.js', () => ({
  getRedis: () => ({
    incr: async (k) => { counters[k] = (counters[k] ?? 0) + 1; return counters[k] },
    expire: async () => 1,
  }),
}))

const { checkFeatureRateLimit } = await import('../lib/server/rateLimit.js')

beforeEach(() => { counters = {} })

describe('checkFeatureRateLimit', () => {
  it('allows traffic under the per-minute ceiling', async () => {
    for (let i = 0; i < 6; i++) {
      const r = await checkFeatureRateLimit('u1', 'predict-grade', { perMinute: 6, perDay: 60 })
      expect(r.allowed).toBe(true)
    }
  })

  it('refuses once the per-minute ceiling is passed, with a Retry-After', async () => {
    for (let i = 0; i < 6; i++) await checkFeatureRateLimit('u1', 'predict-grade', { perMinute: 6, perDay: 60 })
    const r = await checkFeatureRateLimit('u1', 'predict-grade', { perMinute: 6, perDay: 60 })
    expect(r.allowed).toBe(false)
    expect(r.retryAfter).toBeGreaterThan(0)
  })

  it('refuses on the daily ceiling even when the minute window is clear', async () => {
    const r = await checkFeatureRateLimit('u1', 'voice', { perMinute: 1000, perDay: 3 })
    expect(r.allowed).toBe(true)
    await checkFeatureRateLimit('u1', 'voice', { perMinute: 1000, perDay: 3 })
    await checkFeatureRateLimit('u1', 'voice', { perMinute: 1000, perDay: 3 })
    const over = await checkFeatureRateLimit('u1', 'voice', { perMinute: 1000, perDay: 3 })
    expect(over.allowed).toBe(false)
    expect(over.error).toMatch(/today/i)
  })

  it('keys per user, so one account cannot exhaust another', async () => {
    for (let i = 0; i < 7; i++) await checkFeatureRateLimit('noisy', 'predict-grade', { perMinute: 6, perDay: 60 })
    const other = await checkFeatureRateLimit('quiet', 'predict-grade', { perMinute: 6, perDay: 60 })
    expect(other.allowed).toBe(true)
  })

  it('keys per feature, so a burst on one cannot exhaust another', async () => {
    for (let i = 0; i < 7; i++) await checkFeatureRateLimit('u1', 'predict-grade', { perMinute: 6, perDay: 60 })
    const voice = await checkFeatureRateLimit('u1', 'voice', { perMinute: 12, perDay: 200 })
    expect(voice.allowed).toBe(true)
  })
})

// ── the endpoints that must carry a ceiling ─────────────────────────────────

describe('transcribe endpoints', () => {
  it('transcribe-file caps the upload and reserves before spending', () => {
    const src = read('transcribe-file.js')
    expect(src).toMatch(/const MAX_UPLOAD_BYTES = 30 \* 1024 \* 1024/)
    expect(src).toContain('TRANSCRIBE_FILE_AI_COST = 3')
    expect(src).toMatch(/reserveAiUsage\(req, \{ verified: auth, cost: TRANSCRIBE_FILE_AI_COST \}\)/)
    // The 50 MB ceiling is gone, not merely shadowed.
    expect(src).not.toContain('50 * 1024 * 1024')
  })

  it('transcribe-file aborts mid-stream rather than buffering past the cap', () => {
    const src = read('transcribe-file.js')
    expect(src).toMatch(/received > MAX_UPLOAD_BYTES/)
    expect(src).toContain('req.destroy()')
  })

  it('transcribe-file commits only after a successful transcription', () => {
    // `await gate.commit()` rather than `gate.commit()`: the bare form also
    // appears in the comment above the reservation, and matching prose instead
    // of code is how the first draft of this test passed while asserting
    // nothing.
    const src = read('transcribe-file.js')
    const commitAt = src.indexOf('await gate.commit()')
    const emptyGuard = src.indexOf('No speech detected')
    expect(commitAt).toBeGreaterThan(-1)
    expect(commitAt).toBeGreaterThan(emptyGuard)
  })

  it('transcribe caps the clip and carries its own ceiling', () => {
    const src = read('transcribe.js')
    expect(src).toMatch(/const MAX_CLIP_BYTES = 2 \* 1024 \* 1024/)
    expect(src).toMatch(/received > MAX_CLIP_BYTES/)
    expect(src).toContain("checkFeatureRateLimit(auth.userId, 'voice'")
    // Voice input is deliberately free: it must NOT reserve.
    expect(src).not.toContain('reserveAiUsage')
  })
})

describe('predict-grade', () => {
  it('does not spend an action but does carry its own ceiling', () => {
    const src = read('generate-study-tools.js')
    expect(src).toContain("checkFeatureRateLimit(auth.userId, 'predict-grade'")
    // Still exempt from the monthly allowance — that is the pricing decision.
    expect(src).toMatch(/isPredict \? auth : await reserveAiUsage/)
  })

  it('no longer claims it does no AI work, because it does', () => {
    const src = read('generate-study-tools.js')
    expect(src).not.toMatch(/predict-grade does no AI work/)
  })
})

