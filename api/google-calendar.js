/**
 * google-calendar.js — Consolidated Google Calendar + Notion calendar handler
 *
 * POST /api/google-calendar              → fetch events (google + notion)
 * POST /api/google-calendar?action=add   → add event to Google Calendar
 *
 * Replaces api/google-calendar-events.js and api/add-to-google-calendar.js
 * to stay within Vercel Hobby's 12-function limit.
 */

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

async function fetchGoogleEvents(refreshToken) {
  const accessToken = await getAccessToken(refreshToken)
  if (!accessToken) return []

  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const calRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const calData = await calRes.json()
  if (calData.error) return []

  return (calData.items ?? []).map(e => ({
    id: e.id,
    title: e.summary || '(No title)',
    start: e.start.dateTime || e.start.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: !e.start.dateTime,
    source: 'google',
  }))
}

async function fetchNotionEvents(accessToken) {
  try {
    const now = new Date()
    const twoWeeksLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    const startDate = now.toISOString().split('T')[0]
    const endDate = twoWeeksLater.toISOString().split('T')[0]

    const searchRes = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { value: 'database', property: 'object' },
        page_size: 20,
      }),
    })
    const searchData = await searchRes.json()
    if (!searchData.results?.length) return []

    const events = []

    for (const db of searchData.results) {
      const props = db.properties ?? {}
      const dateProps = Object.entries(props).filter(([, v]) => v.type === 'date')
      if (!dateProps.length) continue

      const datePropName = dateProps[0][0]
      const titleProp = Object.entries(props).find(([, v]) => v.type === 'title')
      const titlePropName = titleProp ? titleProp[0] : null

      const queryRes = await fetch(`https://api.notion.com/v1/databases/${db.id}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            and: [
              { property: datePropName, date: { on_or_after: startDate } },
              { property: datePropName, date: { on_or_before: endDate } },
            ],
          },
          page_size: 50,
        }),
      })
      const queryData = await queryRes.json()

      for (const page of queryData.results ?? []) {
        const dateProp = page.properties?.[datePropName]?.date
        if (!dateProp?.start) continue

        let title = '(No title)'
        if (titlePropName && page.properties[titlePropName]?.title?.length) {
          title = page.properties[titlePropName].title.map(t => t.plain_text).join('')
        }

        const hasTime = dateProp.start.includes('T')
        events.push({
          id: `notion-${page.id}`,
          title,
          start: dateProp.start,
          end: dateProp.end || dateProp.start,
          allDay: !hasTime,
          source: 'notion',
        })
      }
    }

    return events
  } catch (err) {
    console.error('[google-calendar] Notion fetch error:', err.message)
    return []
  }
}

async function handleFetchEvents(req, res) {
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

    const getRes = await fetch(
      `${supabaseUrl}/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}&select=study_tools`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const rows = await getRes.json()
    const studyTools = rows[0]?.study_tools ?? {}
    const gcal = studyTools.google_calendar
    const notion = studyTools.notion_calendar

    const googleConnected = !!gcal?.refresh_token
    const notionConnected = !!notion?.access_token

    if (!googleConnected && !notionConnected) {
      return res.status(200).json({ events: [], connected: false, notionConnected: false })
    }

    const [googleEvents, notionEvents] = await Promise.all([
      googleConnected ? fetchGoogleEvents(gcal.refresh_token) : Promise.resolve([]),
      notionConnected ? fetchNotionEvents(notion.access_token) : Promise.resolve([]),
    ])

    res.status(200).json({
      events: [...googleEvents, ...notionEvents],
      connected: googleConnected,
      notionConnected,
    })
  } catch (err) {
    console.error('[google-calendar] fetch events error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function handleAddEvent(req, res) {
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
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const rows = await getRes.json()
    const gcal = rows[0]?.study_tools?.google_calendar

    if (!gcal?.refresh_token) return res.status(400).json({ error: 'Google Calendar not connected' })

    const accessToken = await getAccessToken(gcal.refresh_token)
    if (!accessToken) return res.status(500).json({ error: 'Failed to get access token' })

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

    if (created.error) {
      console.error('[google-calendar] Google API error:', created.error)
      return res.status(500).json({ error: 'Internal server error' })
    }

    res.status(200).json({ success: true, eventId: created.id, htmlLink: created.htmlLink })
  } catch (err) {
    console.error('[google-calendar] add event error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = req.query?.action
  if (action === 'add') return handleAddEvent(req, res)
  return handleFetchEvents(req, res)
}
