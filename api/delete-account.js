/**
 * delete-account.js - Permanently deletes the authenticated user's account.
 *
 * Required by App Store Guideline 5.1.1(v) - apps with account creation must
 * allow users to delete their account from within the app.
 *
 * Flow:
 *   1. Client sends POST with Authorization: Bearer <access_token>
 *   2. Verify token - get user ID
 *   3. Cancel any active Stripe subscription so billing stops immediately
 *   4. Delete user rows from all public tables
 *   5. Delete the Supabase Auth user (cascades to auth.identities, sessions, etc.)
 *
 * Required environment variables (set in Vercel):
 *   SUPABASE_URL             - same as VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY     - Service Role key from Supabase → Settings → API
 *   STRIPE_SECRET_KEY        - Stripe secret key
 */

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers['authorization'] ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing authorization token' })

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const userId = user.id

  // ── 1. Cancel any active Stripe subscription ──────────────────────────────
  try {
    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle()

    const stripeSubId = row?.subscription?.stripeSubId
    const subStatus = row?.subscription?.status

    if (stripeSubId && !['cancelled', 'canceled'].includes(subStatus)) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      await stripe.subscriptions.cancel(stripeSubId)
    }
  } catch (err) {
    console.error('[delete-account] Stripe cancellation error:', err)
    // Non-fatal: subscription may already be cancelled or not exist.
    // Proceed with deletion so the user is not stuck.
  }

  // ── 2. Delete all user data from public tables ────────────────────────────
  const tables = ['user_data', 'ios_state', 'struggle_topics']
  for (const table of tables) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq('user_id', userId)
    if (error) {
      console.error(`[delete-account] Failed to delete from ${table}:`, error)
      // Log but continue - partial cleanup is better than no cleanup.
    }
  }

  // ── 3. Delete the auth user ───────────────────────────────────────────────
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (deleteError) {
    console.error('[delete-account] Auth delete error:', deleteError)
    return res.status(500).json({ error: 'Failed to delete account. Please contact support@getstudyedge.com.' })
  }

  return res.status(200).json({ success: true })
}
