import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * estimateCostUsd is money math that runs on the error path, so the two things
 * worth locking down are that the arithmetic is right and that no shape of a
 * missing or malformed `usage` object can make it throw. A cost estimator that
 * throws would turn a recoverable Anthropic error into a 500.
 */

const logged = []
vi.mock('./posthog.js', () => ({
  posthogCapture: async (event, distinctId, data) => { logged.push({ event, distinctId, data }) },
}))

const { estimateCostUsd, logAiCall } = await import('./aiCost.js')

beforeEach(() => { logged.length = 0 })

describe('estimateCostUsd', () => {
  it('prices Sonnet input and output at the published rates', () => {
    // 1M input at $3 + 1M output at $15
    expect(estimateCostUsd('claude-sonnet-4-6', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    })).toBe(18)
  })

  it('prices Haiku at its own, cheaper rates', () => {
    expect(estimateCostUsd('claude-haiku-4-5-20251001', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    })).toBe(6)
  })

  it('prices a realistic maxed-out coach plan in the tens of cents', () => {
    // The endpoint that actually costs money: ~10k in, 16k out on Sonnet.
    const usd = estimateCostUsd('claude-sonnet-4-6', {
      input_tokens: 10_000,
      output_tokens: 16_000,
    })
    expect(usd).toBeCloseTo(0.27, 2)
  })

  it('charges cache writes above and cache reads below the input rate', () => {
    const write = estimateCostUsd('claude-sonnet-4-6', { cache_creation_input_tokens: 1_000_000 })
    const read = estimateCostUsd('claude-sonnet-4-6', { cache_read_input_tokens: 1_000_000 })
    expect(write).toBe(3.75) // 1.25x input
    expect(read).toBe(0.3) //  0.1x input
  })

  it('returns 0 for an unknown model rather than throwing', () => {
    expect(estimateCostUsd('claude-something-unreleased', { input_tokens: 1000 })).toBe(0)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['an empty object', {}],
    ['negative counts', { input_tokens: -5, output_tokens: -5 }],
    ['non-numeric counts', { input_tokens: 'x', output_tokens: null }],
    ['NaN counts', { input_tokens: NaN, output_tokens: Infinity }],
  ])('survives a %s usage object', (_label, usage) => {
    expect(() => estimateCostUsd('claude-sonnet-4-6', usage)).not.toThrow()
    expect(estimateCostUsd('claude-sonnet-4-6', usage)).toBe(0)
  })
})

describe('logAiCall', () => {
  it('emits a PostHog $ai_generation with cost, tokens, tool and latency', async () => {
    const cost = await logAiCall({
      endpoint: 'generate-study-coach-plan',
      model: 'claude-sonnet-4-6',
      userId: 'u1',
      plan: 'free',
      usage: { input_tokens: 10_000, output_tokens: 16_000, _latency_ms: 2500 },
      ok: true,
    })

    expect(logged).toHaveLength(1)
    expect(logged[0].event).toBe('$ai_generation')
    expect(logged[0].distinctId).toBe('u1')
    expect(logged[0].data).toMatchObject({
      $ai_provider: 'anthropic',
      $ai_model: 'claude-sonnet-4-6',
      $ai_span_name: 'generate-study-coach-plan',
      tool: 'generate-study-coach-plan',
      plan: 'free',
      $ai_input_tokens: 10_000,
      $ai_output_tokens: 16_000,
      $ai_latency: 2.5,
      $ai_is_error: false,
    })
    expect(logged[0].data.$ai_total_cost_usd).toBeCloseTo(0.27, 2)
    expect(cost).toBeCloseTo(0.27, 2)
  })

  it('still logs a failed call, at zero cost, so the failure is visible', async () => {
    await logAiCall({
      endpoint: 'reteach',
      model: 'claude-haiku-4-5-20251001',
      userId: 'u1',
      plan: 'free',
      usage: null,
      ok: false,
      reason: 'http_529',
    })

    expect(logged[0].data).toMatchObject({ $ai_is_error: true, $ai_error: 'http_529', $ai_total_cost_usd: 0 })
  })

  it('does not throw when the logger itself fails', async () => {
    const posthog = await import('./posthog.js')
    const spy = vi.spyOn(posthog, 'posthogCapture')
    spy.mockImplementation(() => { throw new Error('posthog down') })
    // The real guard is the try/catch inside logAiCall; this asserts the
    // contract rather than the mock, so a caller can never be broken by it.
    await expect(logAiCall({ endpoint: 'x', model: 'claude-sonnet-4-6', usage: {} })).resolves.toBeDefined()
  })
})
