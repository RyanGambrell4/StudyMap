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

  // Use hour-stamped lock so this can run every 4h without double-sending
  const hour = new Date().getUTCHours()
  const locked = await acquireCronLock(`early-activation-h${Math.floor(hour / 4)}`)
  if (!locked) return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_this_window' })

  const now = new Date()
  // Target users who signed up 2–6 hours ago
  const windowStart = new Date(now - 6 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 2 * 60 * 60 * 1000)

  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  if (error) return res.status(500).json({ error: 'Failed to list users', detail: error.message })

  const recentUsers = (rows ?? []).map(r => ({ id: r.user_id, email: r.email }))
  let sent = 0, skipped = 0

  for (const user of recentUsers) {
    if (!user.email) continue

    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription, completed_sessions, courses')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!row) { skipped++; continue }

    // Skip already-engaged users and paid subscribers
    const plan = row?.subscription?.plan ?? 'free'
    if (plan !== 'free') { skipped++; continue }
    const sessionCount = Array.isArray(row?.completed_sessions) ? row.completed_sessions.length : 0
    if (sessionCount > 0) { skipped++; continue }

    const guard = await canSendUserEmail(user.id, { priority: 'normal' })
    if (!guard.ok) { skipped++; continue }

    const subjectOptions = [
      "Here's how to get the most out of StudyEdge",
      "Your study system is set up — here's where to start",
      "3 things to do in your first StudyEdge session",
    ]
    const subject = subjectOptions[Math.floor(Date.now() / 1000) % subjectOptions.length]

    try {
      await resend.emails.send({
        from: 'StudyEdge AI <noreply@getstudyedge.com>',
        to: user.email,
        subject,
        headers: listUnsubscribeHeaders(user.id),
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader('Start with your Study Coach → it builds your whole plan in 2 minutes.')}
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;padding:36px 32px;border:1px solid #e5e7eb;">
      <img src="https://getstudyedge.com/favicon.png" alt="StudyEdge AI" style="width:36px;height:36px;border-radius:9px;margin-bottom:20px;">
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">
        Your plan is waiting for you.
      </h1>
      <p style="margin:0 0 22px;font-size:15px;color:#4b5563;line-height:1.6;">
        Most students who get real results with StudyEdge do one thing right away — they run their Study Coach. It asks you about your courses, deadlines, and schedule, then builds a full semester plan around your exam dates.
      </p>
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Start here →</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
        ${[
          { num: '1', title: 'Add your first course', desc: 'Takes 30 seconds. Drop in your course name and exam date.' },
          { num: '2', title: 'Run Study Coach', desc: 'Upload your syllabus or paste your deadlines. It builds your whole plan.' },
          { num: '3', title: 'Start your first session', desc: 'Open a Blueprint and begin. Session 1 takes 10 minutes.' },
        ].map(s => `
          <div style="display:flex;gap:14px;align-items:flex-start;padding:14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
            <div style="width:28px;height:28px;border-radius:8px;background:#ede9fe;color:#7c3aed;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${s.num}</div>
            <div>
              <p style="margin:0 0 2px;font-weight:700;font-size:14px;color:#111;">${s.title}</p>
              <p style="margin:0;font-size:13px;color:#6b7280;">${s.desc}</p>
            </div>
          </div>
        `).join('')}
      </div>
      <a href="https://getstudyedge.com/app" style="display:block;text-align:center;background:linear-gradient(135deg,#3b61c4,#7c3aed);color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">
        Open StudyEdge →
      </a>
      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
        studyedge.com · <a href="https://getstudyedge.com/unsubscribe?uid=${user.id}" style="color:#9ca3af;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`,
      })
      await recordUserEmail(user.id, 'early-activation')
      sent++
    } catch (e) {
      console.error('[early-activation] send error:', e)
    }
  }

  return res.status(200).json({ ok: true, sent, skipped })
}
