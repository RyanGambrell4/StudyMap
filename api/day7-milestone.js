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
  const windowStart = new Date(now - 172 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 156 * 60 * 60 * 1000)

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 })
  if (error) return res.status(500).json({ error: 'Failed to list users' })

  const weekOldUsers = (users?.users ?? []).filter(u => {
    const created = new Date(u.created_at)
    return created >= windowStart && created <= windowEnd
  })

  console.log(`[day7-milestone] Found ${weekOldUsers.length} users at 7-day mark`)
  let sent = 0, skipped = 0

  for (const user of weekOldUsers) {
    if (!user.email) continue

    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription, completed_sessions, courses')
      .eq('user_id', user.id)
      .maybeSingle()

    const plan = row?.subscription?.plan ?? 'free'
    const sessionCount = Array.isArray(row?.completed_sessions) ? row.completed_sessions.length : 0
    const courseCount = Array.isArray(row?.courses) ? row.courses.length : 0
    if (plan !== 'free') { skipped++; continue }

    const hasActivity = sessionCount > 0 || courseCount > 0
    const activityLine = hasActivity
      ? `You've added ${courseCount} course${courseCount !== 1 ? 's' : ''} and completed ${sessionCount} study session${sessionCount !== 1 ? 's' : ''} — that's a solid start.`
      : `You signed up a week ago but haven't started yet. That's okay — most people take a few days to get going.`

    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: user.email,
        subject: "One week in — here's what Pro-plan students do differently",
        html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">
        <tr><td style="padding-bottom:28px;"><span style="font-size:17px;font-weight:700;color:#F1F5F9;">StudyEdge AI</span></td></tr>
        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">You've been on StudyEdge for one week.</h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">${activityLine}</p>
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">Students who upgrade in week 2 consistently outperform those who wait. Here's what they get that you don't have yet:</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              ['AI Study Coach', 'Builds a full multi-week study plan around your courses and exam dates'],
              ['Session Blueprints', 'Minute-by-minute plan for every study session'],
              ['75 AI boosts/month', 'Free gives you 10. Pro gives you enough for daily use all semester'],
              ['5 courses', 'Add your full course load, not just one'],
            ].map(([feat, desc]) => `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="color:#34d399;font-size:13px;margin-right:10px;">✓</span>
                <strong style="font-size:14px;color:#CBD5E1;">${feat}</strong>
                <div style="font-size:12px;color:#475569;margin-top:3px;padding-left:23px;">${desc}</div>
              </td>
            </tr>`).join('')}
          </table>
          <p style="margin:0;font-size:15px;color:#94A3B8;line-height:1.7;">Pro is <strong style="color:#c7d2fe;">$7.08/mo</strong> on the annual plan — less than a textbook chapter.</p>
        </td></tr>
        <tr><td style="padding-bottom:12px;text-align:center;">
          <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=yearly" style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 36px;">Upgrade to Pro — $7.08/mo</a>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="font-size:12px;color:#334155;">Billed $84.99/yr · Cancel anytime</span>
        </td></tr>
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            StudyEdge AI · You signed up one week ago<br/>
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
      console.error(`[day7-milestone] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day7-milestone] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
