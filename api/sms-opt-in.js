// Save phone number for SMS reminders
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  // Verify user
  const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_SERVICE_KEY },
  })
  const userData = await userRes.json()
  if (!userData?.id) return res.status(401).json({ error: 'Unauthorized' })

  const { phone, enabled } = req.body ?? {}

  if (enabled === false) {
    // Opt out — clear phone
    await supabase.from('user_data').upsert({
      user_id: userData.id,
      sms_phone: null,
      sms_enabled: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    return res.status(200).json({ ok: true })
  }

  // Validate phone (basic E.164 check)
  if (!phone || !/^\+\d{10,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone must be in format +1XXXXXXXXXX' })
  }

  await supabase.from('user_data').upsert({
    user_id: userData.id,
    sms_phone: phone,
    sms_enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  return res.status(200).json({ ok: true })
}
