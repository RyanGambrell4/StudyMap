import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[re-engage] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, plan, subscription, completed_sessions, syllabus_events, last_emailed_at')
    .not('plan', 'is', null)

  if (error) {
    console.error('[re-engage] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  const now = Date.now()
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    try {
      const completedSessions = Array.isArray(row.completed_sessions) ? row.completed_sessions : []
      const lastSession = completedSessions[completedSessions.length - 1]?.dateStr
      const daysSinceSession = lastSession
        ? Math.floor((now - new Date(lastSession + 'T12:00:00').getTime()) / 86400000)
        : 999
      if (daysSinceSession < 3) { skipped++; continue }

      // Rate-limit: low priority (>= 5 days since last email)
      const gate = await canSendUserEmail(row.user_id, { priority: 'low' })
      if (!gate.ok) { skipped++; continue }

      let email
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        email = authUser?.user?.email
      } catch { /* skip */ }
      if (!email) { skipped++; continue }

      const plan = row.plan ?? {}
      const courseNames = (plan.courses ?? []).map(c => c.name).filter(Boolean)

      const todayStr = new Date().toISOString().slice(0, 10)
      const upcomingExam = (row.syllabus_events ?? [])
        .filter(e => {
          const isExam = e.type === 'exam' || /exam|midterm|final|test/i.test(e.title ?? '')
          const dateStr = e.date ?? e.dateStr ?? ''
          return isExam && dateStr >= todayStr
        })
        .sort((a, b) => {
          const da = a.date ?? a.dateStr ?? ''
          const db = b.date ?? b.dateStr ?? ''
          return da.localeCompare(db)
        })[0]

      const subject = courseNames.length
        ? `${courseNames[0]} won't study itself — come back`
        : 'Your study streak is waiting'

      const examLine = upcomingExam
        ? `<p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
            Your <strong style="color:#111111;">${upcomingExam.title ?? 'exam'}</strong> is on
            <strong style="color:#111111;">${upcomingExam.date ?? upcomingExam.dateStr}</strong>.
            Now's the time to get back on track.
          </p>`
        : ''

      const courseListHtml = courseNames.length
        ? courseNames.slice(0, 3).map(name => `
          <tr>
            <td style="padding:9px 0;border-bottom:1px solid #F0EDE8;">
              <span style="color:#3B61C4;font-weight:600;margin-right:10px;">→</span>
              <span style="font-size:14px;color:#111111;">${name}</span>
            </td>
          </tr>`).join('')
        : `<tr><td style="padding:9px 0;font-size:14px;color:#6B6B6B;">Your courses are ready — pick up where you left off.</td></tr>`

      await resend.emails.send({
        from: 'StudyEdge AI <support@mail.getstudyedge.com>',
        to: email,
        subject,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your study plan is waiting</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;outline:none;text-decoration:none;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Come back</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${courseNames.length ? `${courseNames[0]} misses you.` : "Your study plan misses you."}
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          It's been a few days. Your study sessions are still waiting — and your exams aren't moving.
        </p>
        ${examLine}
        ${courseNames.length ? `<p style="margin:18px 0 8px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Your courses</p>` : ''}
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${courseListHtml}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Resume studying</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because you have an active StudyEdge AI account.<br>
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
      console.error(`[re-engage] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[re-engage] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
