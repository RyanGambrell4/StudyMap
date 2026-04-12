export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 100000) return res.status(413).json({ error: 'Payload too large' })

  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const verifyRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_SERVICE_KEY,
    },
  })
  if (!verifyRes.ok) return res.status(401).json({ error: 'Unauthorized' })

  const { messages, courseName, examDate, targetGrade, coachPlan, struggles } = req.body
  if (!messages?.length || !courseName) return res.status(400).json({ error: 'Missing required fields' })

  let planContext = ''
  if (coachPlan?.weeklyFocus?.length) {
    planContext = coachPlan.weeklyFocus
      .slice(0, 6)
      .map(w => `  ${w.week}: ${w.theme}`)
      .join('\n')
  }

  const strugglesStr = struggles?.length ? struggles.join(', ') : null

  const systemPrompt = `You are a focused study tutor for ${courseName}. The student has an exam on ${examDate ?? 'an upcoming date'} and their goal is ${targetGrade ?? 'to do well'}.
${planContext ? `Their current study plan covers:\n${planContext}` : ''}
${strugglesStr ? `Topics they have previously struggled with: ${strugglesStr}` : ''}
Your job: help them understand course material clearly and efficiently. Be concise and direct. Use examples. If they paste notes, identify key concepts. Generate practice questions when asked.
IMPORTANT: If the student expresses difficulty, confusion, or asks for more help on a specific topic, identify that topic clearly so it can be flagged in their study plan.

Respond with ONLY valid JSON in this exact format:
{
  "reply": "your full response as a string",
  "flaggedTopic": "short topic name if student is clearly struggling, otherwise null"
}
flaggedTopic must be a short topic name (2-5 words max, e.g. "supply elasticity") ONLY when the student clearly expresses struggle or confusion. Otherwise null. Do not wrap in markdown.`

  const recentMessages = messages.slice(-10)

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
        max_tokens: 1024,
        system: systemPrompt,
        messages: recentMessages,
      }),
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message ?? `Anthropic API error ${response.status}`)

    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty response from AI')

    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) {
      return res.status(200).json({ reply: content, flaggedTopic: null })
    }
    const parsed = JSON.parse(content.slice(first, last + 1))
    res.status(200).json({
      reply: parsed.reply ?? content,
      flaggedTopic: parsed.flaggedTopic ?? null,
    })
  } catch (error) {
    console.error('Chat tutor error:', error)
    res.status(500).json({ error: error.message ?? 'Internal server error' })
  }
}
