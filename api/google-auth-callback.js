export default async function handler(req, res) {
  const { code, state: userId, error } = req.query

  if (error || !code || !userId) {
    return res.redirect('/app?gcal=error')
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'https://getstudyedge.com/api/google-auth-callback',
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()
    if (!tokens.refresh_token) {
      console.error('[google-auth-callback] No refresh_token in response', tokens)
      return res.redirect('/app?gcal=error')
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY

    // Fetch existing study_tools to merge rather than overwrite
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
    const existingTools = rows[0]?.study_tools ?? {}

    const updatedTools = {
      ...existingTools,
      google_calendar: {
        refresh_token: tokens.refresh_token,
        connected_at: Date.now(),
      },
    }

    // Upsert into user_data
    await fetch(`${supabaseUrl}/rest/v1/user_data`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        study_tools: updatedTools,
        updated_at: new Date().toISOString(),
      }),
    })

    res.redirect('/app?gcal=connected')
  } catch (err) {
    console.error('[google-auth-callback] Error:', err)
    res.redirect('/app?gcal=error')
  }
}
