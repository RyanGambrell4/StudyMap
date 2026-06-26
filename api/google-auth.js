import crypto from 'crypto'
import { getRedis } from '../lib/server/redis.js'

export default async function handler(req, res) {
  const { userId, provider } = req.query
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const redis = getRedis()
  const nonce = crypto.randomBytes(16).toString('hex')
  if (redis) await redis.set(`oauth:${nonce}`, userId, 600)
  const secret = process.env.OAUTH_STATE_SECRET
  const sig = secret ? crypto.createHmac('sha256', secret).update(nonce).digest('hex').slice(0, 16) : ''
  const stateToken = sig ? `${nonce}.${sig}` : nonce

  // ── Notion Calendar OAuth ──
  if (provider === 'notion') {
    const params = new URLSearchParams({
      client_id: process.env.NOTION_CLIENT_ID,
      redirect_uri: 'https://getstudyedge.com/api/google-auth-callback',
      response_type: 'code',
      owner: 'user',
      state: redis ? `notion:${stateToken}` : `notion:${userId}`,
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
    state: redis ? `google:${stateToken}` : `google:${userId}`,
  })

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
