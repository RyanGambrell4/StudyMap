import { Resend } from 'resend'
import { upsertContact, triggerEvent } from '../lib/server/loops.js'
import { logUserEvent } from '../lib/server/axiom.js'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { email, userId } = body
  if (!email) return res.status(400).json({ error: 'Missing email' })

  if (!process.env.RESEND_API_KEY) {
    console.warn('[welcome-email] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@mail.getstudyedge.com>',
      to: email,
      subject: "You're in — here's what Pro adds (free for 7 days)",
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to StudyEdge</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#3B61C4;vertical-align:middle;margin-right:8px;"></span>
        <span style="font-size:15px;font-weight:700;color:#111111;vertical-align:middle;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Welcome</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          Your account is ready.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Before you dive in, one thing worth knowing: you can try <strong style="color:#111111;">Pro free for 7 days</strong>. No credit card required.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">Here's what Pro unlocks:</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['5 courses', 'Free gives you 1'],
            ['75 AI study boosts / month', 'Free gives you 10'],
            ['AI Study Coach', 'Personalized multi-week plans'],
            ['Session Blueprints', 'Minute-by-minute session plans'],
            ['Flashcards and quizzes', 'Built into every session'],
          ].map(([feat, sub]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
              <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
              <div style="font-size:13px;color:#9B9B9B;margin-top:2px;">${sub}</div>
            </td>
          </tr>`).join('')}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:8px;">
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1"
               style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">
              Start my free 7-day trial
            </a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">No credit card required. Cancel anytime.</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because you just created a StudyEdge AI account.<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">— The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    })

    await Promise.allSettled([
      upsertContact({ email, userId, plan: 'free', trialActive: false }),
      triggerEvent({ email, eventName: 'signup', properties: { userId } }),
    ])

    logUserEvent({ event: 'signup', userId, plan: 'free' })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[welcome-email] Failed to send:', err)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
