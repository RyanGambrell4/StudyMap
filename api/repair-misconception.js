import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, topic, wrongQuestion, wrongAnswer, correctAnswer, existingExplanation } = req.body
  if (!courseName || !wrongQuestion || !correctAnswer)
    return res.status(400).json({ error: 'Missing required fields' })

  const prompt = `A student studying ${courseName} got a practice question wrong. Diagnose the specific misconception and create a follow-up question to confirm they now understand.

Topic: ${topic || 'General'}
Question: ${wrongQuestion}
Student's answer: ${wrongAnswer || 'No answer (timed out)'}
Correct answer: ${correctAnswer}
${existingExplanation ? `Standard explanation: ${existingExplanation}` : ''}

Return ONLY a valid JSON object with no other text:
{
  "diagnosis": "One or two sentences naming the specific misconception that caused this wrong answer. Reference what the student chose and contrast it with what is correct. Do not just restate the explanation.",
  "repairQuestion": {
    "question": "A new question testing the same concept from a different angle. Force the student to demonstrate they understand the exact distinction they missed.",
    "options": ["A. option", "B. option", "C. option", "D. option"],
    "answer": "exact text of correct option including the letter prefix",
    "explanation": "One sentence explaining why this is correct, reinforcing the key distinction."
  }
}

Rules:
- diagnosis must address the student's specific wrong answer, not just explain the correct one
- repairQuestion must be phrased differently from the original question
- All 4 options must be plausible distractors
- answer must exactly match one of the options strings including the letter prefix
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
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    const result = JSON.parse(content.slice(first, last + 1))
    return res.status(200).json(result)
  } catch (e) {
    console.error('[repair-misconception]', e)
    return res.status(500).json({ error: 'Failed to generate repair. Please try again.' })
  }
}
