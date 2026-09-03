// Deepgram transcription endpoint
// Env var: DEEPGRAM_API_KEY

import { verifyAuth } from '../lib/server/usage.js'
import { checkFeatureRateLimit } from '../lib/server/rateLimit.js'

export const config = { api: { bodyParser: false } }

/**
 * This is the microphone button in the AI chat (src/lib/deepgram.js ->
 * AIChatView), not a file upload: the user holds it, asks a question out loud,
 * and the transcript becomes the message they send. That message is already
 * charged as an AI action, so charging the voice input too would bill twice for
 * one thought and push people back to typing.
 *
 * So it stays free, and gets a size cap and its own ceiling instead.
 *
 * 2 MB. The recorder produces webm/opus, which runs about 24 kbps for speech,
 * so 2 MB is roughly ten minutes of continuous talking — far past any spoken
 * question, and it caps a single call at a couple of cents. There was no limit
 * at all before this, in a handler that streams whatever it is given straight
 * to a paid API.
 */
const MAX_CLIP_BYTES = 2 * 1024 * 1024

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Verify auth before consuming the body stream
  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Transcription not configured' })

  // Free, but not unlimited. Twelve clips a minute is faster than anyone can
  // actually speak a question, and 200 a day is well past a heavy study session
  // while still making a script pointless.
  //
  // NOTE, and re-read this before raising MAX_CLIP_BYTES: this rate limit and
  // the size cap are the ONLY ceilings here — there is no reservation. And
  // rateLimit() FAILS OPEN when Redis is unreachable, so an outage leaves the
  // size cap alone against a paid API. Fine at 2 MB of Deepgram, a couple of
  // cents a call. Not fine if this ever accepts a lecture-sized upload; that
  // is what transcribe-file is for, and it reserves.
  const limit = await checkFeatureRateLimit(auth.userId, 'voice', { perMinute: 12, perDay: 200 })
  if (!limit.allowed) {
    if (limit.retryAfter) res.setHeader('Retry-After', String(limit.retryAfter))
    return res.status(429).json({ error: limit.error })
  }

  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > MAX_CLIP_BYTES) {
    return res.status(413).json({ error: 'Audio clip too long (max 2 MB)' })
  }

  try {
    // Collect raw body chunks, stopping the moment the cap is passed rather
    // than buffering an unbounded body and forwarding it to a paid API.
    const chunks = []
    let received = 0
    for await (const chunk of req) {
      received += chunk.length
      if (received > MAX_CLIP_BYTES) {
        req.destroy()
        return res.status(413).json({ error: 'Audio clip too long (max 2 MB)' })
      }
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)

    // Send raw audio body directly to Deepgram Nova-2
    const dgRes = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'audio/webm',
        },
        body,
      }
    )

    if (!dgRes.ok) {
      const err = await dgRes.text()
      console.error('[Deepgram]', err)
      return res.status(200).json({ transcript: '' })
    }

    const data = await dgRes.json()
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
    return res.status(200).json({ transcript })
  } catch (err) {
    console.error('[Deepgram] error:', err.message)
    return res.status(200).json({ transcript: '' })
  }
}
