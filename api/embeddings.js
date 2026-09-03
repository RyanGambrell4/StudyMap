// OpenAI embeddings for semantic similarity
// Env var: OPENAI_API_KEY

import { verifyAuth } from '../lib/server/usage.js'
import { checkFeatureRateLimit } from '../lib/server/rateLimit.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  // Spends money on OpenAI and had no limit of any kind: not a quota, not a rate
  // limit. The only bound was texts.slice(0, 100), which caps one request's
  // payload and says nothing about how many requests you may send.
  //
  // Deliberately NOT billed against the monthly AI allowance. This backs
  // flashcard dedup and runs several times per generation, so charging a study
  // boost per call would exhaust a free account in one sitting for work the
  // student never asked for and cannot see. It needs a ceiling, not a price,
  // which is exactly what checkFeatureRateLimit is for.
  //
  // Per-day is the ceiling that matters here: dedup runs in bursts of a few
  // calls when a deck is generated, so a tight per-minute limit would break
  // normal use while doing nothing about sustained abuse.
  //
  // Same caveat as the other endpoints on this path: rateLimit() fails open
  // when Redis is unreachable, and here it is the ONLY backstop, so an outage
  // removes the ceiling. Acceptable at embeddings prices.
  const limit = await checkFeatureRateLimit(auth.userId, 'embeddings', { perMinute: 20, perDay: 300 })
  if (!limit.allowed) {
    if (limit.retryAfter) res.setHeader('Retry-After', String(limit.retryAfter))
    return res.status(429).json({ error: limit.error, embeddings: [] })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Embeddings not configured', embeddings: [] })

  const { texts } = req.body ?? {}
  if (!texts?.length) return res.status(400).json({ error: 'texts array required' })

  // Limit to 100 texts max
  const limited = texts.slice(0, 100)

  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: limited,
      }),
    })

    if (!r.ok) {
      const err = await r.text()
      console.error('[Embeddings]', err)
      return res.status(200).json({ embeddings: [] })
    }

    const data = await r.json()
    const embeddings = data.data.map(d => d.embedding)
    return res.status(200).json({ embeddings })
  } catch (err) {
    console.error('[Embeddings] error:', err.message)
    return res.status(200).json({ embeddings: [] })
  }
}
