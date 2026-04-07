export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { courseName, sessionType, text } = req.body
  if (!courseName) return res.status(400).json({ error: 'Missing courseName' })

  const context = text && text.length > 50
    ? `Based on these notes for ${courseName}:\n${text.slice(0, 4000)}\n\n`
    : `Course: ${courseName}\nSession type: ${sessionType}\n\n`

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
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `${context}Generate exactly 5 multiple choice quiz questions for a mid-session check on ${courseName} (${sessionType} session).

Return ONLY this JSON array with no other text:
[
  {
    "question": "question text",
    "options": ["A. option", "B. option", "C. option", "D. option"],
    "answer": "exact text of correct option including the letter prefix",
    "explanation": "one sentence explanation"
  }
]

Rules:
- Test conceptual understanding, not just definitions
- All 4 options must be plausible
- Answer must exactly match one of the options strings
- Explanations must be 1-2 sentences maximum`,
        }],
      }),
    })

    const data = await response.json()
    const content = data.content[0].text
    const first = content.indexOf('[')
    const last = content.lastIndexOf(']')
    const questions = JSON.parse(content.slice(first, last + 1))
    res.status(200).json({ questions })
  } catch (error) {
    console.error('Quick quiz error:', error)
    res.status(500).json({ error: error.message })
  }
}
