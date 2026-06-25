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

  const locked = await acquireCronLock('day1-tips')
  if (!locked) {
    console.log('[day1-tips] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const now = new Date()
  const windowStart = new Date(now - 28 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 20 * 60 * 60 * 1000)

  // Direct RPC against auth.users - auth.admin.listUsers() is broken on
  // GoTrue when any OAuth user exists (NULL confirmation_token scan panic).
  // See migration: add_list_users_by_window_for_drip_emails.
  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  if (error) return res.status(500).json({ error: 'Failed to list users', detail: error.message })
  const newUsers = (rows ?? []).map(r => ({ id: r.user_id, email: r.email, created_at: r.created_at }))

  console.log(`[day1-tips] Found ${newUsers.length} new users`)
  let sent = 0
  for (const user of newUsers) {
    if (!user.email) continue
    const gate = await canSendUserEmail(user.id, { priority: 'normal' })
    if (!gate.ok) continue
    try {
      await resend.emails.send({
        from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
        to: user.email,
        subject: '3 things that make StudyEdge actually work',
        headers: listUnsubscribeHeaders(user.email),
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Make your first week count</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader("Three habits in your first week that separate students who improve from those who don't.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Day 1</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">Make your first week count.</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Students who stick with StudyEdge usually do three things in their first week:
        </p>
        ${[
          ['1. Add a course with a real exam date', 'Your study plan, blueprints, and grade tracker are all built around your exam dates. Without one, the AI can\'t generate anything. 30 seconds.'],
          ['2. Generate a Session Blueprint', 'Open your course, tap Session Blueprint, get a minute-by-minute plan for your next study block. Free includes 1. Use it on the topic you\'re most behind on.'],
          ['3. Run the Study Coach once', 'Get a multi-week plan built around your exam date. Students who do this study far more consistently.'],
        ].map(([title, desc]) => `
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:12px;background:#F7F6F3;border-radius:10px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:14px;font-weight:600;color:#3B61C4;margin-bottom:4px;">${title}</div>
            <div style="font-size:13px;color:#6B6B6B;line-height:1.55;">${desc}</div>
          </td></tr>
        </table>`).join('')}
        <p style="margin:18px 0 24px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Set aside 10 minutes today to get your courses in. Everything else follows from there.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day1_tips" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Open StudyEdge</a>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:20px;">
          <tr><td style="background:#F4F7FF;border-radius:12px;border:1px solid rgba(59,97,196,0.15);padding:14px 18px;text-align:center;">
            <p style="margin:0 0 5px;font-size:13px;font-weight:600;color:#3B61C4;">Your 3-day free trial is waiting</p>
            <p style="margin:0 0 10px;font-size:13px;color:#6B6B6B;line-height:1.55;">Unlock unlimited AI tutoring, brain dumps, cheat sheets, practice exams, and more. 3-day trial · $2.99/wk after · Cancel any time.</p>
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=day1_trial" style="display:inline-block;background:#E8531A;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;padding:10px 22px;">Start free trial →</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Tips for new users from StudyEdge AI<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
          &nbsp;&middot;&nbsp;
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(user.email ?? '')}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      await recordUserEmail(user.id)
      sent++
    } catch (err) {
      console.error(`[day1-tips] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day1-tips] Sent ${sent}`)
  return res.status(200).json({ ok: true, sent })
}
