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

  const { email, firstName, yearLevel, learningStyle, preferredTime } = body
  if (!email) return res.status(400).json({ error: 'Missing email' })

  if (!process.env.RESEND_API_KEY) {
    console.warn('[onboarding-complete] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const greeting = firstName ? `Hey ${firstName.split(' ')[0]}` : 'You\'re set'
  const profileRows = [
    ['Year', yearLevel ?? 'Not specified'],
    ['Learning style', learningStyle ?? 'Not specified'],
    ['Preferred study time', preferredTime ?? 'Not specified'],
  ]

  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@mail.getstudyedge.com>',
      to: email,
      subject: 'Your StudyEdge profile is set up — next step',
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Onboarding complete</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;outline:none;text-decoration:none;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Onboarding complete</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          ${greeting} — your profile is set up.
        </h1>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Here's what you told us, so we can build a plan that actually fits you:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
          ${profileRows.map(([k, v]) => `
          <tr>
            <td style="padding:9px 0;border-bottom:1px solid #F0EDE8;">
              <div style="font-size:12px;color:#9B9B9B;text-transform:uppercase;letter-spacing:0.05em;">${k}</div>
              <div style="font-size:14px;color:#111111;font-weight:500;margin-top:2px;">${v}</div>
            </td>
          </tr>`).join('')}
        </table>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          <strong style="color:#111111;">Next step:</strong> add your first course with a real exam date. Without a date, the planner is just guessing. Takes 30 seconds.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Add my first course</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because you just finished onboarding.<br>
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

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[onboarding-complete] Failed to send:', err)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
