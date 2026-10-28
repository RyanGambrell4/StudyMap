import { describe, it, expect, vi } from 'vitest'

describe('installAnthropicTiming', () => {
  it('stamps Anthropic usage with latency and leaves other hosts alone', async () => {
    const body = () => ({ content: [], usage: { input_tokens: 5, output_tokens: 7 } })
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body())))
    const { installAnthropicTiming } = await import('./aiTiming.js')
    installAnthropicTiming()

    const viaJson = await (await fetch('https://api.anthropic.com/v1/messages', { method: 'POST' })).json()
    expect(typeof viaJson.usage._latency_ms).toBe('number')

    const viaText = JSON.parse(await (await fetch('https://api.anthropic.com/v1/messages')).text())
    expect(typeof viaText.usage._latency_ms).toBe('number')

    const other = await (await fetch('https://example.com/x')).json()
    expect(other.usage._latency_ms).toBeUndefined()
  })
})
