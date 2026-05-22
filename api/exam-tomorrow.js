import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendExamReminderSMS } from '../lib/server/twilio.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).end()
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[exam-tomorrow] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, plan, syllabus_events, subscription, sms_phone, sms_enabled')
    .limit(2000)

  if (error) {
    console.error('[exam-tomorrow] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  const dayAfter = new Date()
  dayAfter.setDate(dayAfter.getDate() + 2)
  const dayAfterStr = dayAfter.toISOString().slice(0, 10)

  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    try {
      // Resolve email — prefer subscription.email, fall back to auth lookup
      let email = row.subscription?.email
      if (!email) {
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
          email = authUser?.user?.email
        } catch { /* skip */ }
      }
      if (!email) { skipped++; continue }

      const events = row.syllabus_events ?? []
      const upcomingExams = events.filter(e => {
        const isExam = e.type === 'exam' || /exam|midterm|final|test/i.test(e.title ?? '')
        const dateStr = e.date ?? e.dateStr ?? ''
        return isExam && (dateStr === tomorrowStr || dateStr === dayAfterStr)
      })

      if (upcomingExams.length === 0) { skipped++; continue }

      // Sort so earliest exam comes first
      upcomingExams.sort((a, b) => {
        const da = a.date ?? a.dateStr ?? ''
        const db = b.date ?? b.dateStr ?? ''
        return da.localeCompare(db)
      })

      const exam = upcomingExams[0]
      const examDate = exam.date ?? exam.dateStr
      const isToday = examDate === tomorrowStr  // "tomorrow" from user perspective (cron runs at 6pm)
      const examTitle = exam.title ?? 'Your exam'

      // Gather course names for context
      const courseNames = (row.plan?.courses ?? []).map(c => c.name).filter(Boolean)
      const courseLine = courseNames.length
        ? `<p style="margin:0 0 16px;font-size:13px;color:#475569;">Your courses: ${courseNames.slice(0, 3).join(', ')}</p>`
        : ''

      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: email,
        subject: `${examTitle} is ${isToday ? 'tomorrow' : 'in 2 days'} — final prep time`,
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
        <tr><td style="padding-bottom:10px;">
          <div style="display:inline-block;background:${isToday ? 'rgba(249,115,22,0.12)' : 'rgba(251,191,36,0.1)'};border:1px solid ${isToday ? 'rgba(249,115,22,0.3)' : 'rgba(251,191,36,0.25)'};border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;color:${isToday ? '#f97316' : '#fbbf24'};">
            ${isToday ? 'TOMORROW' : 'IN 2 DAYS'}
          </div>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            ${examTitle} is ${isToday ? 'tomorrow' : 'in 2 days'}. Lock in.
          </h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 16px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Here's what to focus on in your final session${isToday ? ' tonight' : ' over the next 48 hours'}:
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              'Review your weakest recall topics first — not your strongest',
              'Run a quick Quiz Burst to test yourself under pressure',
              'Use Exam Rescue for a last-minute strategy rundown',
              isToday ? 'Stop studying by 10pm — sleep is your final edge' : 'Do a full practice run tomorrow morning',
            ].map(tip => `
            <tr>
              <td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="color:#6366f1;font-size:13px;margin-right:10px;">→</span>
                <span style="font-size:14px;color:#CBD5E1;">${tip}</span>
              </td>
            </tr>`).join('')}
          </table>
          ${courseLine}
          <div style="background:rgba(99,102,241,0.08);border-left:3px solid #6366f1;border-radius:0 10px 10px 0;padding:14px 18px;">
            <p style="margin:0;font-size:14px;color:#c7d2fe;line-height:1.6;">
              ${isToday
                ? "Don't cram new material tonight. Your brain needs to consolidate what it already knows. Trust your prep."
                : "Two days is enough time to meaningfully sharpen your recall — but only if you're focused on the right things."}
            </p>
          </div>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Open StudyEdge →
          </a>
        </td></tr>
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            Sent because your exam is coming up · StudyEdge AI<br/>
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

      // Also send SMS if user has opted in
      if (row.sms_enabled && row.sms_phone) {
        await sendExamReminderSMS(row.sms_phone, exam.title ?? 'Your exam', isToday)
      }

      sent++
    } catch (err) {
      console.error(`[exam-tomorrow] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[exam-tomorrow] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
