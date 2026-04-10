export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const contentLength = parseInt(req.headers['content-length'] || '0')
  if (contentLength > 500000) return res.status(413).json({ error: 'Payload too large' })

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

  const { conflictingSessions, googleEvents, timePreference } = req.body
  if (!conflictingSessions?.length) return res.status(400).json({ error: 'No conflicting sessions provided' })

  const TIME_WINDOWS = {
    Morning:   '6am–12pm',
    Afternoon: '12pm–6pm',
    Evening:   '6pm–10pm',
  }
  const prefWindow = TIME_WINDOWS[timePreference] ?? TIME_WINDOWS.Morning

  const sessionList = conflictingSessions.map(s =>
    `- id:${s.id} | ${s.dateStr}: ${s.courseName} (${s.sessionType}, ${s.duration}min) currently at ${s.startTime ?? 'unscheduled'}`
  ).join('\n')

  const blockedList = googleEvents?.length
    ? googleEvents.map(e => {
        if (e.allDay || !e.start?.includes('T')) return `- ${e.start?.split('T')[0] ?? ''}: ${e.title} (all day)`
        const sDate = new Date(e.start)
        const eDate = e.end ? new Date(e.end) : null
        const fmt = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        return `- ${e.start.split('T')[0]}: ${e.title} (${fmt(sDate)}–${eDate ? fmt(eDate) : 'end unknown'})`
      }).join('\n')
    : 'None'

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
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a scheduling assistant. The following study sessions conflict with the student's Google Calendar events.

Conflicting sessions:
${sessionList}

All blocked times (Google Calendar events):
${blockedList}

The student prefers studying in the ${timePreference ?? 'morning'} (${prefWindow}).

For each conflicting session, suggest a new time slot on the SAME date that:
1. Does not overlap with any blocked event above
2. Prefers the ${timePreference ?? 'morning'} window (${prefWindow})
3. Keeps the exact same duration

Return ONLY a JSON array, no other text:
[
  {
    "sessionId": "the id from the session",
    "date": "YYYY-MM-DD",
    "suggestedStart": "H:MM AM/PM",
    "suggestedEnd": "H:MM AM/PM",
    "reason": "one sentence explanation"
  }
]`,
        }],
      }),
    })

    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) throw new Error(data.error?.message ?? 'Empty AI response')
    const first = content.indexOf('[')
    const last  = content.lastIndexOf(']')
    const suggestions = JSON.parse(content.slice(first, last + 1))
    res.status(200).json({ suggestions })
  } catch (error) {
    console.error('[reschedule-conflicts] error:', error)
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
