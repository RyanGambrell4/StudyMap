import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'
import { verifyAuth } from '../lib/server/usage.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized' })

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { email, firstName, courses, userId } = body
  if (!email) return res.status(400).json({ error: 'Missing email' })
  if (userId && userId !== auth.userId) return res.status(403).json({ error: 'Forbidden' })

  if (!process.env.RESEND_API_KEY) {
    console.warn('[first-plan] RESEND_API_KEY not set - skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const courseNames = Array.isArray(courses) ? courses.filter(Boolean).slice(0, 5) : []
  const greeting = firstName ? `Hey ${firstName.split(' ')[0]}` : 'Hey there'
  const courseLine = courseNames.length
    ? `We built it around: <strong style="color:#111111;">${courseNames.join(', ')}</strong>.`
    : `We built it around your courses.`

  let userPlan = 'free'
  let trialUsed = false
  if (userId) {
    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle()
    userPlan = row?.subscription?.plan ?? 'free'
    trialUsed = !!(row?.subscription?.trialUsedAt)
  }

  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@mail.getstudyedge.com>',
      to: email,
      subject: 'Your first StudyEdge plan is ready',
      headers: listUnsubscribeHeaders(email),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your first plan is ready</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader("Your study plan is live — open it and start your first session today.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;outline:none;text-decoration:none;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Plan ready</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${greeting} - your first plan is live.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          ${courseLine} Your sessions are scheduled around your exam dates and balanced across the week.
        </p>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Here's how to actually use it:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['Open the next session', 'Tap any session card to see its blueprint - what to study, in what order, for how long.'],
            ['Mark sessions complete', "Your plan adapts as you go. Don't fall behind on this step."],
            ['Use Study Coach weekly', 'Once a week, ask Study Coach to refine your plan. It catches problems before they become panic.'],
          ].map(([title, desc]) => `
          <tr>
            <td style="padding:12px 14px;background:#F7F6F3;border-radius:10px;">
              <div style="font-size:14px;font-weight:600;color:#3B61C4;margin-bottom:4px;">${title}</div>
              <div style="font-size:13px;color:#6B6B6B;line-height:1.55;">${desc}</div>
            </td>
          </tr>
          <tr><td height="8"></td></tr>`).join('')}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Open my plan</a>
          </td></tr>
        </table>
        ${userPlan === 'free' ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:20px;">
          <tr><td style="background:#F4F7FF;border-radius:12px;border:1px solid rgba(59,97,196,0.15);padding:14px 18px;text-align:center;">
            <p style="margin:0 0 5px;font-size:13px;font-weight:600;color:#3B61C4;">${trialUsed ? 'Unlock your full semester plan with Pro' : 'Your 3-day free trial is waiting'}</p>
            <p style="margin:0 0 10px;font-size:13px;color:#6B6B6B;line-height:1.55;">${trialUsed ? 'Unlimited AI tutoring, brain dumps, cheat sheets, and practice exams — make the most of every session.' : 'Unlimited study tools, AI tutoring, and more. No card required — just tap to unlock.'}</p>
            <a href="https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=first_plan" style="display:inline-block;background:#E8531A;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;padding:10px 22px;">${trialUsed ? 'Upgrade to Pro →' : 'Start free trial →'}</a>
          </td></tr>
        </table>` : ''}
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because your first plan was generated.<br>
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

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[first-plan] Failed to send:', err)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
