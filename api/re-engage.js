import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'
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
    console.warn('[re-engage] RESEND_API_KEY not set - skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const locked = await acquireCronLock('re-engage')
  if (!locked) {
    console.log('[re-engage] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, plan, subscription, completed_sessions, syllabus_events, courses, last_emailed_at')
    .not('plan', 'is', null)

  if (error) {
    console.error('[re-engage] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  const now = Date.now()
  const todayStr = new Date().toISOString().slice(0, 10)
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    try {
      const completedSessions = Array.isArray(row.completed_sessions) ? row.completed_sessions : []
      const lastSession = completedSessions[completedSessions.length - 1]?.dateStr
      const daysSinceSession = lastSession
        ? Math.floor((now - new Date(lastSession + 'T12:00:00').getTime()) / 86400000)
        : 999

      // Only engage users who have been away 3+ days
      if (daysSinceSession < 3) { skipped++; continue }

      // Two tiers: 3-7 days = "short" dormant, 7+ days = "long" dormant
      const tier = daysSinceSession >= 7 ? 'long' : 'short'

      // Rate-limit: low priority (>= 5 days since last email of any kind)
      const gate = await canSendUserEmail(row.user_id, { priority: 'low' })
      if (!gate.ok) { skipped++; continue }

      let email
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        email = authUser?.user?.email
      } catch { /* skip */ }
      if (!email) { skipped++; continue }

      const plan        = row.plan ?? {}
      const userPlan    = row?.subscription?.plan ?? 'free'
      const trialUsed   = !!(row?.subscription?.trialUsedAt)
      const courseNames = (row?.courses ?? []).map(c => c.name).filter(Boolean)
      const sessionCount = completedSessions.length

      const upcomingExam = (row.syllabus_events ?? [])
        .filter(e => {
          const isExam = e.type === 'exam' || /exam|midterm|final|test/i.test(e.title ?? '')
          const dateStr = e.date ?? e.dateStr ?? ''
          return isExam && dateStr >= todayStr
        })
        .sort((a, b) => {
          const da = a.date ?? a.dateStr ?? ''
          const db = b.date ?? b.dateStr ?? ''
          return da.localeCompare(db)
        })[0]

      const firstName = email.split('@')[0].split('.')[0]
      const firstName2 = firstName.charAt(0).toUpperCase() + firstName.slice(1)

      // Build content based on tier
      let subject, headline, bodyPara1, bodyPara2

      if (tier === 'long') {
        // 7+ days: strong urgency, falling behind framing
        const weeksGone = Math.floor(daysSinceSession / 7)
        subject = courseNames.length
          ? `${courseNames[0]}: you've been away ${daysSinceSession} days`
          : `You've been away from StudyEdge for ${daysSinceSession} days`
        headline = courseNames.length
          ? `Your ${courseNames[0]} plan hasn't moved in ${daysSinceSession} days.`
          : `You haven't studied in ${daysSinceSession} days. Your exams aren't waiting.`
        bodyPara1 = upcomingExam
          ? `Your <strong style="color:#111111;">${upcomingExam.title ?? 'exam'}</strong> is on
             <strong style="color:#111111;">${upcomingExam.date ?? upcomingExam.dateStr}</strong>.
             Every day you don't study puts you further behind the students who are. Come back today.`
          : `${weeksGone > 1 ? `It's been ${weeksGone} weeks.` : `It's been over a week.`}
             The students who fall behind in their courses aren't the ones who don't understand the material.
             They're the ones who lose their rhythm. You still have time to get it back.`
        bodyPara2 = sessionCount > 0
          ? `You completed ${sessionCount} session${sessionCount !== 1 ? 's' : ''} before you stepped away.
             That work doesn't disappear. Pick up exactly where you left off.`
          : null
      } else {
        // 3-6 days: lighter nudge, course-specific
        subject = courseNames.length
          ? `${courseNames[0]} won't study itself`
          : 'Your study streak is ready to restart'
        headline = courseNames.length
          ? `Your ${courseNames.slice(0, 2).join(' and ')} plan is ready for you.`
          : 'Your study plan is still here. Pick up where you left off.'
        bodyPara1 = upcomingExam
          ? `Your <strong style="color:#111111;">${upcomingExam.title ?? 'exam'}</strong>
             on <strong style="color:#111111;">${upcomingExam.date ?? upcomingExam.dateStr}</strong> is coming.
             A short session today is better than cramming later.`
          : `It's been a few days. Your sessions are still here, and a short study block today
             is enough to rebuild the habit.`
        bodyPara2 = null
      }

      const courseListHtml = courseNames.length
        ? courseNames.slice(0, 3).map(name => `
          <tr>
            <td style="padding:9px 0;border-bottom:1px solid #F0EDE8;">
              <span style="color:#3B61C4;font-weight:600;margin-right:10px;">→</span>
              <span style="font-size:14px;color:#111111;">${name}</span>
            </td>
          </tr>`).join('')
        : `<tr><td style="padding:9px 0;font-size:14px;color:#6B6B6B;">Your courses are ready. Pick up where you left off.</td></tr>`

      const urgencyBadge = upcomingExam && tier === 'long'
        ? `<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            <tr><td style="background:#FFF7ED;border-radius:12px;border:1px solid #FED7AA;padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#92400E;line-height:1.55;">
                ⚠️ <strong>${upcomingExam.title ?? 'Exam'}</strong> on
                <strong>${upcomingExam.date ?? upcomingExam.dateStr}</strong>.
                You have ${Math.max(1, Math.floor((new Date(upcomingExam.date ?? upcomingExam.dateStr).getTime() - now) / 86400000))} days left.
              </p>
            </td></tr>
          </table>`
        : ''

      await resend.emails.send({
        from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
        to: email,
        subject,
        headers: listUnsubscribeHeaders(email),
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Come back to StudyEdge</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader(courseNames.length ? `Your ${courseNames[0]} plan is sitting here. ${daysSinceSession} days of ground to make up.` : `You've been away ${daysSinceSession} days. Your study plan is waiting.`)}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:${tier === 'long' ? '#E8531A' : '#9B9B9B'};text-transform:uppercase;">
          ${tier === 'long' ? `${daysSinceSession} days away` : 'Come back'}
        </p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${headline}
        </h1>

        ${urgencyBadge}

        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">${bodyPara1}</p>
        ${bodyPara2 ? `<p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">${bodyPara2}</p>` : ''}

        ${courseNames.length ? `<p style="margin:18px 0 8px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Your courses</p>` : ''}
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${courseListHtml}
        </table>

        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=re_engage_${tier}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Resume studying</a>
          </td></tr>
        </table>

        ${userPlan === 'free' ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:20px;">
          <tr><td style="background:#F4F7FF;border-radius:12px;border:1px solid rgba(59,97,196,0.15);padding:16px 20px;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#3B61C4;">
              ${trialUsed ? 'Upgrade to Pro' : 'You have a free trial waiting'}
            </p>
            <p style="margin:0 0 12px;font-size:13px;color:#6B6B6B;line-height:1.55;">
              ${trialUsed
                ? 'Everything you had during your trial: unlimited AI tutoring, 5 courses, Blueprints every session, back permanently for $2.99/wk.'
                : `Try every Pro feature free for 3 days. Unlimited AI tutoring, Session Blueprints on every study block, 5 courses. Card required. Cancel before day 4 and pay nothing.`}
            </p>
            <a href="https://getstudyedge.com/app?${trialUsed ? 'upgrade=1' : 'signup=1&plan=pro&billing=weekly&trial=1'}&utm_source=email&utm_medium=lifecycle&utm_campaign=re_engage_${tier}_upsell" style="display:inline-block;background:#E8531A;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;padding:10px 22px;">
              ${trialUsed ? 'Upgrade to Pro →' : 'Start free trial →'}
            </a>
          </td></tr>
        </table>` : ''}
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You have an active StudyEdge AI account.<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
          &nbsp;&middot;&nbsp;
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(email ?? '')}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })

      await recordUserEmail(row.user_id)
      sent++
    } catch (err) {
      console.error(`[re-engage] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[re-engage] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
