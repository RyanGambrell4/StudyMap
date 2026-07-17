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

  const locked = await acquireCronLock('day7-milestone')
  if (!locked) {
    console.log('[day7-milestone] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const now = new Date()
  const windowStart = new Date(now - 172 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 156 * 60 * 60 * 1000)

  // Direct RPC against auth.users - auth.admin.listUsers() is broken on
  // GoTrue when any OAuth user exists (NULL confirmation_token scan panic).
  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  if (error) return res.status(500).json({ error: 'Failed to list users', detail: error.message })
  const weekOldUsers = (rows ?? []).map(r => ({ id: r.user_id, email: r.email, created_at: r.created_at }))

  console.log(`[day7-milestone] Found ${weekOldUsers.length} users at 7-day mark`)
  let sent = 0, skipped = 0

  for (const user of weekOldUsers) {
    if (!user.email) continue

    const { data: row, error: rowError } = await supabaseAdmin
      .from('user_data')
      .select('subscription, completed_sessions, courses')
      .eq('user_id', user.id)
      .maybeSingle()

    if (rowError) {
      console.error(`[day7] Failed to read user data for ${user.id}:`, rowError.message)
      skipped++
      continue
    }

    const plan = row?.subscription?.plan ?? 'free'
    const sessionCount = Array.isArray(row?.completed_sessions) ? row.completed_sessions.length : 0
    const courseCount = Array.isArray(row?.courses) ? row.courses.length : 0
    const trialUsed = !!(row?.subscription?.trialUsedAt || row?.subscription?.trial_activated)
    if (plan !== 'free') { skipped++; continue }

    const gate = await canSendUserEmail(user.id, { priority: 'normal' })
    if (!gate.ok) { skipped++; continue }

    const hasActivity = sessionCount > 0 || courseCount > 0
    const activityLine = hasActivity
      ? `You've added ${courseCount} course${courseCount !== 1 ? 's' : ''} and completed ${sessionCount} study session${sessionCount !== 1 ? 's' : ''}. Solid start.`
      : `You signed up a week ago but haven't started yet. That's okay. Most people take a few days to get going.`

    const upgradeUrl = trialUsed
      ? `https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day7_winback`
      : `https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=day7_milestone`
    const ctaLabel = trialUsed ? 'Upgrade to Pro · $2.99/wk' : 'Start 7-day free trial'
    const ctaFootnote = trialUsed ? '$2.99/wk · Cancel in account anytime' : '7-day trial · $2.99/wk after · Card required · Cancel in account anytime'
    const valueClose = trialUsed
      ? `Pro is <strong style="color:#111111;">$2.99/week</strong>, less than a coffee. Everything you had during your trial, permanently.`
      : `Pro is <strong style="color:#111111;">$2.99/week</strong>, less than a coffee. Try it free for 7 days. Card required, auto-renews unless you cancel.`

    try {
      await resend.emails.send({
        from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
        to: user.email,
        subject: trialUsed ? "One week in. Ready to go back to Pro?" : "One week in. Here's what you're still missing.",
        headers: listUnsubscribeHeaders(user.email),
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>One week on StudyEdge</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader("One week in. Here's what the free plan can't give you - and what Pro changes.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Week 1 check-in</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">You've been on StudyEdge for a week.</h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">${activityLine}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Pro is built for students past the "maybe I'll try it" phase. If you've been using StudyEdge this week, that's you. Here's what you're missing on free:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${[
            ['100 AI actions / month', 'Free gives you 5 total. Pro is enough for daily use all semester.'],
            ['5 courses · not just 1', 'Track every class you\'re taking, with its own plan'],
            ['Unlimited Session Blueprints', 'A minute-by-minute plan before every study block'],
            ['AI Study Coach, on demand', 'Rebuild your full multi-week plan any time things change'],
            ['No more lifetime feature caps', 'Brain Dumps, Quiz Bursts, Exam Rescues all unlimited'],
          ].map(([feat, desc]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
              <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
              <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${desc}</div>
            </td>
          </tr>`).join('')}
        </table>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">${valueClose}</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${upgradeUrl}" style="display:inline-block;background:${trialUsed ? '#3B61C4' : '#E8531A'};color:#FFFFFF;font-size:${trialUsed ? '14' : '15'}px;font-weight:700;text-decoration:none;border-radius:10px;padding:${trialUsed ? '13px 30px' : '14px 32px'};">${ctaLabel}</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">${ctaFootnote}</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You signed up one week ago. <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
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
      console.error(`[day7-milestone] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day7-milestone] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
