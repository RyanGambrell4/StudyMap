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
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Make your first week count</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#3B61C4;vertical-align:middle;margin-right:8px;"></span>
        <span style="font-size:15px;font-weight:700;color:#111111;vertical-align:middle;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Day 1</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">Make your first week count.</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Students who stick with StudyEdge usually do three things in their first week:
        </p>
        ${[
          ['1. Add your courses with real exam dates', 'The app builds everything around your deadlines. Without a date it is just guessing. Takes 30 seconds.'],
          ['2. Generate a Session Blueprint before your next study block', 'Open any course, tap Session Blueprint, and get a minute-by-minute plan. It changes how you approach each block.'],
          ['3. Use Study Coach once a week', 'Ask it to build a weekly plan around your current workload. Students who do this study 40% more consistently.'],
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
            <a href="https://getstudyedge.com/app" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Open StudyEdge</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Tips for new users from StudyEdge AI<br>
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
      sent++
    } catch (err) {
      console.error(`[day1-tips] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day1-tips] Sent ${sent}`)
  return res.status(200).json({ ok: true, sent })
}
