/**
 * re-engage.js — Day-3 re-engagement email for dormant free users
 *
 * Runs daily via Vercel cron (see vercel.json).
 * Finds users who signed up 3 days ago and haven't returned since,
 * and sends a "still figuring out your schedule?" nudge.
 *
 * GET /api/re-engage
 * Protected by CRON_SECRET header (set in Vercel env vars).
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Verify cron secret
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[re-engage] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  // Find users created 3 days ago (72h ± 12h window)
  const now = new Date()
  const windowStart = new Date(now - 84 * 60 * 60 * 1000) // 84h ago
  const windowEnd   = new Date(now - 60 * 60 * 1000 * 60) // 60h ago

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  })

  if (error) {
    console.error('[re-engage] Failed to list users:', error)
    return res.status(500).json({ error: 'Failed to list users' })
  }

  const dormant = (users?.users ?? []).filter(u => {
    const created = new Date(u.created_at)
    if (created < windowStart || created > windowEnd) return false
    // Skip if they've signed back in after the first hour (meaning they returned)
    const lastSignIn = new Date(u.last_sign_in_at)
    const firstHourCutoff = new Date(created.getTime() + 60 * 60 * 1000)
    return lastSignIn <= firstHourCutoff
  })

  console.log(`[re-engage] Found ${dormant.length} dormant users to re-engage`)

  let sent = 0
  for (const user of dormant) {
    if (!user.email) continue
    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: user.email,
        subject: 'Still figuring out your study schedule?',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            Your study plan is waiting.
          </h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            You signed up for StudyEdge AI but haven't set up your schedule yet.
            It takes about 60 seconds — just add your courses and we'll build a full
            study plan around your exams and deadlines.
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Here's what you'll have when you're done:
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              'A week-by-week study calendar',
              'Session blueprints with what to study and when',
              'AI-powered study boosts for any topic',
              'Flashcards and quizzes built from your notes',
            ].map(f => `
            <tr>
              <td style="padding:7px 0;">
                <span style="color:#6366f1;font-size:13px;margin-right:10px;">→</span>
                <span style="font-size:14px;color:#CBD5E1;">${f}</span>
              </td>
            </tr>`).join('')}
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Set up my study plan →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            You're receiving this because you created a StudyEdge AI account.<br/>
            <a href="https://getstudyedge.com/app" style="color:#475569;">Open the app</a> ·
            <a href="mailto:support@getstudyedge.com" style="color:#475569;">Contact support</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
      })
      sent++
    } catch (err) {
      console.error(`[re-engage] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[re-engage] Sent ${sent}/${dormant.length} re-engagement emails`)
  return res.status(200).json({ ok: true, sent, total: dormant.length })
}
