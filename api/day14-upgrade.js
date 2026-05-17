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
  const windowEnd   = new Date(now - 14 * 24 * 60 * 60 * 1000)
  const windowStart = new Date(now - 15 * 24 * 60 * 60 * 1000)

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) {
    console.error('[day14-upgrade] Failed to list users:', error)
    return res.status(500).json({ error: 'Failed to list users' })
  }

  const eligible = (users?.users ?? []).filter(u => {
    const created = new Date(u.created_at)
    return created >= windowStart && created <= windowEnd
  })

  let sent = 0, skipped = 0

  for (const user of eligible) {
    if (!user.email) { skipped++; continue }

    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', user.id)
      .single()

    const activeStatuses = ['active', 'trialing', 'past_due']
    const sub = row?.subscription ?? {}
    const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
    if (plan !== 'free') { skipped++; continue }

    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: user.email,
        subject: "Two weeks in — still on the free plan?",
        html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">
        <tr><td style="padding-bottom:28px;"><span style="font-size:17px;font-weight:700;color:#F1F5F9;">StudyEdge AI</span></td></tr>
        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">You've been using StudyEdge for 2 weeks.</h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 16px;font-size:15px;color:#94A3B8;line-height:1.7;">
            You're on the free plan, which limits you to 1 course and 10 AI boosts. If you've been hitting those limits — or want to use the app properly this semester — Pro is the right move.
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Most students who upgrade do it around week 2, when they realize they're serious about their grades. You're at that point.
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
            ${[
              ['5 courses', 'Track every class, not just one'],
              ['75 AI boosts / month', '7x more than free — enough for daily use'],
              ['AI Study Coach', '8-week personalized plan built around your deadlines'],
              ['Session Blueprints', 'Know exactly what to study in every session'],
              ['Focus sessions', 'Timed, distraction-free study with your plan loaded'],
            ].map(([feat, detail]) => `
            <tr>
              <td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:14px;color:#CBD5E1;font-weight:600;">${feat}</div>
                <div style="font-size:12px;color:#475569;margin-top:2px;">${detail}</div>
              </td>
            </tr>`).join('')}
          </table>
        </td></tr>
        <tr><td style="padding-bottom:12px;text-align:center;">
          <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1" style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 36px;">Try Pro free for 7 days</a>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="font-size:12px;color:#334155;">Cancel before day 7 and you won't be charged anything.</span>
        </td></tr>
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            StudyEdge AI · You signed up 2 weeks ago<br/>
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
      console.error(`[day14-upgrade] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day14-upgrade] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
