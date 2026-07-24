import { verifyAndCheckAiUsage } from '../lib/server/usage.js'
import { tracedCall } from '../lib/server/langfuse.js'
import { logAiCall } from '../lib/server/axiom.js'
import {
  ANTI_GUESSING_RULES,
  NO_STUDENT_CONTENT_DIRECTIVE,
  hasStudentContent,
} from '../lib/server/coachAntiGuessing.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 500000) return res.status(413).json({ error: 'Payload too large' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const {
    courseName,
    sessionType,
    durationMinutes,
    examDate,
    targetGrade,
    uploadedTopics,
    studentFocus,
    professorEmphasis,
    struggles,
    learningStyle,
    recallHistory,
    weakTopics,
    completedCount,
    recentRecallAvg,
    currentGradePct,
    preferredTime,
  } = req.body
  if (!courseName || !durationMinutes) return res.status(400).json({ error: 'Missing required fields' })

  const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|Reading Comprehension|FAR|AUD|REG|MBE|MEE|MPT|Verbal Reasoning|Quantitative Reasoning|Analytical Writing|Quantitative|Data Insights/i
  const isExamMode = EXAM_PATTERN.test(courseName)

  // Grounding check. If the student supplied NO topic/upload/focus/emphasis,
  // we skip the AI call entirely and return a neutral structural blueprint.
  // The AI is never asked to invent subject content from courseName alone.
  const grounded = hasStudentContent(uploadedTopics, studentFocus, professorEmphasis, struggles, weakTopics)

  const todayStr = new Date().toISOString().split('T')[0]
  const rawDaysUntilExam = examDate
    ? Math.round((new Date(examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000)
    : null
  const daysUntilExam = rawDaysUntilExam !== null && rawDaysUntilExam >= 0 ? rawDaysUntilExam : null

  // Neutral fallback: no student content → return method-only blocks, no AI.
  if (!grounded) {
    const neutral = neutralBlueprint({ durationMinutes, sessionType, isExamMode })
    return res.status(200).json(neutral)
  }

  const examLine = daysUntilExam !== null
    ? `Days until exam: ${daysUntilExam}`
    : 'No exam scheduled - design a normal study session, do NOT use exam-day language.'

  const recallContext = weakTopics?.length
    ? `\n\nIMPORTANT - This student's weak areas (recall score < 60%): ${weakTopics.join(', ')}. Prioritize these topics and allocate more time to active recall and practice problems for them.`
    : ''

  const experienceContext = completedCount > 0
    ? `\nStudent has completed ${completedCount} sessions for this course.`
    : `\nThis is one of the student's first sessions for this course - include orientation and overview time.`

  const avgRecall = recallHistory?.length
    ? Math.round(recallHistory.reduce((a, b) => a + b.score * 100, 0) / recallHistory.length)
    : null

  const recallTrendNote = avgRecall !== null
    ? `\nRecent average recall score: ${avgRecall}%. ${avgRecall < 50 ? 'This student is struggling - keep blocks shorter and increase active recall frequency.' : avgRecall < 70 ? 'Moderate retention - balance review with active recall.' : 'Strong retention - can handle deeper content and harder practice problems.'}`
    : ''

  const recentRecallAvgNote = typeof recentRecallAvg === 'number' && Number.isFinite(recentRecallAvg)
    ? `\nRecent recall avg: ${recentRecallAvg.toFixed(1)}/5. ${recentRecallAvg < 3 ? 'Shorten blocks, add a recall check every 8–10 minutes.' : recentRecallAvg >= 4 ? 'Allow deeper 25-min blocks before recall.' : ''}`
    : ''

  const currentGradeNote = typeof currentGradePct === 'number' && Number.isFinite(currentGradePct)
    ? `\nCurrent course grade: ${currentGradePct.toFixed(0)}%. Calibrate intensity.`
    : ''

  const preferredTimeNote = preferredTime && typeof preferredTime === 'string'
    ? `\nStudent is studying in the ${preferredTime}. ${preferredTime === 'Morning' ? 'Warm up with low-friction recall first.' : preferredTime === 'Evening' ? 'Front-load high-cognitive-load work before fatigue.' : ''}`
    : ''

  const personalContext = `${recentRecallAvgNote}${currentGradeNote}${preferredTimeNote}`

  // Grounded prompts always include ANTI_GUESSING_RULES. We removed the
  // fabricated-content fallbacks ('General course material', 'Most important
  // exam topics', 'High-yield content for this section') so a null field is
  // now a genuine null, not an invitation for the model to invent.
  const groundingBlock = [
    uploadedTopics    ? `Available study materials/topics (student-supplied): ${uploadedTopics}` : null,
    studentFocus      ? `Student wants to focus on: ${studentFocus}` : null,
    professorEmphasis ? `Professor emphasizes: ${professorEmphasis}. Weight blocks toward these topics.` : null,
    struggles?.length ? `Student struggles with: ${struggles.join(', ')}. Prioritize these in practice blocks.` : null,
  ].filter(Boolean).join('\n')

  const userContent = isExamMode ? `You are an elite professional exam prep coach designing a high-intensity study session for a licensing or admissions exam. Every block must be purposeful and exam-focused.

${ANTI_GUESSING_RULES}

Section: ${courseName}
Session type: ${sessionType || 'Content Review'}
Total duration: ${durationMinutes} minutes
${examLine}
Target score: ${targetGrade || 'Top score'}
${groundingBlock}
${experienceContext}${recallTrendNote}${personalContext}${recallContext}

Session type definitions and how to structure each:
- Content Review: systematic content pass through key concepts, notes, and mnemonics
- Practice Passage Block: timed passage or question sets with immediate self-scoring
- Full Length Exam: simulate real exam conditions - no interruptions, strict timing
- FL Review Session: detailed wrong-answer analysis from a recent full-length exam
- Active Recall Drill: flashcard and recall-based drilling of high-yield facts

Design the session with blocks that match the session type. Return ONLY this JSON:

{
  "sessionTitle": "sharp, exam-coach-style session name (must reference only the student-supplied focus or the session type)",
  "objective": "one sentence: the specific measurable outcome for this session",
  "blocks": [
    {
      "blockNumber": 1,
      "title": "block name (must reference only the student-supplied focus, a study method, or the session type)",
      "duration": 5,
      "activity": "one of: review, active-recall, practice-problems, timed-passages, fl-review, break",
      "instruction": "specific 1-2 sentence instruction that references the student-supplied focus and/or a study method. Never invent subject content.",
      "why": "one sentence on why this block builds exam performance"
    }
  ],
  "successNote": "one direct, coach-style closing statement"
}

Rules:
- Total block durations must add up to exactly ${durationMinutes} minutes
- For Practice Passage Block / Full Length Exam: most blocks should be timed-passages (10-15 min chunks)
- For FL Review Session: blocks should be fl-review focused on wrong answers by category
- For Content Review / Active Recall Drill: alternate review and active-recall blocks
- Always start with a 5-min activation block (recall what you know before reviewing)
- Always end with a 5-min consolidation block (what did you learn? what still needs work?)
- Include one 5-min break if session is over 60 minutes
- Instructions must reference student-supplied focus or study methods only. If the student did not name a focus, describe an activity (e.g., "Timed passage set on the assigned reading"), never a fabricated topic.
- Do not use em dashes in any field` : `You are an expert academic study strategist designing a focused, structured study session. Your goal is to help the student walk in knowing exactly what to tackle and walk out having made real progress.

${ANTI_GUESSING_RULES}

Course: ${courseName}
Session type: ${sessionType}
Total duration: ${durationMinutes} minutes
${examLine}
Target grade: ${targetGrade || 'B'}
${groundingBlock}
${learningStyle === 'visual' ? 'Learning style: visual - include concept-mapping and diagram-review blocks.' : learningStyle === 'practice' ? 'Learning style: practice-based - weight blocks toward active recall and practice problems.' : learningStyle === 'reading' ? 'Learning style: reading/writing - include structured note-review and summary blocks.' : ''}${experienceContext}${recallTrendNote}${personalContext}${recallContext}

Design a structured study session broken into specific timed blocks. Each block should have a clear purpose that builds toward the student's goal for this session. Return ONLY this JSON:

{
  "sessionTitle": "short motivating session name (must reference only the student-supplied focus or a study method)",
  "objective": "one sentence: what the student will achieve in this session",
  "blocks": [
    {
      "blockNumber": 1,
      "title": "block name (must reference only the student-supplied focus or a study method)",
      "duration": 5,
      "activity": "one of: review, active-recall, flashcards, practice-problems, summary, break",
      "instruction": "specific 1-2 sentence instruction that references the student-supplied focus and/or a study method. Never invent subject content.",
      "why": "one sentence explaining why this block matters"
    }
  ],
  "successNote": "one encouraging sentence for when the session is complete"
}

Rules:
- Total block durations must add up to exactly ${durationMinutes} minutes
- Start with a short 5-min warm-up block (review/recall activation)
- End with a 5-10 min summary block
- Middle blocks should alternate between review and active-recall or practice
- If exam is less than 7 days away, weight heavily toward practice and recall
- Instructions must reference student-supplied focus or study methods only. If the student did not name a focus, describe an activity (e.g., "Active recall on this week's assigned reading"), never a fabricated topic.
- Include a 5-min break block if session is over 50 minutes, placed after the halfway point
- Do not use em dashes in any field`

  const messages = [{ role: 'user', content: [{ type: 'text', text: userContent, cache_control: { type: 'ephemeral' } }] }]

  const t0 = Date.now()

  try {
    const data = await tracedCall({
      name: 'session-blueprint',
      userId: gate.userId,
      model: 'claude-haiku-4-5-20251001',
      input: { messages },
      maxTokens: 2000,
      call: () => fetch('https://api.anthropic.com/v1/messages', {
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
          messages,
        }),
      }).then(r => r.json()),
    })

    logAiCall({
      endpoint: 'session-blueprint',
      userId: gate.userId,
      plan: gate.plan,
      latencyMs: Date.now() - t0,
      tokens: {
        input: data.usage?.input_tokens,
        output: data.usage?.output_tokens,
        total: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    })

    const content = data.content?.[0]?.text
    if (!content) throw new Error(data.error?.message ?? 'Empty AI response')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    const blueprint = JSON.parse(content.slice(first, last + 1))
    res.status(200).json(blueprint)
  } catch (error) {
    console.error('Blueprint error:', error)
    console.error(error)
    res.status(500).json({ error: error.message ?? 'Internal server error' })
  }
}

