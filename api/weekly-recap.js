import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { acquireCronLock } from '../lib/server/cronLock.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[weekly-recap] RESEND_API_KEY not set - skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const locked = await acquireCronLock('weekly-recap')
  if (!locked) {
    console.log('[weekly-recap] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, completed_sessions, study_tools, subscription, syllabus_events, email_digest')
    .limit(1000)

  if (error) {
    console.error('[weekly-recap] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  const now = new Date()
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    // Sunday dedupe: opt-in digest subscribers get weekly-digest instead (richer content).
    if (row.email_digest) { skipped++; continue }

    const allSessions = Array.isArray(row.completed_sessions) ? row.completed_sessions : []
    const weekSessions = allSessions.filter(s => {
      const d = new Date(s.completedAt ?? s.date ?? s.timestamp ?? 0)
      return d >= weekAgo
    })
    const streak = row.study_tools?._streak?.currentStreak ?? 0
    const activeStatuses = ['active', 'trialing', 'past_due']
    const sub = row.subscription ?? {}
    const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
    if (weekSessions.length === 0 && streak === 0) { skipped++; continue }

    const gate = await canSendUserEmail(row.user_id, { priority: 'normal' })
    if (!gate.ok) { skipped++; continue }

    const todayStr = now.toISOString().slice(0, 10)
    const weekAheadStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const upcomingExams = (row.syllabus_events ?? [])
      .filter(e => {
        const isExam = e.type === 'exam' || /exam|midterm|final|test/i.test(e.title ?? '')
        const dateStr = e.date ?? e.dateStr ?? ''
        return isExam && dateStr >= todayStr && dateStr <= weekAheadStr
      })
      .sort((a, b) => (a.date ?? a.dateStr ?? '').localeCompare(b.date ?? b.dateStr ?? ''))
      .slice(0, 3)

    let email
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
      email = authUser?.user?.email
    } catch { /* skip */ }
    if (!email) { skipped++; continue }

    const highlights = weekSessions.slice(0, 3).map(s => s.course ?? s.title ?? 'Study session')
    const totalMins = weekSessions.reduce((sum, s) => sum + (Number(s.duration) || 0), 0)
    const hoursStr = totalMins >= 60 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : totalMins > 0 ? `${totalMins}m` : '-'
    const sessionWord = weekSessions.length === 1 ? 'session' : 'sessions'
    const streakLine = streak >= 2 ? `${streak}-day streak - keep it going.` : null
    const motiveLine = weekSessions.length >= 5
      ? "That's a strong week. Consistency like this is what moves the needle."
      : weekSessions.length >= 3 ? "Solid week. You're building the habit."
      : weekSessions.length >= 1 ? "You showed up this week. That's more than most."
      : "Even one session a week adds up. Your schedule is ready when you are."
    const isFreePlan = plan === 'free'
    const trialUsed = !!(sub.trialUsedAt)

    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@mail.getstudyedge.com>',
        to: email,
        subject: weekSessions.length > 0
          ? `Your week: ${weekSessions.length} ${sessionWord} completed${streak >= 2 ? ` · ${streak}-day streak` : ''}`
          : 'Your weekly study recap',
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your weekly study recap</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;outline:none;text-decoration:none;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Weekly Recap</p>
        <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${weekSessions.length > 0 ? `You completed ${weekSessions.length} study ${sessionWord} this week.` : "Your study plan is ready for the week ahead."}
        </h1>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
          <tr>
            <td style="text-align:center;padding:16px 12px;background:#F7F6F3;border-radius:12px;" width="33%">
              <div style="font-size:22px;font-weight:800;color:#111111;">${weekSessions.length}</div>
              <div style="font-size:11px;color:#9B9B9B;margin-top:4px;">sessions</div>
            </td>
            <td width="8px"></td>
            <td style="text-align:center;padding:16px 12px;background:#F7F6F3;border-radius:12px;" width="33%">
              <div style="font-size:22px;font-weight:800;color:#111111;">${streak}</div>
              <div style="font-size:11px;color:#9B9B9B;margin-top:4px;">day streak</div>
            </td>
            <td width="8px"></td>
            <td style="text-align:center;padding:16px 12px;background:#F7F6F3;border-radius:12px;" width="33%">
              <div style="font-size:22px;font-weight:800;color:#111111;">${hoursStr}</div>
              <div style="font-size:11px;color:#9B9B9B;margin-top:4px;">studied</div>
            </td>
          </tr>
        </table>

        ${highlights.length > 0 ? `
        <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">This week's sessions</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:18px;">
          ${highlights.map(h => `<tr><td style="padding:9px 0;border-bottom:1px solid #F0EDE8;font-size:14px;color:#111111;"><span style="color:#3B61C4;margin-right:8px;">✓</span>${h}</td></tr>`).join('')}
          ${weekSessions.length > 3 ? `<tr><td style="padding:9px 0;font-size:12px;color:#9B9B9B;">+${weekSessions.length - 3} more</td></tr>` : ''}
        </table>` : ''}

        ${upcomingExams.length > 0 ? `
        <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Exams this week</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:18px;background:#FFF5E6;border:1px solid #F4DDB6;border-radius:10px;">
          ${upcomingExams.map((e, i) => {
            const dateStr = e.date ?? e.dateStr ?? ''
            const label = dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
            return `<tr>
              <td style="padding:11px 14px;${i < upcomingExams.length - 1 ? 'border-bottom:1px solid #F4DDB6;' : ''}">
                <span style="font-size:14px;font-weight:600;color:#7A4B0A;">${e.title ?? 'Exam'}</span>
                ${label ? `<span style="font-size:12px;color:#9C6E2A;margin-left:8px;">${label}</span>` : ''}
              </td>
            </tr>`
          }).join('')}
        </table>` : ''}

        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          ${motiveLine}${streakLine ? `<br><strong style="color:#111111;">${streakLine}</strong>` : ''}
        </p>

        ${isFreePlan ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;background:rgba(59,97,196,0.06);border:1px solid rgba(59,97,196,0.18);border-radius:12px;margin-bottom:22px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:14px;font-weight:600;color:#111111;margin-bottom:4px;">${trialUsed ? 'Keep the momentum with Pro' : 'Your free 7-day trial is waiting'}</div>
            <div style="font-size:13px;color:#6B6B6B;line-height:1.55;margin-bottom:6px;">${trialUsed ? 'Unlimited AI tutoring, brain dumps, session blueprints, and Study Coach. $2.99/wk.' : 'Pro gives you 100 AI boosts/month, 5 courses, Study Coach, and Session Blueprints. $2.99/wk after the trial.'}</div>
            ${!trialUsed ? `<div style="font-size:12px;color:#9B9B9B;margin-bottom:12px;">Card required · Cancel before day 8 and pay nothing</div>` : `<div style="margin-bottom:12px;"></div>`}
            <a href="https://getstudyedge.com/app?${trialUsed ? 'upgrade=1' : 'signup=1&plan=pro&billing=weekly&trial=1'}&utm_source=email&utm_medium=lifecycle&utm_campaign=weekly_recap" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;padding:9px 18px;">${trialUsed ? 'Upgrade to Pro →' : 'Start free 7-day trial →'}</a>
          </td></tr>
        </table>` : ''}

        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app" style="display:inline-block;background:#111111;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Open my study plan</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Weekly recap from StudyEdge AI · Every Sunday<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
          &nbsp;&middot;&nbsp;
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(email)}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">- The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      await recordUserEmail(row.user_id)
      sent++
    } catch (err) {
      console.error(`[weekly-recap] Failed to send to ${email}:`, err)
    }
  }

  console.log(`[weekly-recap] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
