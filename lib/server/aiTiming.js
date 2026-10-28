// Times every Anthropic request without touching the call sites.
//
// About 25 endpoints call fetch('https://api.anthropic.com/...') and then
// pass `data.usage` to logAiCall. This wraps fetch once so an Anthropic
// response's parsed body carries `usage._latency_ms` (request start to full
// body), which logAiCall reports as $ai_latency. The value travels on the
// response itself, so concurrent requests cannot mix their timings.
// Streaming responses are left as they are.

const ANTHROPIC = 'https://api.anthropic.com/'
let installed = false

function stamp(body, t0) {
  if (body && typeof body === 'object' && body.usage && typeof body.usage === 'object') {
    body.usage._latency_ms = Date.now() - t0
  }
  return body
}

export function installAnthropicTiming() {
  if (installed || typeof globalThis.fetch !== 'function') return
  installed = true
  const original = globalThis.fetch
  globalThis.fetch = async function timedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input))
    if (!url.startsWith(ANTHROPIC)) return original(input, init)
    const t0 = Date.now()
    const res = await original(input, init)
    const json = res.json.bind(res)
    const text = res.text.bind(res)
    res.json = async () => stamp(await json(), t0)
    res.text = async () => {
      const raw = await text()
      try {
        const body = JSON.parse(raw)
        if (body?.usage) return JSON.stringify(stamp(body, t0))
      } catch { /* not JSON (e.g. an HTML error page): leave it */ }
      return raw
    }
    return res
  }
}
