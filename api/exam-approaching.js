/**
 * Exam approaching trigger email.
 *
 * Cron that scans all free users with an upcoming exam in 1–14 days.
 * This is the highest-urgency conversion moment in the product — the student
 * has a real deadline, and we know what it is. A generic "here's what Pro
 * unlocks" email at day 7 cannot compete with "your Organic Chem Midterm is
 * in 8 days — here's the plan."
 *
 * Dedup strategy: we hash (examTitle + examDate) per user and store sent
 * hashes in subscription.exam_approaching_sent (array). This means we send
 * once per unique exam event even if the cron runs daily, and never double-send
 * for the same exam if the exam date changes slightly.
 *
 * Branches:
 *   has_sessions  → "You're studying. Here's how to make these days count."
 *   no_sessions   → "You haven't started. 14 days (or fewer) is still enough."
 *
 * Days-remaining bucketing: <3 days = CRITICAL, 3–7 = URGENT, 8–14 = PLAN.
 * Color and CTA urgency scales with proximity.
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { acquireCronLock } from '../lib/server/cronLock.js'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

function examHash(title, date) {
  const raw = `${(title ?? '').toLowerCase().replace(/\s+/g, '_')}_${date ?? ''}`
  let h = 0
  for (let i = 0; i < raw.length; i++) {
    h = Math.imul(31, h) + raw.charCodeAt(i) | 0
  }
  return Math.abs(h).toString(36)
}

function urgencyFromDays(days) {
  if (days <= 2)  return { label: 'CRITICAL', color: '#DC2626', emoji: '🚨' }
  if (days <= 6)  return { label: 'URGENT',   color: '#E8531A', emoji: '⚠️'  }
  return           { label: 'PLAN NOW', color: '#3B61C4', emoji: '📅' }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: true })

  const locked = await acquireCronLock('exam-approaching')
  if (!locked) {
    console.log('[exam-approaching] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const maxDateStr = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Pull all free users who have syllabus events (exams) coming up.
  const { data: rows, error } = await supabaseAdmin
    .from('user_data')
    .select('user_id, subscription, completed_sessions, courses, syllabus_events, plan')
    .not('syllabus_events', 'is', null)
    .limit(5000)

  if (error) return res.status(500).json({ error: 'DB error', detail: error.message })

  console.log(`[exam-approaching] Checking ${(rows ?? []).length} users with syllabus events`)
  let sent = 0, skipped = 0

  for (const row of rows ?? []) {
    try {
      const sub = row.subscription ?? {}
      const activeStatuses = ['active', 'trialing', 'past_due']
      const userPlan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
      if (userPlan !== 'free') { skipped++; continue }

      // Find the soonest upcoming exam in the 1–14 day window.
      const upcomingExam = (row.syllabus_events ?? [])
        .filter(e => {
          const isExam = e.type === 'exam' || /exam|midterm|final|test|quiz/i.test(e.title ?? '')
          const dateStr = e.date ?? e.dateStr ?? ''
          return isExam && dateStr > todayStr && dateStr <= maxDateStr
        })
        .sort((a, b) => (a.date ?? a.dateStr ?? '').localeCompare(b.date ?? b.dateStr ?? ''))[0]

      if (!upcomingExam) { skipped++; continue }

      const examDate = upcomingExam.date ?? upcomingExam.dateStr ?? ''
      const examTitle = upcomingExam.title ?? 'Upcoming exam'
      const hash = examHash(examTitle, examDate)

      // Skip if we already notified this user about this specific exam.
      const sentHashes = Array.isArray(sub.exam_approaching_sent) ? sub.exam_approaching_sent : []
      if (sentHashes.includes(hash)) { skipped++; continue }

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

      const examDateObj = new Date(examDate + 'T12:00:00')
      const daysLeft = Math.round((examDateObj.getTime() - now.getTime()) / 86400000)
      const examDateLabel = examDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      const urgency = urgencyFromDays(daysLeft)

      const sessionCount = Array.isArray(row.completed_sessions) ? row.completed_sessions.length : 0
      const recentSessions = (row.completed_sessions ?? []).filter(s => {
        const d = new Date(s.completedAt ?? s.date ?? s.timestamp ?? 0)
        return (now.getTime() - d.getTime()) < 7 * 86400000
      }).length

      const trialUsed = !!(sub.trialUsedAt || sub.trial_activated)
      const greeting = firstName ? `Hey ${firstName}` : 'Hey'

      const upgradeUrl = trialUsed
        ? `https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=exam_approaching_winback`
        : `https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=exam_approaching`

      // Branch copy
      let lead, tip, tipTitle, ctaLabel
      if (recentSessions >= 3) {
        lead = `You've been active this week — ${recentSessions} session${recentSessions !== 1 ? 's' : ''}. That's a real head start. Here's how to make the next ${daysLeft} days count.`
        tipTitle = 'Your next move: Exam Rescue'
        tip = `Open your course and tap Exam Rescue on the topics you feel shakiest about. It identifies the specific gaps between what you know and what the exam will test, then gives you a targeted review plan. Use it now while you still have time to act on it.`
        ctaLabel = daysLeft <= 3 ? 'Get my exam plan now' : 'Build my exam plan'
      } else if (sessionCount > 0) {
        lead = `You've done ${sessionCount} session${sessionCount !== 1 ? 's' : ''} total — but the exam is in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Time to accelerate.`
        tipTitle = 'The plan for the next ' + daysLeft + ' days'
        tip = `Run the AI Study Coach on your ${examTitle} right now. It takes 2 minutes and gives you a day-by-day breakdown of exactly what to cover before the exam — prioritized by what you're most likely to miss. With ${daysLeft} days left, every session needs to count.`
        ctaLabel = 'Build my ' + daysLeft + '-day plan'
      } else {
        lead = `You haven't started studying for it yet. ${daysLeft} days is still workable — but only if you start today, and only if every session is focused on the right things.`
        tipTitle = daysLeft <= 5 ? 'The fastest path to prepared' : 'Start here — takes 2 minutes'
        tip = daysLeft <= 5
          ? `Don't try to cover everything. Run Exam Rescue on the highest-weight topics. It identifies the exact concepts the exam tests hardest and gives you a focused sprint. ${daysLeft} days of targeted studying beats ${daysLeft} days of rereading chapters.`
          : `Run the AI Study Coach on your ${examTitle}. It builds a day-by-day plan for the next ${daysLeft} days — what to study, when, and for how long. You go from "I need to study for this" to "I know exactly what I'm doing tomorrow."`
        ctaLabel = 'Get my exam plan'
      }

      try {
        await resend.emails.send({
          from: 'StudyEdge AI <support@mail.getstudyedge.com>',
          to: email,
          subject: daysLeft <= 3
            ? `${examTitle} is in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Last chance to prepare.`
            : daysLeft <= 7
              ? `${examTitle} is in ${daysLeft} days. Here's your plan.`
              : `${examTitle} is coming up. Build your study plan now.`,
          headers: listUnsubscribeHeaders(email),
          tags: [
            { name: 'campaign', value: 'exam_approaching' },
            { name: 'user_id', value: row.user_id },
          ],
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your exam is approaching</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader(daysLeft <= 3 ? `${examTitle}: ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left. This is the focused sprint.` : `${daysLeft} days until ${examTitle}. Here's exactly how to use them.`)}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>

      <!-- Personalized exam card image — rendered at open time with real data -->
      <tr><td style="padding-bottom:16px;">
        <img
          src="https://getstudyedge.com/api/og/exam-card?${[
            firstName ? `name=${encodeURIComponent(firstName)}` : '',
            `exam=${encodeURIComponent(examTitle)}`,
            `days=${daysLeft}`,
            `color=${encodeURIComponent(urgency.color)}`,
            `label=${encodeURIComponent(urgency.label)}`,
          ].filter(Boolean).join('&')}"
          width="508" height="180"
          alt="${daysLeft} day${daysLeft !== 1 ? 's' : ''} until ${examTitle}"
          style="display:block;border:0;border-radius:14px;width:100%;max-width:508px;"
        />
      </td></tr>

      <tr><td style="background:#FFFFFF;border-radius:18px;border:1px solid rgba(0,0,0,0.06);padding:36px 36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">


        <p style="margin:0 0 6px;font-size:11.5px;font-weight:600;letter-spacing:0.08em;color:${urgency.color};text-transform:uppercase;">Exam prep</p>
        <h1 style="margin:0 0 16px;font-size:25px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.28;">
          ${greeting} — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} until your exam.
        </h1>

        <p style="margin:0 0 22px;font-size:15px;color:#6B6B6B;line-height:1.7;">
          ${lead}
        </p>

        <!-- Tip block -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;background:${daysLeft <= 3 ? '#FEF2F2' : '#F4F7FF'};border-radius:13px;border:1px solid ${daysLeft <= 3 ? 'rgba(220,38,38,0.15)' : 'rgba(59,97,196,0.15)'};">
          <tr><td style="padding:20px 22px;">
            <p style="margin:0 0 8px;font-size:11.5px;font-weight:700;letter-spacing:0.08em;color:${daysLeft <= 3 ? '#DC2626' : '#3B61C4'};text-transform:uppercase;">${tipTitle}</p>
            <p style="margin:0;font-size:14.5px;color:#111111;line-height:1.65;">${tip}</p>
          </td></tr>
        </table>

        <!-- Pro upsell -->
        ${userPlan !== 'free' ? '' : `
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;background:#FAFAFA;border-radius:13px;border:1px solid rgba(0,0,0,0.07);">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111111;">These features are Pro-only</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px;">
              ${[
                ['Exam Rescue', 'Targets your specific gaps before the exam'],
                ['AI Study Coach', 'Builds a day-by-day plan for your exact timeline'],
                ['Unlimited Session Blueprints', 'Minute-by-minute plan before every study block'],
                ['Brain Dump + Cheat Sheets', 'Compress what you know into the right format'],
              ].map(([feat, desc], i, arr) => `
              <tr>
                <td style="padding:9px 0;${i < arr.length - 1 ? 'border-bottom:1px solid #F0EDE8;' : ''}">
                  <div style="font-size:13.5px;font-weight:600;color:#3B61C4;">${feat}</div>
                  <div style="font-size:12.5px;color:#6B6B6B;margin-top:2px;">${desc}</div>
                </td>
              </tr>`).join('')}
            </table>
            <p style="margin:14px 0 0;font-size:13px;color:#6B6B6B;line-height:1.55;">
              Pro is <strong style="color:#111111;">$2.99/week</strong>.
              ${trialUsed ? 'You know what you get.' : `Try free for 3 days — no charge until day 8.`}
            </p>
          </td></tr>
        </table>`}

        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:10px;">
            <a href="${upgradeUrl}" style="display:inline-block;background:${urgency.color};color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 36px;">${trialUsed ? 'Upgrade to Pro — $2.99/wk' : ctaLabel}</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12.5px;color:#9B9B9B;">${trialUsed ? '$2.99/wk · Cancel anytime' : 'Card required · $2.99/wk after day 4 · Cancel anytime'}</span>
          </td></tr>
        </table>

        <p style="margin:26px 0 0;font-size:13.5px;color:#9B9B9B;line-height:1.6;">
          Reply if you want help building your study plan for this exam. — Ryan
        </p>
      </td></tr>

      <tr><td style="padding:22px 4px 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          Sent because you have an exam coming up on StudyEdge.
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
          &nbsp;&middot;&nbsp;
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(email)}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`,
        })

        // Record this exam hash so it never re-fires for the same exam.
        const updatedHashes = [...sentHashes, hash]
        const mergedSub = { ...sub, exam_approaching_sent: updatedHashes }
        await supabaseAdmin
          .from('user_data')
          .update({ subscription: mergedSub })
          .eq('user_id', row.user_id)

        await recordUserEmail(row.user_id)
        sent++
      } catch (err) {
        console.error(`[exam-approaching] Failed to send to ${email}:`, err)
      }
    } catch (err) {
      console.error(`[exam-approaching] Error for user ${row.user_id}:`, err)
    }
  }

  console.log(`[exam-approaching] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
