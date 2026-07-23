import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { buildContextBlock, contextGuardrails } from '../lib/server/courseContextPrompt.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, topic, courseContext } = req.body
  if (!courseName && !courseContext?.courseName) {
    return res.status(400).json({ error: 'Missing courseName' })
  }

  const ctx = courseContext ?? { courseName }
  const resolvedName = ctx.courseName ?? courseName

  // Choose the 5-question focus. Priority: explicit topic → most recent
  // quiz miss → weakest mastery topic → coach plan emphasis → general.
  const focus = pickFocus(topic, ctx)

  const contextBlock = buildContextBlock(ctx)
  const guardrails = contextGuardrails(ctx, {
    invention: 'If the context above does not contain enough material to write a specific question, write the question at a general-course level and set "grounding":"course_name_only" on that question. Never invent syllabus items, textbook page numbers, or professor names.',
  })

  const prompt = `You are writing a Quick Quiz Burst for a specific student. This student's course context is below — every question you write must be defensibly grounded in it.

${contextBlock}

QUIZ FOCUS: ${focus.label}
${focus.detail ? `Detail: ${focus.detail}` : ''}

Write exactly 5 multiple-choice questions with this difficulty arc:
- Q1 easy (confidence builder tied to a concept in the context)
- Q2 medium (real understanding of a listed topic)
- Q3 hard (application / synthesis, ideally on a weak topic)
- Q4 hard (edge case or a distinction the student has previously missed)
- Q5 medium (consolidation on an emphasis topic)

For EACH question return this exact shape:
{
  "question": "…",
  "options": ["A. …", "B. …", "C. …", "D. …"],
  "answer": "exact text of correct option including letter prefix",
  "explanation": "one sentence explaining why the answer is correct",
  "difficulty": "easy" | "medium" | "hard",
  "topic": "short topic name that this question tests",
  "whyThisQuestion": "one short phrase tying it to the student's context — e.g. 'you scored 42% on Mitosis last time' or 'appears on Week 4 lecture' or 'listed in professor emphasis'",
  "grounding": "syllabus" | "weak_topic" | "past_miss" | "emphasis" | "coach_plan" | "course_name_only",
  "rootCauseType": "definition_confusion" | "mechanism_confusion" | "misapplication" | "terminology_mixup" | "careless_speed" | "unfamiliar",
  "distractorTags": {
    "A. …": "why-a-student-picks-this in 2-4 words, e.g. 'confuses with meiosis'",
    "B. …": "…",
    "C. …": "…",
    "D. …": "…"
  }
}

Return ONLY a JSON array of 5 objects, nothing else.

${guardrails}
- All 4 options must be plausible distractors
- answer must exactly match one option string including the letter prefix
- Test conceptual understanding and application, not vocabulary trivia
- rootCauseType tags what KIND of thinking a student who misses this question got wrong. Use the most specific one.
- distractorTags MUST include the correct option too, tagged as "correct".
- Every distractor tag names the specific misconception the student would hold if they picked it. E.g. "confuses cause with correlation", "swaps prophase and metaphase", "applies formula in wrong direction". Not "wrong answer" or "distractor".
- No em dashes anywhere`

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }] }],
      }),
    })
    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('[')
    const last = content.lastIndexOf(']')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    const questions = JSON.parse(content.slice(first, last + 1))
    return res.status(200).json({
      questions,
      focus: focus.label,
      groundingSummary: summarizeGrounding(questions),
      courseName: resolvedName,
    })
  } catch (e) {
    console.error('[quiz-burst]', e)
    return res.status(500).json({ error: 'Failed to generate quiz. Please try again.' })
  }
}

function pickFocus(topic, ctx) {
  const trimmedTopic = typeof topic === 'string' ? topic.trim() : ''
  if (trimmedTopic) return { label: trimmedTopic, detail: 'student-selected focus topic' }

  const firstMiss = ctx.recentQuizMisses?.[0]
  if (firstMiss?.topic) {
    return { label: firstMiss.topic, detail: `student scored ${firstMiss.score}% on this last time — target it again` }
  }
  const weakest = ctx.weakTopics?.[0]
  if (weakest?.topic) {
    return { label: weakest.topic, detail: `mastery ${weakest.score}/100 — student's weakest topic in this course` }
  }
  const emphasis = ctx.emphasisTopics?.[0]
  if (emphasis) return { label: emphasis, detail: 'listed in professor emphasis' }
  const week = ctx.weeklyFocus?.theme
  if (week) return { label: week, detail: 'current week of the coach plan' }
  return { label: 'general course material', detail: null }
}

function summarizeGrounding(questions) {
  const buckets = {}
  for (const q of questions ?? []) {
    const g = q.grounding ?? 'course_name_only'
    buckets[g] = (buckets[g] ?? 0) + 1
  }
  return buckets
}
