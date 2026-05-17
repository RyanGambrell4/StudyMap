import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, topic, weakTopics } = req.body
  if (!courseName) return res.status(400).json({ error: 'Missing courseName' })

  const scopeLine = topic
    ? `Focus topic: ${topic}`
    : weakTopics?.length
      ? `Student weak areas to target: ${weakTopics.join(', ')}`
      : 'General course material'

  const prompt = `You are creating a Quick Quiz Burst for a student studying ${courseName}.
${scopeLine}

Generate exactly 5 multiple choice questions with a specific difficulty arc:
- Question 1: Easy (broad concept, confidence builder)
- Question 2: Medium (requires real understanding)
- Question 3: Hard (application or synthesis)
- Question 4: Hard (edge case or tricky distinction)
- Question 5: Medium (consolidation, ends on an achievable note)

Return ONLY a valid JSON array with no other text:
[
  {
    "question": "question text",
    "options": ["A. option", "B. option", "C. option", "D. option"],
    "answer": "exact text of correct option including the letter prefix",
    "explanation": "one sentence explaining why this is correct",
    "difficulty": "easy"
  }
]

Rules:
- difficulty field: "easy", "medium", or "hard" following the arc above
- All 4 options must be plausible distractors
- answer must exactly match one of the options strings including the letter prefix
- Test conceptual understanding and application, not just vocabulary definitions
- No em dashes anywhere`

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
        max_tokens: 1600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('[')
    const last = content.lastIndexOf(']')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    const questions = JSON.parse(content.slice(first, last + 1))
    return res.status(200).json({ questions })
  } catch (e) {
    console.error('[quiz-burst]', e)
    return res.status(500).json({ error: 'Failed to generate quiz. Please try again.' })
  }
}
