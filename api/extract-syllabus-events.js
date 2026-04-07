export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { text } = req.body
  if (!text || text.length < 50) return res.status(400).json({ error: 'Not enough text' })

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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Extract all academic deadlines and important dates from this course syllabus.

Syllabus text:
${text.slice(0, 6000)}

Return ONLY a JSON array. Extract every assignment, quiz, exam, project, presentation, and deadline you can find. For recurring items like "weekly quizzes", create one entry with the note "recurring weekly".

For each item return:
{
  "name": "clear short name like 'Midterm Exam' or 'Group Project Due'",
  "date": "YYYY-MM-DD format, use current year if not specified",
  "type": "one of: Exam, Midterm, Assignment, Project, Quiz, Lab, Other",
  "weight": "percentage as number if mentioned, null if not",
  "notes": "any extra details like time or location, null if none"
}

Return ONLY the JSON array with no other text. Example:
[{"name": "Midterm Exam", "date": "2026-02-12", "type": "Midterm", "weight": 20, "notes": "In Class"}]`
        }]
      })
    })

    const data = await response.json()
    const content = data.content[0].text
    const firstBracket = content.indexOf('[')
    const lastBracket = content.lastIndexOf(']')
    const cleaned = content.slice(firstBracket, lastBracket + 1)
    const events = JSON.parse(cleaned)
    res.status(200).json({ events })
  } catch (error) {
    console.error('Syllabus extraction error:', error)
    res.status(500).json({ error: error.message })
  }
}
