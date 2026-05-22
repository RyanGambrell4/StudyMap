import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

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
      // --- Activity filter: skip users active in last 3 days ---
      const completedSessions = Array.isArray(row.completed_sessions) ? row.completed_sessions : []
      const lastSession = completedSessions[completedSessions.length - 1]?.dateStr
      const daysSinceSession = lastSession
        ? Math.floor((now - new Date(lastSession + 'T12:00:00').getTime()) / 86400000)
        : 999
      if (daysSinceSession < 3) { skipped++; continue }

      // --- Email throttle: skip users emailed in last 2 days ---
      if (row.last_emailed_at) {
        const daysSinceEmail = Math.floor((now - new Date(row.last_emailed_at).getTime()) / 86400000)
        if (daysSinceEmail < 2) { skipped++; continue }
      }

      // --- Resolve email ---
      let email
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        email = authUser?.user?.email
      } catch { /* skip */ }
      if (!email) { skipped++; continue }

      // --- Personalization ---
      const plan = row.plan ?? {}
      const courseNames = (plan.courses ?? []).map(c => c.name).filter(Boolean)

      // Find nearest upcoming exam from syllabus_events
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
        ? `<p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Your <strong style="color:#F1F5F9;">${upcomingExam.title ?? 'exam'}</strong> is coming up on
            <strong style="color:#F1F5F9;">${upcomingExam.date ?? upcomingExam.dateStr}</strong>.
            Now's the time to get back on track.
          </p>`
        : ''

      const courseListHtml = courseNames.length
        ? courseNames.slice(0, 3).map(name => `
          <tr>
            <td style="padding:7px 0;">
              <span style="color:#6366f1;font-size:13px;margin-right:10px;">→</span>
              <span style="font-size:14px;color:#CBD5E1;">${name}</span>
            </td>
          </tr>`).join('')
        : `<tr><td style="padding:7px 0;font-size:14px;color:#CBD5E1;">Your courses are ready — pick up where you left off.</td></tr>`

      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: email,
        subject,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">
        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>
        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            ${courseNames.length ? `${courseNames[0]} misses you.` : "Your study plan misses you."}
          </h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            It's been a few days. Your study sessions are still waiting — and your exams aren't moving.
          </p>
          ${examLine}
          ${courseNames.length ? `<p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.8px;">Your courses</p>` : ''}
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${courseListHtml}
          </table>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Resume studying
          </a>
        </td></tr>
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            You're receiving this because you have an active StudyEdge AI account.<br/>
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

      // Record the send time so we don't double-email
      await supabaseAdmin
        .from('user_data')
        .update({ last_emailed_at: new Date().toISOString() })
        .eq('user_id', row.user_id)

      sent++
    } catch (err) {
      console.error(`[re-engage] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[re-engage] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
