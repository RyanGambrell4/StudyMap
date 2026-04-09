export default async function handler(req, res) {
  const { code, state: userId, error } = req.query

  if (error || !code || !userId) {
    console.error('[google-auth-callback] Missing params — error:', error, '| code present:', !!code, '| userId:', userId)
    return res.redirect('https://getstudyedge.com/app?gcal=error')
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
    console.log('[google-auth-callback] Token exchange — access_token present:', !!tokens.access_token, '| refresh_token present:', !!tokens.refresh_token, '| error:', tokens.error ?? null)

    if (!tokens.refresh_token) {
      console.error('[google-auth-callback] No refresh_token — full response:', JSON.stringify(tokens))
      return res.redirect('https://getstudyedge.com/app?gcal=error')
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY
    console.log('[google-auth-callback] SUPABASE_URL set:', !!supabaseUrl, '| SERVICE_KEY set:', !!serviceKey, '| userId:', userId)

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
    console.log('[google-auth-callback] Supabase fetch — row found:', !!rows[0], '| existing study_tools keys:', Object.keys(rows[0]?.study_tools ?? {}))
    const existingTools = rows[0]?.study_tools ?? {}

    const updatedTools = {
      ...existingTools,
      google_calendar: {
        refresh_token: tokens.refresh_token,
        connected_at: Date.now(),
      },
    }

    // UPDATE the existing row (PATCH with eq filter — avoids duplicate key conflicts)
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          study_tools: updatedTools,
          updated_at: new Date().toISOString(),
        }),
      }
    )
    console.log('[google-auth-callback] Supabase update status:', updateRes.status, updateRes.statusText)
    if (!updateRes.ok) {
      const updateBody = await updateRes.text()
      console.error('[google-auth-callback] Supabase update error body:', updateBody)
    }

    res.redirect('https://getstudyedge.com/app?gcal=connected')
  } catch (err) {
    console.error('[google-auth-callback] Error:', err)
    res.redirect('https://getstudyedge.com/app?gcal=error')
  }
}
