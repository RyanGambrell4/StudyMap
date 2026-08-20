import { reserveAiUsage, verifyAuth } from '../lib/server/usage.js'
import { sendUserError } from '../lib/server/userErrors.js'
import { getCourseContext, formatCourseContextForPrompt, resolveCourseId } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'

// Section-by-section drafting partner. Takes the student's draft of one
// outline section and returns targeted feedback + concrete edits + evidence
// gaps + rubric-aligned scoring when a rubric is provided.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const {
    sectionName,
    sectionPurpose,
    sectionPoints,
    draft,
    thesis,
    essayType,
    wordAllocation,
    requirements,
    courseName,
    courseId: bodyCourseId,
  } = req.body || {}

  if (!sectionName || !draft?.trim()) {
    return res.status(400).json({ error: 'sectionName and draft are required' })
  }

  let courseId = bodyCourseId
  if (!courseId && courseName) courseId = await resolveCourseId(auth.userId, courseName)
  if (!courseId) return sendUserError(res, 'course_required', `essay-review-section: no courseId resolved (courseName=${courseName ?? 'none'})`)

  // Quota is reserved only now, once the request is known to be well formed.
  // It used to be taken at the top of the handler, so a request that was about
  // to be rejected for a missing course still cost the user an AI action.
  const gate = await reserveAiUsage(req, { verified: auth })
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })


  let brain
  try {
    brain = await getCourseContext(gate.userId, courseId, { topic: sectionPurpose || sectionName || null, request: req })
  } catch (err) {
    console.error('[essay-review-section] getCourseContext failed', err)
    return sendUserError(res, 'course_context_failed', err)
  }

  const contextBlock = formatCourseContextForPrompt(brain)
  const wordCount = draft.trim().split(/\s+/).length
  const wordDelta = wordAllocation ? wordCount - wordAllocation : null

  const prompt = `You are the student's writing coach. You've read their outline and now they've drafted ONE section. Give feedback like a real editor: specific, kind, actionable. Not vague praise.

${ANTI_GUESSING_RULES}

${contextBlock}

ESSAY CONTEXT:
- Type: ${essayType ?? 'academic essay'}
- Thesis: ${thesis ?? '(not set)'}
- Section: ${sectionName}
- Section purpose: ${sectionPurpose ?? '(unspecified)'}
- Section points from outline:
${(sectionPoints ?? []).map(p => `  - ${p}`).join('\n') || '  (none provided)'}
- Target word count: ${wordAllocation ?? 'not set'}
- Actual word count: ${wordCount}${wordDelta != null ? ` (${wordDelta >= 0 ? '+' : ''}${wordDelta} vs target)` : ''}

${requirements ? `ASSIGNMENT REQUIREMENTS THE STUDENT PASTED:\n${requirements}\n` : ''}

STUDENT'S DRAFT:
---
${draft.trim().slice(0, 4000)}
---

Return ONLY valid JSON:
{
  "overallScore": 0-100,
  "hits": ["specific thing they did well, quote a phrase from their draft"],
  "misses": ["specific thing missing/wrong, quote a phrase or name the gap"],
  "evidenceGaps": [
    { "claim": "quote the specific claim from their draft", "needsSource": "type of source that would back it (peer-reviewed study, textbook chapter, primary document, dataset)" }
  ],
  "wordCountVerdict": "on-target | over | under",
  "wordCountAdvice": "one sentence — if over, name specifically what to cut; if under, name what to expand. Empty if on-target.",
  "concreteEdits": [
    { "original": "quote a sentence/phrase from their draft", "revised": "your revised version", "why": "one short reason" }
  ],
  "rubricAlignment": [
    { "criterion": "criterion name from the assignment", "assessment": "how well the draft meets it in 1 sentence", "score": 0-100 }
  ],
  "nextStep": "one sentence naming the SINGLE most valuable next revision"
}

Rules:
- Every hit / miss must quote or paraphrase something SPECIFIC from the draft. No generic feedback.
- concreteEdits: at least 2, at most 5. Real sentences.
- evidenceGaps: only include claims that ACTUALLY need a source (assertions of fact, statistics, causal claims). Empty array if none.
- rubricAlignment: only populated if requirements contained rubric criteria. Empty array otherwise.
- Do NOT invent facts, citations, or sources. If the student references a source, take them at their word — flag it only if it looks structurally inconsistent (wrong century, contradictory data). If they need a specific type of source, name the TYPE not a fake title.
- No em dashes anywhere.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2400,
        system: 'You are a rigorous writing coach. Return only valid JSON matching the requested schema. Feedback must be grounded in the student\'s actual draft — no generic advice.',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    const review = JSON.parse(content.slice(first, last + 1))
    // The work succeeded, so charge for it now. A reservation that never
    // reaches this line costs the user nothing.
    await gate.commit?.()
    return res.status(200).json({ review, wordCount })
  } catch (e) {
    console.error('[essay-review-section]', e)
    return res.status(500).json({ error: 'Failed to review draft. Please try again.' })
  }
}
