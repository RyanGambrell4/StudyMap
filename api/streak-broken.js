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

  // Pull users who had a streak going. study_tools._streak is populated by the client.
  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, study_tools, completed_sessions, last_emailed_at')
    .limit(2000)

  if (error) {
    console.error('[streak-broken] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  const now = Date.now()
  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(now - 86400000).toISOString().slice(0, 10)
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    try {
      // Streak threshold: only notify if previous streak was meaningful (>= 3 days)
      const streak = row.study_tools?._streak ?? {}
      const previousStreak = streak.lastKnownStreak ?? streak.currentStreak ?? 0
      if (previousStreak < 3) { skipped++; continue }

      // Check the user did NOT study yesterday or today
      const completed = Array.isArray(row.completed_sessions) ? row.completed_sessions : []
      const completedDates = new Set(completed.map(s => s.dateStr).filter(Boolean))
      const studiedRecently = completedDates.has(todayStr) || completedDates.has(yesterdayStr)
      if (studiedRecently) { skipped++; continue }

      // Throttle: skip if emailed in last 4 days
      if (row.last_emailed_at) {
        const daysSinceEmail = Math.floor((now - new Date(row.last_emailed_at).getTime()) / 86400000)
        if (daysSinceEmail < 4) { skipped++; continue }
      }

      let email
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        email = authUser?.user?.email
      } catch { /* skip */ }
      if (!email) { skipped++; continue }

      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: email,
        subject: `Your ${previousStreak}-day streak ended — here's how to restart`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Restart your streak</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#3B61C4;vertical-align:middle;margin-right:8px;"></span>
        <span style="font-size:15px;font-weight:700;color:#111111;vertical-align:middle;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Streak break</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          You missed a day. That's fine.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          You had a <strong style="color:#111111;">${previousStreak}-day streak</strong> going. Streaks aren't the goal — consistency is. One missed day doesn't undo the habit.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Here's the fastest way back:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${[
            ['Open the next session card', 'Don\'t plan a new week. Just do the next thing in front of you.'],
            ['Cap it at 25 minutes', 'A short, focused session beats a long, guilty one every time.'],
            ['Mark it complete', 'The streak counter restarts the moment you finish today\'s session.'],
          ].map(([title, desc]) => `
          <tr>
            <td style="padding:12px 14px;background:#F7F6F3;border-radius:10px;">
              <div style="font-size:14px;font-weight:600;color:#3B61C4;margin-bottom:4px;">${title}</div>
              <div style="font-size:13px;color:#6B6B6B;line-height:1.55;">${desc}</div>
            </td>
          </tr>
          <tr><td height="8"></td></tr>`).join('')}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Start a 25-min session</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because your study streak ended.<br>
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

      await supabaseAdmin
        .from('user_data')
        .update({ last_emailed_at: new Date().toISOString() })
        .eq('user_id', row.user_id)

      sent++
    } catch (err) {
      console.error(`[streak-broken] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[streak-broken] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
