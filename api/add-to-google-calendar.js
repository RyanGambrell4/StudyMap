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

  const { userId, title, description, startDateTime, endDateTime, date } = req.body
  if (!userId || !title) return res.status(400).json({ error: 'userId and title required' })

  const userData = await verifyRes.json()
  if (userData.id !== userId) return res.status(403).json({ error: 'Forbidden' })

  try {
    const supabaseUrl = process.env.SUPABASE_URL
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

    if (!gcal?.refresh_token) return res.status(400).json({ error: 'Google Calendar not connected' })

    const accessToken = await getAccessToken(gcal.refresh_token)
    if (!accessToken) return res.status(500).json({ error: 'Failed to get access token' })

    // Build event — prefer dateTime (timed) over date (all-day)
    const event = {
      summary: title,
      description: description || undefined,
      start: startDateTime
        ? { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : { date },
      end: endDateTime
        ? { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : { date: date || startDateTime?.split('T')[0] },
    }

    const createRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    )
    const created = await createRes.json()

    if (created.error) { console.error('[add-to-google-calendar] Google API error:', created.error); return res.status(500).json({ error: 'Internal server error' }) }

    res.status(200).json({ success: true, eventId: created.id, htmlLink: created.htmlLink })
  } catch (err) {
    console.error('[add-to-google-calendar] Error:', err)
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
