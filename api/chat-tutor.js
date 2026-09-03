import { reserveAiUsage, verifyAuth } from '../lib/server/usage.js'
import { USER_ERRORS, sendUserError } from '../lib/server/userErrors.js'
import { logAiCall } from '../lib/server/axiom.js'
import { getCourseContext, formatCourseContextForPrompt, resolveCourseId } from '../lib/server/courseContext.js'
import { ANTI_GUESSING_RULES } from '../lib/server/coachAntiGuessing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 100000) return res.status(413).json({ error: 'Payload too large' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const {
    messages,
    tutorMemory,
    courseName,
    courseId: bodyCourseId,
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
  } = req.body || {}
  if (!messages?.length) return sendUserError(res, 'missing_input', 'chat-tutor: empty messages array')

  let courseId = bodyCourseId
  if (!courseId && courseName) courseId = await resolveCourseId(auth.userId, courseName)
  if (!courseId) return sendUserError(res, 'course_required', `chat-tutor: no courseId resolved (courseName=${courseName ?? 'none'})`)

  // Quota is reserved only now, once the request is known to be well formed.
  // It used to be taken at the top of the handler, so a request that was about
  // to be rejected for a missing course still cost the user an AI action.
  const gate = await reserveAiUsage(req, { verified: auth })
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })


  // Extract the latest user message once — we use it for both the topic
  // hint into getCourseContext (so materials retrieval targets what the
  // student is actually asking about) and the Wolfram Alpha pattern check.
  const latestUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content ?? ''

  let brain
  try {
    brain = await getCourseContext(gate.userId, courseId, {
      topic: typeof latestUserMessage === 'string' ? latestUserMessage.slice(0, 200) : null,
      request: req,
    })
  } catch (err) {
    console.error('[chat-tutor] getCourseContext failed', err)
    return sendUserError(res, 'course_context_failed', err)
  }
  const resolvedCourseName = brain.identity?.name || courseName
  const serverContextBlock = formatCourseContextForPrompt(brain)

  // Direct probe hint from mastery. The topics block in serverContextBlock
  // already carries per-topic mastery; this line surfaces the shortlist so
  // the tutor can proactively steer toward weak areas rather than waiting
  // for the student to ask.
  const weakestTopics = (brain?.topics?.items ?? [])
    .filter(t => typeof t.mastery === 'number' && t.mastery < 60)
    .sort((a, b) => (a.mastery ?? 999) - (b.mastery ?? 999))
    .slice(0, 3)
    .map(t => t.name)
  const weakestProbeLine = weakestTopics.length
    ? `Student is currently weakest at: ${weakestTopics.join(', ')}. When relevant to what they are asking, connect the answer to one of these and offer a short check-for-understanding.`
    : ''

  let planContext = ''
  if (coachPlan?.weeklyFocus?.length) {
    planContext = coachPlan.weeklyFocus
      .slice(0, 6)
      .map(w => `  ${w.week}: ${w.theme}`)
      .join('\n')
  }

  const strugglesStr = struggles?.length ? struggles.join(', ') : null

  const learningStyleHint = learningStyle === 'visual'
    ? 'This student is a visual learner - use diagrams described in text, analogies, and structured visual breakdowns.'
    : learningStyle === 'reading'
    ? 'This student learns through reading & writing - use clear written explanations, bullet-point summaries, and structured notes.'
    : learningStyle === 'practice'
    ? 'This student is practice-based - lead with worked examples, practice questions, and active recall drills.'
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

  const systemPrompt = `You are a focused study tutor for ${resolvedCourseName}. The student has an exam on ${examDate ?? 'an upcoming date'} and their goal is ${targetGrade ?? 'to do well'}.

${ANTI_GUESSING_RULES}

${serverContextBlock}

${personalBlock}${planContext ? `Their current study plan covers:\n${planContext}` : ''}
${weakestProbeLine}
${strugglesStr ? `Topics they have previously struggled with (spend extra time here): ${strugglesStr}` : ''}
${professorEmphasis ? `Professor emphasizes these topics (high exam priority): ${professorEmphasis}` : ''}
${strengths ? `Areas they are already solid on (brief review only): ${strengths}` : ''}
${learningStyleHint ?? ''}
Your job: help them understand course material clearly and efficiently. Be concise and direct. Use examples. If they paste notes, identify key concepts. Generate practice questions when asked.

Respond in plain text. Do not use em dashes. If the student clearly expresses struggle or confusion about a specific topic, append exactly this on the very last line of your response (nothing after it):
[FLAGGED_TOPIC:topic name in 2-5 words]
Only include this line when the student is clearly struggling. Otherwise omit it entirely.`

  // Unlimited clients pass tutorMemory: true and we honor the full session.
  // Cap at 60 messages as a server-side safety net so a runaway client can't
  // blow the context window.
  const recentMessages = tutorMemory === true ? messages.slice(-60) : messages.slice(-10)

  // The Wolfram Alpha lookup that used to sit here is gone, along with
  // api/wolfram.js.
  //
  // It never once ran. This handler called our own /api/wolfram over HTTP with
  // no Authorization header, and that endpoint starts with verifyAuth, so the
  // fetch got back {"error":"Unauthorized"} every time. `wolfData.available`
  // was undefined, the branch never fired, and nothing was ever added to the
  // prompt. Confirmed against production before removing it: an unauthenticated
  // POST to /api/wolfram returns 401, which is exactly the request this made.
  //
  // So this cost nothing and delivered nothing, while adding a full extra HTTP
  // round trip to every tutor message that mentioned a number, inside the
  // latency budget of a streaming response.
  const effectiveSystemPrompt = systemPrompt

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

    // The stream completed, so charge for it. This is awaited before res.end()
    // because ending the response ends the function invocation, and a write
    // still in flight at that point is not guaranteed to land.
    await gate.commit?.()

    res.end()
  } catch (error) {
    console.error('Chat tutor error:', error)
    res.write(`data: ${JSON.stringify({ error: USER_ERRORS.unexpected.error, code: USER_ERRORS.unexpected.code })}\n\n`)
    res.end()
  }
}
