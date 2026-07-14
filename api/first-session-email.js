import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'
import { verifyAuth } from '../lib/server/usage.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { userId, courseName } = body
  if (!userId) return res.status(400).json({ error: 'Missing userId' })
  if (userId !== auth.userId) return res.status(403).json({ error: 'Forbidden' })
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: true })

  const { data: row } = await supabaseAdmin
    .from('user_data')
    .select('subscription, completed_sessions')
    .eq('user_id', userId)
    .maybeSingle()

  if (row?.subscription?.first_session_email_sent) {
    return res.status(200).json({ ok: true, skipped: true })
  }

  // Only fire for users who have 1-3 sessions. If they somehow have more,
  // the first session moment has long passed - no point sending a stale email.
  const sessionCount = Array.isArray(row?.completed_sessions) ? row.completed_sessions.length : 0
  if (sessionCount > 3) return res.status(200).json({ ok: true, skipped: true })

  const userPlan = row?.subscription?.plan ?? 'free'
  const trialUsed = !!(row?.subscription?.trialUsedAt)

  let email
  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
    email = authUser?.user?.email
  } catch { /* skip */ }
  if (!email) return res.status(200).json({ ok: true, skipped: true })

  const sessionLabel = courseName ? `your ${courseName} session` : 'your first session'

  try {
    await resend.emails.send({
      from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
      to: email,
      subject: 'You finished your first session.',
      headers: listUnsubscribeHeaders(email),
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>First session done</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader("That is the hardest part. Every session from here gets easier to start.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">First session</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">
          You started. That already puts you ahead.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Most people download a study app and never actually open it. You just finished ${sessionLabel}. The habit is easier from here.
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Three things to do before your next session:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['Check your grade tracker', 'Today\'s session already moved your projected score. Open the app and see where you stand.'],
            ['Schedule your next session', 'The best time to plan the next one is right after you finish this one.'],
            ['Try a Session Blueprint', 'Get a minute-by-minute plan before you study, not after. Free includes one - use it on your weakest topic.'],
          ].map(([title, desc], i, arr) => `
          <tr>
            <td style="padding:13px 0;${i < arr.length - 1 ? 'border-bottom:1px solid #F0EDE8;' : ''}">
              <div style="font-size:14px;font-weight:600;color:#3B61C4;margin-bottom:3px;">${title}</div>
              <div style="font-size:13px;color:#6B6B6B;line-height:1.55;">${desc}</div>
            </td>
          </tr>`).join('')}
        </table>
        ${userPlan === 'free' && !trialUsed ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:14px;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=first_session_trial" style="display:inline-block;background:#E8531A;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;">Start your free 7-day trial →</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">Card required · $0 today · Cancel before day 8 and pay nothing</span>
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app" style="font-size:13px;color:#9B9B9B;text-decoration:underline;">Or open the app →</a>
          </td></tr>
        </table>` : `
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app${userPlan === 'free' && trialUsed ? '?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=first_session_upgrade' : ''}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">${userPlan === 'free' && trialUsed ? 'Upgrade to Pro →' : 'Open StudyEdge'}</a>
          </td></tr>
        </table>`}
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because you just completed your first StudyEdge session.<br>
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

    const merged = { ...(row?.subscription ?? {}), first_session_email_sent: true }
    await supabaseAdmin.from('user_data').upsert(
      { user_id: userId, subscription: merged, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    ).catch(e => console.error('[first-session] Failed to record flag:', e))

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[first-session] Failed to send:', err)
    return res.status(500).json({ error: 'Failed' })
  }
}
