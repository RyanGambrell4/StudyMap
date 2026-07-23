import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { buildContextBlock, contextGuardrails } from '../lib/server/courseContextPrompt.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { topic, essayType, wordCount, requirements, courseName, courseContext } = req.body
  if (!topic?.trim()) return res.status(400).json({ error: 'Topic is required' })

  const ctx = courseContext ?? { courseName }
  const contextBlock = buildContextBlock(ctx)
  const guardrails = contextGuardrails(ctx, {
    invention: 'If the student has not provided an assignment prompt or specific requirements, pick angles that match the course level (year, learning style, professor emphasis). Do NOT invent that the professor is looking for anything specific.',
  })

  const prompt = `Generate exactly 3 strong, distinct thesis statements for a ${essayType || 'academic'} essay.

${contextBlock}

Essay topic: ${topic}
${wordCount ? `Target word count: ${wordCount}` : ''}
${requirements ? `Assignment requirements the student pasted: ${requirements}` : ''}

Rules:
- Each thesis takes a clear, arguable position that fits this course level and any listed emphasis topics.
- Each of the 3 must attack the topic from a meaningfully different angle.
- Keep each to one sentence, no numbering or labels.
- No em dashes anywhere.

Return ONLY a JSON array of 3 strings: ["thesis 1", "thesis 2", "thesis 3"]

${guardrails}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'You are an expert writing coach who grounds every thesis in the student\'s specific course context. Return only valid JSON arrays, no markdown.',
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
