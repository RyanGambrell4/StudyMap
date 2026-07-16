/**
 * Trial report card — fires the moment a trial ends for non-converters.
 *
 * Window: trialUsedAt was 72–96h ago (trial ended 0–24h ago), plan !== 'pro'/'unlimited'.
 * This fills the dead zone between trial-warning (day 2) and trial-expired (day 4-5).
 * The trial-end moment is the highest-leverage conversion window — the student just
 * lost something real — and the most effective message is their OWN data, not a
 * generic features list.
 *
 * What makes this different from trial-expired.js:
 *   - Fires immediately at trial end, not 1–2 days after
 *   - Shows real session count, real course names, real upcoming exams
 *   - Copy is indexed to their actual behavior (3 branches by session count)
 *   - No generic "here's what Pro does" — only "here's what YOU built and lost"
 *
 * Guard: trial_email_flags.report_card_sent — never double-send.
 */

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

  const locked = await acquireCronLock('trial-report-card')
  if (!locked) {
    console.log('[trial-report-card] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  // Window: trial ended in last 24h = trialUsedAt was 72–96h ago (3-day trial).
  // trial-warning fires at 48–72h (24h remaining), so this is right after the
  // trial-warning window closes — no overlap.
  const now = new Date()
  const windowStart = new Date(now - 96 * 60 * 60 * 1000) // 4 days ago
  const windowEnd   = new Date(now - 72 * 60 * 60 * 1000) // 3 days ago

  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, subscription, plan, completed_sessions, courses, syllabus_events, trial_email_flags')
    .not('subscription->trialUsedAt', 'is', null)
    .limit(2000)

  if (error) return res.status(500).json({ error: 'Failed to query users', detail: error.message })

  console.log(`[trial-report-card] Checking ${(rows ?? []).length} trial-used accounts`)
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    try {
      const sub  = row.subscription ?? {}
      const plan = sub.plan ?? 'free'

      // Only non-converters — active/trialing users already received pro-welcome.
      if (plan === 'pro' || plan === 'unlimited') { skipped++; continue }

      const trialUsedAt = sub.trialUsedAt
      if (!trialUsedAt) { skipped++; continue }
      const trialUsedDate = new Date(trialUsedAt)
      if (isNaN(trialUsedDate.getTime())) { skipped++; continue }
      if (trialUsedDate < windowStart || trialUsedDate > windowEnd) { skipped++; continue }

      // Guard — never resend.
      const flags = row.trial_email_flags ?? {}
      if (flags.report_card_sent) { skipped++; continue }

      const gate = await canSendUserEmail(row.user_id, { priority: 'high' })
      if (!gate.ok) { skipped++; continue }

      let email, firstName
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        email = authUser?.user?.email
        firstName = (authUser?.user?.user_metadata?.first_name
          ?? authUser?.user?.user_metadata?.full_name
          ?? authUser?.user?.user_metadata?.name
          ?? '').split(' ')[0] || null
      } catch { /* skip */ }
      if (!email) { skipped++; continue }

      // ── Real data ──────────────────────────────────────────────────────────

      const sessionCount = Array.isArray(row.completed_sessions) ? row.completed_sessions.length : 0

      // Pull up to 3 course names — fall back gracefully if name field varies.
      const courseNames = (row.courses ?? [])
        .slice(0, 3)
        .map(c => c?.name ?? c?.title ?? c?.courseName ?? null)
        .filter(Boolean)
      const courseCount = Array.isArray(row.courses) ? row.courses.length : 0

      // Find the soonest upcoming exam from syllabus_events.
      const todayStr  = now.toISOString().slice(0, 10)
      const nextExam  = (row.syllabus_events ?? [])
        .filter(e => {
          const isExam = e.type === 'exam' || /exam|midterm|final|test|quiz/i.test(e.title ?? '')
          const d = e.date ?? e.dateStr ?? ''
          return isExam && d > todayStr
        })
        .sort((a, b) => (a.date ?? a.dateStr ?? '').localeCompare(b.date ?? b.dateStr ?? ''))[0] ?? null

      let nextExamLabel = null
      let daysToExam    = null
      if (nextExam) {
        const examDate = new Date((nextExam.date ?? nextExam.dateStr) + 'T12:00:00')
        daysToExam     = Math.round((examDate.getTime() - now.getTime()) / 86400000)
        nextExamLabel  = nextExam.title ?? 'Upcoming exam'
      }

      // ── Branch copy indexed to real session count ─────────────────────────
      const greeting = firstName ? `Hey ${firstName}` : 'Hey'
      let subject, heading, lead, urgencyNote

      if (sessionCount >= 3) {
        subject     = `You logged ${sessionCount} sessions. Here's what you built.`
        heading     = `${sessionCount} sessions. That's a real start — don't reset it.`
        lead        = `${greeting}, your 3-day Pro trial just ended. You logged ${sessionCount} session${sessionCount !== 1 ? 's' : ''} — that's more than most trial users ever do. The habit is there. The question is whether you keep it.`
        urgencyNote = `Students who keep studying momentum into week 2 are the ones who finish the semester ahead. The ones who let it break spend the last 3 weeks cramming.`
      } else if (sessionCount > 0) {
        subject     = `Your trial ended. You ran ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`
        heading     = `You started. Here's what you lose if you stop.`
        lead        = `${greeting}, your Pro trial just ended. You ran ${sessionCount} session${sessionCount !== 1 ? 's' : ''} — enough to see what the tool does. The students who get the real results are the ones who use it consistently, not just once.`
        urgencyNote = `One session a day with a Blueprint is what moves the needle. $2.99/week is less than one coffee. The grade difference is not.`
      } else {
        subject     = `Your trial ended without a single session.`
        heading     = `Your trial is over. You never ran a session.`
        lead        = `${greeting}, your Pro trial ended. You set up your account${courseCount > 0 ? ` and added ${courseCount} course${courseCount !== 1 ? 's' : ''}` : ''} — but never ran a study session. That's the one step that separates the students who see results from those who don't.`
        urgencyNote = `A single 2-minute session with the AI Study Coach will show you more than any email can. Pro is $2.99/week. If it doesn't help, cancel in 10 seconds from your account.`
      }

      const upgradeUrl = `https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=trial_report_card`

      try {
        await resend.emails.send({
          from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
          to: email,
          subject,
          headers: listUnsubscribeHeaders(email),
          tags: [
            { name: 'campaign', value: 'trial_report_card' },
            { name: 'user_id', value: row.user_id },
          ],
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader(sessionCount >= 3
  ? `You logged ${sessionCount} sessions. That habit doesn't have to end here.`
  : sessionCount > 0
    ? `You ran ${sessionCount} session${sessionCount !== 1 ? 's' : ''} on Pro. Here's what you lose now.`
    : `Your trial ended without a session. $2.99/week to pick up where you didn't start.`
)}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>

      <tr><td style="background:#FFFFFF;border-radius:18px;border:1px solid rgba(0,0,0,0.06);padding:36px 36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">

        <!-- Trial ended pill -->
        <table cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
          <tr><td style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:100px;padding:5px 14px;">
            <span style="font-size:12px;font-weight:700;color:#DC2626;letter-spacing:0.04em;">● Trial ended</span>
          </td></tr>
        </table>

        <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#111111;letter-spacing:-0.6px;line-height:1.24;">
          ${heading}
        </h1>

        <p style="margin:0 0 26px;font-size:15px;color:#6B6B6B;line-height:1.72;">
          ${lead}
        </p>

        <!-- Real data card -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:26px;background:#F7F6F3;border-radius:16px;border:1px solid rgba(0,0,0,0.07);">
          <tr><td style="padding:20px 24px 8px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#9B9B9B;text-transform:uppercase;">Your 3-day trial results</p>
          </td></tr>

          <!-- Sessions row -->
          <tr><td style="padding:0 24px 14px;">
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#FFFFFF;border-radius:12px;border:1px solid rgba(0,0,0,0.06);">
              <tr>
                <td style="padding:14px 18px;width:56px;text-align:center;vertical-align:middle;">
                  <div style="font-size:28px;font-weight:800;color:${sessionCount >= 3 ? '#22C55E' : sessionCount > 0 ? '#3B61C4' : '#9B9B9B'};">${sessionCount}</div>
                </td>
                <td style="padding:14px 18px 14px 0;border-left:1px solid #F0EDE8;vertical-align:middle;">
                  <div style="font-size:13px;font-weight:700;color:#111111;margin-bottom:3px;">Study sessions completed</div>
                  <div style="font-size:12px;color:#9B9B9B;">${sessionCount >= 3 ? 'Strong start — top 10% of trial users' : sessionCount > 0 ? 'You tried it. That\'s the hardest part.' : 'None started during the trial'}</div>
                </td>
              </tr>
            </table>
          </td></tr>

          <!-- Courses row -->
          <tr><td style="padding:0 24px 14px;">
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#FFFFFF;border-radius:12px;border:1px solid rgba(0,0,0,0.06);">
              <tr>
                <td style="padding:14px 18px;width:56px;text-align:center;vertical-align:middle;">
                  <div style="font-size:28px;font-weight:800;color:${courseCount > 0 ? '#3B61C4' : '#9B9B9B'};">${courseCount}</div>
                </td>
                <td style="padding:14px 18px 14px 0;border-left:1px solid #F0EDE8;vertical-align:middle;">
                  <div style="font-size:13px;font-weight:700;color:#111111;margin-bottom:3px;">${courseCount === 1 ? 'Course' : 'Courses'} tracked${courseNames.length > 0 ? '' : ' (free plan: back to 1)'}</div>
                  ${courseNames.length > 0
                    ? `<div style="font-size:12px;color:#6B6B6B;">${courseNames.join(' · ')}</div>`
                    : `<div style="font-size:12px;color:#9B9B9B;">No courses added during trial</div>`
                  }
                </td>
              </tr>
            </table>
          </td></tr>

          <!-- Next exam row — only if we have real data -->
          ${nextExamLabel ? `
          <tr><td style="padding:0 24px 14px;">
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#FFFFFF;border-radius:12px;border:1px solid rgba(0,0,0,0.06);">
              <tr>
                <td style="padding:14px 18px;width:56px;text-align:center;vertical-align:middle;">
                  <div style="font-size:20px;font-weight:800;color:#E8531A;">${daysToExam}</div>
                  <div style="font-size:9px;color:#9B9B9B;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">days</div>
                </td>
                <td style="padding:14px 18px 14px 0;border-left:1px solid #F0EDE8;vertical-align:middle;">
                  <div style="font-size:13px;font-weight:700;color:#111111;margin-bottom:3px;">Until ${nextExamLabel}</div>
                  <div style="font-size:12px;color:#E8531A;font-weight:600;">You need Pro to build your exam plan.</div>
                </td>
              </tr>
            </table>
          </td></tr>` : ''}

          <tr><td style="padding:0 24px 18px;">
            <p style="margin:0;font-size:12px;color:#9B9B9B;line-height:1.6;font-style:italic;">
              ${urgencyNote}
            </p>
          </td></tr>
        </table>

        <!-- What you lose — only show if they actually used anything -->
        ${sessionCount > 0 || courseCount > 0 ? `
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#111111;">What just turned off:</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:26px;">
          ${[
            ['100 AI actions/month', sessionCount > 0 ? 'You used these — now back to 2 total.' : 'Back to 2 total.'],
            ['Unlimited Session Blueprints', 'Capped again. Free plan is too limited for daily use.'],
            [courseCount > 1 ? `${courseCount}-course tracking` : '5-course tracking', 'Back to 1 course. Your other courses go untracked.'],
            ['AI Study Coach — unlimited', 'The plan that was keeping you on schedule is gone.'],
          ].map(([feat, note]) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #F0EDE8;">
              <table cellpadding="0" cellspacing="0" style="width:100%;">
                <tr>
                  <td style="width:22px;vertical-align:top;padding-top:2px;">
                    <span style="font-size:13px;color:#DC2626;font-weight:700;">✕</span>
                  </td>
                  <td>
                    <div style="font-size:14px;font-weight:600;color:#111111;">${feat}</div>
                    <div style="font-size:12.5px;color:#9B9B9B;margin-top:2px;">${note}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`).join('')}
        </table>` : ''}

        <!-- CTA -->
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          Pro is <strong style="color:#111111;">$2.99/week</strong>. Cancel in your account any time — one tap.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:10px;">
            <a href="${upgradeUrl}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 36px;letter-spacing:-0.2px;">Upgrade to Pro — $2.99/wk</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12px;color:#9B9B9B;">$2.99/wk · Cancel in account anytime</span>
          </td></tr>
        </table>

        <p style="margin:28px 0 0;font-size:14px;color:#9B9B9B;line-height:1.65;">
          Reply if you want to talk through whether Pro is right for where you are in your semester. I'll actually respond. — Ryan
        </p>

      </td></tr>

      <tr><td style="padding:22px 4px 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because your StudyEdge Pro trial just ended.<br>
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

        await supabaseAdmin
          .from('user_data')
          .update({ trial_email_flags: { ...flags, report_card_sent: new Date().toISOString() } })
          .eq('user_id', row.user_id)
        await recordUserEmail(row.user_id)
        sent++
        const branch = sessionCount >= 3 ? 'high' : sessionCount > 0 ? 'some' : 'zero'
        console.log(`[trial-report-card] Sent to ${email} branch=${branch} sessions=${sessionCount} courses=${courseCount}`)
      } catch (err) {
        console.error(`[trial-report-card] Failed to send to ${email}:`, err)
      }
    } catch (err) {
      console.error(`[trial-report-card] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[trial-report-card] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
