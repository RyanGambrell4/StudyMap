import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../lib/server/usage.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export const config = { maxDuration: 10 }

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? '' })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { subscription } = req.body
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing subscription' })

  const { error } = await supabaseAdmin
    .from('user_data')
    .update({ push_subscription: subscription })
    .eq('user_id', userId)

  if (error) {
    console.error('[push-subscribe] DB error:', error)
    return res.status(500).json({ error: 'Failed to save subscription' })
  }

  return res.status(200).json({ ok: true })
}
