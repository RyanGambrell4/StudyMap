import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 500000) return res.status(413).json({ error: 'Payload too large' })

  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const { courseName, goal, emphasisTopics, importantDates, daysPerWeek, sessionMinutes, calendarEvents, timePreference, struggles, gradeGap, weakAreas, courseMaterials } = req.body
  if (!courseName || !goal) return res.status(400).json({ error: 'Missing required fields' })

  const EXAM_PATTERN = /C\/P|CARS|B\/B|P\/S|Logical Reasoning|Analytical Reasoning|Reading Comprehension|FAR|AUD|REG|MBE|MEE|MPT|Verbal Reasoning|Quantitative Reasoning|Analytical Writing|Quantitative|Data Insights/i
  const isExamMode = EXAM_PATTERN.test(courseName)

  const todayStr = new Date().toISOString().split('T')[0]
  const datesStr = importantDates?.length
    ? importantDates.map(d => `${d.label} — ${d.date}`).join('\n')
    : 'No specific dates provided'

  const TIME_WINDOWS = {
    Morning:   { label: 'morning',   hours: '6am–12pm' },
    Afternoon: { label: 'afternoon', hours: '12pm–6pm' },
    Evening:   { label: 'evening',   hours: '6pm–10pm' },
  }
  const pref = TIME_WINDOWS[timePreference] ?? TIME_WINDOWS.Morning

  const calendarStr = calendarEvents?.length
    ? calendarEvents.slice(0, 50).map(e => {
        if (e.allDay || !e.start?.includes('T')) {
          return `- ${e.start?.split('T')[0] ?? ''}: ${e.title} (all day)`
        }
        const sDate = new Date(e.start)
        const eDate = e.end ? new Date(e.end) : null
        const fmt = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        return `- ${e.start.split('T')[0]}: ${e.title} (${fmt(sDate)}–${eDate ? fmt(eDate) : 'end unknown'})`
      }).join('\n')
    : null

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
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: isExamMode ? `You are an elite professional exam prep coach. Build a phase-based study plan for a student preparing for a high-stakes licensing or admissions exam.

Section: ${courseName}
Target score / goal: ${goal}
Study days per week: ${daysPerWeek || 5}
Session length: ${sessionMinutes || 90} minutes
Today's date: ${todayStr}

Exam date / prep timeline:
${datesStr}
${calendarStr ? `\nBlocked times (never schedule over these):\n${calendarStr}\nPreferred study window: ${pref.hours}\n` : `Preferred study window: ${pref.hours}`}
${struggles?.length ? `\nWeak areas requiring extra reps: ${struggles.join(', ')}\n` : ''}

Structure the plan across FOUR phases in order:
1. Content Foundation — master the core content systematically. Session types: Content Review, Active Recall Drill
2. Practice & Passages — build speed and accuracy with practice problems. Session types: Practice Passage Block, Active Recall Drill
3. Official Material Focus — work through official prep materials (AAMC, LSAC, AICPA, etc.). Session types: Practice Passage Block, Full Length Exam, FL Review Session
4. Final Crunch — targeted weak-area elimination and test simulation. Session types: Full Length Exam, FL Review Session, Active Recall Drill

Assign each week to the appropriate phase based on the timeline. Weeks close to the exam should be in Phase 3–4.

Return ONLY this JSON:

{
  "summary": "2-3 sentence strategy overview written like a serious exam coach, not a school planner",
  "weeklyFocus": [
    {
      "week": "Week of [Month Day]",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "theme": "Phase [1-4]: [what this week targets] — e.g. 'Phase 1: Electrochemistry & Thermodynamics'",
      "sessions": [
        {
          "sessionLabel": "Session 1",
          "focusArea": "specific content area or passage type",
          "goal": "what the student should hit by end of session",
          "keyTopics": ["topic 1", "topic 2", "topic 3"],
          "studyMethod": "one of: Content Review, Practice Passage Block, Full Length Exam, FL Review Session, Active Recall Drill",
          "duration": ${sessionMinutes || 90}
        }
      ]
    }
  ],
  "priorityTopics": ["high-yield topic 1", "high-yield topic 2", "high-yield topic 3", "high-yield topic 4", "high-yield topic 5"],
  "warningZones": ["common trap 1", "area students underestimate 2", "timing/pacing issue 3"]
}

Rules:
- Each week MUST have startDate (Monday) and endDate (Sunday) as YYYY-MM-DD
- Generate exactly ${daysPerWeek || 5} sessions per week
- theme MUST start with the phase label: "Phase 1:", "Phase 2:", "Phase 3:", or "Phase 4:"
- studyMethod must be one of the five exam session types listed above
- Keep all strings SHORT — focusArea max 8 words, keyTopics max 4 words each
- Generate enough weeks to reach the exam date, ramping intensity in later phases
- CRITICAL: compact JSON only, no prose outside the JSON` : `You are an expert academic strategist building a comprehensive, week-by-week study plan for a student.

Course: ${courseName}
Student's goal: ${goal}
Topics the professor emphasizes: ${emphasisTopics || 'Not specified'}
Available study days per week: ${daysPerWeek || 3}
Typical session length: ${sessionMinutes || 60} minutes
Today's date: ${todayStr}

Important upcoming dates:
${datesStr}
${calendarStr ? `
CRITICAL: Never schedule study sessions during the following blocked time slots. These are the student's real calendar events and must not be overlapped under any circumstances. The student's preferred study time is ${timePreference ?? 'Morning'}. Always schedule sessions during ${pref.hours} first (morning = 6am-12pm, afternoon = 12pm-6pm, evening = 6pm-10pm). Only use other times if the preferred window is fully blocked.

