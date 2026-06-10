import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { upsertContact, triggerEvent } from '../lib/server/loops.js'
import { logUserEvent } from '../lib/server/axiom.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { email, userId, firstName, createdAt } = body
  if (!email) return res.status(400).json({ error: 'Missing email' })

  // Server-side guard: only send if the account is truly new (< 30 min old).
  // Prevents re-sends from new devices/browsers where localStorage is empty.
  if (createdAt) {
    const ageMs = Date.now() - new Date(createdAt).getTime()
    if (ageMs > 30 * 60 * 1000 || ageMs < 0) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Account not fresh' })
    }
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[welcome-email] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  // Server-side dedup: prevent duplicates when the same user opens the app on
  // a second device within the 30-min freshness window. Stores a flag in the
  // subscription JSON so the drip email timing (last_emailed_at) is unaffected.
  if (userId) {
    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle()
    if (row?.subscription?.welcome_email_sent) {
      console.log(`[welcome-email] Skipping duplicate for ${userId}`)
      return res.status(200).json({ ok: true, skipped: true, reason: 'Already sent' })
    }
  }

  const greetingName = firstName ? firstName.split(' ')[0] : null
  const headline = greetingName ? `Welcome, ${greetingName}.` : 'Welcome to StudyEdge.'

  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@mail.getstudyedge.com>',
      to: email,
      subject: greetingName
        ? `${greetingName}, you're in. Pro is free for 3 days.`
        : "You're in. Pro is free for 3 days.",
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to StudyEdge</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:24px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;outline:none;text-decoration:none;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:18px;border:1px solid rgba(0,0,0,0.06);padding:36px 36px 30px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
        <p style="margin:0 0 6px;font-size:11.5px;font-weight:600;letter-spacing:0.08em;color:#3B61C4;text-transform:uppercase;">Account ready</p>
        <h1 style="margin:0 0 14px;font-size:26px;font-weight:700;color:#111111;letter-spacing:-0.6px;line-height:1.25;">
          ${headline}
        </h1>
        <p style="margin:0 0 22px;font-size:15.5px;color:#444444;line-height:1.65;">
          You're set up. Before you start, try <strong style="color:#111111;">Pro free for 3 days</strong>. $2.99/wk after the trial. Cancel anytime from your account.
        </p>
        <p style="margin:0 0 14px;font-size:11.5px;font-weight:600;letter-spacing:0.08em;color:#9B9B9B;text-transform:uppercase;">What Pro unlocks</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
          ${[
            ['5 courses', 'Free gives you 1'],
            ['100 AI study boosts / month', 'Free gives you 10'],
            ['AI Study Coach', 'Personalized multi-week plans'],
            ['Session Blueprints', 'Minute-by-minute session plans'],
            ['Flashcards and quizzes', 'Built into every session'],
          ].map(([feat, sub], i, arr) => `
          <tr>
            <td style="padding:12px 0;${i < arr.length - 1 ? 'border-bottom:1px solid #F0EDE8;' : ''}">
              <table cellpadding="0" cellspacing="0" style="width:100%;">
                <tr>
                  <td style="width:24px;vertical-align:top;padding-top:1px;">
                    <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:rgba(59,97,196,0.12);text-align:center;line-height:18px;color:#3B61C4;font-size:11px;font-weight:700;">✓</span>
                  </td>
                  <td>
                    <div style="font-size:14.5px;font-weight:600;color:#111111;line-height:1.4;">${feat}</div>
                    <div style="font-size:13px;color:#9B9B9B;margin-top:2px;line-height:1.5;">${sub}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`).join('')}
        </table>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:10px;">
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1"
               style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 34px;box-shadow:0 1px 2px rgba(59,97,196,0.18);">
              Start my free 3-day trial
            </a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12.5px;color:#9B9B9B;">$0 today, then $2.99/wk. Cancel anytime in your account.</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:18px 6px 0;">
        <p style="margin:0;font-size:13.5px;color:#6B6B6B;line-height:1.65;">
          Not into the trial? Add your courses and exam dates first — StudyEdge builds everything around your real schedule. <a href="https://getstudyedge.com/app" style="color:#3B61C4;text-decoration:none;font-weight:600;">Open the app →</a>
        </p>
      </td></tr>
      <tr><td style="padding:28px 4px 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because you just created a StudyEdge account.<br>
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

    await Promise.allSettled([
      upsertContact({ email, userId, firstName, plan: 'free', trialActive: false }),
      triggerEvent({ email, eventName: 'signup', properties: { userId } }),
      userId ? (async () => {
        const { data: r } = await supabaseAdmin.from('user_data').select('subscription').eq('user_id', userId).maybeSingle()
        const merged = { ...(r?.subscription ?? {}), welcome_email_sent: true }
        await supabaseAdmin.from('user_data').upsert(
          { user_id: userId, subscription: merged, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
      })() : Promise.resolve(),
    ])

    logUserEvent({ event: 'signup', userId, plan: 'free' })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[welcome-email] Failed to send:', err)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
