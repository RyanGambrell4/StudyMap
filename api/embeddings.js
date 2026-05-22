// OpenAI embeddings for semantic similarity
// Env var: OPENAI_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

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
