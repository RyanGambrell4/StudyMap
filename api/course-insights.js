import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { getCourseContext, formatCourseContextForPrompt, resolveCourseId } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, courseId: bodyCourseId, targetScore, weakTopics: legacyWeak } = req.body || {}

  let courseId = bodyCourseId
  if (!courseId && courseName) courseId = await resolveCourseId(gate.userId, courseName)
  if (!courseId) return res.status(400).json({ error: 'Missing courseId (or unique courseName)' })

  let brain
  try {
    brain = await getCourseContext(gate.userId, courseId, { request: req })
  } catch (err) {
    console.error('[course-insights] getCourseContext failed', err)
    return res.status(400).json({ error: String(err?.message || err) })
  }

  const contextBlock = formatCourseContextForPrompt(brain)
  const legacyWeakLine = Array.isArray(legacyWeak) && legacyWeak.length
    ? `\nCLIENT-DERIVED weak topics (mastery store): ${legacyWeak.slice(0, 5).join(', ')}\n`
    : ''
  const targetLine = targetScore ? `\nStudent's stated target score: ${targetScore}\n` : ''

  const prompt = `You are a study analytics engine. Analyze this student's course performance and generate actionable insights.

${ANTI_GUESSING_RULES}

${contextBlock}${legacyWeakLine}${targetLine}

Return ONLY valid JSON:
{
  "healthScore": <0-100 integer representing overall course health>,
  "healthLabel": "<one of: 'On Track', 'Needs Attention', 'At Risk', 'Strong'>",
  "gradeTrajectory": "<one of: 'improving', 'stable', 'declining', 'unknown'>",
  "topWeakAreas": ["<specific concept>", "<specific concept>"],
  "topStrengths": ["<specific area>"],
  "nextSessionFocus": "<one concrete action for their very next study session>",
  "insight": "<one sharp sentence about what this student most needs to do differently right now>"
}

No em dashes. Be specific to the course and data - not generic advice.
If the context has no session history, set gradeTrajectory to 'unknown' and healthLabel to something honest like 'Not Enough Data'. Do not manufacture a trajectory from thin air.`

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
        max_tokens: 500,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }] }],
      }),
    })
    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty AI response')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('Malformed AI response')
    const result = JSON.parse(content.slice(first, last + 1))
    return res.status(200).json(result)
  } catch (e) {
    console.error('[course-insights]', e)
    return res.status(500).json({ error: 'Failed to generate course insights.' })
  }
}
