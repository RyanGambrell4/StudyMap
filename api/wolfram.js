// Wolfram Alpha Short Answers API
// Env var: WOLFRAM_APP_ID

import { verifyAuth } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const appId = process.env.WOLFRAM_APP_ID
  if (!appId) return res.status(503).json({ error: 'Wolfram not configured' })

  const { query } = req.body ?? {}
  if (!query) return res.status(400).json({ error: 'query required' })

  try {
    // Use Wolfram Short Answers API (simple text response)
    const url = `https://api.wolframalpha.com/v1/result?appid=${encodeURIComponent(appId)}&i=${encodeURIComponent(query)}&units=metric`
    const res2 = await fetch(url)

    if (!res2.ok) {
      return res.status(200).json({ answer: null, available: false })
    }

    const answer = await res2.text()
    return res.status(200).json({ answer, available: true })
  } catch (err) {
    return res.status(200).json({ answer: null, available: false })
  }
}
