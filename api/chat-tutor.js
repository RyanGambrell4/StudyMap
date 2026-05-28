import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { logAiCall } from '../lib/server/axiom.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 100000) return res.status(413).json({ error: 'Payload too large' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const {
    messages,
    courseName,
    examDate,
    targetGrade,
    coachPlan,
    struggles,
    professorEmphasis,
    strengths,
    learningStyle,
    preferredTime,
    yearLevel,
    firstName,
    recentRecallAvg,
    currentGradePct,
    brainDumpGaps,
    upcomingDeadlines,
  } = req.body
  if (!messages?.length || !courseName) return res.status(400).json({ error: 'Missing required fields' })

  let planContext = ''
  if (coachPlan?.weeklyFocus?.length) {
    planContext = coachPlan.weeklyFocus
      .slice(0, 6)
      .map(w => `  ${w.week}: ${w.theme}`)
      .join('\n')
  }

  const strugglesStr = struggles?.length ? struggles.join(', ') : null

  const learningStyleHint = learningStyle === 'visual'
    ? 'This student is a visual learner — use diagrams described in text, analogies, and structured visual breakdowns.'
    : learningStyle === 'reading'
    ? 'This student learns through reading & writing — use clear written explanations, bullet-point summaries, and structured notes.'
    : learningStyle === 'practice'
    ? 'This student is practice-based — lead with worked examples, practice questions, and active recall drills.'
    : null

  const personalLines = []
  if (firstName && typeof firstName === 'string' && firstName.trim()) {
    personalLines.push(`Student name: ${firstName.trim()}.`)
  }
  if (yearLevel && typeof yearLevel === 'string') {
    personalLines.push(`Audience: ${yearLevel} student.`)
  }
  if (preferredTime && typeof preferredTime === 'string') {
    personalLines.push(`Student studies best in the ${preferredTime}.`)
  }
  if (typeof recentRecallAvg === 'number' && Number.isFinite(recentRecallAvg)) {
    if (recentRecallAvg < 3) {
      personalLines.push(`Recent recall trend has been weak (${recentRecallAvg.toFixed(1)}/5). Slow down, repeat key ideas, check understanding more often.`)
    } else if (recentRecallAvg >= 4) {
      personalLines.push(`Recent recall has been strong (${recentRecallAvg.toFixed(1)}/5). Push deeper, ask harder follow-ups.`)
    }
  }
  if (typeof currentGradePct === 'number' && Number.isFinite(currentGradePct)) {
    personalLines.push(`Current grade in this course: ${currentGradePct.toFixed(0)}%.`)
  }
  if (Array.isArray(brainDumpGaps) && brainDumpGaps.length) {
    personalLines.push(`Known gaps from their last brain dump: ${brainDumpGaps.join('; ')}. Lean into these.`)
  }
  if (Array.isArray(upcomingDeadlines) && upcomingDeadlines.length) {
    personalLines.push(`Upcoming work: ${upcomingDeadlines.join('; ')}. Help them be ready for these.`)
  }
  const personalBlock = personalLines.length ? personalLines.join('\n') + '\n' : ''

  const systemPrompt = `You are a focused study tutor for ${courseName}. The student has an exam on ${examDate ?? 'an upcoming date'} and their goal is ${targetGrade ?? 'to do well'}.
${personalBlock}${planContext ? `Their current study plan covers:\n${planContext}` : ''}
${strugglesStr ? `Topics they have previously struggled with (spend extra time here): ${strugglesStr}` : ''}
${professorEmphasis ? `Professor emphasizes these topics (high exam priority): ${professorEmphasis}` : ''}
${strengths ? `Areas they are already solid on (brief review only): ${strengths}` : ''}
${learningStyleHint ?? ''}
Your job: help them understand course material clearly and efficiently. Be concise and direct. Use examples. If they paste notes, identify key concepts. Generate practice questions when asked.

Respond in plain text. If the student clearly expresses struggle or confusion about a specific topic, append exactly this on the very last line of your response (nothing after it):
[FLAGGED_TOPIC:topic name in 2-5 words]
Only include this line when the student is clearly struggling. Otherwise omit it entirely.`

  const recentMessages = messages.slice(-10)
  const latestUserMessage = recentMessages.filter(m => m.role === 'user').slice(-1)[0]?.content ?? ''

  // Try Wolfram Alpha for math/science/calculation queries
  let wolframContext = ''
  const mathPattern = /\b(solve|calculate|compute|integral|derivative|equation|factor|simplify|convert|what is \d|how many|square root|log|sin|cos|tan|percent|probability)\b/i
  if (mathPattern.test(latestUserMessage)) {
    try {
      const wolfRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://getstudyedge.com'}/api/wolfram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: latestUserMessage }),
      })
      const wolfData = await wolfRes.json()
      if (wolfData.available && wolfData.answer) {
        wolframContext = `\n\n[Wolfram Alpha computed result for this query: "${wolfData.answer}". Use this as ground truth for the calculation.]\n`
      }
    } catch {
      // Wolfram unavailable — proceed without it
    }
  }

  const effectiveSystemPrompt = systemPrompt + wolframContext

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const t0 = Date.now()

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        stream: true,
        system: [{ type: 'text', text: effectiveSystemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: recentMessages,
      }),
    })

    if (!anthropicRes.ok) {
      res.write(`data: ${JSON.stringify({ error: 'AI unavailable' })}\n\n`)
      res.end()
      return
    }

    const reader = anthropicRes.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              fullText += parsed.delta.text
              res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`)
            } else if (parsed.type === 'message_stop') {
              // Extract optional [FLAGGED_TOPIC:...] marker from end of plain text response
              let reply = fullText.trim()
              let flaggedTopic = null
              const flagMatch = reply.match(/\[FLAGGED_TOPIC:([^\]]+)\]\s*$/)
              if (flagMatch) {
                flaggedTopic = flagMatch[1].trim()
                reply = reply.slice(0, flagMatch.index).trim()
              }
              res.write(`data: ${JSON.stringify({ done: true, reply, flaggedTopic })}\n\n`)
            }
          } catch {}
        }
      }
    }

    logAiCall({
      endpoint: 'chat-tutor',
      userId: gate.userId,
      plan: gate.plan,
      latencyMs: Date.now() - t0,
    })

    res.end()
  } catch (error) {
    console.error('Chat tutor error:', error)
    res.write(`data: ${JSON.stringify({ error: error.message ?? 'Internal server error' })}\n\n`)
    res.end()
  }
}
