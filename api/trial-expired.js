import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { acquireCronLock } from '../lib/server/cronLock.js'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: true })

  const locked = await acquireCronLock('trial-expired')
  if (!locked) {
    console.log('[trial-expired] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  // Target users whose trial ended 1-2 days ago (trialUsedAt was 8-9 days ago).
  // 7-day trial: trialUsedAt + 168h = trial end. We want 24-48h after that = 192-216h after trialUsedAt.
  const now = new Date()
  const windowStart = new Date(now - 216 * 60 * 60 * 1000) // 9 days ago (trialUsedAt 192-216h ago → trialEnd 24-48h ago)
  const windowEnd   = new Date(now - 192 * 60 * 60 * 1000) // 8 days ago

  // Pull free users who had a trial (trialUsedAt set) so we can filter by when their trial ended.
  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, subscription, completed_sessions, courses')
    .not('subscription->trialUsedAt', 'is', null)
    .limit(2000)

  if (error) return res.status(500).json({ error: 'Failed to query users', detail: error.message })

  console.log(`[trial-expired] Checking ${(rows ?? []).length} trial-used accounts`)
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    try {
      const sub = row.subscription ?? {}
      const plan = sub.plan ?? 'free'
      if (plan !== 'free') { skipped++; continue }

      const trialUsedAt = sub.trialUsedAt
      if (!trialUsedAt) { skipped++; continue }

      const trialUsedDate = new Date(trialUsedAt)
      if (isNaN(trialUsedDate.getTime())) { skipped++; continue }

      // Trial end = trialUsedAt + 7 days. We want 24-48h after trial end.
      const trialEnd = new Date(trialUsedDate.getTime() + 7 * 24 * 3600 * 1000)
      if (trialEnd < windowStart || trialEnd > windowEnd) { skipped++; continue }

      const gate = await canSendUserEmail(row.user_id, { priority: 'normal' })
      if (!gate.ok) { skipped++; continue }

      let email
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        email = authUser?.user?.email
      } catch { /* skip */ }
      if (!email) { skipped++; continue }

      const sessionCount = Array.isArray(row.completed_sessions) ? row.completed_sessions.length : 0
      const courseCount  = Array.isArray(row.courses) ? row.courses.length : 0

      const activityLine = sessionCount > 0
        ? `You completed ${sessionCount} session${sessionCount !== 1 ? 's' : ''} during your trial. That's real progress.`
        : `You set up ${courseCount} course${courseCount !== 1 ? 's' : ''} during your trial.`

      const upgradeUrl = `https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=trial_expired`

      try {
        await resend.emails.send({
          from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
          to: email,
          subject: 'Your trial ended. Here\'s what you lost.',
          headers: listUnsubscribeHeaders(email),
          tags: [
            { name: 'campaign', value: 'trial_expired' },
            { name: 'user_id', value: row.user_id },
          ],
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your trial ended</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader("You tried Pro. You know what it does. $2.99/wk to get it back.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Trial ended</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">Your 7-day Pro trial ended.</h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          ${activityLine} You've seen what Pro does: the AI tutoring, unlimited blueprints, all the study tools.
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Here's what you no longer have:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${[
            ['100 AI actions/month', 'Back to 5 total. Not enough to get through a week.'],
            ['Unlimited Session Blueprints', 'Now capped. You used them. You know how much they help.'],
            ['5-course tracking', 'Back to 1. If you\'re taking more than one class, that\'s a problem.'],
            ['Focus Mode (no time limit)', 'The 30-min cap is back. Pro removes it entirely.'],
          ].map(([feat, desc]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <span style="font-size:14px;color:#DC2626;font-weight:700;flex-shrink:0;padding-top:1px;">✕</span>
                <div>
                  <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
                  <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${desc}</div>
                </div>
              </div>
            </td>
          </tr>`).join('')}
        </table>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Pro is <strong style="color:#111111;">$2.99/week</strong>, less than a coffee. You already know what you get. Cancel anytime from your account.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${upgradeUrl}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Upgrade to Pro · $2.99/wk</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">$2.99/wk · Cancel in account anytime</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because your StudyEdge Pro trial ended.
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
          &nbsp;&middot;&nbsp;
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(email ?? '')}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
        })
        await recordUserEmail(row.user_id)
        sent++
      } catch (err) {
        console.error(`[trial-expired] Failed to send to ${email}:`, err)
      }
    } catch (err) {
      console.error(`[trial-expired] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[trial-expired] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
