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
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: true })

  const now = new Date()
  const windowStart = new Date(now - 28 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 20 * 60 * 60 * 1000)

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 })
  if (error) return res.status(500).json({ error: 'Failed to list users' })

  const newUsers = (users?.users ?? []).filter(u => {
    const created = new Date(u.created_at)
    return created >= windowStart && created <= windowEnd
  })

  console.log(`[day1-tips] Found ${newUsers.length} new users`)
  let sent = 0
  for (const user of newUsers) {
    if (!user.email) continue
    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: user.email,
        subject: '3 things that make StudyEdge actually work',
        html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">
        <tr><td style="padding-bottom:28px;"><span style="font-size:17px;font-weight:700;color:#F1F5F9;">StudyEdge AI</span></td></tr>
        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">Make your first week count.</h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 20px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Most students who stick with StudyEdge do three things in their first week:
          </p>
          ${[
            ['1. Add your courses with real exam dates', 'The app builds everything around your deadlines. Without a date it is just guessing. Takes 30 seconds.'],
            ['2. Generate a Session Blueprint before your next study block', 'Open any course, tap Session Blueprint, and get a minute-by-minute plan for the session. It changes how you approach each block.'],
            ['3. Use Study Coach once a week', 'Ask it to build a weekly plan around your current workload. Students who do this study 40% more consistently.'],
          ].map(([title, desc]) => `
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;">
            <tr><td style="padding:16px;">
              <div style="font-size:14px;font-weight:700;color:#c7d2fe;margin-bottom:6px;">${title}</div>
              <div style="font-size:13px;color:#94A3B8;line-height:1.6;">${desc}</div>
            </td></tr>
          </table>`).join('')}
          <p style="margin:20px 0 0;font-size:15px;color:#94A3B8;line-height:1.7;">Set aside 10 minutes today to get your courses in. Everything else follows from there.</p>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app" style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 36px;">Open StudyEdge</a>
        </td></tr>
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            StudyEdge AI · Tips for new users<br/>
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
      console.error(`[day1-tips] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day1-tips] Sent ${sent}`)
  return res.status(200).json({ ok: true, sent })
}
