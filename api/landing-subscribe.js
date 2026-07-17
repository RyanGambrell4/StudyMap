import { upsertContact, triggerEvent } from '../lib/server/loops.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { email } = body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  const normalized = email.trim().toLowerCase()

  try {
    await upsertContact({ email: normalized, plan: 'free' })
    await triggerEvent({ email: normalized, eventName: 'newsletter_signup' })
  } catch (err) {
    console.error('[landing-subscribe] Loops error:', err?.message)
    // Don't block the user on Loops errors
  }

  return res.status(200).json({ ok: true })
}
