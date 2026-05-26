/**
 * delete-account.js — Permanently deletes the authenticated user's account.
 *
 * Required by App Store Guideline 5.1.1(v) — apps with account creation must
 * allow users to delete their account from within the app.
 *
 * Flow:
 *   1. Client sends POST with Authorization: Bearer <access_token>
 *   2. This endpoint verifies the token via Supabase (gets user ID)
 *   3. Uses service role key to call auth.admin.deleteUser(userId)
 *
 * Required environment variables (set in Vercel):
 *   SUPABASE_URL             — same as VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY     — Service Role key (NOT anon key) from Supabase → Settings → API
 */

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers['authorization'] ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }

  // Admin client can verify the JWT and look up the user by token
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error('delete-account error:', deleteError)
    return res.status(500).json({ error: 'Failed to delete account' })
  }

  return res.status(200).json({ success: true })
}
