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

  const locked = await acquireCronLock('trial-warning')
  if (!locked) {
    console.log('[trial-warning] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  // Target users whose trial ends in ~24h: trialUsedAt was 144-168h ago.
  // 7-day trial = trialUsedAt + 168h. We fire when 24h remains = 144-168h after trialUsedAt.
  const now = new Date()
  const windowStart = new Date(now - 168 * 60 * 60 * 1000) // 7 days ago
  const windowEnd   = new Date(now - 144 * 60 * 60 * 1000) // 6 days ago

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, subscription, completed_sessions, courses, trial_email_flags')
    .not('subscription->trialUsedAt', 'is', null)
    .limit(2000)

  if (error) return res.status(500).json({ error: 'Failed to query users', detail: error.message })

  console.log(`[trial-warning] Checking ${(rows ?? []).length} trial-used accounts`)
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    try {
      const sub = row.subscription ?? {}
      const plan = sub.plan ?? 'free'
      if (plan !== 'free') { skipped++; continue }

      const trialUsedAt = sub.trialUsedAt
      if (!trialUsedAt) { skipped++; continue }

      const trialUsedDate = new Date(trialUsedAt)
      if (isNaN(trialUsedDate.getTime())) { skipped++; continue }

      // Only send when trialUsedAt falls in the 48-72h ago window (trial ends in ~24h).
      if (trialUsedDate < windowStart || trialUsedDate > windowEnd) { skipped++; continue }

      const gate = await canSendUserEmail(row.user_id, { priority: 'high' })
      if (!gate.ok) { skipped++; continue }

      let email
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        email = authUser?.user?.email
      } catch { /* skip */ }
      if (!email) { skipped++; continue }

      const sessionCount    = Array.isArray(row.completed_sessions) ? row.completed_sessions.length : 0
      const courseCount     = Array.isArray(row.courses) ? row.courses.length : 0
      const eng             = row.subscription?.email_engagement ?? {}
      const openedCampaigns = Array.isArray(eng.opened_campaigns) ? eng.opened_campaigns : []
      const clickedAny      = Array.isArray(eng.clicked_campaigns) && eng.clicked_campaigns.length > 0

      // Branch on real engagement signals: sessions completed + emails opened/clicked.
      // High engagement = they're interested but haven't paid — needs a different push.
      // Zero activity = they never tried it — needs a "you're about to let it expire unused" message.
      const isHighEngagement = sessionCount >= 3 || (openedCampaigns.length >= 2 && sessionCount >= 1) || clickedAny
      const isZeroActivity   = sessionCount === 0 && openedCampaigns.length === 0

      let subject, kicker, heading, activityLine
      if (isHighEngagement) {
        subject      = sessionCount >= 3
          ? `You've logged ${sessionCount} sessions. Don't let that reset.`
          : `You've been paying attention. Here's the honest case.`
        kicker       = 'Trial ending: you\'re engaged'
        heading      = sessionCount >= 3
          ? `${sessionCount} sessions in 7 days. That's the habit that changes grades.`
          : `You've read every email. Here's why $2.99 actually makes sense.`
        activityLine = sessionCount >= 3
          ? `You've logged ${sessionCount} sessions in 7 days. That puts you in the top 10% of trial users. Tomorrow, without Pro, those AI Study Coach plans, Blueprints, and Exam Rescue runs all go away. The 5-course tracking drops back to 1.`

          : `You've been reading these. You know what Pro does. The honest case: $2.99/week is less than one coffee, and the students who keep it for a full semester consistently pull a GPA tier higher than those who don't.`
      } else if (isZeroActivity) {
        subject      = `Your trial ends in 24 hours. You haven't tried it yet.`
        kicker       = 'Trial ending: unused'
        heading      = `24 hours left. You set it up but never ran a session.`
        activityLine = `You've set up ${courseCount > 0 ? `${courseCount} course${courseCount !== 1 ? 's' : ''}` : 'your account'} but never ran a study session. That's the one step between "I have this app" and "this app actually helped my grade." Takes 2 minutes.`
      } else {
        subject      = `Your Pro trial ends tomorrow.`
        kicker       = 'Trial ending soon'
        heading      = `Your 7-day Pro trial ends in less than 24 hours.`
        activityLine = sessionCount > 0
          ? `You've completed ${sessionCount} session${sessionCount !== 1 ? 's' : ''} on Pro. That progress is real, and it disappears without Pro. You drop back to 5 AI actions total, 1 course, and a 30-minute focus cap.`
          : `You've set up ${courseCount} course${courseCount !== 1 ? 's' : ''} on Pro. When the trial ends, you'll drop back to the free plan: 5 AI actions total, 1 course, and a 30-minute focus cap.`
      }

      const upgradeUrl = `https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=trial_warning`

      try {
        await resend.emails.send({
          from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
          to: email,
          subject,
          headers: listUnsubscribeHeaders(email),
          tags: [
            { name: 'campaign', value: 'trial_warning' },
            { name: 'user_id', value: row.user_id },
          ],
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your trial ends tomorrow</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader("Lock in Pro now. Your trial ends in less than 24 hours.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#E87820;text-transform:uppercase;">${kicker}</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">${heading}</h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          ${activityLine}
        </p>
        <p style="margin:0 0 6px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Keep everything you've been using:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${[
            ['100 AI actions/month', 'Enough for daily studying all semester.'],
            ['Unlimited Session Blueprints', 'AI-generated study plans for every session.'],
            ['5-course tracking', 'Manage your full semester in one place.'],
            ['Unlimited Focus Mode', 'No 30-minute cap. Study as long as you need.'],
          ].map(([feat, desc]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <span style="font-size:14px;color:#22C55E;font-weight:700;flex-shrink:0;padding-top:1px;">✓</span>
                <div>
                  <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
                  <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${desc}</div>
                </div>
              </div>
            </td>
          </tr>`).join('')}
        </table>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Pro is <strong style="color:#111111;">$2.99/week</strong>. Cancel anytime. No commitment, no hassle.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${upgradeUrl}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Keep Pro · $2.99/wk</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">$2.99/wk · Cancel in account anytime</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because your StudyEdge Pro trial is about to end.
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
        const branch = isHighEngagement ? 'high_engagement' : isZeroActivity ? 'zero_activity' : 'default'
        console.log(`[trial-warning] Sent to ${email} branch=${branch} sessions=${sessionCount} opened=${openedCampaigns.length}`)
      } catch (err) {
        console.error(`[trial-warning] Failed to send to ${email}:`, err)
      }
    } catch (err) {
      console.error(`[trial-warning] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[trial-warning] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
