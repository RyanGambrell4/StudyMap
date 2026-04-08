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

    // Shuffle options so correct answer is evenly distributed across A/B/C/D
    const LABELS = ['A', 'B', 'C', 'D']
    const shuffled = questions.map(q => {
      // Strip letter prefix ("A. ", "B. " etc) to get plain text
      const plain = q.options.map(o => o.replace(/^[A-D]\.\s*/, ''))
      // Fisher-Yates shuffle
      for (let i = plain.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [plain[i], plain[j]] = [plain[j], plain[i]]
      }
      // Re-apply letter prefixes
      const newOptions = plain.map((text, i) => `${LABELS[i]}. ${text}`)
      // Find which label the correct answer now sits at
      const correctPlain = q.answer.replace(/^[A-D]\.\s*/, '')
      const newAnswer = newOptions.find(o => o.replace(/^[A-D]\.\s*/, '') === correctPlain) ?? newOptions[0]
      return { ...q, options: newOptions, answer: newAnswer }
    })

    res.status(200).json({ questions: shuffled })
  } catch (error) {
    console.error('Quick quiz error:', error)
    res.status(500).json({ error: error.message })
  }
}
