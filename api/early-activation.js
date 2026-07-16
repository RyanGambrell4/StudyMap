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

  // Use hour-stamped lock so this can run every 4h without double-sending
  const hour = new Date().getUTCHours()
  const locked = await acquireCronLock(`early-activation-h${Math.floor(hour / 4)}`)
  if (!locked) return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_this_window' })

  const now = new Date()
  // Target users who signed up 2–6 hours ago
  const windowStart = new Date(now - 6 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 2 * 60 * 60 * 1000)

  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  if (error) return res.status(500).json({ error: 'Failed to list users', detail: error.message })

  const recentUsers = (rows ?? []).map(r => ({ id: r.user_id, email: r.email }))
  let sent = 0, skipped = 0

  for (const user of recentUsers) {
    if (!user.email) continue

    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription, completed_sessions, courses')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!row) { skipped++; continue }

    // Skip already-engaged users and paid subscribers
    const plan = row?.subscription?.plan ?? 'free'
    if (plan !== 'free') { skipped++; continue }
    const sessionCount = Array.isArray(row?.completed_sessions) ? row.completed_sessions.length : 0
    if (sessionCount > 0) { skipped++; continue }

    const guard = await canSendUserEmail(user.id, { priority: 'normal' })
    if (!guard.ok) { skipped++; continue }

    const subject = "One thing to do in StudyEdge right now (takes 30 sec)"

    try {
      await resend.emails.send({
        from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
        to: user.email,
        subject,
        headers: listUnsubscribeHeaders(user.email),
        tags: [
          { name: 'campaign', value: 'early_activation' },
          { name: 'user_id', value: user.id },
        ],
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Get started with StudyEdge</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader("Add a course with an exam date. Everything else — your plan, your blueprints, your coach — runs from there.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">From Ryan</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          The one thing that makes StudyEdge actually work.
        </h1>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          You signed up a couple hours ago. Before you dive in, here's the single most important thing: <strong style="color:#111111;">add a course with a real exam date.</strong>
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Your study plan, Session Blueprints, Study Coach, and grade tracker are all built around exam dates. Without one, the AI doesn't know what to focus on — or when.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['Add a course (30 seconds)', 'Tap Courses → Add course. Give it a name and an exam date.'],
            ['Run the Study Coach', 'It builds a full multi-week plan around your deadlines. Takes 2 minutes.'],
            ['Start your first session', 'Open a Session Blueprint. It tells you exactly what to study and for how long.'],
          ].map(([title, desc], i, arr) => `
          <tr>
            <td style="padding:13px 0;${i < arr.length - 1 ? 'border-bottom:1px solid #F0EDE8;' : ''}">
              <div style="font-size:14px;font-weight:600;color:#3B61C4;margin-bottom:3px;">${title}</div>
              <div style="font-size:13px;color:#6B6B6B;line-height:1.55;">${desc}</div>
            </td>
          </tr>`).join('')}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=early_activation" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Add my first course</a>
          </td></tr>
        </table>
        <div style="margin:24px 0 0;background:#F4F7FF;border-radius:12px;border:1px solid rgba(59,97,196,0.18);padding:18px 20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#3B61C4;">Start your free 3-day trial →</p>
          <p style="margin:0 0 12px;font-size:13px;color:#6B6B6B;line-height:1.55;">Unlock unlimited AI tutoring, 5 courses, and Session Blueprints on every session.</p>
          <p style="margin:0 0 12px;font-size:12px;color:#9B9B9B;">Card required · Card required · Cancel before day 4 and pay nothing</p>
          <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=early_activation_trial" style="display:inline-block;background:#E8531A;color:#FFFFFF;font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;padding:11px 24px;">Start free 3-day trial →</a>
        </div>
        <p style="margin:22px 0 0;font-size:14px;color:#6B6B6B;line-height:1.65;">
          Reply if you have questions — I read them.<br>— Ryan
        </p>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You just created a StudyEdge account.
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
      await recordUserEmail(user.id, 'early-activation')
      sent++
    } catch (e) {
      console.error('[early-activation] send error:', e)
    }
  }

  return res.status(200).json({ ok: true, sent, skipped })
}
