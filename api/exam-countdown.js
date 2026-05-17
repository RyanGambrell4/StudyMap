import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[exam-countdown] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  function dateInDays(n) {
    const d = new Date(today)
    d.setDate(d.getDate() + n)
    return d.toISOString().split('T')[0]
  }

  const target14 = dateInDays(14)
  const target7  = dateInDays(7)

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, courses, subscription')
    .limit(2000)

  if (error) {
    console.error('[exam-countdown] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    const courses = Array.isArray(row.courses) ? row.courses : []
    const matches = courses.filter(c => c.examDate === target14 || c.examDate === target7)
    if (!matches.length) { skipped++; continue }

    let email
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
      email = authUser?.user?.email
    } catch { /* skip */ }
    if (!email) { skipped++; continue }

    const activeStatuses = ['active', 'trialing', 'past_due']
    const sub = row.subscription ?? {}
    const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
    const isFreePlan = plan === 'free'

    for (const course of matches) {
      const daysLeft = course.examDate === target14 ? 14 : 7
      const examName = course.name ?? 'your exam'
      const targetScore = course.targetScore ? ` Your target: ${course.targetScore}.` : ''

      const tips = {
        14: ['Switch from new content to active recall and practice questions.', 'Review your weakest areas first — not your strongest.', 'Start timing yourself on practice passages or problems.'],
        7:  ['Do a full-length practice test or timed section today.', 'Focus only on high-yield topics. No new material.', 'Sleep and nutrition matter more than an extra hour of studying.'],
      }
      const tip = tips[daysLeft][Math.floor(Math.random() * 3)]

      try {
        await resend.emails.send({
          from: 'StudyEdge AI <support@getstudyedge.com>',
          to: email,
          subject: `${daysLeft} days to ${examName} — here's what to focus on`,
          html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">
        <tr><td style="padding-bottom:28px;"><span style="font-size:17px;font-weight:700;color:#F1F5F9;">StudyEdge AI</span></td></tr>
        <tr><td style="padding-bottom:8px;">
          <div style="display:inline-block;background:${daysLeft === 7 ? 'rgba(249,115,22,0.12)' : 'rgba(251,191,36,0.1)'};border:1px solid ${daysLeft === 7 ? 'rgba(249,115,22,0.3)' : 'rgba(251,191,36,0.25)'};border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;color:${daysLeft === 7 ? '#f97316' : '#fbbf24'};">
            ${daysLeft} days to exam
          </div>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            ${daysLeft === 7 ? 'Final week.' : 'Two weeks out.'} Make it count.
          </h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 16px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Your <strong style="color:#F1F5F9;">${examName}</strong> is in ${daysLeft} days.${targetScore}
            Here's the most important thing to focus on right now:
          </p>
          <div style="background:rgba(99,102,241,0.08);border-left:3px solid #6366f1;border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:20px;">
            <p style="margin:0;font-size:15px;color:#c7d2fe;font-weight:600;line-height:1.5;">${tip}</p>
          </div>
          <p style="margin:0;font-size:15px;color:#94A3B8;line-height:1.7;">
            ${daysLeft === 7
              ? "Don't cram new material. Your brain needs time to consolidate what it already knows. Trust your prep."
              : "Two weeks is enough time to meaningfully move your score — but only if you're studying the right things."}
          </p>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app" style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;">Open my study plan</a>
        </td></tr>
        ${isFreePlan ? `<tr><td style="padding-bottom:32px;">
          <div style="background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:16px 18px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#c7d2fe;">Get a session blueprint for every remaining day</p>
            <p style="margin:0 0 12px;font-size:12px;color:#475569;line-height:1.5;">Pro gives you AI-built session plans, Study Coach, and 75 boosts/month. Try free for 7 days.</p>
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1" style="font-size:13px;font-weight:700;color:#818cf8;text-decoration:none;">Start 7-day free trial</a>
          </div>
        </td></tr>` : ''}
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            Sent because your exam is coming up · StudyEdge AI<br/>
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
        sent++
      } catch (err) {
        console.error(`[exam-countdown] Failed to send to ${email}:`, err)
      }
    }
  }

  console.log(`[exam-countdown] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
