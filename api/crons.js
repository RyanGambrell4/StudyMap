/**
 * crons.js — Consolidated email/cron handler
 *
 * GET  /api/crons?job=re-engage    → day-3 re-engagement email (daily cron)
 * GET  /api/crons?job=weekly-recap → Sunday weekly recap email (weekly cron)
 * POST /api/crons?job=welcome-email → welcome email for new signups
 *
 * Replaces api/welcome-email.js, api/re-engage.js, api/weekly-recap.js
 * to stay within Vercel Hobby's 12-function limit.
 *
 * Cron jobs protected by CRON_SECRET env var.
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ─── Welcome Email ───────────────────────────────────────────────────────────

async function handleWelcomeEmail(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { email } = body
  if (!email) return res.status(400).json({ error: 'Missing email' })

  if (!process.env.RESEND_API_KEY) {
    console.warn('[crons/welcome-email] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  try {
    await resend.emails.send({
      from: 'StudyEdge AI <support@getstudyedge.com>',
      to: email,
      subject: "You're in — here's what Pro adds (free for 7 days)",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            Welcome. You're on the free plan.
          </h1>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Your account is set up and ready. Before you dive in, here's one thing worth knowing:
            you can try <strong style="color:#c7d2fe;">Pro free for 7 days</strong> — no commitment,
            card only charged after the trial ends.
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">Here's what Pro unlocks:</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              ['5 courses', 'Free gives you 1'],
              ['75 AI study boosts/month', 'Free gives you 10'],
              ['AI Study Coach', 'Personalized study plans'],
              ['Session Blueprints', 'Minute-by-minute session plans'],
              ['Flashcards & quizzes', 'Built into every session'],
            ].map(([feat, sub]) => `
            <tr>
              <td style="padding:7px 0;">
                <span style="color:#34d399;font-size:13px;margin-right:10px;">✓</span>
                <strong style="font-size:14px;color:#CBD5E1;">${feat}</strong>
                <span style="font-size:13px;color:#475569;margin-left:8px;">— ${sub}</span>
              </td>
            </tr>`).join('')}
          </table>
        </td></tr>

        <tr><td style="padding-bottom:16px;text-align:center;">
          <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Start my free 7-day trial →
          </a>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="font-size:12px;color:#334155;">Card charged after trial · Cancel before day 7, pay nothing</span>
        </td></tr>

        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            You're receiving this because you just created a StudyEdge AI account.<br/>
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
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[crons/welcome-email] Failed to send:', err)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}

// ─── Re-engage Cron ──────────────────────────────────────────────────────────

async function handleReEngage(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[crons/re-engage] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const now = new Date()
  const windowStart = new Date(now - 84 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 60 * 60 * 1000 * 60)

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  })

  if (error) {
    console.error('[crons/re-engage] Failed to list users:', error)
    return res.status(500).json({ error: 'Failed to list users' })
  }

  const dormant = (users?.users ?? []).filter(u => {
    const created = new Date(u.created_at)
    if (created < windowStart || created > windowEnd) return false
    const lastSignIn = new Date(u.last_sign_in_at)
    const firstHourCutoff = new Date(created.getTime() + 60 * 60 * 1000)
    return lastSignIn <= firstHourCutoff
  })

  console.log(`[crons/re-engage] Found ${dormant.length} dormant users`)

  let sent = 0
  for (const user of dormant) {
    if (!user.email) continue
    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: user.email,
        subject: 'Still figuring out your study schedule?',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            Your study plan is waiting.
          </h1>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            You signed up for StudyEdge AI but haven't set up your schedule yet.
            It takes about 60 seconds — just add your courses and we'll build a full
            study plan around your exams and deadlines.
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">Here's what you'll have when you're done:</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              'A week-by-week study calendar',
              'Session blueprints with what to study and when',
              'AI-powered study boosts for any topic',
              'Flashcards and quizzes built from your notes',
            ].map(f => `
            <tr>
              <td style="padding:7px 0;">
                <span style="color:#6366f1;font-size:13px;margin-right:10px;">→</span>
                <span style="font-size:14px;color:#CBD5E1;">${f}</span>
              </td>
            </tr>`).join('')}
          </table>
        </td></tr>

        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Set up my study plan →
          </a>
        </td></tr>

        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            You're receiving this because you created a StudyEdge AI account.<br/>
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
      console.error(`[crons/re-engage] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[crons/re-engage] Sent ${sent}/${dormant.length}`)
  return res.status(200).json({ ok: true, sent, total: dormant.length })
}

// ─── Weekly Recap Cron ───────────────────────────────────────────────────────

async function handleWeeklyRecap(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[crons/weekly-recap] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, completed_sessions, study_tools, subscription')
    .limit(1000)

  if (error) {
    console.error('[crons/weekly-recap] DB error:', error)
    return res.status(500).json({ error: 'DB read failed' })
  }

  const now = new Date()
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

  let sent = 0
  let skipped = 0

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

    let email
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
      email = authUser?.user?.email
    } catch { /* skip */ }
    if (!email) { skipped++; continue }

    const highlights = weekSessions.slice(0, 3).map(s => s.course ?? s.title ?? 'Study session')
    const totalMins = weekSessions.reduce((sum, s) => sum + (Number(s.duration) || 0), 0)
    const hoursStr = totalMins >= 60
      ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
      : totalMins > 0 ? `${totalMins}m` : null

    const sessionWord = weekSessions.length === 1 ? 'session' : 'sessions'
    const streakLine = streak >= 2 ? `🔥 ${streak}-day streak — keep it going.` : null
    const motiveLine = weekSessions.length >= 5
      ? "That's a strong week. Consistency like this is what moves the needle."
      : weekSessions.length >= 3
        ? "Solid week. You're building the habit."
        : weekSessions.length >= 1
          ? "You showed up this week. That's more than most."
          : "Even one session a week adds up. Your schedule is ready when you are."

    const isFreePlan = plan === 'free'

    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: email,
        subject: weekSessions.length > 0
          ? `Your week: ${weekSessions.length} ${sessionWord} completed${streak >= 2 ? ` · ${streak}-day streak` : ''}`
          : 'Your weekly study recap',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <tr><td style="padding-bottom:24px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
          <span style="font-size:12px;color:#334155;margin-left:10px;">Weekly Recap</span>
        </td></tr>

        <tr><td style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#F1F5F9;letter-spacing:-0.6px;line-height:1.3;">
            ${weekSessions.length > 0 ? `You completed ${weekSessions.length} study ${sessionWord} this week.` : "Your study plan is ready for the week ahead."}
          </h1>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;border-radius:12px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.15);overflow:hidden;">
            <tr>
              <td style="padding:16px 20px;text-align:center;border-right:1px solid rgba(99,102,241,0.15);">
                <div style="font-size:28px;font-weight:900;color:#c7d2fe;letter-spacing:-1px;">${weekSessions.length}</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">sessions this week</div>
              </td>
              <td style="padding:16px 20px;text-align:center;border-right:1px solid rgba(99,102,241,0.15);">
                <div style="font-size:28px;font-weight:900;color:#c7d2fe;letter-spacing:-1px;">${streak}</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">day streak</div>
              </td>
              <td style="padding:16px 20px;text-align:center;">
                <div style="font-size:28px;font-weight:900;color:#c7d2fe;letter-spacing:-1px;">${hoursStr ?? '—'}</div>
                <div style="font-size:11px;color:#475569;margin-top:2px;">studied</div>
              </td>
            </tr>
          </table>
        </td></tr>

        ${highlights.length > 0 ? `
        <tr><td style="padding-bottom:20px;">
          <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.8px;">This week's sessions</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            ${highlights.map(h => `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="font-size:13px;color:#CBD5E1;">✓ ${h}</span>
              </td>
            </tr>`).join('')}
            ${weekSessions.length > 3 ? `
            <tr><td style="padding:8px 0;font-size:12px;color:#475569;">+${weekSessions.length - 3} more sessions</td></tr>` : ''}
          </table>
        </td></tr>` : ''}

        <tr><td style="padding-bottom:${isFreePlan ? '20px' : '32px'};">
          <p style="margin:0;font-size:15px;color:#94A3B8;line-height:1.7;">
            ${motiveLine}${streakLine ? `<br/><br/><strong style="color:#fbbf24;">${streakLine}</strong>` : ''}
          </p>
        </td></tr>

        ${isFreePlan ? `
        <tr><td style="padding-bottom:32px;">
          <div style="background:linear-gradient(135deg,rgba(79,126,247,0.12),rgba(124,92,250,0.12));border:1px solid rgba(99,102,241,0.25);border-radius:12px;padding:18px 20px;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#c7d2fe;">✦ Want to study more effectively next week?</p>
            <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.5;">Pro gives you 75 AI study boosts/month, 5 courses, Study Coach, and Session Blueprints. Try it free for 7 days.</p>
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1"
               style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;padding:10px 22px;">
              Start 7-day free trial →
            </a>
          </div>
        </td></tr>` : ''}

        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app"
             style="display:inline-block;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#c7d2fe;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;padding:12px 28px;">
            Open my study plan →
          </a>
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
      console.error(`[crons/weekly-recap] Failed to send to ${email}:`, err)
    }
  }

  console.log(`[crons/weekly-recap] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}

// ─── Exam Countdown Cron ─────────────────────────────────────────────────────
// Runs daily. Finds users with an exam date exactly 14 or 7 days away and sends
// a targeted countdown email with a contextual study tip and upgrade nudge.

async function handleExamCountdown(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[crons/exam-countdown] RESEND_API_KEY not set — skipping')
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
    console.error('[crons/exam-countdown] DB error:', error)
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
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <tr><td style="padding-bottom:24px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <tr><td style="padding-bottom:8px;">
          <div style="display:inline-block;background:${daysLeft === 7 ? 'rgba(249,115,22,0.12)' : 'rgba(251,191,36,0.1)'};border:1px solid ${daysLeft === 7 ? 'rgba(249,115,22,0.3)' : 'rgba(251,191,36,0.25)'};border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;color:${daysLeft === 7 ? '#f97316' : '#fbbf24'};letter-spacing:0.3px;">
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
          <a href="https://getstudyedge.com/app"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 32px;letter-spacing:-0.2px;">
            Open my study plan →
          </a>
        </td></tr>

        ${isFreePlan ? `
        <tr><td style="padding-bottom:32px;">
          <div style="background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:16px 18px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#c7d2fe;">Get a session blueprint for every remaining day</p>
            <p style="margin:0 0 12px;font-size:12px;color:#475569;line-height:1.5;">Pro gives you AI-built session plans, Study Coach, and 75 boosts/month. Try free for 7 days.</p>
            <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1"
               style="font-size:13px;font-weight:700;color:#818cf8;text-decoration:none;">
              Start 7-day free trial →
            </a>
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
        console.error(`[crons/exam-countdown] Failed to send to ${email}:`, err)
      }
    }
  }

  console.log(`[crons/exam-countdown] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}

// ─── Day-14 Upgrade Push ─────────────────────────────────────────────────────
// Runs daily. Finds free users who signed up 14 days ago and haven't upgraded.
// Sends a direct, value-focused upgrade email.

async function handleDay14Upgrade(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[crons/day14-upgrade] RESEND_API_KEY not set — skipping')
    return res.status(200).json({ ok: true, skipped: true })
  }

  const now = new Date()
  // Window: signed up 14–15 days ago (1-day window to avoid duplicates)
  const windowEnd   = new Date(now - 14 * 24 * 60 * 60 * 1000)
  const windowStart = new Date(now - 15 * 24 * 60 * 60 * 1000)

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) {
    console.error('[crons/day14-upgrade] Failed to list users:', error)
    return res.status(500).json({ error: 'Failed to list users' })
  }

  const eligible = (users?.users ?? []).filter(u => {
    const created = new Date(u.created_at)
    return created >= windowStart && created <= windowEnd
  })

  let sent = 0, skipped = 0

  for (const user of eligible) {
    if (!user.email) { skipped++; continue }

    // Check if already on a paid plan
    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', user.id)
      .single()

    const activeStatuses = ['active', 'trialing', 'past_due']
    const sub = row?.subscription ?? {}
    const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
    if (plan !== 'free') { skipped++; continue }

    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: user.email,
        subject: "Two weeks in — still on the free plan?",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            You've been using StudyEdge for 2 weeks.
          </h1>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 16px;font-size:15px;color:#94A3B8;line-height:1.7;">
            You're on the free plan, which limits you to 1 course and 10 AI boosts. If you've been hitting those limits — or want to use the app properly this semester — Pro is the right move.
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Most students who upgrade do it around week 2, when they realize they're serious about their grades. You're at that point.
          </p>

          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
            ${[
              ['5 courses', 'Track every class, not just one'],
              ['75 AI boosts / month', '7× more than free — enough for daily use'],
              ['AI Study Coach', '8-week personalized plan built around your deadlines'],
              ['Session Blueprints', 'Know exactly what to study in every session'],
              ['Focus sessions', 'Timed, distraction-free study with your plan loaded'],
            ].map(([feat, detail]) => `
            <tr>
              <td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:14px;color:#CBD5E1;font-weight:600;">${feat}</div>
                <div style="font-size:12px;color:#475569;margin-top:2px;">${detail}</div>
              </td>
            </tr>`).join('')}
          </table>
        </td></tr>

        <tr><td style="padding-bottom:12px;text-align:center;">
          <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 36px;letter-spacing:-0.2px;">
            Try Pro free for 7 days →
          </a>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="font-size:12px;color:#334155;">Cancel before day 7 and you won't be charged anything.</span>
        </td></tr>

        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            StudyEdge AI · You signed up 2 weeks ago and are still on the free plan<br/>
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
      console.error(`[crons/day14-upgrade] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[crons/day14-upgrade] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}

