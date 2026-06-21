import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

function buildDigestHtml({ name, email, stats, courses, weekAhead, isFree = false, trialUsed = false }) {
  const firstName = (name ?? email ?? 'there').split(' ')[0]
  const totalMin  = stats?.totalMinutes ?? 0
  const sessions  = stats?.sessionCount ?? 0
  const streak    = stats?.streak ?? 0

  const timeStr = totalMin >= 60
    ? `${Math.round(totalMin / 60)}h ${totalMin % 60}m`
    : `${totalMin}m`

  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const nextSun = (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + (7 - d.getUTCDay()))
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
  })()

  const courseRows = (courses ?? []).map(c => {
    const grade = c.currentGrade != null ? `${c.currentGrade.toFixed(1)}%` : null
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color ?? '#3B61C4'};margin-right:8px;"></span>
        <span style="font-size:14px;font-weight:500;color:#111111;">${c.name}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;text-align:right;">
        ${grade
          ? `<span style="font-size:14px;font-weight:700;color:#3B61C4;">${grade}</span>`
          : `<span style="font-size:13px;color:#9B9B9B;">No grade yet</span>`}
      </td>
    </tr>`
  }).join('')

  const weekItems = (weekAhead ?? []).map(s => `
    <div style="padding:10px 14px;border-radius:10px;background:#F7F6F3;margin-bottom:8px;">
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${s.color ?? '#3B61C4'};margin-right:8px;vertical-align:middle;"></span>
      <strong style="font-size:13px;color:#111111;">${s.day} · ${s.courseName}</strong>
      <span style="font-size:12px;color:#6B6B6B;margin-left:6px;">${s.sessionType} · ${s.duration} min</span>
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your weekly study digest</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;outline:none;text-decoration:none;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:28px 28px 24px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Weekly Digest</p>
        <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;">Hey ${firstName}.</h1>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td style="text-align:center;padding:16px 12px;background:#F7F6F3;border-radius:12px;" width="33%">
              <div style="font-size:22px;font-weight:800;color:#111111;">${timeStr}</div>
              <div style="font-size:11px;color:#9B9B9B;margin-top:4px;">Study time</div>
            </td>
            <td width="8px"></td>
            <td style="text-align:center;padding:16px 12px;background:#F7F6F3;border-radius:12px;" width="33%">
              <div style="font-size:22px;font-weight:800;color:#111111;">${sessions}</div>
              <div style="font-size:11px;color:#9B9B9B;margin-top:4px;">Sessions</div>
            </td>
            <td width="8px"></td>
            <td style="text-align:center;padding:16px 12px;background:#F7F6F3;border-radius:12px;" width="33%">
              <div style="font-size:22px;font-weight:800;color:#111111;">${streak}</div>
              <div style="font-size:11px;color:#9B9B9B;margin-top:4px;">Day streak</div>
            </td>
          </tr>
        </table>
        ${courses?.length ? `
        <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Current grades</p>
        <table width="100%" cellpadding="0" cellspacing="0">${courseRows}</table>` : ''}
        ${weekAhead?.length ? `
        <p style="margin:24px 0 10px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Week ahead (through ${nextSun})</p>
        ${weekItems}` : `
        <div style="margin-top:20px;padding:14px;border-radius:10px;background:#F7F6F3;text-align:center;">
          <p style="margin:0;font-size:13px;color:#9B9B9B;">No sessions scheduled. Open the app to plan your week.</p>
        </div>`}
      </td></tr>
      <tr><td style="padding:20px 0 0;text-align:center;">
        <a href="https://getstudyedge.com/app" style="display:inline-block;padding:13px 28px;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">Open StudyEdge</a>
      </td></tr>
      ${isFree ? `
      <tr><td style="padding:16px 0 0;">
        <table cellpadding="0" cellspacing="0" style="width:100%;background:#F4F7FF;border-radius:12px;border:1px solid rgba(59,97,196,0.15);">
          <tr><td style="padding:14px 18px;text-align:center;">
            <p style="margin:0 0 5px;font-size:13px;font-weight:600;color:#3B61C4;">${trialUsed ? 'Upgrade to Pro' : 'You have a free trial waiting'}</p>
            <p style="margin:0 0 10px;font-size:13px;color:#6B6B6B;line-height:1.55;">Unlock unlimited AI tutoring, brain dumps, cheat sheets, and practice exams.</p>
            <a href="https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=digest&utm_campaign=weekly_digest" style="display:inline-block;background:#E8531A;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;border-radius:8px;padding:10px 22px;">${trialUsed ? 'Upgrade to Pro →' : 'Start free trial →'}</a>
          </td></tr>
        </table>
      </td></tr>` : ''}
      <tr><td style="padding:24px 0 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You opted into weekly digests in StudyEdge.<br>
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(email ?? '')}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  const auth   = req.headers['authorization'] ?? ''
  const isCron = req.headers['x-vercel-cron']
  if (secret && auth !== `Bearer ${secret}` && !isCron) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'No RESEND_API_KEY' })
  }

  const results = { sent: 0, skipped: 0, errors: [] }

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, email_digest, manual_sessions, completed_sessions, study_tools, subscription')
    .eq('email_digest', true)

  if (error) return res.status(500).json({ error: error.message })
  if (!rows?.length) return res.status(200).json({ message: 'No opted-in users', ...results })

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'support@mail.getstudyedge.com'
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  for (const row of rows) {
    let authUser
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
      authUser = data?.user
    } catch { /* skip */ }
    if (!authUser?.email) { results.skipped++; continue }

    const gate = await canSendUserEmail(row.user_id, { priority: 'normal' })
    if (!gate.ok) { results.skipped++; continue }

    try {
      const manual    = Array.isArray(row.manual_sessions) ? row.manual_sessions : []
      const completed = Array.isArray(row.completed_sessions) ? row.completed_sessions : []
      const courses   = (row.study_tools?.courses ?? []).map(c => {
        const comps  = c.gradeData?.components ?? []
        const graded = comps.filter(x => x.graded && x.grade != null)
        const totalW = comps.reduce((s, x) => s + x.weight, 0)
        const grade  = graded.length && totalW > 0
          ? graded.reduce((s, x) => s + (x.grade * x.weight / totalW), 0)
          : null
        return { name: c.name, color: c.color?.dot ?? '#3B61C4', currentGrade: grade }
      })

      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() + i)
        return d.toISOString().split('T')[0]
      })
      const weekAhead = manual
        .filter(s => days.includes(s.dateStr))
        .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
        .slice(0, 6)
        .map(s => ({
          day: DAY_NAMES[new Date(s.dateStr + 'T12:00:00').getDay()],
          courseName: s.courseName ?? 'Study session',
          sessionType: s.sessionType ?? 'Review',
          duration: s.duration ?? 60,
          color: s.color?.dot ?? '#3B61C4',
        }))

      const weekAgoStr = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0] })()
      const weekSessions  = completed.filter(s => (s.dateStr ?? '') >= weekAgoStr)
      const totalMinutes  = weekSessions.reduce((s, x) => s + (x.duration ?? 0), 0)
      const completedDays = new Set(completed.map(s => s.dateStr))
      let streak = 0
      for (let i = 0; i < 365; i++) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const ds = d.toISOString().split('T')[0]
        if (completedDays.has(ds)) streak++
        else if (i > 0) break
      }

      const userPlan = row?.subscription?.plan ?? 'free'
      const trialUsed = !!(row?.subscription?.trialUsedAt)

      const html = buildDigestHtml({
        name: authUser.user_metadata?.name,
        email: authUser.email,
        stats: { totalMinutes, sessionCount: weekSessions.length, streak },
        courses,
        weekAhead,
        isFree: userPlan === 'free',
        trialUsed,
      })

      const { error: sendErr } = await resend.emails.send({
        from: `StudyEdge <${fromEmail}>`,
        to: authUser.email,
        subject: `Your week in study${weekSessions.length > 0 ? ` · ${weekSessions.length} session${weekSessions.length === 1 ? '' : 's'} done` : ''}`,
        html,
      })

      if (sendErr) results.errors.push({ userId: row.user_id, error: sendErr.message })
      else { await recordUserEmail(row.user_id); results.sent++ }
    } catch (err) {
      results.errors.push({ userId: row.user_id, error: String(err?.message ?? err) })
      results.skipped++
    }
  }

  return res.status(200).json({
    message: `Digest sent to ${results.sent} user${results.sent === 1 ? '' : 's'}`,
    ...results,
  })
}
