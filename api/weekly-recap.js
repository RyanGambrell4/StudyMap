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
    console.warn('[weekly-recap] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, completed_sessions, study_tools, subscription, syllabus_events')
    .limit(1000)

  if (error) {
    console.error('[weekly-recap] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  const now = new Date()
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    const allSessions = Array.isArray(row.completed_sessions) ? row.completed_sessions : []
    const weekSessions = allSessions.filter(s => {
      const d = new Date(s.completedAt ?? s.date ?? s.timestamp ?? 0)
      return d >= weekAgo
    })
    const streak = row.study_tools?._streak?.currentStreak ?? 0
    const activeStatuses = ['active', 'trialing', 'past_due']
    const sub = row.subscription ?? {}
    const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
    if (weekSessions.length === 0 && streak === 0) { skipped++; continue }

    // Compute this week's upcoming exams (next 7 days)
    const todayStr = now.toISOString().slice(0, 10)
    const weekAheadStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const upcomingExams = (row.syllabus_events ?? [])
      .filter(e => {
        const isExam = e.type === 'exam' || /exam|midterm|final|test/i.test(e.title ?? '')
        const dateStr = e.date ?? e.dateStr ?? ''
        return isExam && dateStr >= todayStr && dateStr <= weekAheadStr
      })
      .sort((a, b) => (a.date ?? a.dateStr ?? '').localeCompare(b.date ?? b.dateStr ?? ''))
      .slice(0, 3)

    let email
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
      email = authUser?.user?.email
    } catch { /* skip */ }
    if (!email) { skipped++; continue }

    const highlights = weekSessions.slice(0, 3).map(s => s.course ?? s.title ?? 'Study session')
    const totalMins = weekSessions.reduce((sum, s) => sum + (Number(s.duration) || 0), 0)
    const hoursStr = totalMins >= 60 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : totalMins > 0 ? `${totalMins}m` : null
    const sessionWord = weekSessions.length === 1 ? 'session' : 'sessions'
    const streakLine = streak >= 2 ? `${streak}-day streak — keep it going.` : null
    const motiveLine = weekSessions.length >= 5
      ? "That's a strong week. Consistency like this is what moves the needle."
      : weekSessions.length >= 3 ? "Solid week. You're building the habit."
      : weekSessions.length >= 1 ? "You showed up this week. That's more than most."
      : "Even one session a week adds up. Your schedule is ready when you are."
    const isFreePlan = plan === 'free'

    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: email,
        subject: weekSessions.length > 0
          ? `Your week: ${weekSessions.length} ${sessionWord} completed${streak >= 2 ? ` · ${streak}-day streak` : ''}`
          : 'Your weekly study recap',
        html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">
        <tr><td style="padding-bottom:24px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;">StudyEdge AI</span>
          <span style="font-size:12px;color:#334155;margin-left:10px;">Weekly Recap</span>
        </td></tr>
        <tr><td style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#F1F5F9;letter-spacing:-0.6px;line-height:1.3;">
            ${weekSessions.length > 0 ? `You completed ${weekSessions.length} study ${sessionWord} this week.` : "Your study plan is ready for the week ahead."}
          </h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;border-radius:12px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.15);">
            <tr>
              <td style="padding:16px 20px;text-align:center;border-right:1px solid rgba(99,102,241,0.15);">
                <div style="font-size:28px;font-weight:900;color:#c7d2fe;">${weekSessions.length}</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">sessions</div>
              </td>
              <td style="padding:16px 20px;text-align:center;border-right:1px solid rgba(99,102,241,0.15);">
                <div style="font-size:28px;font-weight:900;color:#c7d2fe;">${streak}</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">day streak</div>
              </td>
              <td style="padding:16px 20px;text-align:center;">
                <div style="font-size:28px;font-weight:900;color:#c7d2fe;">${hoursStr ?? '—'}</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">studied</div>
              </td>
            </tr>
          </table>
        </td></tr>
        ${highlights.length > 0 ? `<tr><td style="padding-bottom:20px;">
          <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.8px;">This week's sessions</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            ${highlights.map(h => `<tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);"><span style="font-size:13px;color:#CBD5E1;">✓ ${h}</span></td></tr>`).join('')}
            ${weekSessions.length > 3 ? `<tr><td style="padding:8px 0;font-size:12px;color:#475569;">+${weekSessions.length - 3} more sessions</td></tr>` : ''}
          </table>
        </td></tr>` : ''}
        ${upcomingExams.length > 0 ? `<tr><td style="padding-bottom:20px;">
          <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.8px;">Exams this week</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background:rgba(249,115,22,0.07);border:1px solid rgba(249,115,22,0.2);border-radius:12px;padding:4px 0;">
            ${upcomingExams.map(e => {
              const dateStr = e.date ?? e.dateStr ?? ''
              const label = dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
              return `<tr>
                <td style="padding:10px 16px;border-bottom:1px solid rgba(249,115,22,0.1);">
                  <span style="font-size:14px;font-weight:700;color:#fed7aa;">${e.title ?? 'Exam'}</span>
                  ${label ? `<span style="font-size:12px;color:#9a3412;margin-left:8px;">${label}</span>` : ''}
                </td>
              </tr>`
            }).join('')}
          </table>
        </td></tr>` : ''}
        <tr><td style="padding-bottom:${isFreePlan ? '20px' : '32px'};">
          <p style="margin:0;font-size:15px;color:#94A3B8;line-height:1.7;">
            ${motiveLine}${streakLine ? `<br/><br/><strong style="color:#fbbf24;">${streakLine}</strong>` : ''}
          </p>
        </td></tr>
        ${isFreePlan ? `<tr><td style="padding-bottom:32px;">
          <div style="background:linear-gradient(135deg,rgba(79,126,247,0.12),rgba(124,92,250,0.12));border:1px solid rgba(99,102,241,0.25);border-radius:12px;padding:18px 20px;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#c7d2fe;">Want to study more effectively next week?</p>
            <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.5;">Pro gives you 75 AI study boosts/month, 5 courses, Study Coach, and Session Blueprints. Try it free for 7 days.</p>
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1" style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;padding:10px 22px;">Start 7-day free trial</a>
          </div>
        </td></tr>` : ''}
        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app" style="display:inline-block;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#c7d2fe;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;padding:12px 28px;">Open my study plan</a>
        </td></tr>
        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            Weekly recap from StudyEdge AI · Every Sunday<br/>
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
      console.error(`[weekly-recap] Failed to send to ${email}:`, err)
    }
  }

  console.log(`[weekly-recap] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
