export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { courseName, goal, emphasisTopics, importantDates, daysPerWeek, sessionMinutes, calendarEvents, timePreference } = req.body
  if (!courseName || !goal) return res.status(400).json({ error: 'Missing required fields' })

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
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are an expert academic strategist building a comprehensive, week-by-week study plan for a student.

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
Build a focused, realistic study plan starting from today. Generate enough weeks to cover all important dates, with the right session count per week (${daysPerWeek || 3} sessions/week).

Return ONLY this JSON:

{
  "summary": "2-3 sentence overview of the study strategy and why it fits this student's goal",
  "weeklyFocus": [
    {
      "week": "Week of [Month Day]",
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
- Generate exactly ${daysPerWeek || 3} sessions per week
- Make focusArea and keyTopics highly specific to the course content, not generic
- Make studyMethod specific and actionable (mention exact techniques)
- warningZones should be honest and specific — things that actually trip students up in this subject
- If there are important dates, weight the weeks before them appropriately (ramp up intensity)
- Generate enough weeks to cover all listed dates plus 1-2 weeks before the last one`,
        }],
      }),
    })

    const data = await response.json()
    const content = data.content[0].text
    const first = content.indexOf('{')
    const last = content.lastIndexOf('}')
    const plan = JSON.parse(content.slice(first, last + 1))
    res.status(200).json(plan)
  } catch (error) {
    console.error('Study coach plan error:', error)
    res.status(500).json({ error: error.message })
  }
}
