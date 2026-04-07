export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { courseName, sessionType, durationMinutes, examDate, targetGrade, uploadedTopics, studentFocus } = req.body
  if (!courseName || !durationMinutes) return res.status(400).json({ error: 'Missing required fields' })

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
          content: `You are an expert academic study strategist designing a focused, structured study session. Your goal is to help the student walk in knowing exactly what to tackle and walk out having made real progress.

Course: ${courseName}
Session type: ${sessionType}
Total duration: ${durationMinutes} minutes
Days until exam: ${daysUntilExam}
Target grade: ${targetGrade || 'B'}
Available study materials/topics: ${uploadedTopics || 'General course material'}
Student wants to focus on: ${studentFocus || 'Most important exam topics'}

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
    const content = data.content[0].text
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    const blueprint = JSON.parse(content.slice(first, last + 1))
    res.status(200).json(blueprint)
  } catch (error) {
    console.error('Blueprint error:', error)
    res.status(500).json({ error: error.message })
  }
}
