// Deepgram transcription endpoint
// Env var: DEEPGRAM_API_KEY

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Transcription not configured' })

  try {
    // Collect raw body chunks
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
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