// ─── Day-1 Tips ──────────────────────────────────────────────────────────────

async function handleDay1Tips(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ ok: true, skipped: true })
  }

  const now = new Date()
  const windowStart = new Date(now - 28 * 60 * 60 * 1000) // 28h ago
  const windowEnd   = new Date(now - 20 * 60 * 60 * 1000) // 20h ago

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 })
  if (error) return res.status(500).json({ error: 'Failed to list users' })

  const newUsers = (users?.users ?? []).filter(u => {
    const created = new Date(u.created_at)
    return created >= windowStart && created <= windowEnd
  })

  console.log(`[crons/day1-tips] Found ${newUsers.length} new users`)
  let sent = 0
  for (const user of newUsers) {
    if (!user.email) continue
    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: user.email,
        subject: '3 things that make StudyEdge actually work',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            Make your first week count.
          </h1>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 20px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Most students who stick with StudyEdge do three things in their first week. Here they are:
          </p>

          ${[
            ['1. Add your courses with real exam dates', 'The app builds everything around your deadlines — without a date it\'s just guessing. Takes 30 seconds.'],
            ['2. Generate a Session Blueprint before your next study block', 'Open any course, tap "Session Blueprint," and get a minute-by-minute plan for the session. It changes how you approach each block.'],
            ['3. Use Study Coach once a week', 'Ask it to build a weekly plan around your current workload. Students who do this study 40% more consistently than those who don\'t.'],
          ].map(([title, desc]) => `
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;">
            <tr>
              <td>
                <div style="font-size:14px;font-weight:700;color:#c7d2fe;margin-bottom:6px;">${title}</div>
                <div style="font-size:13px;color:#94A3B8;line-height:1.6;">${desc}</div>
              </td>
            </tr>
          </table>`).join('')}

          <p style="margin:20px 0 0;font-size:15px;color:#94A3B8;line-height:1.7;">
            Set aside 10 minutes today to get your courses in. Everything else follows from there.
          </p>
        </td></tr>

        <tr><td style="padding-bottom:32px;text-align:center;">
          <a href="https://getstudyedge.com/app"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 36px;letter-spacing:-0.2px;">
            Open StudyEdge →
          </a>
        </td></tr>

        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            StudyEdge AI · Tips for new users<br/>
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
      console.error(`[crons/day1-tips] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[crons/day1-tips] Sent ${sent}`)
  return res.status(200).json({ ok: true, sent })
}

