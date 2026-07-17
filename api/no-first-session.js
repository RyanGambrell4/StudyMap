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

  const locked = await acquireCronLock('no-first-session')
  if (!locked) {
    console.log('[no-first-session] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const now = new Date()
  // Target users who signed up 22–26 hours ago
  const windowStart = new Date(now - 26 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 22 * 60 * 60 * 1000)

  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  if (error) return res.status(500).json({ error: 'Failed to list users', detail: error.message })
  const recentUsers = (rows ?? []).map(r => ({ id: r.user_id, email: r.email }))

  console.log(`[no-first-session] Found ${recentUsers.length} users in 22-26h window`)
  let sent = 0, skipped = 0

  for (const user of recentUsers) {
    if (!user.email) continue

    const { data: row, error: rowError } = await supabaseAdmin
      .from('user_data')
      .select('subscription, completed_sessions, courses, plan')
      .eq('user_id', user.id)
      .maybeSingle()

    if (rowError) { skipped++; continue }

    // Only target users who completed onboarding (have user_data) but haven't started
    if (!row) { skipped++; continue }

    const plan = row?.subscription?.plan ?? 'free'
    if (plan !== 'free') { skipped++; continue }

    const sessionCount = Array.isArray(row?.completed_sessions) ? row.completed_sessions.length : 0
    const courseCount  = Array.isArray(row?.courses) ? row.courses.length : 0

    // Skip users who are already engaged
    if (sessionCount > 0 || courseCount > 0) { skipped++; continue }

    const gate = await canSendUserEmail(user.id, { priority: 'high' })
    if (!gate.ok) { skipped++; continue }

    const trialUsed = !!(row?.subscription?.trialUsedAt || row?.subscription?.trial_activated)
    const upgradeUrl = trialUsed
      ? `https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=no_first_session_winback`
      : `https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=no_first_session`
    const ctaLabel = trialUsed ? 'Open the app' : 'Open the app and start your trial'

    try {
      await resend.emails.send({
        from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
        to: user.email,
        subject: "Your study plan is built. You haven't opened it yet.",
        headers: listUnsubscribeHeaders(user.email),
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your plan is waiting</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader("You set up your study plan yesterday and haven't come back. Everything's still there.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">From Ryan</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          Your plan is built. You just haven't looked at it yet.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          You signed up for StudyEdge yesterday and went through setup. But you haven't added your first course or started a session.
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          That's the part that actually works. Your AI study coach, your blueprints, your schedule: none of it runs until you add a course with a real exam date.
        </p>

        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['Add a course (30 seconds)', 'Tap Courses → Add course. Give it a name and an exam date. That\'s all it needs.'],
            ['Generate your first Session Blueprint', 'Open the course, tap Session Blueprint. You get a minute-by-minute study plan instantly. Free includes one.'],
            ['Run the Study Coach', 'Get a full multi-week plan built around your exams. Students who do this study 60% more consistently.'],
          ].map(([step, desc]) => `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #F0EDE8;">
              <div style="font-size:14px;font-weight:700;color:#3B61C4;margin-bottom:3px;">${step}</div>
              <div style="font-size:13px;color:#6B6B6B;line-height:1.55;">${desc}</div>
            </td>
          </tr>`).join('')}
        </table>

        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=no_first_session_open" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Open StudyEdge</a>
          </td></tr>
        </table>

        ${!trialUsed ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px;">
          <tr><td style="background:#F4F7FF;border-radius:12px;border:1px solid rgba(59,97,196,0.15);padding:16px 20px;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#3B61C4;">Your 7-day free trial is still waiting</p>
            <p style="margin:0 0 12px;font-size:13px;color:#6B6B6B;line-height:1.55;">
              Try every Pro feature free: unlimited AI tutoring, 5 courses, Session Blueprints on every session. Card required. Cancel before day 8 and pay nothing.
            </p>
            <a href="${upgradeUrl}" style="display:inline-block;background:#E8531A;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;padding:10px 22px;">Start free trial →</a>
          </td></tr>
        </table>` : ''}

        <p style="margin:20px 0 0;font-size:14px;color:#6B6B6B;line-height:1.65;">
          — Ryan
        </p>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You signed up for StudyEdge AI yesterday.<br>
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
      await recordUserEmail(user.id)
      sent++
    } catch (err) {
      console.error(`[no-first-session] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[no-first-session] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
