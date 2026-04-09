async function getAccessToken(refreshToken) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  const data = await tokenRes.json()
  return data.access_token ?? null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY

    const getRes = await fetch(
      `${supabaseUrl}/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}&select=study_tools`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    )
    const rows = await getRes.json()
    const gcal = rows[0]?.study_tools?.google_calendar

    if (!gcal?.refresh_token) return res.status(200).json({ events: [], connected: false })

    const accessToken = await getAccessToken(gcal.refresh_token)
    if (!accessToken) return res.status(200).json({ events: [], connected: true })

    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const calData = await calRes.json()

    if (calData.error) {
      console.error('[google-calendar-events] API error:', calData.error)
      return res.status(200).json({ events: [], connected: true })
    }

    const events = (calData.items ?? []).map(e => ({
      id: e.id,
      title: e.summary || '(No title)',
      start: e.start.dateTime || e.start.date,
      end: e.end?.dateTime || e.end?.date,
      allDay: !e.start.dateTime,
    }))

    res.status(200).json({ events, connected: true })
  } catch (err) {
    console.error('[google-calendar-events] Error:', err)
    res.status(500).json({ error: err.message })
  }
}
