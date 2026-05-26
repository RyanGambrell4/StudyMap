import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

const MIN_LEN = 10
const MAX_LEN = 30
const MAX_SOURCE_CHARS = 18_000

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const gate = await verifyAndCheckAiUsage(req)
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

    const { text, courseName, examLength, context } = req.body ?? {}
    const length = Math.max(MIN_LEN, Math.min(MAX_LEN, Number(examLength) || 10))

    const hasText = typeof text === 'string' && text.trim().length >= 50
    if (!hasText) return res.status(400).json({ error: 'Provide source material (notes, past exam, slides). Need at least 50 characters of text.' })

    const source = text.slice(0, MAX_SOURCE_CHARS)
    const contextLine = context && typeof context === 'string' && context.trim().length
      ? `Additional instructions from the student:\n"${context.trim()}"\n\n`
      : ''
    const courseLine = courseName ? `Course: ${courseName}\n\n` : ''

    const prompt = `You are an expert exam designer building a realistic practice exam.

${courseLine}${contextLine}Source material the student uploaded (past exams, notes, or slides):
"""
${source}
"""

Build a practice exam of exactly ${length} questions.

CRITICAL ORDERING:
1. FIRST — scan the source for any actual exam questions present verbatim (multiple choice, short answer, fill-in-the-blank). Include these EXACTLY as written, marked with "sourceType":"verbatim". Do not paraphrase verbatim questions.
2. THEN — generate additional questions inspired by the source material to reach exactly ${length} total. Mark these "sourceType":"generated".
3. Mix difficulty across the set — some quick recall, some applied reasoning, some integrative.

Question shape rules:
- Multiple choice (preferred): 4 options labeled "A. text", "B. text", "C. text", "D. text". "answer" must be the FULL string of the correct option, letter prefix included.
- Short answer: no options array, "answer" is a 1–3 sentence model answer.
- Every question MUST have a "topic" field (a 2–5 word phrase describing what concept is being tested) so weak-area grouping works in results.
- Every question MUST have an "explanation" — 1–3 sentences on why the correct answer is right, written like a tutor would say it.

Return ONLY this JSON, no preamble, no commentary, no markdown fence:
{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "question stem",
      "options": ["A. ...","B. ...","C. ...","D. ..."],
      "answer": "A. ...",
      "explanation": "...",
      "topic": "...",
      "sourceType": "verbatim"
    },
    {
      "type": "short_answer",
      "question": "question stem",
      "answer": "model answer",
      "explanation": "...",
      "topic": "...",
      "sourceType": "generated"
    }
  ]
}

Hard rules:
- Output EXACTLY ${length} questions. Not 9, not 11.
- Verbatim questions come first in the array (lowest indices), generated questions fill the rest.
- Multiple-choice wrong answers must be plausible distractors, not obviously silly.
- Do not invent facts that contradict the source.
- "answer" for multiple_choice MUST exactly match one of the strings in "options".`

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
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
        }],
      }),
    })

    const raw = await response.text()
    let data
    try { data = JSON.parse(raw) }
    catch {
      console.error('[generate-practice-exam] Anthropic returned non-JSON:', raw.slice(0, 400))
      return res.status(502).json({ error: 'AI service returned an unexpected response. Please try again.' })
    }

    const content = data.content?.[0]?.text
    if (!content) {
      console.error('[generate-practice-exam] Empty AI response:', JSON.stringify(data).slice(0, 400))
      return res.status(502).json({ error: data.error?.message ?? 'Empty AI response. Please try again.' })
    }

    const stripped = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '')
    const firstBrace = stripped.indexOf('{')
    const lastBrace = stripped.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace <= firstBrace) {
      console.error('[generate-practice-exam] Malformed AI content:', stripped.slice(0, 400))
      return res.status(502).json({ error: 'AI returned malformed exam. Please try again.' })
    }

    let parsed
    try { parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) }
    catch (e) {
      console.error('[generate-practice-exam] JSON parse failed:', e.message)
      return res.status(502).json({ error: 'AI returned invalid JSON. Please try again.' })
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (!questions.length) return res.status(502).json({ error: 'AI returned no questions. Please try again.' })

    const normalized = questions
      .filter(q => q && typeof q === 'object' && typeof q.question === 'string' && q.question.trim().length > 5)
      .map((q, i) => {
        const isMc = q.type === 'multiple_choice' && Array.isArray(q.options) && q.options.length >= 2
        return {
          id: `q${i + 1}`,
          type: isMc ? 'multiple_choice' : 'short_answer',
          question: q.question.trim(),
          options: isMc ? q.options.slice(0, 4) : undefined,
          answer: typeof q.answer === 'string' ? q.answer.trim() : '',
          explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
          topic: typeof q.topic === 'string' && q.topic.trim().length ? q.topic.trim() : 'General',
          sourceType: q.sourceType === 'verbatim' ? 'verbatim' : 'generated',
        }
      })

    return res.status(200).json({ questions: normalized })

  } catch (err) {
    console.error('[generate-practice-exam] Unhandled error:', err)
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong generating your exam. Please try again.' })
  }
}
