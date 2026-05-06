/**
 * welcome-email.js — Sends a day-1 welcome email to new free users
 * promoting the 7-day Pro trial via Resend.
 *
 * POST /api/welcome-email
 * Body: { email: string }
 */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { email } = body
  if (!email) return res.status(400).json({ error: 'Missing email' })

  if (!process.env.RESEND_API_KEY) {
    console.warn('[welcome-email] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@getstudyedge.com>',
      to: email,
      subject: "You're in — here's what Pro adds (free for 7 days)",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <!-- Logo -->
        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            Welcome. You're on the free plan.
          </h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Your account is set up and ready. Before you dive in, here's one thing worth knowing:
            you can try <strong style="color:#c7d2fe;">Pro free for 7 days</strong> — no commitment,
            card only charged after the trial ends.
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Here's what Pro unlocks:
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              ['5 courses', 'Free gives you 1'],
              ['75 AI study boosts/month', 'Free gives you 10'],
              ['AI Study Coach', 'Personalized study plans'],
              ['Session Blueprints', 'Minute-by-minute session plans'],
              ['Flashcards & quizzes', 'Built into every session'],
            ].map(([feat, sub]) => `
            <tr>
              <td style="padding:7px 0;">
                <span style="color:#34d399;font-size:13px;margin-right:10px;">✓</span>
                <strong style="font-size:14px;color:#CBD5E1;">${feat}</strong>
                <span style="font-size:13px;color:#475569;margin-left:8px;">— ${sub}</span>
              </td>
            </tr>`).join('')}
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding-bottom:16px;text-align:center;">
          <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Start my free 7-day trial →
          </a>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="font-size:12px;color:#334155;">Card charged after trial · Cancel before day 7, pay nothing</span>
        </td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            You're receiving this because you just created a StudyEdge AI account.<br/>
            <a href="https://getstudyedge.com/app" style="color:#475569;">Open the app</a> ·
            <a href="mailto:support@getstudyedge.com" style="color:#475569;">Contact support</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[welcome-email] Failed to send:', err)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
