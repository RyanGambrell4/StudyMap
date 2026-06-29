// Transcribes an uploaded audio file (mp3, m4a, wav, webm, ogg) via Deepgram
// Used by the "Upload Lecture Audio" feature in StudyToolsView

import { verifyAuth } from '../lib/server/usage.js'

export const config = { api: { bodyParser: false }, maxDuration: 60 }

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

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks)

    if (body.length < 1000) {
      return res.status(400).json({ error: 'Audio file too small or empty' })
    }

    // 50 MB limit
    if (body.length > 50 * 1024 * 1024) {
      return res.status(413).json({ error: 'Audio file too large (max 50 MB)' })
    }

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

    return res.status(200).json({ transcript })
  } catch (err) {
    console.error('[transcribe-file] error:', err.message)
    return res.status(500).json({ error: 'Failed to transcribe audio' })
  }
}
