import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { getCourseContext, formatCourseContextForPrompt, resolveCourseId } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'
import { saveArtifact } from '../lib/server/artifactWriter.js'

// Server-side variant of hasRichContext: enough grounding to write a real
// outline, not a generic one. Deliberately conservative — if the student
// hasn't pasted an assignment prompt and we have zero signal from the
// course, we refuse rather than guess.
function brainIsRich(brain) {
  const signals = [
    brain?.deadlines?.items?.length ?? 0,
    brain?.plan?.emphasisTopics?.length ?? 0,
    brain?.plan?.weeklyFocus?.length ?? 0,
    brain?.topics?.items?.length ?? 0,
    brain?.materials?.excerpts?.length ?? 0,
    brain?.plan?.struggles?.length ?? 0,
  ]
  return signals.reduce((a, b) => a + b, 0) >= 2
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { topic, essayType, wordCount, requirements, courseName, courseId: bodyCourseId, thesis } = req.body || {}
  if (!topic?.trim()) return res.status(400).json({ error: 'Essay topic is required' })

  let courseId = bodyCourseId
  if (!courseId && courseName) courseId = await resolveCourseId(gate.userId, courseName)
  if (!courseId) return res.status(400).json({ error: 'Missing courseId (or unique courseName)' })

  let brain
  try {
    brain = await getCourseContext(gate.userId, courseId, { topic: topic.trim(), request: req })
  } catch (err) {
    console.error('[essay-outline] getCourseContext failed', err)
    return res.status(400).json({ error: String(err?.message || err) })
  }

  const hasPrompt = typeof requirements === 'string' && requirements.trim().length >= 20
  if (!hasPrompt && !brainIsRich(brain)) {
    return res.status(200).json({
      needsMoreContext: true,
      reason: 'no-prompt-no-context',
      message: 'Paste the assignment prompt (or upload your syllabus for this course) so the outline matches what your professor actually asked for. Without it, any outline would be a guess.',
      askFor: ['assignment prompt or grading rubric', 'course syllabus events'],
    })
  }

  const typeDescriptions = {
    argumentative: 'argumentative essay that takes a clear position and defends it with evidence',
    analytical: 'analytical essay that breaks down and examines a topic in depth',
    expository: 'expository essay that explains or describes a topic objectively',
    compare: 'compare and contrast essay examining similarities and differences',
    narrative: 'narrative essay telling a story or recounting an experience',
    research: 'research paper synthesizing multiple sources around a central thesis'
  }
  const typeDesc = typeDescriptions[essayType] || 'academic essay'
  const wc = wordCount || 1000

  const contextBlock = formatCourseContextForPrompt(brain)

  const prompt = `Create a detailed outline for a ${wc}-word ${typeDesc}.

${ANTI_GUESSING_RULES}

${contextBlock}

Essay topic: ${topic}
${thesis ? `Thesis (use this exactly): ${thesis}` : ''}
${requirements ? `Assignment prompt / requirements the student pasted: ${requirements}` : ''}

Return ONLY a JSON object with this exact structure:
{
  "title": "suggested essay title",
  "thesis": "the thesis statement (use the provided thesis if given)",
  "essayType": "${essayType || 'academic'}",
  "estimatedWordCount": ${wc},
  "sections": [
    {
      "name": "Introduction",
      "purpose": "hook the reader and present the thesis",
      "points": ["hook/opening", "background context", "thesis statement"],
      "wordAllocation": 150
    }
  ],
  "keyArguments": ["main argument 1", "main argument 2", "main argument 3"],
  "suggestedSources": ["type of source 1", "type of source 2"],
  "writingTips": ["tip specific to this essay type and this student — reference learning style or professor emphasis when present"],
  "commonPitfalls": ["pitfall to avoid for this essay type"],
  "gapsToFillBeforeWriting": ["specific fact, source, or definition the student should look up before drafting — grounded in what's missing from the context above"]
}

Rules:
- Section breakdown must add up to roughly the target word count.
- writingTips must reference the student's learning style / year / emphasis topics when those are provided.
- Do NOT invent citations, page numbers, or professor preferences. If suggestedSources is empty because no reading list is given, mark it as ["ask professor for reading list"] instead of inventing titles.
- No em dashes in any field.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2400,
      system: 'You are an expert writing coach and academic tutor. Ground every recommendation in the student\'s specific course context. Always return valid JSON matching the exact schema requested.',
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(500).json({ error: 'AI service error: ' + err })
  }

  const data = await response.json()
  const raw = data.content?.[0]?.text || ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse AI response' })

  let outline
  try {
    outline = JSON.parse(jsonMatch[0])
  } catch {
    return res.status(500).json({ error: 'Invalid JSON from AI' })
  }

  const resolvedName = brain.identity?.name || courseName || 'this course'
  saveArtifact({
    userId: gate.userId,
    courseId,
    courseName: resolvedName,
    artifactType: 'essay_outline',
    title: `${topic.slice(0, 60)} Outline`,
    topic: topic.slice(0, 200),
    payload: { outline, essayType, wordCount, requirements: requirements?.slice(0, 1000) },
  }).then(w => { if (!w.ok) console.warn('[essay-outline] saveArtifact failed', w.error) })
    .catch(err => console.warn('[essay-outline] saveArtifact threw', err?.message))

  return res.status(200).json({ outline })
}
