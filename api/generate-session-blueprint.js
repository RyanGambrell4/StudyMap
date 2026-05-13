import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 500000) return res.status(413).json({ error: 'Payload too large' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, sessionType, durationMinutes, examDate, targetGrade, uploadedTopics, studentFocus, professorEmphasis, struggles, learningStyle } = req.body
  if (!courseName || !durationMinutes) return res.status(400).json({ error: 'Missing required fields' })

  const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|Reading Comprehension|FAR|AUD|REG|MBE|MEE|MPT|Verbal Reasoning|Quantitative Reasoning|Analytical Writing|Quantitative|Data Insights/i
  const isExamMode = EXAM_PATTERN.test(courseName)

  const todayStr = new Date().toISOString().split('T')[0]
  const daysUntilExam = examDate
    ? Math.max(0, Math.round((new Date(examDate + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000))
    : 30

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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: isExamMode ? `You are an elite professional exam prep coach designing a high-intensity study session for a licensing or admissions exam. Every block must be purposeful and exam-focused.

Section: ${courseName}
Session type: ${sessionType || 'Content Review'}
Total duration: ${durationMinutes} minutes
Days until exam: ${daysUntilExam}
Target score: ${targetGrade || 'Top score'}
Focus area: ${studentFocus || 'High-yield content for this section'}
${professorEmphasis ? `Professor-emphasized topics (highest priority): ${professorEmphasis}` : ''}
${struggles?.length ? `Student struggles with: ${struggles.join(', ')} — allocate extra drill time here` : ''}

Session type definitions and how to structure each:
- Content Review: systematic content pass through key concepts, notes, and mnemonics
- Practice Passage Block: timed passage or question sets with immediate self-scoring
- Full Length Exam: simulate real exam conditions — no interruptions, strict timing
- FL Review Session: detailed wrong-answer analysis from a recent full-length exam
- Active Recall Drill: flashcard and recall-based drilling of high-yield facts

Design the session with blocks that match the session type. Return ONLY this JSON:

{
  "sessionTitle": "sharp, exam-coach-style session name like 'CARS Passage Assault — 60 min block'",
  "objective": "one sentence: the specific measurable outcome for this session",
  "blocks": [
    {
      "blockNumber": 1,
      "title": "block name like 'Activation Recall' or 'Timed Passage Set 1'",
      "duration": 5,
      "activity": "one of: review, active-recall, practice-problems, timed-passages, fl-review, break",
      "instruction": "specific 1-2 sentence instruction — reference the section and session type directly",
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
- Instructions must be specific to ${courseName}, not generic` : `You are an expert academic study strategist designing a focused, structured study session. Your goal is to help the student walk in knowing exactly what to tackle and walk out having made real progress.

Course: ${courseName}
Session type: ${sessionType}
Total duration: ${durationMinutes} minutes
Days until exam: ${daysUntilExam}
Target grade: ${targetGrade || 'B'}
Available study materials/topics: ${uploadedTopics || 'General course material'}
Student wants to focus on: ${studentFocus || 'Most important exam topics'}
${professorEmphasis ? `Professor emphasizes: ${professorEmphasis}. Weight blocks toward these topics.` : ''}
${struggles?.length ? `Student struggles with: ${struggles.join(', ')}. Prioritize these in practice blocks.` : ''}
${learningStyle === 'visual' ? 'Learning style: visual — include concept-mapping and diagram-review blocks.' : learningStyle === 'practice' ? 'Learning style: practice-based — weight blocks toward active recall and practice problems.' : learningStyle === 'reading' ? 'Learning style: reading/writing — include structured note-review and summary blocks.' : ''}

Design a structured study session broken into specific timed blocks. Each block should have a clear purpose that builds toward the student's goal for this session. Return ONLY this JSON:

{
  "sessionTitle": "short motivating session name like 'Final Push — Formula Mastery'",
  "objective": "one sentence: what the student will achieve in this session",
  "blocks": [
    {
      "blockNumber": 1,
      "title": "block name like 'Warm Up Recall' or 'Deep Concept Review'",
      "duration": 5,
      "activity": "one of: review, active-recall, flashcards, practice-problems, summary, break",
      "instruction": "specific 1-2 sentence instruction for exactly what to do",
      "why": "one sentence explaining why this block matters for the exam"
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
- Make instructions specific to the course and session type, not generic
- Include a 5-min break block if session is over 50 minutes, placed after the halfway point`,
        }],
      }),
    })

    const data = await response.json()
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
