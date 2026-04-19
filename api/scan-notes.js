import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 5_000_000) return res.status(413).json({ error: 'Payload too large' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { imageBase64, mediaType } = req.body
  if (!imageBase64 || !mediaType) {
    return res.status(400).json({ error: 'Missing image data' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: 'Extract and clean up all the text from these handwritten notes. Format it as clear, readable study notes with headers and bullet points. Preserve all the information but make it well-organized and easy to read.',
              },
            ],
          },
        ],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message ?? 'Anthropic API error')
    }

    const text = data.content?.[0]?.text ?? ''
    res.status(200).json({ text })
  } catch (error) {
    console.error('scan-notes error:', error)
    res.status(500).json({ error: 'Failed to scan notes' })
  }
}
