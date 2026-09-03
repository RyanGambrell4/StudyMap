// Transcribes an uploaded audio file (mp3, m4a, wav, webm, ogg) via Deepgram
// Used by the "Upload Lecture Audio" feature in StudyToolsView

import { verifyAuth, reserveAiUsage } from '../lib/server/usage.js'

export const config = { api: { bodyParser: false }, maxDuration: 60 }

/**
 * Hard ceiling on an uploaded lecture, and what it costs.
 *
 * This was the most expensive unmetered path in the product: 50 MB accepted,
 * no reservation, no rate limit, callable as often as you liked by anyone who
 * could sign up. Deepgram nova-2 pre-recorded is roughly $0.0043/min at list,
 * so a full 50 MB upload is about 52 minutes of audio and about $0.22 a call,
 * repeatable.
 *
 * 30 MB. Phone and laptop lecture recordings land around 64-128 kbps, which
 * puts 30 MB at roughly 31 minutes at 128 kbps, 42 at 96, and 62 at 64 — so it
 * still covers an ordinary full lecture, which 25 MB would have started
 * clipping. It takes the worst case per call from about $0.22 to about $0.13.
 *
 * Cost 3, the same as a podcast, because the marginal spend is the same
 * (~$0.13 against ~$0.10) and charging two things that cost the same amount
 * different numbers of actions is how a quota stops meaning anything. On free
 * that is one upload a month with 2 actions left over; on Pro it caps a
 * determined subscriber at 33 uploads, about $4.30 against $9.99 of revenue.
 * At cost 1 those 100 actions would buy 100 uploads, about $13 — more than the
 * subscription is worth, which is the same arithmetic that set the podcast.
 */
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024
const TRANSCRIBE_FILE_AI_COST = 3

const MIME_MAP = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Transcription not configured' })

  // Determine audio MIME type from content-type header or x-file-ext header
  const ext = (req.headers['x-file-ext'] ?? '').toLowerCase().replace('.', '')
  const contentType = req.headers['content-type'] ?? ''
  const mimeType = MIME_MAP[ext] ?? (contentType.startsWith('audio/') ? contentType : 'audio/mpeg')

  // Reject on the declared length before reading a byte, when the client sends
  // one. Cheap, and it means an oversized upload is refused at the head rather
  // than after we have carried it.
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ error: 'Audio file too large (max 30 MB)' })
  }

  try {
    // Abort mid-stream once the cap is passed. The old code buffered the whole
    // upload and only then checked its size, so a 500 MB body was fully read
    // into a 60-second function before being rejected — the check did nothing
    // to protect the thing it was guarding.
    const chunks = []
    let received = 0
    for await (const chunk of req) {
      received += chunk.length
      if (received > MAX_UPLOAD_BYTES) {
        req.destroy()
        return res.status(413).json({ error: 'Audio file too large (max 30 MB)' })
      }
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)

    if (body.length < 1000) {
      return res.status(400).json({ error: 'Audio file too small or empty' })
    }

    // Everything that can reject the request has run, so this is the first
    // point at which it is honest to charge. Nothing is written until
    // gate.commit() after a successful transcription, so a Deepgram failure or
    // an empty transcript costs the user nothing.
    const gate = await reserveAiUsage(req, { verified: auth, cost: TRANSCRIBE_FILE_AI_COST })
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

    const dgRes = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&paragraphs=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': mimeType,
        },
        body,
      }
    )

    if (!dgRes.ok) {
      const errText = await dgRes.text()
      console.error('[transcribe-file] Deepgram error:', errText)
      return res.status(500).json({ error: 'Transcription failed' })
    }

    const data = await dgRes.json()
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

    if (!transcript) return res.status(422).json({ error: 'No speech detected in audio' })

    await gate.commit()

    return res.status(200).json({ transcript, usage: gate.usage })
  } catch (err) {
    console.error('[transcribe-file] error:', err.message)
    return res.status(500).json({ error: 'Failed to transcribe audio' })
  }
}
