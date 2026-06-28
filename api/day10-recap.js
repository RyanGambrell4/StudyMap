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

  const locked = await acquireCronLock('day10-recap')
  if (!locked) {
    console.log('[day10-recap] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const now = new Date()
  // Target users who signed up 9.5–10.5 days ago
  const windowStart = new Date(now - 252 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 228 * 60 * 60 * 1000)

  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  if (error) return res.status(500).json({ error: 'Failed to list users', detail: error.message })
  const targetUsers = (rows ?? []).map(r => ({ id: r.user_id, email: r.email }))

  console.log(`[day10-recap] Found ${targetUsers.length} users at 10-day mark`)
  let sent = 0, skipped = 0

  for (const user of targetUsers) {
    if (!user.email) continue

    const { data: row, error: rowError } = await supabaseAdmin
      .from('user_data')
      .select('subscription, completed_sessions, courses, syllabus_events')
      .eq('user_id', user.id)
      .maybeSingle()

    if (rowError) { skipped++; continue }

    const plan = row?.subscription?.plan ?? 'free'
    if (plan !== 'free') { skipped++; continue }

    const gate = await canSendUserEmail(user.id, { priority: 'normal' })
    if (!gate.ok) { skipped++; continue }

    const sessionCount  = Array.isArray(row?.completed_sessions) ? row.completed_sessions.length : 0
    const courseCount   = Array.isArray(row?.courses) ? row.courses.length : 0
    const courseNames   = (row?.courses ?? []).map(c => c.name).filter(Boolean)
    const trialUsed     = !!(row?.subscription?.trialUsedAt || row?.subscription?.trial_activated)

    const todayStr = new Date().toISOString().slice(0, 10)
    const upcomingExam = (row?.syllabus_events ?? [])
      .filter(e => {
        const isExam = e.type === 'exam' || /exam|midterm|final|test/i.test(e.title ?? '')
        const dateStr = e.date ?? e.dateStr ?? ''
        return isExam && dateStr >= todayStr
      })
      .sort((a, b) => (a.date ?? a.dateStr ?? '').localeCompare(b.date ?? b.dateStr ?? ''))[0]

    const upgradeUrl = trialUsed
      ? `https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=day10_winback`
      : `https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=day10_recap`
    const ctaLabel    = trialUsed ? 'Upgrade to Pro — $2.99/wk' : 'Start 3-day free trial'
    const ctaFootnote = trialUsed ? '$2.99/wk · Cancel anytime' : '$0 today · $2.99/wk after · cancel anytime'

    const activityBlock = sessionCount > 0 || courseCount > 0
      ? `<p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          You've added <strong style="color:#111111;">${courseCount} course${courseCount !== 1 ? 's' : ''}</strong> and completed
          <strong style="color:#111111;">${sessionCount} study session${sessionCount !== 1 ? 's' : ''}</strong> in your first 10 days.
          That puts you ahead of most students who sign up — they quit in the first week.
        </p>`
      : `<p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          You've been on StudyEdge for 10 days. You haven't started yet — but your plan is still here.
          Students who add their first course this week are 4× more likely to stick with it.
        </p>`

    const examLine = upcomingExam
      ? `<p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Your next exam — <strong style="color:#111111;">${upcomingExam.title ?? 'upcoming exam'}</strong> on
          <strong style="color:#111111;">${upcomingExam.date ?? upcomingExam.dateStr}</strong> — is getting closer.
          Pro users get unlimited blueprints and a full multi-week plan built around it.
        </p>`
      : ''

    const courseListHtml = courseNames.length
      ? `<p style="margin:18px 0 8px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Your courses</p>
         <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
           ${courseNames.slice(0, 3).map(name => `
           <tr><td style="padding:8px 0;border-bottom:1px solid #F0EDE8;">
             <span style="color:#3B61C4;font-weight:600;margin-right:10px;">→</span>
             <span style="font-size:14px;color:#111111;">${name}</span>
           </td></tr>`).join('')}
         </table>`
      : ''

    try {
      await resend.emails.send({
        from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
        to: user.email,
        subject: trialUsed ? '10 days in — time to go back to Pro?' : "10 days in. Here's what you're still leaving on the table.",
        headers: listUnsubscribeHeaders(user.email),
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>10 days on StudyEdge</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader("10 days in. Here's where you stand — and what Pro unlocks for the rest of your semester.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Day 10 check-in</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">You've been on StudyEdge for 10 days.</h1>

        ${activityBlock}
        ${examLine}
        ${courseListHtml}

        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Here's what the free plan is holding back:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${[
            ['100 AI actions / month', 'Free gives you 2 total. Pro is enough for your entire semester.'],
            ['5 courses (not just 1)', 'Track every class you\'re taking with its own plan and schedule.'],
            ['Unlimited Session Blueprints', 'A minute-by-minute plan before every study session, every time.'],
            ['Rebuild plans anytime', 'New exam dates, grade changes, schedule shifts — your coach adapts.'],
            ['Brain Dumps, Quiz Bursts, Exam Rescue', 'All the AI study tools, all unlimited.'],
          ].map(([feat, desc]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
              <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
              <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${desc}</div>
            </td>
          </tr>`).join('')}
        </table>

        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Pro is <strong style="color:#111111;">$2.99/week</strong>, less than a coffee.
          ${trialUsed
            ? 'You\'ve already seen what it does. Everything you had during your trial, back permanently.'
            : 'Try it free for 3 days — no charge until day 4, cancel anytime before then.'}
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
          You signed up 10 days ago. <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
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
      console.error(`[day10-recap] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day10-recap] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