// ─── Day-7 Milestone ─────────────────────────────────────────────────────────

async function handleDay7Milestone(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ ok: true, skipped: true })
  }

  const now = new Date()
  const windowStart = new Date(now - 172 * 60 * 60 * 1000) // 7.17 days ago
  const windowEnd   = new Date(now - 156 * 60 * 60 * 1000) // 6.5 days ago

  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 })
  if (error) return res.status(500).json({ error: 'Failed to list users' })

  const weekOldUsers = (users?.users ?? []).filter(u => {
    const created = new Date(u.created_at)
    return created >= windowStart && created <= windowEnd
  })

  console.log(`[crons/day7-milestone] Found ${weekOldUsers.length} users at 7-day mark`)
  let sent = 0, skipped = 0

  for (const user of weekOldUsers) {
    if (!user.email) continue

    // Fetch user_data to check plan + session count
    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription, completed_sessions, courses')
      .eq('user_id', user.id)
      .maybeSingle()

    const plan = row?.subscription?.plan ?? 'free'
    const sessionCount = Array.isArray(row?.completed_sessions) ? row.completed_sessions.length : 0
    const courseCount = Array.isArray(row?.courses) ? row.courses.length : 0

    // Skip if already on paid plan — no upgrade push needed
    if (plan !== 'free') { skipped++; continue }

    const hasActivity = sessionCount > 0 || courseCount > 0
    const activityLine = hasActivity
      ? `You've added ${courseCount} course${courseCount !== 1 ? 's' : ''} and completed ${sessionCount} study session${sessionCount !== 1 ? 's' : ''} — that's a solid start.`
      : `You signed up a week ago but haven't started yet. That's okay — most people take a few days to get going.`

    try {
      await resend.emails.send({
        from: 'StudyEdge AI <support@getstudyedge.com>',
        to: user.email,
        subject: "One week in — here's what Pro-plan students do differently",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080D1A;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0D1425;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:40px 48px;max-width:560px;">

        <tr><td style="padding-bottom:28px;">
          <span style="font-size:17px;font-weight:700;color:#F1F5F9;letter-spacing:-0.3px;">StudyEdge AI</span>
        </td></tr>

        <tr><td style="padding-bottom:16px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#F1F5F9;letter-spacing:-0.8px;line-height:1.3;">
            You've been on StudyEdge for one week.
          </h1>
        </td></tr>

        <tr><td style="padding-bottom:24px;">
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            ${activityLine}
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:#94A3B8;line-height:1.7;">
            Students who upgrade in week 2 consistently outperform those who wait. Here's what they get that you don't have yet:
          </p>

          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${[
              ['AI Study Coach', 'Builds a full multi-week study plan around your courses and exam dates'],
              ['Session Blueprints', 'Minute-by-minute plan for every study session — no more winging it'],
              ['75 AI boosts/month', 'Free gives you 10 — Pro gives you enough for daily use all semester'],
              ['5 courses', 'Add your full course load, not just one'],
            ].map(([feat, desc]) => `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="color:#34d399;font-size:13px;margin-right:10px;">✓</span>
                <strong style="font-size:14px;color:#CBD5E1;">${feat}</strong>
                <div style="font-size:12px;color:#475569;margin-top:3px;padding-left:23px;">${desc}</div>
              </td>
            </tr>`).join('')}
          </table>

          <p style="margin:0;font-size:15px;color:#94A3B8;line-height:1.7;">
            Pro is <strong style="color:#c7d2fe;">$7.08/mo</strong> on the annual plan — less than a textbook chapter, for tools that actually help you use it.
          </p>
        </td></tr>

        <tr><td style="padding-bottom:12px;text-align:center;">
          <a href="https://getstudyedge.com/app?signup=1&plan=pro&billing=yearly"
             style="display:inline-block;background:linear-gradient(135deg,#4F7EF7,#7C5CFA);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;padding:14px 36px;letter-spacing:-0.2px;">
            Upgrade to Pro — $7.08/mo →
          </a>
        </td></tr>
        <tr><td style="padding-bottom:32px;text-align:center;">
          <span style="font-size:12px;color:#334155;">Billed $84.99/yr · Cancel anytime</span>
        </td></tr>

        <tr><td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#334155;line-height:1.6;">
            StudyEdge AI · You signed up one week ago<br/>
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
      console.error(`[crons/day7-milestone] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[crons/day7-milestone] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}

// ─── Router ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const job = req.query?.job
  if (job === 'welcome-email')   return handleWelcomeEmail(req, res)
  if (job === 're-engage')       return handleReEngage(req, res)
  if (job === 'weekly-recap')    return handleWeeklyRecap(req, res)
  if (job === 'exam-countdown')  return handleExamCountdown(req, res)
  if (job === 'day14-upgrade')   return handleDay14Upgrade(req, res)
  if (job === 'day1-tips')       return handleDay1Tips(req, res)
  if (job === 'day7-milestone')  return handleDay7Milestone(req, res)
  return res.status(400).json({ error: 'Missing or invalid ?job= param' })
}
