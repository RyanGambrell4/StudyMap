/**
 * weekly-digest.js — Send weekly study digest emails to opted-in users
 *
 * POST /api/weekly-digest
 *   Called by a cron or manually. Pulls each opted-in user's study data,
 *   builds a personalized digest, and sends via Resend.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function supabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

// ── Auth: require internal cron secret or service call ──────────────────────
function isAuthorized(req) {
  const auth = req.headers['authorization'] ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  // Also allow Vercel Cron (automatically sets x-vercel-cron header)
  if (req.headers['x-vercel-cron']) return true
  return false
}

// ── Format helpers ───────────────────────────────────────────────────────────
function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function getGreeting() {
  const h = new Date().getUTCHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function nextSunday() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + (7 - d.getUTCDay()))
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// ── Build email HTML ─────────────────────────────────────────────────────────
function buildDigestHtml({ name, email, stats, courses, weekAhead }) {
  const greeting = getGreeting()
  const firstName = (name ?? email ?? 'there').split(' ')[0]

  const courseRows = (courses ?? []).map(c => {
    const grade = c.currentGrade != null ? `${c.currentGrade.toFixed(1)}%` : null
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color ?? '#3B61C4'};flex-shrink:0;"></span>
            <span style="font-size:14px;font-weight:500;color:#111111;">${c.name}</span>
          </div>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;text-align:right;">
          ${grade ? `<span style="font-size:14px;font-weight:700;color:#3B61C4;">${grade}</span>` : '<span style="font-size:13px;color:#9B9B9B;">No grade yet</span>'}
        </td>
      </tr>`
  }).join('')

  const weekItems = (weekAhead ?? []).map(s => `
    <div style="padding:10px 14px;border-radius:10px;background:#F7F6F3;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${s.color ?? '#3B61C4'};flex-shrink:0;"></span>
      <div>
        <div style="font-size:13px;font-weight:600;color:#111111;">${s.day} · ${s.courseName}</div>
        <div style="font-size:12px;color:#6B6B6B;margin-top:2px;">${s.sessionType} · ${s.duration} min</div>
      </div>
    </div>`).join('')

  const totalMin = stats?.totalMinutes ?? 0
  const sessions = stats?.sessionCount ?? 0
  const streak   = stats?.streak ?? 0

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your weekly study digest</title>
</head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <!-- Logo / Header -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:8px;">
                <span style="width:28px;height:28px;border-radius:8px;background:#3B61C4;display:inline-block;"></span>
                <span style="font-size:15px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge</span>
              </div>
            </td>
          </tr>

          <!-- Hero card -->
          <tr>
            <td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:28px 28px 24px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Weekly Digest</p>
              <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.5px;">${greeting}, ${firstName}.</h1>

              <!-- Stats row -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  ${[
                    { label: 'Study time', value: totalMin >= 60 ? `${Math.round(totalMin / 60)}h ${totalMin % 60}m` : `${totalMin}m` },
                    { label: 'Sessions', value: String(sessions) },
                    { label: 'Day streak', value: String(streak) },
                  ].map(s => `
                  <td style="text-align:center;padding:16px 12px;background:#F7F6F3;border-radius:12px;" width="33%">
                    <div style="font-size:22px;font-weight:800;color:#111111;letter-spacing:-0.5px;">${s.value}</div>
                    <div style="font-size:11px;font-weight:500;color:#9B9B9B;margin-top:4px;">${s.label}</div>
                  </td>`).join('<td width="8px"></td>')}
                </tr>
              </table>

              ${courses?.length ? `
              <!-- Courses -->
              <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Current grades</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${courseRows}
              </table>` : ''}

              ${weekAhead?.length ? `
              <!-- Week ahead -->
              <p style="margin:24px 0 10px;font-size:11px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Week ahead (through ${nextSunday()})</p>
              ${weekItems}` : `
              <div style="margin-top:20px;padding:14px;border-radius:10px;background:#F7F6F3;text-align:center;">
                <p style="margin:0;font-size:13px;color:#9B9B9B;">No sessions scheduled. Open the app to add sessions for the week.</p>
              </div>`}

            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:20px 0 0;text-align:center;">
              <a href="https://studyedgeai.com" style="display:inline-block;padding:13px 28px;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:-0.2px;">Open StudyEdge</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;">
              <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
                You're receiving this because you opted in to weekly digests.<br>
                <a href="https://studyedgeai.com/unsubscribe?email=${encodeURIComponent(email ?? '')}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const db = supabaseAdmin()
  const results = { sent: 0, skipped: 0, errors: [] }

  try {
    // Pull opted-in users from user_data (email_digest column set at onboarding)
    const { data: rows, error } = await db
      .from('user_data')
      .select('user_id, email_digest, plan, manual_sessions, completed_sessions, study_tools')
      .eq('email_digest', true)

    if (error) throw error
    if (!rows?.length) {
      return res.status(200).json({ message: 'No opted-in users', ...results })
    }

    // Pull auth emails in one batch via admin API
    const userIds = rows.map(r => r.user_id)
    const authUsers = {}
    for (const uid of userIds) {
      try {
        const { data: { user } } = await db.auth.admin.getUserById(uid)
        if (user) authUsers[uid] = { email: user.email, name: user.user_metadata?.name ?? user.email }
      } catch { /* skip */ }
    }

    // Process each user
    for (const row of rows) {
      const authUser = authUsers[row.user_id]
      if (!authUser?.email) { results.skipped++; continue }

      const user = { id: row.user_id, email: authUser.email, name: authUser.name }

      try {
        // Reconstruct app data from individual columns
        const appData = {
          manual_sessions: row.manual_sessions ?? [],
          completed_sessions: row.completed_sessions ?? [],
          courses: row.study_tools?.courses ?? [],
        }
        const courses = (appData.courses ?? []).map(c => ({
          name: c.name,
          color: c.color?.dot ?? '#3B61C4',
          currentGrade: c.gradeData?.components?.length
            ? (() => {
                const graded = c.gradeData.components.filter(x => x.graded && x.grade != null)
                if (!graded.length) return null
                const totalW = c.gradeData.components.reduce((s, x) => s + x.weight, 0)
                return graded.reduce((s, x) => s + (x.grade * x.weight / totalW), 0)
              })()
            : null,
        }))

        // Build week-ahead from manual sessions (generated schedule is computed client-side)
        const allSessions = appData.manual_sessions ?? []

        // Next 7 days
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() + i)
          return d.toISOString().split('T')[0]
        })
        const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

        const weekAhead = allSessions
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

        // Stats: sessions completed this past week
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const weekAgoStr = weekAgo.toISOString().split('T')[0]
        const completedSessions = (appData.completed_sessions ?? []).filter(s => s.dateStr >= weekAgoStr)
        const totalMinutes = completedSessions.reduce((s, x) => s + (x.duration ?? 0), 0)
        const sessionCount = completedSessions.length

        // Simple streak: count consecutive days backward from today
        const completedDays = new Set((appData.completed_sessions ?? []).map(s => s.dateStr))
        let streak = 0
        for (let i = 0; i < 365; i++) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const ds = d.toISOString().split('T')[0]
          if (completedDays.has(ds)) streak++
          else if (i > 0) break
        }

        const html = buildDigestHtml({
          name: user.name,
          email: user.email,
          stats: { totalMinutes, sessionCount, streak },
          courses,
          weekAhead,
        })

        const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'digest@studyedgeai.com'

        const { error: sendError } = await resend.emails.send({
          from: `StudyEdge <${fromEmail}>`,
          to: user.email,
          subject: `Your week in study${sessionCount > 0 ? ` · ${pluralize(sessionCount, 'session')} done` : ''}`,
          html,
        })

        if (sendError) {
          results.errors.push({ userId: user.id, error: sendError.message })
        } else {
          results.sent++
        }
      } catch (userErr) {
        results.errors.push({ userId: user.id, error: String(userErr?.message ?? userErr) })
        results.skipped++
      }
    }

    return res.status(200).json({
      message: `Digest sent to ${results.sent} user${results.sent === 1 ? '' : 's'}`,
      ...results,
    })
  } catch (err) {
    console.error('[weekly-digest]', err)
    return res.status(500).json({ error: err.message ?? 'Internal error' })
  }
}
