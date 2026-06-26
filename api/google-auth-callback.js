import crypto from 'crypto'
import { getRedis } from '../lib/server/redis.js'

const REDIRECT_BASE = 'https://getstudyedge.com/app'

export default async function handler(req, res) {
  const { code, state, error } = req.query
  const errRedirect = (p) => res.redirect(`${REDIRECT_BASE}?${p === 'notion' ? 'notion' : 'gcal'}=error`)

  if (error || !code || !state) {
    console.error('[auth-callback] Missing params - error:', error, '| code present:', !!code, '| state:', state)
    return errRedirect('google')
  }

  // ── Parse state parameter ───────────────────────────────────────────────────
  // New format: "provider:nonce[.sig]" — nonce is pure hex (no hyphens)
  // Legacy format: "provider:uuid" — uuid contains hyphens
  let provider = 'google'
  let stateContent = state
  if (state.startsWith('google:')) { provider = 'google'; stateContent = state.slice(7) }
  else if (state.startsWith('notion:')) { provider = 'notion'; stateContent = state.slice(7) }

  // Detect format by presence of hyphens (UUID = legacy, hex = new nonce)
  const isLegacy = /^[0-9a-f]{8}-/.test(stateContent)

  let userId
  if (isLegacy) {
    // Legacy format: stateContent is the bare userId
    userId = stateContent
    console.warn('[auth-callback] Processing legacy state format (no CSRF protection)')
  } else {
    // New format: stateContent is "nonce[.sig]"
    const dotIdx = stateContent.indexOf('.')
    const rawNonce = dotIdx >= 0 ? stateContent.slice(0, dotIdx) : stateContent
    const sig = dotIdx >= 0 ? stateContent.slice(dotIdx + 1) : ''

    // Verify HMAC signature if OAUTH_STATE_SECRET is set
    const secret = process.env.OAUTH_STATE_SECRET
    if (secret && sig) {
      const expected = crypto.createHmac('sha256', secret).update(rawNonce).digest('hex').slice(0, 16)
      if (sig !== expected) {
        console.error('[auth-callback] Invalid state signature — possible CSRF attempt')
        return errRedirect(provider)
      }
    }

    // Look up nonce in Redis and mark as used (one-time)
    const redis = getRedis()
    if (!redis) {
      console.error('[auth-callback] Redis unavailable — cannot verify nonce')
      return errRedirect(provider)
    }
    const stored = await redis.get(`oauth:${rawNonce}`)
    if (!stored || stored === 'used') {
      console.error('[auth-callback] Nonce missing or already used — possible replay attack')
      return errRedirect(provider)
    }
    userId = stored
    await redis.set(`oauth:${rawNonce}`, 'used', 60)
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_KEY

    if (provider === 'notion') {
      // ── Notion token exchange ──
      const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString('base64'),
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://getstudyedge.com/api/google-auth-callback',
        }),
      })

      const tokens = await tokenRes.json()
      console.log('[auth-callback] Notion token exchange - access_token present:', !!tokens.access_token, '| workspace:', tokens.workspace_name, '| error:', tokens.error ?? null)

      if (!tokens.access_token) {
        console.error('[auth-callback] Notion - no access_token:', JSON.stringify(tokens))
        return res.redirect('https://getstudyedge.com/app?notion=error')
      }

      // Fetch existing study_tools to merge
      const getRes = await fetch(
        `${supabaseUrl}/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}&select=study_tools`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      )
      const rows = await getRes.json()
      const existingTools = rows[0]?.study_tools ?? {}

      const updatedTools = {
        ...existingTools,
        notion_calendar: {
          access_token: tokens.access_token,
          workspace_id: tokens.workspace_id,
          workspace_name: tokens.workspace_name,
          connected_at: Date.now(),
        },
      }

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
          body: JSON.stringify({ study_tools: updatedTools, updated_at: new Date().toISOString() }),
        }
      )
      console.log('[auth-callback] Notion Supabase update status:', updateRes.status)

      return res.redirect('https://getstudyedge.com/app?notion=connected')
    }

    // ── Google token exchange (default) ──
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
    console.log('[auth-callback] Google token exchange - access_token present:', !!tokens.access_token, '| refresh_token present:', !!tokens.refresh_token, '| error:', tokens.error ?? null)

    if (!tokens.refresh_token) {
      console.error('[auth-callback] Google - no refresh_token:', JSON.stringify(tokens))
      return res.redirect('https://getstudyedge.com/app?gcal=error')
    }

    const getRes = await fetch(
      `${supabaseUrl}/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}&select=study_tools`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
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
        body: JSON.stringify({ study_tools: updatedTools, updated_at: new Date().toISOString() }),
      }
    )
    console.log('[auth-callback] Google Supabase update status:', updateRes.status)

    res.redirect('https://getstudyedge.com/app?gcal=connected')
  } catch (err) {
    console.error('[auth-callback] Error:', err)
    res.redirect(`https://getstudyedge.com/app?${provider === 'notion' ? 'notion' : 'gcal'}=error`)
  }
}
