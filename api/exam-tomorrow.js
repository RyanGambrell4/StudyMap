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

      upcomingExams.sort((a, b) => {
        const da = a.date ?? a.dateStr ?? ''
        const db = b.date ?? b.dateStr ?? ''
        return da.localeCompare(db)
      })

      const exam = upcomingExams[0]
      const examDate = exam.date ?? exam.dateStr
      const isToday = examDate === tomorrowStr
      const examTitle = exam.title ?? 'Your exam'

      const courseNames = (row.plan?.courses ?? []).map(c => c.name).filter(Boolean)
      const courseLine = courseNames.length
        ? `<p style="margin:0 0 14px;font-size:13px;color:#9B9B9B;">Your courses: ${courseNames.slice(0, 3).join(', ')}</p>`
        : ''

      const pillBg = isToday ? '#FBE9D6' : '#FFF5E6'
      const pillBorder = isToday ? '#F0B27A' : '#F4DDB6'
      const pillText = isToday ? '#A0522D' : '#7A4B0A'

      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: email,
        subject: `${examTitle} is ${isToday ? 'tomorrow' : 'in 2 days'} — final prep time`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${examTitle} — final prep</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#3B61C4;vertical-align:middle;margin-right:8px;"></span>
        <span style="font-size:15px;font-weight:700;color:#111111;vertical-align:middle;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <table cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
          <tr><td style="background:${pillBg};border:1px solid ${pillBorder};border-radius:999px;padding:5px 14px;">
            <span style="font-size:12px;font-weight:700;color:${pillText};letter-spacing:0.04em;">${isToday ? 'TOMORROW' : 'IN 2 DAYS'}</span>
          </td></tr>
        </table>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${examTitle} is ${isToday ? 'tomorrow' : 'in 2 days'}. Lock in.
        </h1>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Here's what to focus on in your final session${isToday ? ' tonight' : ' over the next 48 hours'}:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:18px;">
          ${[
            'Review your weakest recall topics first — not your strongest',
            'Run a quick Quiz Burst to test yourself under pressure',
            'Use Exam Rescue for a last-minute strategy rundown',
            isToday ? 'Stop studying by 10pm — sleep is your final edge' : 'Do a full practice run tomorrow morning',
          ].map(tip => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
              <span style="color:#3B61C4;font-weight:600;margin-right:10px;">→</span>
              <span style="font-size:14px;color:#111111;">${tip}</span>
            </td>
          </tr>`).join('')}
        </table>
        ${courseLine}
        <div style="background:#F7F6F3;border-left:3px solid #3B61C4;border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:24px;">
          <p style="margin:0;font-size:14px;color:#111111;line-height:1.6;">
            ${isToday
              ? "Don't cram new material tonight. Your brain needs to consolidate. Trust your prep."
              : "Two days is enough time to meaningfully sharpen your recall — but only if you're focused on the right things."}
          </p>
        </div>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Open StudyEdge</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because your exam is coming up · StudyEdge AI<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">— The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })

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
