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

  const locked = await acquireCronLock('day21-upgrade')
  if (!locked) {
    console.log('[day21-upgrade] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const now = new Date()
  const windowEnd   = new Date(now - 21 * 24 * 60 * 60 * 1000)
  const windowStart = new Date(now - 22 * 24 * 60 * 60 * 1000)

  const { data: rpcRows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  const users = { users: (rpcRows ?? []).map(r => ({ id: r.user_id, email: r.email, created_at: r.created_at })) }
  if (error) {
    console.error('[day21-upgrade] Failed to list users:', error)
    return res.status(500).json({ error: 'Failed to list users', detail: error.message })
  }

  const eligible = (users?.users ?? []).filter(u => {
    const created = new Date(u.created_at)
    return created >= windowStart && created <= windowEnd
  })

  let sent = 0, skipped = 0

  for (const user of eligible) {
    if (!user.email) { skipped++; continue }

    const { data: row, error: rowError } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', user.id)
      .maybeSingle()

    if (rowError) {
      console.error(`[day21-upgrade] Failed to read user data for ${user.id}:`, rowError.message)
      skipped++
      continue
    }

    const activeStatuses = ['active', 'trialing', 'past_due']
    const sub = row?.subscription ?? {}
    const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
    if (plan !== 'free') { skipped++; continue }

    const gate = await canSendUserEmail(user.id, { priority: 'normal' })
    if (!gate.ok) { skipped++; continue }

    const trialUsed = !!(sub.trialUsedAt || sub.trial_activated)
    const upgradeUrl = trialUsed
      ? `https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day21_winback`
      : `https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=day21_upgrade`

    // Subject line: different framing for trial-expired vs never-tried
    const subject = trialUsed
      ? "Your grades won't wait forever."
      : "3 weeks on free. Here's the honest math."

    const bodyHtml = trialUsed ? `
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Week 3</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">You've been grinding without Pro for 3 weeks.</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          You tried it. You know what it does. You're still studying without it.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          At $2.99/week — less than a coffee — the question isn't whether it's worth it. It's whether passing your next exam is worth $2.99 to you.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;background:#F7F6F3;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:16px 20px;">
            <div style="font-size:13px;font-weight:700;color:#111111;margin-bottom:8px;">What you gave up when your trial ended:</div>
            ${[
              'Unlimited focus sessions (you\'re back to 30 min/day)',
              '100 AI actions/month → back to 2 total',
              '5 courses → back to 1',
              'Exam Rescue, Brain Dumps, unlimited Blueprints',
            ].map(item => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="color:#DC2626;font-size:13px;">✕</span>
              <span style="font-size:13px;color:#6B6B6B;">${item}</span>
            </div>`).join('')}
          </td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${upgradeUrl}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Get Pro back — $2.99/wk</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">30-day money-back guarantee · Cancel in account anytime</span>
          </td></tr>
        </table>` : `
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Week 3 check-in</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">3 weeks on free. Here's the honest math.</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          A semester is roughly 16 weeks. You've used 3 of them on the free plan. That leaves 13 weeks where exams actually matter.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Pro is $2.99/week. For a full 13-week semester, that's $38.87. Split across every session, every AI boost, and every exam — it's less than $3 per week of actually being prepared.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['3-day free trial', 'No charge today. Cancel if it doesn\'t click.'],
            ['Unlimited focus sessions', 'No 30-min cap — study as long as you need'],
            ['100 AI actions/month', 'Your tutor for every concept, every course'],
            ['Session Blueprints', 'Know exactly what to study before every session'],
            ['Exam Rescue, Brain Dumps, Cheat Sheets', 'Every tool, every time you need it'],
          ].map(([feat, detail]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
              <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
              <div style="font-size:13px;color:#6B6B6B;margin-top:2px;">${detail}</div>
            </td>
          </tr>`).join('')}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:6px;">
            <a href="${upgradeUrl}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Start 3-day free trial</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">$0 today · $2.99/wk after · 30-day money-back guarantee</span>
          </td></tr>
        </table>`

    try {
      await resend.emails.send({
        from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
        to: user.email,
        subject,
        headers: listUnsubscribeHeaders(user.email),
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>3 weeks on StudyEdge</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader(trialUsed ? "You tried Pro. You're still here. Your grades won't wait." : "3 weeks on free. The honest math on whether Pro is worth it.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You signed up 3 weeks ago. <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
          &nbsp;&middot;&nbsp;
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(user.email ?? '')}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      await recordUserEmail(user.id)
      sent++
    } catch (err) {
      console.error(`[day21-upgrade] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day21-upgrade] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
