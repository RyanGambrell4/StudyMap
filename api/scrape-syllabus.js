// Scrape syllabus from URL using Firecrawl + Claude extraction
// Env vars: FIRECRAWL_API_KEY, ANTHROPIC_API_KEY

import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (!firecrawlKey) return res.status(503).json({ error: 'URL scraping not configured' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { url, courseName } = req.body ?? {}
  if (!url) return res.status(400).json({ error: 'url required' })

  // Validate URL
  try { new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.toLocaleString('en-US', { month: 'long' })

  try {
    // Step 1: Scrape with Firecrawl
    const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    })

    if (!scrapeRes.ok) {
      const err = await scrapeRes.text()
      console.error('[Firecrawl]', err)
      return res.status(422).json({ error: 'Could not scrape that URL. Try uploading the PDF instead.' })
    }

    const scrapeData = await scrapeRes.json()
    const markdown = scrapeData?.data?.markdown ?? scrapeData?.markdown ?? ''

    if (!markdown || markdown.length < 100) {
      return res.status(422).json({ error: 'Page content too short. Try uploading the PDF instead.' })
    }

    // Step 2: Extract events with Claude (same prompt as extract-syllabus-events.js)
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
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
          content: `Extract all academic deadlines and important dates from this course syllabus${courseName ? ` for "${courseName}"` : ''}.

Today is ${currentMonth} ${currentYear}. Use ${currentYear} for any dates that don't specify a year (or the next calendar year if the month has already passed this year).

Syllabus content:
${markdown.slice(0, 25000)}

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
  "notes": "any extra details like time, room, or chapters - null if none"
}

Return ONLY the JSON array with no other text, markdown, or explanation.
Example: [{"name":"Midterm Exam","date":"${currentYear}-03-12","type":"Midterm","weight":25,"notes":"In class, closed book"}]`,
        }],
      }),
    })

    const anthropicData = await anthropicRes.json()
    const text = anthropicData.content?.[0]?.text
    if (!text) throw new Error(anthropicData.error?.message ?? 'Empty AI response')

    const firstBracket = text.indexOf('[')
    const lastBracket = text.lastIndexOf(']')
    const cleaned = text.slice(firstBracket, lastBracket + 1)
    const events = JSON.parse(cleaned)

    return res.status(200).json({ events, source: 'url', url })
  } catch (err) {
    console.error('[scrape-syllabus]', err.message)
    return res.status(500).json({ error: 'Scraping failed. Try uploading the PDF instead.' })
  }
}
