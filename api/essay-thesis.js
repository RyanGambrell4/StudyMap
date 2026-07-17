import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { topic, essayType, wordCount, requirements, courseName } = req.body
  if (!topic?.trim()) return res.status(400).json({ error: 'Topic is required' })

  const prompt = `Generate exactly 3 strong, distinct thesis statements for a ${essayType || 'academic'} essay.

Topic: ${topic}${courseName ? '\nCourse: ' + courseName : ''}${wordCount ? '\nTarget word count: ' + wordCount : ''}${requirements ? '\nRequirements: ' + requirements : ''}

Rules:
- Each thesis must take a clear, arguable position
- Each should be meaningfully different in angle or argument
- Keep each to one sentence
- Do not number them or add labels

- No em dashes in any thesis

Return ONLY a JSON array of 3 strings: ["thesis 1", "thesis 2", "thesis 3"]`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: 'You are an expert writing coach. Return only valid JSON arrays, no markdown.',
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(500).json({ error: 'AI service error: ' + err })
  }

  const data = await response.json()
  const raw = data.content?.[0]?.text || ''
  const arrMatch = raw.match(/\[[\s\S]*\]/)
  if (!arrMatch) return res.status(500).json({ error: 'Failed to parse response' })

  let theses
  try {
    theses = JSON.parse(arrMatch[0])
  } catch {
    return res.status(500).json({ error: 'Invalid JSON from AI' })
  }

  return res.status(200).json({ theses })
}
