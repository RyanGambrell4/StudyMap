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
  console.log('[google-calendar-events] getAccessToken response:', JSON.stringify({ access_token: data.access_token ? '***present***' : null, error: data.error, error_description: data.error_description }))
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

  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const userData = await verifyRes.json()
  if (userData.id !== userId) return res.status(403).json({ error: 'Forbidden' })

  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    console.log('[google-calendar-events] SUPABASE_URL set:', !!supabaseUrl, '| SERVICE_KEY set:', !!serviceKey)

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
    console.log('[google-calendar-events] Supabase row found:', !!rows[0], '| study_tools keys:', Object.keys(rows[0]?.study_tools ?? {}), '| refresh_token present:', !!gcal?.refresh_token)

    if (!gcal?.refresh_token) {
      console.log('[google-calendar-events] No refresh token — returning not connected')
      return res.status(200).json({ events: [], connected: false })
    }

    const accessToken = await getAccessToken(gcal.refresh_token)
    if (!accessToken) {
      console.log('[google-calendar-events] getAccessToken returned null — token exchange failed')
      return res.status(200).json({ events: [], connected: true })
    }

    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const calData = await calRes.json()
    console.log('[google-calendar-events] Google Calendar API response — error:', calData.error ?? null, '| items count:', calData.items?.length ?? 0)

    if (calData.error) {
      console.error('[google-calendar-events] Google API error:', JSON.stringify(calData.error))
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
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
