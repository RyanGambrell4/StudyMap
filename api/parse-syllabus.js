import { reserveAiUsage, verifyAuth } from '../lib/server/usage.js'
import { USER_ERRORS } from '../lib/server/userErrors.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 1_500_000) return res.status(413).json({ error: 'Payload too large' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { text } = req.body
  if (!text || text.length < 50) return sendUserError(res, 'unreadable_input', 'parse-syllabus: text under 50 chars')

  // Reserved after validation, so a request that gets rejected costs nothing.
  const gate = await reserveAiUsage(req, { verified: auth })
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })


  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const currentYear = now.getFullYear()

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        system: [{
          type: 'text',
          cache_control: { type: 'ephemeral' },
          text: `You are a structured data extractor for academic course syllabi. Today is ${todayStr}.

ANTI-GUESSING RULES (strictly enforced):
- Only extract information that appears verbatim or near-verbatim in the provided text.
- Every extracted item must have a sourceSnippet: the exact phrase or sentence from the document that proves this item exists. Do not paraphrase.
- If a field is not stated in the document, omit it or return null. Never guess or fill with typical values.
- Do not add exams, topics, or weights that seem typical for the course type but are absent from the text.

YEAR RULES:
- Today is ${todayStr}.
- If a date includes a full year, use it exactly.
- If a date has no year: compute what year makes it most likely a future academic deadline.
  - If month-day falls after today in year ${currentYear}: use ${currentYear}, set yearAmbiguous: false.
  - If month-day has already passed in year ${currentYear}: use ${currentYear + 1}, set yearAmbiguous: true, set confidence: "needs-review".
- If ALL non-recurring dates appear to be more than 2 months in the past, set isPastTerm: true.

TOPICS: only extract topics that appear as an explicit list, schedule, or weekly outline. Do not infer topics from course name or description.

GRADING: only extract grade weights that appear as explicit percentages or point values attributed to categories.

Return ONLY valid JSON matching this exact schema. No prose, no markdown fences:

{
  "isSyllabus": true,
  "isPastTerm": false,
  "course": {
    "name": "Introduction to Biology",
    "code": "BIOL 101",
    "term": "Fall 2026",
    "sourceSnippet": "BIOL 101: Introduction to Biology, Fall 2026"
  },
  "instructor": {
    "name": "Dr. Smith",
    "email": "smith@university.edu",
    "officeHours": "Mon/Wed 2-3pm",
    "sourceSnippet": "Instructor: Dr. Smith, smith@university.edu, Office hours Mon/Wed 2-3pm"
  },
  "exams": [
    {
      "name": "Midterm 1",
      "date": "YYYY-MM-DD",
      "weight": 25,
      "yearAmbiguous": false,
      "confidence": "high",
      "sourceSnippet": "Midterm 1 -- October 5, worth 25% of grade"
    }
  ],
  "dueDates": [
    {
      "title": "Problem Set 1",
      "date": "YYYY-MM-DD",
      "type": "Assignment",
      "weight": null,
      "yearAmbiguous": false,
      "confidence": "high",
      "sourceSnippet": "Problem Set 1 due September 12"
    }
  ],
  "classMeetings": [
    {
      "days": ["Monday", "Wednesday", "Friday"],
      "startTime": "10:00",
      "endTime": "11:00",
      "location": "Science Hall 201",
      "confidence": "high",
      "sourceSnippet": "Lectures MWF 10:00-11:00 AM, Science Hall 201"
    }
  ],
  "topics": [
    {
      "title": "Cell Division and Mitosis",
      "weekLabel": "Week 3",
      "confidence": "high",
      "sourceSnippet": "Week 3: Cell Division and Mitosis"
    }
  ],
  "gradingBreakdown": [
    {
      "category": "Final Exam",
      "percentage": 35,
      "sourceSnippet": "Final Exam: 35%"
    }
  ]
}

If the text is clearly not a course syllabus, return: {"isSyllabus": false}
If a section has no items, return an empty array [] for list fields and null for object fields.`,
        }],
        messages: [{
          role: 'user',
          content: `Extract structured data from this course syllabus. Apply all ANTI-GUESSING and YEAR rules.

Syllabus text:
${text.slice(0, 30000)}`,
        }],
      }),
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message ?? `Anthropic API error ${response.status}`)

    const raw = data.content?.[0]?.text
    if (!raw) throw new Error('Empty AI response')

    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('AI response was not JSON')

    let parsed
    try {
      parsed = JSON.parse(raw.slice(first, last + 1))
    } catch (e) {
      throw new Error('Could not parse extraction JSON: ' + e.message)
    }

    // Post-hoc scrub: drop any item whose sourceSnippet does not appear in the input text.
    // This enforces grounding even if the model fabricated a snippet.
    const normalizedText = text.replace(/\s+/g, ' ').toLowerCase()
    const inText = (snippet) => {
      if (!snippet || typeof snippet !== 'string' || snippet.length < 4) return false
      const norm = snippet.replace(/\s+/g, ' ').toLowerCase().slice(0, 120)
      return normalizedText.includes(norm)
    }

    if (Array.isArray(parsed.exams))
      parsed.exams = parsed.exams.filter(e => inText(e.sourceSnippet))
    if (Array.isArray(parsed.dueDates))
      parsed.dueDates = parsed.dueDates.filter(e => inText(e.sourceSnippet))
    if (Array.isArray(parsed.topics))
      parsed.topics = parsed.topics.filter(e => inText(e.sourceSnippet))
    if (Array.isArray(parsed.gradingBreakdown))
      parsed.gradingBreakdown = parsed.gradingBreakdown.filter(e => inText(e.sourceSnippet))
    if (Array.isArray(parsed.classMeetings))
      parsed.classMeetings = parsed.classMeetings.filter(e => inText(e.sourceSnippet))
    if (parsed.course && !inText(parsed.course.sourceSnippet))
      parsed.course = null
    if (parsed.instructor && !inText(parsed.instructor.sourceSnippet))
      parsed.instructor = null

    // The work succeeded, so charge for it now.
    await gate.commit?.()
    res.status(200).json(parsed)
  } catch (error) {
    console.error('parse-syllabus error:', error)
    res.status(500).json({ error: USER_ERRORS.unexpected.error, code: USER_ERRORS.unexpected.code })
  }
}
