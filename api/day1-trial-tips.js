/**
 * Day 1 trial email (24h after trial start).
 *
 * Fires once for each trialing free-→-Pro user in the 24–36h post-trialUsedAt
 * window. Purpose: fill the silence between trial-started (t=0) and
 * trial-warning (t=48h before end). This is the moment where "did they even
 * try the app?" is decided.
 *
 * The email is personalized on `plan.schoolType` and `plan.yearLevel` (from
 * onboarding) so the copy reads to their actual context, not generic
 * "students". This is the personalization the video called out as the #1
 * lever for trial→paid conversion.
 *
 * Sends are guarded three ways:
 *   1. `trial_email_flags.day1_tips_sent` — never double-send.
 *   2. `canSendUserEmail(..., priority: 'high')` — respects the throttle
 *      (though 'high' bypasses on the current PRIORITY_GAP_HOURS map).
 *   3. `acquireCronLock('day1-trial-tips')` — prevents cron overlap.
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { acquireCronLock } from '../lib/server/cronLock.js'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Copy variants keyed by (schoolType, yearLevel). Not exhaustive — the
// generic fallback below is fine for anyone we don't have a specific hit for.
function pickAudienceCopy({ schoolType, yearLevel }) {
  const st = (schoolType ?? '').toLowerCase()
  const yl = (yearLevel ?? '').toLowerCase()

  if (st === 'exam') {
    return {
      audienceLabel: 'exam prep',
      opener: `You're prepping for a big exam — day 1 of Pro is where the AI Study Coach earns its keep.`,
      tipTitle: 'Do this today (10 minutes)',
      tipBody: `Add your exam date and drop your prep timeline into the AI Study Coach. It builds a real, week-by-week plan so you're not just cramming the last week — you're covering everything on the exam blueprint.`,
      ctaLabel: 'Build my exam plan',
      ctaHref: 'https://getstudyedge.com/app?tab=coach&utm_source=email&utm_medium=lifecycle&utm_campaign=day1_trial_tips',
    }
  }

  if (st === 'hs') {
    return {
      audienceLabel: 'high school',
      opener: yl.includes('senior')
        ? `You're a senior — GPA still matters this semester. Day 1 of Pro is when you set the plan.`
        : `Day 1 of Pro is when you set the plan. High schoolers who front-load this get the biggest lift.`,
      tipTitle: 'Do this today (5 minutes)',
      tipBody: `Add every class you're currently taking as a course. The AI reads your syllabus, spots the tests, and turns them into concrete study sessions — no more "I'll figure it out tonight".`,
      ctaLabel: 'Add my classes',
      ctaHref: 'https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day1_trial_tips',
    }
  }

  // Default: university
  const isEarlyYear = yl.includes('1st') || yl.includes('freshman') || yl.includes('2nd') || yl.includes('sophomore')
  return {
    audienceLabel: 'university',
    opener: isEarlyYear
      ? `The students who lock in a plan in the first year — that's the group that ends up with the 3.7+ GPA. Day 1 of Pro is where you start.`
      : `You know how a semester goes: quiet for 3 weeks, then everything hits at once. Pro is built to keep you in front of that curve.`,
    tipTitle: 'Do this today (5 minutes)',
    tipBody: `Add your hardest course first — the one where the exam average is 60. Drop in the exam date, and the AI Study Coach will build a real plan around it: what to study, when, and for how long.`,
    ctaLabel: 'Plan my hardest class',
    ctaHref: 'https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day1_trial_tips',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: true })

  const locked = await acquireCronLock('day1-trial-tips')
  if (!locked) {
    console.log('[day1-trial-tips] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  // Target users whose trial started 24-36h ago. That gives us a full
  // day-1 morning window without racing the trial-started confirmation email.
  const now = Date.now()
  const windowStart = new Date(now - 36 * 3600 * 1000)
  const windowEnd   = new Date(now - 24 * 3600 * 1000)

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, subscription, plan, completed_sessions, trial_email_flags')
    .not('subscription->trialUsedAt', 'is', null)
    .limit(2000)

  if (error) return res.status(500).json({ error: 'Failed to query users', detail: error.message })

  console.log(`[day1-trial-tips] Checking ${(rows ?? []).length} trial-used accounts`)
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    try {
      const sub = row.subscription ?? {}
      // Only real trialing users, not free users who have "used a trial" flag
      // set from an earlier cancelled trial.
      if (sub.status !== 'trialing') { skipped++; continue }

      const trialUsedAt = sub.trialUsedAt
      if (!trialUsedAt) { skipped++; continue }
      const trialUsedDate = new Date(trialUsedAt)
      if (isNaN(trialUsedDate.getTime())) { skipped++; continue }
      if (trialUsedDate < windowStart || trialUsedDate > windowEnd) { skipped++; continue }

      // Guard: never resend to the same user.
      const flags = row.trial_email_flags ?? {}
      if (flags.day1_tips_sent) { skipped++; continue }

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

      // Personalization inputs — stored in the `plan` JSONB on user_data.
      const planData = row.plan ?? {}
      const audience = pickAudienceCopy({
        schoolType: planData.schoolType,
        yearLevel: planData.yearLevel,
      })

      const sessionCount = Array.isArray(row.completed_sessions) ? row.completed_sessions.length : 0
      const openerLine = sessionCount === 0
        ? `You started your Pro trial yesterday. You haven't run a study session yet — that's fine, day 1 is for setup.`
        : sessionCount === 1
          ? `You logged your first session yesterday. Nice — momentum matters more than volume here.`
          : `You already logged ${sessionCount} sessions. You're moving fast — here's how to keep the streak going.`

      const greeting = firstName ? `Hey ${firstName}` : 'Hey'

      try {
        await resend.emails.send({
          from: 'StudyEdge AI <support@mail.getstudyedge.com>',
          to: email,
          subject: `${audience.audienceLabel === 'exam prep' ? 'Day 1 of exam prep' : 'Day 1 of your Pro trial'} — do this first`,
          headers: listUnsubscribeHeaders(email),
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Day 1 of your Pro trial</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader(`Day 1: the 5-minute setup step most Pro users skip — and regret.`)}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#3B61C4;text-transform:uppercase;">Day 1 · trial in progress</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${greeting} — day 1 of Pro. Let's use it right.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          ${openerLine}
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          ${audience.opener}
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;background:#F4F7FF;border-radius:12px;border:1px solid rgba(59,97,196,0.15);">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.06em;color:#3B61C4;text-transform:uppercase;">${audience.tipTitle}</p>
            <p style="margin:0;font-size:14.5px;color:#111111;line-height:1.6;">${audience.tipBody}</p>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${audience.ctaHref}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">${audience.ctaLabel}</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">~6 days left on your trial. No charge until then.</span>
          </td></tr>
        </table>
        <p style="margin:22px 0 0;font-size:13px;color:#9B9B9B;line-height:1.6;">
          Stuck on setup? Reply to this email — a real human reads them.
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

        // Mark sent + record for throttle. Merge into existing flags so we do
        // not clobber day2_progress_sent or founder_cancel_sent set elsewhere.
        await supabaseAdmin
          .from('user_data')
          .update({ trial_email_flags: { ...flags, day1_tips_sent: new Date().toISOString() } })
          .eq('user_id', row.user_id)
        await recordUserEmail(row.user_id)
        sent++
      } catch (err) {
        console.error(`[day1-trial-tips] Failed to send to ${email}:`, err)
      }
    } catch (err) {
      console.error(`[day1-trial-tips] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[day1-trial-tips] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
