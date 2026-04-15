export default async function handler(req, res) {
  const { userId, provider } = req.query
  if (!userId) return res.status(400).json({ error: 'userId required' })

  // ── Notion Calendar OAuth ──
  if (provider === 'notion') {
    const params = new URLSearchParams({
      client_id: process.env.NOTION_CLIENT_ID,
      redirect_uri: 'https://getstudyedge.com/api/google-auth-callback',
      response_type: 'code',
      owner: 'user',
      state: `notion:${userId}`,
    })
    return res.redirect(`https://api.notion.com/v1/oauth/authorize?${params}`)
  }

  // ── Google Calendar OAuth (default) ──
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: 'https://getstudyedge.com/api/google-auth-callback',
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state: `google:${userId}`,
  })

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
