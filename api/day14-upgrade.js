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

  const locked = await acquireCronLock('day14-upgrade')
  if (!locked) {
    console.log('[day14-upgrade] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const now = new Date()
  const windowEnd   = new Date(now - 14 * 24 * 60 * 60 * 1000)
  const windowStart = new Date(now - 15 * 24 * 60 * 60 * 1000)

  // Direct RPC against auth.users - auth.admin.listUsers() is broken on
  // GoTrue when any OAuth user exists (NULL confirmation_token scan panic).
  const { data: rpcRows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  const users = { users: (rpcRows ?? []).map(r => ({ id: r.user_id, email: r.email, created_at: r.created_at })) }
  if (error) {
    console.error('[day14-upgrade] Failed to list users:', error)
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
      console.error(`[day14] Failed to read user data for ${user.id}:`, rowError.message)
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
      ? `https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day14_winback`
      : `https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=day14_upgrade`

    const subject = trialUsed
      ? "You tried Pro. What would bring you back?"
      : "Two weeks in. Still on the free plan?"

    const bodyHtml = trialUsed ? `
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Week 2</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">You tried Pro. You're back on free.</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          That's fine — but I want to make sure the price was the only thing holding you back, not the product.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Pro is $2.99/wk — less than a coffee. At that price it pays for itself the first time you use it to prep for an exam. Here's what you had during your trial:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['5 courses', 'Your full semester tracked in one place'],
            ['100 AI actions / month', 'Your always-on tutor for every concept'],
            ['Unlimited Session Blueprints', 'A focused plan before every study block'],
            ['Unlimited Focus sessions', 'No 30-min cap — study as long as you need'],
            ['Cheat Sheets, Brain Dumps, Exam Rescue', 'The full toolkit for any situation'],
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
            <a href="${upgradeUrl}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">Upgrade to Pro — $2.99/wk</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">$2.99/wk · Cancel in account anytime</span>
          </td></tr>
        </table>` : `
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#E8531A;text-transform:uppercase;">Two weeks in — still free</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.3;">You haven't tried the trial yet. Here's your reminder.</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Two weeks on StudyEdge and you're still capped at 2 AI actions and 1 course. Your trial is still available — $0 today, card required, cancel before day 8 and you pay nothing. Here's what it unlocks:
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['5 courses', 'Track every class, not just one'],
            ['100 AI actions / month', 'Enough for daily use all semester'],
            ['AI Study Coach, on demand', 'Multi-week plan built around your exam dates, re-runnable any time'],
            ['Unlimited Session Blueprints', 'Know exactly what to study in every session'],
            ['Unlimited Focus sessions', 'Lock in for as long as you need; no 30-min cap'],
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
            <a href="${upgradeUrl}" style="display:inline-block;background:#E8531A;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;">Start your free 7-day trial →</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">Card required · $0 today · Cancel before day 8 and pay nothing</span>
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
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Two weeks on StudyEdge</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader(trialUsed ? "You tried Pro. Here's why most students come back." : "Two weeks on StudyEdge. Still on free? Here's what changes when you upgrade.")}
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
          You signed up 2 weeks ago. <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
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
      console.error(`[day14-upgrade] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day14-upgrade] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
