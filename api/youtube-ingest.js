import { verifyAuth } from '../lib/server/usage.js'

export const config = { maxDuration: 30 }

function extractVideoId(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0]
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v') ?? u.pathname.split('/').pop()
    }
  } catch {}
  // bare ID fallback
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/)
  return match?.[1] ?? null
}

async function fetchTranscript(videoId) {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!pageRes.ok) throw new Error('Could not fetch YouTube page')
  const html = await pageRes.text()

  // Extract video title
  const titleMatch = html.match(/<meta name="title" content="([^"]+)"/) ||
                     html.match(/"title":"([^"]+)","lengthSeconds"/)
  const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'") : 'YouTube Lecture'

  if (!html.includes('captionTracks')) {
    throw new Error('No captions found. Try a video with subtitles enabled.')
  }

  // Extract caption baseUrl — prefer English, fall back to first available
  const captionSection = html.match(/"captionTracks":\[(.*?)\](?=,"audioTracks")/)
  if (!captionSection) throw new Error('Could not parse caption tracks')

  const englishUrl = captionSection[1].match(/"baseUrl":"([^"]+)"[^}]*"languageCode":"en(?:-[A-Z]+)?"/)
  const anyUrl = captionSection[1].match(/"baseUrl":"([^"]+)"/)
  const rawUrl = (englishUrl || anyUrl)?.[1]
  if (!rawUrl) throw new Error('No caption URL found')

  const captionUrl = rawUrl.replace(/\\u0026/g, '&') + '&fmt=json3'
  const captionRes = await fetch(captionUrl)
  if (!captionRes.ok) throw new Error('Failed to download captions')

  const captionData = await captionRes.json()
  const text = (captionData.events ?? [])
    .filter(e => e.segs)
    .map(e => e.segs.map(s => (s.utf8 ?? '').replace(/[\n\r]/g, ' ')).join(''))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (text.length < 100) throw new Error('Transcript too short to be useful')

  return { title, transcript: text }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { url } = req.body ?? {}
  if (!url) return res.status(400).json({ error: 'url required' })

  const videoId = extractVideoId(url)
  if (!videoId) return res.status(400).json({ error: 'Could not extract a YouTube video ID from that URL' })

  try {
    const { title, transcript } = await fetchTranscript(videoId)
    return res.status(200).json({ ok: true, title, transcript, videoId })
  } catch (err) {
    console.error('[youtube-ingest] Error:', err.message)
    return res.status(422).json({ error: err.message ?? 'Failed to fetch transcript' })
  }
}
