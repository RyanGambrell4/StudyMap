export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const verifyRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_SERVICE_KEY,
    },
  })
  if (!verifyRes.ok) return res.status(401).json({ error: 'Unauthorized' })

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