Blocked time slots:
${calendarStr}
` : `The student prefers studying in the ${pref.label} (${pref.hours}). Schedule sessions in that window whenever possible.`}
${courseMaterials ? `\nThe student has provided the following course material for context:\n${courseMaterials.slice(0, 8000)}\n` : ''}${struggles?.length ? `\nPreviously identified struggle areas — allocate MORE sessions and deeper coverage to these: ${struggles.join(', ')}\n` : ''}${gradeGap != null && gradeGap < 0 ? `\nGRADE ALERT: Student is ${Math.abs(gradeGap).toFixed(1)} points below their target grade. ${weakAreas?.length ? `Weak areas: ${weakAreas.join(', ')}. ` : ''}Significantly increase session intensity and prioritize recovery for these topics.\n` : ''}Build a focused, realistic study plan starting from today. Generate enough weeks to cover all important dates, with the right session count per week (${daysPerWeek || 3} sessions/week).

Return ONLY this JSON:

{
  "summary": "2-3 sentence overview of the study strategy and why it fits this student's goal",
  "weeklyFocus": [
    {
      "week": "Week of [Month Day]",
      "startDate": "YYYY-MM-DD (Monday of this week)",
      "endDate": "YYYY-MM-DD (Sunday of this week)",
      "theme": "what this week is fundamentally about — e.g. 'Building foundational understanding'",
      "sessions": [
        {
          "sessionLabel": "Session 1",
          "focusArea": "specific topic or concept to cover this session",
          "goal": "what the student should be able to do or understand by the end of this session",
          "keyTopics": ["specific topic 1", "specific topic 2", "specific topic 3"],
          "studyMethod": "recommended approach — e.g. Active recall + practice problems, or Concept mapping + flashcards",
          "duration": ${sessionMinutes || 60}
        }
      ]
    }
  ],
  "priorityTopics": ["most important topic 1", "most important topic 2", "most important topic 3", "most important topic 4", "most important topic 5"],
  "warningZones": ["thing student is likely to neglect 1", "thing student is likely to underestimate 2", "common mistake 3"]
}

Rules:
- Each week MUST include startDate (YYYY-MM-DD, the Monday) and endDate (YYYY-MM-DD, the Sunday)
- Generate exactly ${daysPerWeek || 3} sessions per week
- Make focusArea and keyTopics highly specific to the course content, not generic
- Keep all string values SHORT — focusArea max 8 words, goal max 12 words, keyTopics max 4 words each, studyMethod max 8 words
- warningZones: max 10 words each, 3 items only
- priorityTopics: max 5 words each, 5 items only
- If there are important dates, weight the weeks before them appropriately (ramp up intensity)
- Generate enough weeks to cover all listed dates plus 1 week before the last one
- CRITICAL: Keep response compact — short strings only, no verbose explanations`,
        }],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message ?? `Anthropic API error ${response.status}`)
    }
    const content = data.content?.[0]?.text
    if (!content) throw new Error('Empty response from AI')
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    if (first === -1 || last === -1) throw new Error('AI response was not valid JSON')
    const plan = JSON.parse(content.slice(first, last + 1))
    res.status(200).json(plan)
  } catch (error) {
    console.error('Study coach plan error:', error)
    res.status(500).json({ error: error.message ?? 'Internal server error' })
  }
}
