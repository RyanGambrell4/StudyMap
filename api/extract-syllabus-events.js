import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 500000) return res.status(413).json({ error: 'Payload too large' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { text } = req.body
  if (!text || text.length < 50) return res.status(400).json({ error: 'Not enough text' })

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.toLocaleString('en-US', { month: 'long' })

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
        messages: [{
          role: 'user',
          content: `Extract all academic deadlines and important dates from this course syllabus.

Today is ${currentMonth} ${currentYear}. Use ${currentYear} for any dates that don't specify a year (or the next calendar year if the month has already passed this year).

Syllabus text:
${text.slice(0, 25000)}

Return ONLY a JSON array. Extract every assignment, quiz, exam, project, presentation, paper, lab report, and deadline you can find.
- Look carefully at course schedule tables (Week 1, Week 2 etc.) and convert relative dates to absolute YYYY-MM-DD dates using the semester start date if mentioned.
- For recurring items like "weekly quizzes every Friday", create one entry per occurrence if dates are listed, otherwise create a single entry with notes "recurring weekly".
- If a date range is given (e.g. "March 10-14"), use the last day as the due date.
- Include readings/textbook chapters only if they have explicit due dates.

For each item return:
{
  "name": "clear short name like 'Midterm Exam' or 'Group Project Due'",
  "date": "YYYY-MM-DD format",
  "type": "one of: Exam, Midterm, Assignment, Project, Quiz, Lab, Other",
  "weight": percentage as number if mentioned or null,
  "notes": "any extra details like time, room, or chapters — null if none"
}

Return ONLY the JSON array with no other text, markdown, or explanation.
Example: [{"name":"Midterm Exam","date":"${currentYear}-03-12","type":"Midterm","weight":25,"notes":"In class, closed book"}]`
        }]
      })
    })

    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error(data.error?.message ?? 'Empty AI response')
    const firstBracket = content.indexOf('[')
    const lastBracket = content.lastIndexOf(']')
    const cleaned = content.slice(firstBracket, lastBracket + 1)
    const events = JSON.parse(cleaned)
    res.status(200).json({ events })
  } catch (error) {
    console.error('Syllabus extraction error:', error)
    console.error(error)
    res.status(500).json({ error: error.message ?? 'Internal server error' })
  }
}
