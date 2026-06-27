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
    console.warn('[exam-countdown] RESEND_API_KEY not set - skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const locked = await acquireCronLock('exam-countdown')
  if (!locked) {
    console.log('[exam-countdown] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  function dateInDays(n) {
    const d = new Date(today)
    d.setDate(d.getDate() + n)
    return d.toISOString().split('T')[0]
  }

  const target14 = dateInDays(14)
  const target7  = dateInDays(7)

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, courses, subscription')
    .limit(2000)

  if (error) {
    console.error('[exam-countdown] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    const courses = Array.isArray(row.courses) ? row.courses : []
    const matches = courses.filter(c => c.examDate === target14 || c.examDate === target7)
    if (!matches.length) { skipped++; continue }

    let email
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
      email = authUser?.user?.email
    } catch { /* skip */ }
    if (!email) { skipped++; continue }

    const gate = await canSendUserEmail(row.user_id, { priority: 'normal' })
    if (!gate.ok) { skipped++; continue }

    const activeStatuses = ['active', 'trialing', 'past_due']
    const sub = row.subscription ?? {}
    const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
    const isFreePlan = plan === 'free'
    const trialUsed = !!(sub.trialUsedAt)

    // Send ONE email per user - most-urgent exam first (7d before 14d). The 48h
    // throttle means secondary exams won't get their own dedicated email here;
    // exam-tomorrow (critical, unthrottled) will catch them at 1-2 days out.
    matches.sort((a, b) => (a.examDate === target7 ? 0 : 1) - (b.examDate === target7 ? 0 : 1))
    const matchesToSend = matches.slice(0, 1)

    let userSent = false
    for (const course of matchesToSend) {
      const daysLeft = course.examDate === target14 ? 14 : 7
      const examName = course.name ?? 'your exam'
      const targetScore = course.targetScore ? ` Your target: ${course.targetScore}.` : ''

      const tips = {
        14: ['Switch from new content to active recall and practice questions.', 'Review your weakest areas first - not your strongest.', 'Start timing yourself on practice passages or problems.'],
        7:  ['Do a full-length practice test or timed section today.', 'Focus only on high-yield topics. No new material.', 'Sleep and nutrition matter more than an extra hour of studying.'],
      }
      const tip = tips[daysLeft][Math.floor(Math.random() * 3)]
      const isUrgent = daysLeft === 7
      const pillBg = isUrgent ? '#FBE9D6' : '#FFF5E6'
      const pillBorder = isUrgent ? '#F0B27A' : '#F4DDB6'
      const pillText = isUrgent ? '#A0522D' : '#7A4B0A'

      try {
        await resend.emails.send({
          from: 'StudyEdge AI <support@mail.getstudyedge.com>',
          to: email,
          subject: `${daysLeft} days to ${examName} - here's what to focus on`,
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${daysLeft} days to ${examName}</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;outline:none;text-decoration:none;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <table cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
          <tr><td style="background:${pillBg};border:1px solid ${pillBorder};border-radius:999px;padding:5px 14px;">
            <span style="font-size:12px;font-weight:700;color:${pillText};letter-spacing:0.02em;">${daysLeft} days to exam</span>
          </td></tr>
        </table>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${isUrgent ? 'Final week.' : 'Two weeks out.'} Make it count.
        </h1>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Your <strong style="color:#111111;">${examName}</strong> is in ${daysLeft} days.${targetScore}
          The most important thing to focus on right now:
        </p>
        <div style="background:#F7F6F3;border-left:3px solid #3B61C4;border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:20px;">
          <p style="margin:0;font-size:15px;color:#111111;font-weight:500;line-height:1.55;">${tip}</p>
        </div>
        <p style="margin:0 0 24px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          ${isUrgent
            ? "Don't cram new material. Your brain needs time to consolidate. Trust your prep."
            : "Two weeks is enough time to meaningfully move your score - but only if you're studying the right things."}
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Open my study plan</a>
          </td></tr>
        </table>
        ${isFreePlan ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;background:rgba(59,97,196,0.06);border:1px solid rgba(59,97,196,0.18);border-radius:12px;margin-top:22px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:14px;font-weight:600;color:#111111;margin-bottom:4px;">${trialUsed ? 'Upgrade to Pro for the final push' : 'Get a session blueprint for every remaining day'}</div>
            <div style="font-size:13px;color:#6B6B6B;line-height:1.55;margin-bottom:10px;">${trialUsed ? 'Unlimited AI blueprints, Study Coach, and Exam Rescue — make the most of the time you have left.' : 'Pro gives you AI-built session plans, Study Coach, and 100 AI boosts/month for $2.99/wk. Try free for 3 days.'}</div>
            <a href="https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=exam_countdown" style="font-size:13px;font-weight:600;color:#3B61C4;text-decoration:none;">${trialUsed ? 'Upgrade to Pro →' : 'Start 3-day free trial →'}</a>
          </td></tr>
        </table>` : ''}
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because your exam is coming up · StudyEdge AI<br>
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
        userSent = true
        sent++
      } catch (err) {
        console.error(`[exam-countdown] Failed to send to ${email}:`, err)
      }
    }
    if (userSent) await recordUserEmail(row.user_id)
  }

  console.log(`[exam-countdown] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
