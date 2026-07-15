import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, topic } = req.body
  if (!courseName) return res.status(400).json({ error: 'Missing courseName' })

  const topicLine = topic?.trim() ? `Focus specifically on: ${topic.trim()}` : `Cover a broad mix of topics from the course.`

  const prompt = `Generate 14 multiple choice quiz questions for a student studying ${courseName}.
${topicLine}

These are for a timed speed challenge — questions should be clear, unambiguous, and answerable in under 10 seconds. Vary difficulty: mix easy, medium, and hard questions.

Return ONLY valid JSON:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A",
      "difficulty": "easy",
      "explanation": "One sentence explaining why this is correct."
    }
  ]
}

Rules:
- Exactly 14 questions
- Each question has exactly 4 options
- The answer must exactly match one of the options
- difficulty is one of: easy, medium, hard
- No em dashes in any text
- Questions should test genuine understanding, not trick wording`

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
        max_tokens: 2400,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    return res.status(200).json(JSON.parse(content.slice(first, last + 1)))
  } catch (e) {
    console.error('[timed-challenge]', e)
    return res.status(500).json({ error: 'Failed. Please try again.' })
  }
}
