/**
 * Day 3 trial email (72h after trial start).
 *
 * Fills the dead zone between day2-trial-progress (48h) and trial-warning (day 6).
 * With the 3-day trial, days 3-5 had zero email coverage — this is the window where
 * users decide if they're going to keep using the product or drift away.
 *
 * Focus: showcase a single high-value feature the user probably hasn't tried yet
 * (Exam Rescue or Brain Dump) with a real use-case scenario. Not a generic feature list.
 *
 * Also branches on engagement: active users get a "try this next" prompt,
 * inactive users get a "here's the 10-minute thing that changes how this feels" rescue.
 *
 * Guards: trial_email_flags.day3_tips_sent, canSendUserEmail priority 'high', cronLock.
 */

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

  const locked = await acquireCronLock('day3-trial-tips')
  if (!locked) {
    console.log('[day3-trial-tips] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  // Target users whose trial started 72-84h ago (day 3 morning window).
  const now = Date.now()
  const windowStart = new Date(now - 84 * 3600 * 1000)
  const windowEnd   = new Date(now - 72 * 3600 * 1000)

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, subscription, plan, completed_sessions, courses, trial_email_flags')
    .not('subscription->trialUsedAt', 'is', null)
    .limit(2000)

  if (error) return res.status(500).json({ error: 'Failed to query users', detail: error.message })

  console.log(`[day3-trial-tips] Checking ${(rows ?? []).length} trial-used accounts`)
  let sent = 0, skipped = 0, activeBranch = 0, inactiveBranch = 0

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
      if (flags.day3_tips_sent) { skipped++; continue }

      const gate = await canSendUserEmail(row.user_id, { priority: 'high' })
      if (!gate.ok) { skipped++; continue }

      let email, firstName
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        email = authUser?.user?.email
        firstName = (authUser?.user?.user_metadata?.first_name
          ?? authUser?.user?.user_metadata?.full_name
          ?? authUser?.user?.user_metadata?.name
          ?? '').split(' ')[0] || null
      } catch { /* skip */ }
      if (!email) { skipped++; continue }

      const greeting = firstName ? `Hey ${firstName}` : 'Hey'
      const sessionCount = Array.isArray(row.completed_sessions) ? row.completed_sessions.length : 0
      const courseCount  = Array.isArray(row.courses) ? row.courses.length : 0
      const isInactive = sessionCount === 0 && courseCount === 0

      let subject, kicker, kickerColor, headline, lead, tipTitle, tipBody, ctaLabel, ctaHref, ctaSub

      if (isInactive) {
        inactiveBranch++
        subject = "Day 3 of your trial: 10 minutes will change how this feels"
        kicker = 'Day 3 · rescue'
        kickerColor = '#E8531A'
        headline = `${greeting}, you have 4 days of Pro left. Let's actually use one.`
        lead = `You haven't started a session yet. That's the part that makes it click. Here's the fastest path from "interesting app" to "this is genuinely useful":`
        tipTitle = 'The 10-minute session that changes everything'
        tipBody = `Add one course with your next exam date. Then tap Session Blueprint. The AI gives you a minute-by-minute plan for exactly what to study and for how long. Do it once, even just 10 minutes, and you'll understand why Pro users say they study more consistently.`
        ctaLabel = 'Try one session now'
        ctaHref = 'https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day3_trial_rescue'
        ctaSub = '4 days of Pro remaining.'
      } else {
        activeBranch++
        subject = sessionCount >= 3
          ? `${sessionCount} sessions in 3 days. Here's the Pro feature to use next`
          : 'Day 3: the Pro feature most students don\'t find on their own'
        kicker = 'Day 3 · next move'
        kickerColor = '#3B61C4'
        headline = sessionCount >= 3
          ? `${greeting}, ${sessionCount} sessions in 3 days. That puts you in the top 5%.`
          : `${greeting}, you've started. Here's what to do next.`
        lead = sessionCount >= 3
          ? `You've already built more study momentum than most trial users do in a week. There's one more Pro feature worth using before your trial ends.`
          : `You've logged at least one session. The next one gets easier, especially with this.`
        tipTitle = 'Try Exam Rescue on your hardest topic'
        tipBody = `Open a course, tap "Exam Rescue" on any topic you're weakest at. Paste in some notes or a concept you're struggling with. The AI identifies the specific gaps in your understanding and gives you a targeted 20-minute review plan. It's the closest thing to having a tutor look at your work and tell you exactly what to focus on.`
        ctaLabel = 'Try Exam Rescue'
        ctaHref = 'https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day3_trial_active'
        ctaSub = '4 days of Pro remaining. Keep everything at $2.99/wk.'
      }

      try {
        await resend.emails.send({
          from: 'StudyEdge AI <support@mail.getstudyedge.com>',
          to: email,
          subject,
          headers: listUnsubscribeHeaders(email),
          tags: [
            { name: 'campaign', value: 'day3_trial_tips' },
            { name: 'user_id', value: row.user_id },
          ],
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader(isInactive ? 'One 10-minute session is all it takes to go from "set up" to "actually useful."' : 'Day 3: the feature most users discover too late. Try Exam Rescue.')}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:${kickerColor};text-transform:uppercase;">${kicker}</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${headline}
        </h1>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">${lead}</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;background:${isInactive ? '#FFF6F0' : '#F4F7FF'};border-radius:12px;border:1px solid ${isInactive ? 'rgba(232,83,26,0.15)' : 'rgba(59,97,196,0.15)'};">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.06em;color:${kickerColor};text-transform:uppercase;">${tipTitle}</p>
            <p style="margin:0;font-size:14.5px;color:#111111;line-height:1.6;">${tipBody}</p>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${ctaHref}" style="display:inline-block;background:${kickerColor};color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">${ctaLabel}</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">${ctaSub}</span>
          </td></tr>
        </table>
        <p style="margin:22px 0 0;font-size:13px;color:#9B9B9B;line-height:1.6;">
          Question about Pro or the app? Reply here. I actually read them. — Ryan
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
              day3_tips_sent: new Date().toISOString(),
              day3_branch: isInactive ? 'inactive' : 'active',
            },
          })
          .eq('user_id', row.user_id)
        await recordUserEmail(row.user_id)
        sent++
      } catch (err) {
        console.error(`[day3-trial-tips] Failed to send to ${email}:`, err)
      }
    } catch (err) {
      console.error(`[day3-trial-tips] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[day3-trial-tips] Sent ${sent} (active=${activeBranch}, inactive=${inactiveBranch}), skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped, activeBranch, inactiveBranch })
}
