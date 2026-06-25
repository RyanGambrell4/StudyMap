// YouTube Data API v3 - contextual video suggestions during study sessions
// Env var: YOUTUBE_API_KEY

import { verifyAuth } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'YouTube not configured', videos: [] })

  const { topic, courseName, type = 'lecture' } = req.body ?? {}
  if (!topic) return res.status(400).json({ error: 'topic required' })

  try {
    const query = type === 'lecture'
      ? `${topic} ${courseName ?? ''} lecture tutorial explained`.trim()
      : `${topic} ${courseName ?? ''} explained simply`.trim()

    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('q', query)
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('type', 'video')
    url.searchParams.set('maxResults', '3')
    url.searchParams.set('videoDuration', 'medium')  // 4–20 min
    url.searchParams.set('relevanceLanguage', 'en')
    url.searchParams.set('safeSearch', 'strict')
    url.searchParams.set('order', 'relevance')

    const r = await fetch(url.toString())
    if (!r.ok) return res.status(200).json({ videos: [] })

    const data = await r.json()
    const videos = (data.items ?? []).map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }))

    return res.status(200).json({ videos })
  } catch (err) {
    console.error('[YouTube] error:', err.message)
    return res.status(200).json({ videos: [] })
  }
}
