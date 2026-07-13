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

  const locked = await acquireCronLock('day3-progress')
  if (!locked) {
    console.log('[day3-progress] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const now = new Date()
  // Target users who signed up 2.5–3.5 days ago (60–84 hours)
  const windowStart = new Date(now - 84 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 60 * 60 * 60 * 1000)

  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  if (error) return res.status(500).json({ error: 'Failed to list users', detail: error.message })
  const targetUsers = (rows ?? []).map(r => ({ id: r.user_id, email: r.email }))

  console.log(`[day3-progress] Found ${targetUsers.length} users at 3-day mark`)
  let sent = 0, skipped = 0

  for (const user of targetUsers) {
    if (!user.email) continue

    const { data: row, error: rowError } = await supabaseAdmin
      .from('user_data')
      .select('subscription, completed_sessions, courses')
      .eq('user_id', user.id)
      .maybeSingle()

    if (rowError) {
      console.error(`[day3-progress] Failed to read user data for ${user.id}:`, rowError.message)
      skipped++
      continue
    }

    const plan = row?.subscription?.plan ?? 'free'
    if (plan !== 'free') { skipped++; continue }

    const gate = await canSendUserEmail(user.id, { priority: 'normal' })
    if (!gate.ok) { skipped++; continue }

    const sessionCount = Array.isArray(row?.completed_sessions) ? row.completed_sessions.length : 0
    const courseCount  = Array.isArray(row?.courses) ? row.courses.length : 0
    const trialUsed    = !!(row?.subscription?.trialUsedAt || row?.subscription?.trial_activated)

    const hasActivity = sessionCount > 0 || courseCount > 0
    const activityLine = hasActivity
      ? `You've completed ${sessionCount} study session${sessionCount !== 1 ? 's' : ''} and added ${courseCount} course${courseCount !== 1 ? 's' : ''} in 3 days. That's a real start.`
      : `You signed up 3 days ago. Most students take a bit to get going — your plan is still here when you're ready.`

    const upgradeUrl = trialUsed
      ? `https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=day3_winback`
      : `https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=day3_progress`
    const ctaLabel    = trialUsed ? 'Upgrade to Pro — $2.99/wk' : 'Start 7-day free trial'
    const ctaFootnote = trialUsed ? '$2.99/wk · Cancel anytime' : '7-day trial · $2.99/wk after · Cancel anytime'

    try {
      await resend.emails.send({
        from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
        to: user.email,
        subject: hasActivity ? "3 days in — here's what you're still missing" : "Still figuring things out? Let me help.",
        headers: listUnsubscribeHeaders(user.email),
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>3 days on StudyEdge</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader("Three days in. Here's what Pro changes — and why free-plan students fall behind.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Day 3 check-in</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">You've been on StudyEdge for 3 days.</h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">${activityLine}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Here's what the free plan doesn't give you — and why it matters now, not later:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${[
            ['100 AI actions / month', 'Free gives you 2 total. Pro is enough for daily use all semester long.'],
            ['Session Blueprints — every session', 'A minute-by-minute plan before you sit down. Free users guess.'],
            ['5 courses', 'Track every class. Free is limited to 1.'],
            ['Study Coach anytime', 'Rebuild your full plan around new exams, grades, or schedule changes.'],
            ['Brain Dumps, Quiz Bursts, Exam Rescue', 'All the AI tools that actually change how you study — all unlimited.'],
          ].map(([feat, desc]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
              <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
              <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${desc}</div>
            </td>
          </tr>`).join('')}
        </table>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Pro is <strong style="color:#111111;">$2.99/week</strong> — less than a coffee. ${trialUsed ? 'Everything you had during your trial, permanently.' : 'Try it free for 7 days. Card required, auto-renews unless you cancel.'}
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${upgradeUrl}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">${ctaLabel}</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">${ctaFootnote}</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You signed up 3 days ago. <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
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
      console.error(`[day3-progress] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day3-progress] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
