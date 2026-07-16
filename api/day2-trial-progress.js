/**
 * Day 2 trial email (48h after trial start).
 *
 * Fires for every trialing user in the 48–60h post-trialUsedAt window.
 * The whole point is engagement branching: users who have used the app and
 * users who haven't need completely different messages.
 *
 *   * ACTIVE branch (>= 1 completed session): reinforce progress, name a
 *     specific power feature they haven't used yet, keep them on the hook.
 *   * INACTIVE branch (0 sessions, or no data): "you have 1 day left, here's
 *     the 5-minute win that will make the trial worth it" — a rescue nudge
 *     before the trial ends.
 *
 * Personalized by onboarding data (schoolType, yearLevel) via the same
 * approach as day1-trial-tips.js.
 *
 * Fires 3h after day1 in the day, and both are guarded by trial_email_flags
 * so double-sends are impossible.
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { acquireCronLock } from '../lib/server/cronLock.js'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Audience-conditioned copy chunks. Kept small and named so the branching
// logic below is obvious at read-time.
function pickAudienceLine({ schoolType, yearLevel }) {
  const st = (schoolType ?? '').toLowerCase()
  const yl = (yearLevel ?? '').toLowerCase()
  if (st === 'exam') return `Exam prep is a marathon. Pro was built for the last 4 weeks especially.`
  if (st === 'hs') return `High school GPA compounds. One semester on Pro can shift a transcript real fast.`
  if (yl.includes('4th') || yl.includes('senior')) return `Senior year. Grad school apps are watching this GPA more than any other.`
  return `Semester grades come down to the last 3 weeks. Pro is your setup for those weeks.`
}

// The two branches. Named so the fork below reads cleanly.
function inactiveBody({ audienceLine, greeting, firstName }) {
  const nameSuffix = firstName ? ` ${firstName},` : ''
  return {
    subject: 'Your trial is more than half gone. 5 minutes fixes that.',
    heading: `Trial is halfway done${nameSuffix ? '' : '.'}${firstName ? ' Let\'s not waste it.' : ''}`,
    kicker: 'Day 2 · rescue',
    kickerColor: '#E8531A',
    lead: `${greeting}, you haven't run a session yet. That's the only thing standing between you and knowing if this actually works for you.`,
    tipTitle: 'The 5-minute win',
    tipBody: `Add one course with the next real exam date. That's it. The AI Study Coach will spin up a specific plan and a Session Blueprint automatically. You'll see in one session whether this is worth $2.99/wk.`,
    tipContext: audienceLine,
    ctaLabel: 'Try one session now',
    ctaHref: 'https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day2_rescue',
    ctaSub: 'Trial ends in ~5 days.',
  }
}

function activeBody({ audienceLine, greeting, firstName, sessionCount }) {
  const strong = sessionCount >= 3
  return {
    subject: strong ? "You're using Pro like you mean it. One more thing." : 'Nice. Day 2 momentum. Try this next.',
    heading: strong ? `${sessionCount} sessions in 2 days. You're already on the top 10% curve.` : `You're using it. Let's stack one more win.`,
    kicker: 'Day 2 · momentum',
    kickerColor: '#22C55E',
    lead: strong
      ? `${greeting}, most Pro users take a week to log ${sessionCount} sessions. You did it in 2 days. That pattern is the whole game.`
      : `${greeting}, you've run at least one session. That already puts you ahead of most trial users. One more today locks the habit.`,
    tipTitle: 'The Pro feature most users miss',
    tipBody: `Open a course, tap "Cheat Sheet" on a topic you're weakest at. The AI pulls the exam-critical formulas + concepts onto one printable page. Bring it to class tomorrow. It compresses hours of note-review into a single scan.`,
    tipContext: audienceLine,
    ctaLabel: 'Generate a cheat sheet',
    ctaHref: 'https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day2_active',
    ctaSub: 'Trial ends in ~5 days. Keep Pro at $2.99/wk.',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: true })

  const locked = await acquireCronLock('day2-trial-progress')
  if (!locked) {
    console.log('[day2-trial-progress] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  // Target users whose trial started 48-60h ago. This must not overlap with
  // the trial-warning window (48-72h — fires at 24h remaining). We send early
  // in that window so day-2 morning delivery lands well.
  const now = Date.now()
  const windowStart = new Date(now - 60 * 3600 * 1000)
  const windowEnd   = new Date(now - 48 * 3600 * 1000)

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, subscription, plan, completed_sessions, trial_email_flags')
    .not('subscription->trialUsedAt', 'is', null)
    .limit(2000)

  if (error) return res.status(500).json({ error: 'Failed to query users', detail: error.message })

  console.log(`[day2-trial-progress] Checking ${(rows ?? []).length} trial-used accounts`)
  let sent = 0, skipped = 0
  let activeBranch = 0, inactiveBranch = 0

  for (const row of rows ?? []) {
    try {
      const sub = row.subscription ?? {}
      if (sub.status !== 'trialing') { skipped++; continue }

      const trialUsedAt = sub.trialUsedAt
      if (!trialUsedAt) { skipped++; continue }
      const trialUsedDate = new Date(trialUsedAt)
      if (isNaN(trialUsedDate.getTime())) { skipped++; continue }
      if (trialUsedDate < windowStart || trialUsedDate > windowEnd) { skipped++; continue }

      const flags = row.trial_email_flags ?? {}
      if (flags.day2_progress_sent) { skipped++; continue }

      const gate = await canSendUserEmail(row.user_id, { priority: 'high' })
      if (!gate.ok) { skipped++; continue }

      let email
      let firstName = null
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        email = authUser?.user?.email
        firstName = (authUser?.user?.user_metadata?.first_name
          ?? authUser?.user?.user_metadata?.full_name
          ?? authUser?.user?.user_metadata?.name
          ?? '').split(' ')[0] || null
      } catch { /* skip */ }
      if (!email) { skipped++; continue }

      const planData = row.plan ?? {}
      const audienceLine = pickAudienceLine({ schoolType: planData.schoolType, yearLevel: planData.yearLevel })
      const greeting = firstName ? `Hey ${firstName}` : 'Hey'

      // Engagement branching. "Inactive" = 0 completed sessions after 48h.
      const sessionCount = Array.isArray(row.completed_sessions) ? row.completed_sessions.length : 0
      const isInactive = sessionCount === 0
      const body = isInactive
        ? inactiveBody({ audienceLine, greeting, firstName })
        : activeBody({ audienceLine, greeting, firstName, sessionCount })

      if (isInactive) inactiveBranch++
      else activeBranch++

      try {
        await resend.emails.send({
          from: 'StudyEdge AI <support@mail.getstudyedge.com>',
          to: email,
          subject: body.subject,
          headers: listUnsubscribeHeaders(email),
          tags: [
            { name: 'campaign', value: 'day2_trial_progress' },
            { name: 'user_id', value: row.user_id },
          ],
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${body.subject}</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader(isInactive ? 'One 5-minute session will tell you if StudyEdge Pro is right for you. You have a day left.' : 'You are 2 days in. One more feature to try before the trial ends.')}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:${body.kickerColor};text-transform:uppercase;">${body.kicker}</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${body.heading}
        </h1>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">${body.lead}</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;background:${isInactive ? '#FFF6F0' : '#F0FAF4'};border-radius:12px;border:1px solid ${isInactive ? 'rgba(232,83,26,0.15)' : 'rgba(34,197,94,0.15)'};">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.06em;color:${body.kickerColor};text-transform:uppercase;">${body.tipTitle}</p>
            <p style="margin:0 0 8px;font-size:14.5px;color:#111111;line-height:1.6;">${body.tipBody}</p>
            <p style="margin:0;font-size:13px;color:#6B6B6B;line-height:1.55;font-style:italic;">${body.tipContext}</p>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${body.ctaHref}" style="display:inline-block;background:${body.kickerColor};color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">${body.ctaLabel}</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">${body.ctaSub}</span>
          </td></tr>
        </table>
        <p style="margin:22px 0 0;font-size:13px;color:#9B9B9B;line-height:1.6;">
          Got a blocker? Reply to this email. I actually read them. — Ryan
        </p>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because your StudyEdge AI Pro trial is active.
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
          &nbsp;&middot;&nbsp;
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(email)}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
        })

        await supabaseAdmin
          .from('user_data')
          .update({
            trial_email_flags: {
              ...flags,
              day2_progress_sent: new Date().toISOString(),
              day2_branch: isInactive ? 'inactive' : 'active',
            },
          })
          .eq('user_id', row.user_id)
        await recordUserEmail(row.user_id)
        sent++
      } catch (err) {
        console.error(`[day2-trial-progress] Failed to send to ${email}:`, err)
      }
    } catch (err) {
      console.error(`[day2-trial-progress] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[day2-trial-progress] Sent ${sent} (active=${activeBranch}, inactive=${inactiveBranch}), skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped, activeBranch, inactiveBranch })
}
