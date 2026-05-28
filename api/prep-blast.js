import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const {
    courseName,
    sessionType,
    mode,
    weakTopics,
    examTopics,
    coachFocus,
    examDate,
    daysUntilExam,
    targetGrade,
    learningStyle,
    struggles,
    professorEmphasis,
  } = req.body
  if (!courseName) return res.status(400).json({ error: 'Missing courseName' })

  // Compute days-until-exam if only examDate was provided.
  let resolvedDays = typeof daysUntilExam === 'number' && Number.isFinite(daysUntilExam) ? daysUntilExam : null
  if (resolvedDays === null && examDate) {
    const todayStr = new Date().toISOString().split('T')[0]
    resolvedDays = Math.max(0, Math.round((new Date(examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000))
  }

  const personalLines = []
  if (resolvedDays !== null) {
    personalLines.push(`Exam in ${resolvedDays} days.${resolvedDays <= 3 ? ' TIGHT TIMELINE — focus only on highest-yield review.' : ''}`)
  }
  if (targetGrade) personalLines.push(`Target grade: ${targetGrade}.`)
  if (learningStyle) personalLines.push(`Student learns best by: ${learningStyle}. Frame the 3 points accordingly.`)
  if (Array.isArray(struggles) && struggles.length) personalLines.push(`Active struggle areas: ${struggles.join(', ')}.`)
  if (professorEmphasis) personalLines.push(`Professor emphasizes: ${professorEmphasis}.`)
  const personalBlock = personalLines.length ? `\n${personalLines.join('\n')}\n` : ''

  let prompt = ''

  if (mode === 'weakness') {
    const weakList = weakTopics?.slice(0, 4) || []
    prompt = `Generate a pre-session weakness review briefing for a student about to study ${courseName}${sessionType ? ` (${sessionType})` : ''}.
${personalBlock}
Weak areas from recall history: ${weakList.length ? weakList.join(', ') : 'no specific weak areas identified yet, generate likely difficult topics'}

Return ONLY valid JSON:
{
  "mode": "weakness",
  "headline": "Review these before you start",
  "points": ["specific weak area to focus on", "another specific focus area", "third specific area"],
  "actionPrompt": "One actionable sentence for what to do during this session"
}

No em dashes. Points must be specific concepts, not generic advice.`

  } else if (mode === 'exam-topics') {
    prompt = `Generate a pre-session exam topic briefing for a student about to study ${courseName}.
${personalBlock}
Upcoming exam topics: ${examTopics?.join(', ') || 'not specified, use your knowledge of this course'}
Coach plan focus: ${coachFocus || 'general review'}

Return ONLY valid JSON:
{
  "mode": "exam-topics",
  "headline": "Most likely on your exam",
  "points": ["likely exam topic 1", "likely exam topic 2", "likely exam topic 3"],
  "actionPrompt": "One sentence on what to prioritize in this session"
}

No em dashes. Topics must be course-specific and concrete.`

  } else {
    prompt = `Generate a single sharp focus question to prime active recall for a student about to study ${courseName}${sessionType ? ` (${sessionType})` : ''}.
${personalBlock}
Session focus: ${coachFocus || 'general review'}

Return ONLY valid JSON:
{
  "mode": "focus-question",
  "headline": "Hold this question in mind",
  "question": "A specific challenging question requiring synthesis or application, not just memorization",
  "why": "One sentence explaining why mastering this concept unlocks the bigger picture"
}

No em dashes. The question must require genuine understanding, not surface recall.`
  }

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
        max_tokens: 400,
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
    console.error('[prep-blast]', e)
    return res.status(500).json({ error: 'Failed to generate prep blast.' })
  }
}