// ─── Neutral structural blueprint (no AI, no student content) ─────────────────
// Returned when the student has not supplied any topic/focus/upload/struggle.
// Every block references a study method or activity, never a subject fact.
function neutralBlueprint({ durationMinutes, sessionType, isExamMode }) {
  const d = Math.max(15, Math.min(240, Number(durationMinutes) || 45))
  const label = sessionType || (isExamMode ? 'Content Review' : 'Study Session')

  // Compose blocks that always sum to `d`. Warm-up 5, summary 5, optional break
  // 5 if d > 50. Middle is split between recall and review/practice.
  const blocks = []
  let remaining = d
  blocks.push({
    blockNumber: 1,
    title: 'Warm-up recall',
    duration: 5,
    activity: 'active-recall',
    instruction: 'Before opening any material, write down or say aloud everything you already know about today\'s topic. Two minutes on a blank page, three minutes reviewing your list.',
    why: 'Priming retrieval before study strengthens encoding of what comes next.',
  })
  remaining -= 5

  // Reserve trailing summary and optional break
  const hasBreak = d > 50
  const summaryLen = 5
  const breakLen = hasBreak ? 5 : 0
  const middleLen = remaining - summaryLen - breakLen

  if (middleLen > 0) {
    if (hasBreak) {
      const half = Math.floor(middleLen / 2)
      blocks.push({
        blockNumber: 2,
        title: 'Active review',
        duration: half,
        activity: 'review',
        instruction: 'Work through your assigned reading or lecture notes. After each section, close the material and try to recall the main idea in one sentence.',
        why: 'Retrieval after each section catches gaps before they compound.',
      })
      blocks.push({
        blockNumber: 3,
        title: 'Break',
        duration: breakLen,
        activity: 'break',
        instruction: 'Stand up, walk away from the screen, drink water. No phone.',
        why: 'A short mid-session break preserves focus for the second half.',
      })
      blocks.push({
        blockNumber: 4,
        title: 'Recall drill',
        duration: middleLen - half,
        activity: 'active-recall',
        instruction: 'Cover your notes and self-quiz on the concepts you just reviewed. Say the answer out loud or write it before you check.',
        why: 'Effortful retrieval is what moves information into durable memory.',
      })
    } else {
      const half = Math.floor(middleLen / 2)
      blocks.push({
        blockNumber: 2,
        title: 'Active review',
        duration: half,
        activity: 'review',
        instruction: 'Work through your assigned reading or lecture notes. After each section, close the material and try to recall the main idea in one sentence.',
        why: 'Retrieval after each section catches gaps before they compound.',
      })
      blocks.push({
        blockNumber: 3,
        title: 'Recall drill',
        duration: middleLen - half,
        activity: 'active-recall',
        instruction: 'Cover your notes and self-quiz on the concepts you just reviewed. Say the answer out loud or write it before you check.',
        why: 'Effortful retrieval is what moves information into durable memory.',
      })
    }
  }

  blocks.push({
    blockNumber: blocks.length + 1,
    title: 'Consolidation',
    duration: summaryLen,
    activity: 'summary',
    instruction: 'Write two lines: one thing you now understand better, one thing that is still fuzzy and needs another pass.',
    why: 'Naming the fuzzy part turns it into your next-session priority.',
  })

  return {
    sessionTitle: label,
    objective: 'Build retention and identify weak spots in your assigned material.',
    blocks,
    successNote: 'Good session. The consolidation note is your starting point next time.',
  }
}
