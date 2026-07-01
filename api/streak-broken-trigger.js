import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { verifyAuth } from '../lib/server/usage.js'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export const config = { maxDuration: 15 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: true })

  const userId = await verifyAuth(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { streak, email } = req.body ?? {}
  if (!email || !streak) return res.status(400).json({ error: 'Missing streak or email' })

  const ok = await canSendUserEmail(userId, 'streak-broken-trigger', 20 * 60) // 20h cooldown
  if (!ok) return res.status(200).json({ ok: true, skipped: true, reason: 'recently_sent' })

  const streakNum = parseInt(streak, 10) || 1
  const subject = streakNum >= 7
    ? `Your ${streakNum}-day streak broke — don't let it end here`
    : `Your study streak broke — here's how to bounce back fast`

  try {
    await resend.emails.send({
      from: 'StudyEdge AI <noreply@getstudyedge.com>',
      to: email,
      subject,
      headers: listUnsubscribeHeaders(userId),
      html: `
${preheader('One session today resets the streak. It only takes 10 minutes.')}
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fef9f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;padding:36px 32px;border:1px solid #fed7aa;">
      <div style="font-size:36px;margin-bottom:16px;">🔥</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">
        Your ${streakNum}-day streak just broke.
      </h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.65;">
        ${streakNum >= 14
          ? `That was an impressive ${streakNum}-day run. Don't let a missed day become a missed week. One session today resets everything.`
          : `It happens. The students who win aren't the ones who never miss — they're the ones who get back on track within 24 hours.`}
      </p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px;margin-bottom:22px;">
        <p style="margin:0 0 4px;font-weight:700;font-size:13px;color:#c2410c;">Why get back today?</p>
        <p style="margin:0;font-size:13.5px;color:#92400e;line-height:1.6;">
          Students who restart within 24 hours rebuild streaks 3× faster. A 10-minute session is all it takes to get the momentum back — and your plan already knows where to pick up.
        </p>
      </div>
      <a href="https://getstudyedge.com/app" style="display:block;text-align:center;background:linear-gradient(135deg,#ea580c,#dc2626);color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;margin-bottom:12px;">
        Start a 10-min session now →
      </a>
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        studyedge.com · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`,
    })

    await recordUserEmail(userId, 'streak-broken-trigger')
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[streak-broken-trigger] send error:', e)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
