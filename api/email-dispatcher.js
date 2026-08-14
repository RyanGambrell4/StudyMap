/**
 * Email Dispatcher — lifecycle_v2 send coordinator.
 *
 * Runs every 2 hours. Only active when lifecycle_v2 feature flag is ON (global
 * default: false). When off, this handler returns immediately and zero emails
 * are affected.
 *
 * What it does:
 *   1. Read pending email_queue entries (one per user, highest priority first)
 *   2. Check suppression (hard block) and 72h emailGuard cap
 *   3. Re-verify the trigger condition is still true (state may have changed)
 *   4. Send via Resend with all required UTM params
 *   5. Mark sent in email_queue and update last_emailed_at
 *
 * COPY STATUS: All campaign email bodies below are PENDING COPY APPROVAL.
 * They will not send to any user until lifecycle_v2 is enabled globally:
 *   UPDATE app_config SET feature_flags = '{"lifecycle_v2": true}' WHERE id = 1;
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { isEnabled } from '../lib/server/featureFlags.js'
import { fetchPendingEntries, markSent, markSuppressed } from '../lib/server/emailQueue.js'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { acquireCronLock } from '../lib/server/cronLock.js'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: 'no_resend' })

  // Bail entirely if lifecycle_v2 is off — zero behavior change from today
  if (!(await isEnabled('lifecycle_v2'))) {
    return res.status(200).json({ ok: true, skipped: 'lifecycle_v2_off' })
  }

  const locked = await acquireCronLock('email-dispatcher')
  if (!locked) return res.status(200).json({ ok: true, skipped: 'already_ran' })

  const entries = await fetchPendingEntries(50)
  const results = { sent: 0, suppressed: 0, condition_cleared: 0, throttled: 0, errors: 0 }

  for (const entry of entries) {
    const { id, user_id, campaign, context } = entry
    const email = context?.email

    if (!email) {
      await markSuppressed(id, 'no_email_in_context')
      results.suppressed++
      continue
    }

    // 1. emailGuard: suppression hard-block (by user_id AND email) + 72h frequency cap
    const guard = await canSendUserEmail(user_id, { priority: 'normal', email })
    if (!guard.ok) {
      if (guard.reason?.startsWith('Suppressed')) {
        await markSuppressed(id, guard.reason)
        results.suppressed++
      } else {
        // Throttled: leave in queue, will be eligible next time guard clears
        results.throttled++
      }
      continue
    }

    // 2. Re-verify the trigger condition still holds
    const { data: userData, error: udErr } = await supabaseAdmin
      .from('user_data')
      .select('subscription, completed_sessions, courses, syllabus_events')
      .eq('user_id', user_id)
      .maybeSingle()

    if (udErr || !userData) {
      results.errors++
      continue
    }

    const stillValid = await verifyTrigger(campaign, userData, context)
    if (!stillValid) {
      await markSuppressed(id, 'condition_cleared')
      results.condition_cleared++
      continue
    }

    // 3. Send
    try {
      await sendCampaign(campaign, user_id, email, userData, context)
      await markSent(id)
      await recordUserEmail(user_id)
      results.sent++
    } catch (err) {
      console.error(`[email-dispatcher] send failed for ${campaign}/${user_id}:`, err.message)
      results.errors++
    }
  }

  console.log('[email-dispatcher]', JSON.stringify(results))
  return res.status(200).json({ ok: true, ...results })
}

// ── Trigger re-verification ────────────────────────────────────────────────

function verifyTrigger(campaign, userData, context) {
  const sessions = Array.isArray(userData.completed_sessions) ? userData.completed_sessions : []
  const courses = Array.isArray(userData.courses) ? userData.courses : []
  const plan = userData.subscription?.plan ?? 'free'
  const activeStatuses = ['active', 'trialing', 'past_due']
  const isActive = activeStatuses.includes(userData.subscription?.status)

  switch (campaign) {
    case 'no-course-24h':
      return courses.length === 0 && sessions.length === 0

    case 'no-first-session':
      return sessions.length === 0 && courses.length > 0

    case 'first-session':
      // Still valid if they have 1-3 sessions (momentum window)
      return sessions.length >= 1 && sessions.length <= 3

    case 'paywall-hit':
      return (!isActive || plan === 'free') && sessions.length > 0

    case 'checkout-recovery':
      return (!isActive || plan === 'free') && sessions.length > 0

    case 're-engage': {
      if (sessions.length === 0) return false
      const lastSession = sessions
        .map(s => new Date(s.completedAt ?? s.created_at ?? 0))
        .sort((a, b) => b - a)[0]
      if (!lastSession) return false
      const daysSince = (Date.now() - lastSession.getTime()) / 86_400_000
      return daysSince >= 7
    }

    case 'day14-upgrade':
    case 'day21-upgrade':
      return (!isActive || plan === 'free') && sessions.length > 0

    // welcome, onboarding-complete, first-plan, streak-broken: moment-in-time, no re-check
    default:
      return true
  }
}

// ── Name sanitizer ────────────────────────────────────────────────────────
// Returns a capitalized first name only if it is at least 3 alphabetic chars.
// Falls back to null so callers open with the sentence rather than a bad token.
// Minimum 3 (not 2) because 2-char inputs like "Ma" produce worse results than
// no greeting at all, which is the exact case that motivated this check.
function safeName(raw) {
  if (!raw || typeof raw !== 'string') return null
  const first = raw.trim().split(/\s+/)[0]
  if (first.length < 3) return null
  if (!/^[A-Za-z]+$/.test(first)) return null
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

// ── Campaign send functions ────────────────────────────────────────────────
// COPY STATUS: All subject lines and body text below are PENDING APPROVAL.
// Do not enable lifecycle_v2 until copy has been reviewed.

async function sendCampaign(campaign, userId, email, userData, context) {
  const name = safeName(context?.firstName ?? email.split('@')[0].split('.')?.[0])
  const courses = Array.isArray(userData.courses) ? userData.courses : []
  const sessions = Array.isArray(userData.completed_sessions) ? userData.completed_sessions : []
  const sub = userData.subscription ?? {}
  const trialUsed = !!(sub.trialUsedAt || sub.trial_activated)
  const plan = sub.plan ?? 'free'
  const activeStatuses = ['active', 'trialing', 'past_due']
  const isPro = activeStatuses.includes(sub.status) && plan !== 'free'

  switch (campaign) {

    // ── TRIGGER 1: Signed up, no course after 24h ──────────────────────────
    // CTA links to /app — the syllabus upload modal has no standalone URL.
    // Add a ?upload=syllabus param handler to App.jsx to create a true deep link.
    case 'no-course-24h': {
      const ctaUrl = `https://getstudyedge.com/app?upload=syllabus&utm_source=email&utm_medium=lifecycle&utm_campaign=no_course_24h`
      const opener = name ? `${name}, your semester plan is one syllabus away.` : 'Your semester plan is one syllabus away.'
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject: 'Drop one syllabus, get your semester planned',
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader('Drop your syllabus and get a study plan built around your real exam dates.')}
<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge AI</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:36px 32px;">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">${opener}</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
          Drop your syllabus and StudyEdge AI builds your full study plan around it. Courses, exam dates, session schedule. Takes about 30 seconds.
        </p>
        <a href="${ctaUrl}" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">Drop your syllabus, get your plan</a>
        <p style="margin:12px 0 0;font-size:13px;color:#9ca3af;text-align:center;">getstudyedge.com/app</p>
        <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">Any questions, just reply. We read every one.<br>The StudyEdge AI Team</p>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      break
    }

    // ── TRIGGER 2: Course added, no session after 24h ──────────────────────
    case 'no-first-session': {
      const courseName = (courses[0]?.name ?? courses[0]) || null
      // Keep subject under 50 chars — truncate to generic if course name makes it too long
      const subjectWithCourse = courseName ? `${courseName} plan ready. Start your first session.` : null
      const subject = (subjectWithCourse && subjectWithCourse.length <= 49)
        ? subjectWithCourse
        : 'Your plan is ready. Start your first session.'
      const headline = courseName ? `Your ${courseName} plan is ready.` : 'Your study plan is ready.'
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject,
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader('Your first session takes 15 minutes. Tap Session Blueprint and you have a step-by-step plan.')}
<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge AI</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:36px 32px;">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">${headline}</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
          Your first session takes 15 minutes. Open your course, tap Session Blueprint, and you get a step-by-step plan for exactly what to study.
        </p>
        <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=no_first_session" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">Start your first session</a>
        <p style="margin:12px 0 0;font-size:13px;color:#9ca3af;text-align:center;">getstudyedge.com/app</p>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      break
    }

    // ── TRIGGER 3: First session completed ─────────────────────────────────
    case 'first-session': {
      const courseName = (context?.courseName ?? courses[0]?.name ?? courses[0]) || null
      // Single CTA: trial if free and never tried (peak conversion moment);
      // otherwise open their updated plan.
      const cta = (!isPro && !trialUsed)
        ? { text: 'Start your free 7-day trial', url: `https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=first_session_trial`, sub: 'Card required. Cancel before day 8 and pay nothing.' }
        : { text: 'See your updated plan', url: `https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=first_session`, sub: null }
      const opener = name
        ? `${name}, you finished your first session.`
        : courseName ? `You finished your first ${courseName} session.` : 'You finished your first session.'
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject: 'You finished your first session.',
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader('The hardest part is done. Every session from here is easier to start.')}
<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge AI</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:36px 32px;">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">${opener}</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
          Most people download a study app and never open it. The habit gets easier from here.
        </p>
        <a href="${cta.url}" style="display:block;text-align:center;background:${!isPro && !trialUsed ? '#E8531A' : '#3B61C4'};color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">${cta.text}</a>
        ${cta.sub ? `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af;text-align:center;">${cta.sub}</p>` : ''}
        <p style="margin:12px 0 0;font-size:13px;color:#9ca3af;text-align:center;">getstudyedge.com/app</p>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      break
    }

    // ── TRIGGER 4: Paywall hit ─────────────────────────────────────────────
    case 'paywall-hit': {
      const trigger = context?.trigger ?? 'ai'
      const PAYWALL_COPY = {
        ai:             { subject: 'You hit the AI limit on StudyEdge AI', headline: 'You ran out of free AI questions.', unlock: 'Pro gives you 100 AI actions per month. Ask anything about any of your courses, any time.' },
        'ai-exhausted': { subject: 'You hit the AI limit on StudyEdge AI', headline: 'You ran out of free AI questions.', unlock: 'Pro gives you 100 AI actions per month. Ask anything about any of your courses, any time.' },
        'ai-struggle':  { subject: 'You were working through a tough topic', headline: 'You hit the AI limit while drilling a weak spot.', unlock: 'Pro gives you 100 AI coaching sessions per month so you can drill weak spots until they stick.' },
        courses:        { subject: 'Need more courses? That is Pro.', headline: 'Five courses with full plans. That is Pro.', unlock: 'Pro gives you up to 5 courses with full plans, grade tracking, and AI coaching for each one.' },
        focusMode:      { subject: 'You hit your free focus session limit', headline: 'You hit your free Focus Mode limit.', unlock: 'Pro gives you unlimited Focus Mode sessions. Build the daily study habit without hitting a cap.' },
        blueprints:     { subject: 'You hit the free blueprint limit', headline: 'You hit the free blueprint limit.', unlock: 'Pro gives you unlimited Session Blueprints so you always have a plan for what to study next.' },
        examRescue:     { subject: 'Exam Rescue is waiting on Pro.', headline: 'Exam Rescue is a Pro feature.', unlock: 'Pro unlocks Exam Rescue so you can generate a focused last-48-hour cram plan for any course.' },
        cheatSheet:     { subject: 'AI Cheat Sheets unlock with Pro.', headline: 'AI Cheat Sheets are a Pro feature.', unlock: 'Pro unlocks unlimited AI cheat sheets. Pull the key concepts from any topic in seconds.' },
      }
      const copy = PAYWALL_COPY[trigger] ?? { subject: 'You hit a limit on StudyEdge AI', headline: 'You hit the free plan limit.', unlock: 'Pro gives you 5 courses, 100 AI actions per month, unlimited blueprints and focus sessions.' }
      const upgradeUrl = `https://getstudyedge.com/app?signup=1&plan=pro&billing=weekly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=paywall_hit`
      const greeting = name ? `${name}, ` : ''
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject: copy.subject,
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader(copy.unlock)}
<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge AI</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:36px 32px;">
        <h1 style="margin:0 0 12px;font-size:21px;font-weight:800;color:#111;letter-spacing:-0.03em;">${copy.headline}</h1>
        <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">${greeting}${copy.unlock}</p>
        <a href="${upgradeUrl}" style="display:block;text-align:center;background:#E8531A;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;">Start your free 7-day trial</a>
        <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Card required. Cancel before day 8 and pay nothing.</p>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      break
    }

    // ── TRIGGER 5: Checkout abandoned ─────────────────────────────────────
    // Mapped to Stripe checkout.session.expired email. Approved copy re-used.
    case 'checkout-recovery': {
      const wasTrial = context?.wasTrial ?? true
      const ctaUrl = `https://getstudyedge.com/app?plan=pro&billing=weekly${wasTrial ? '&trial=1' : ''}&utm_source=email&utm_medium=lifecycle&utm_campaign=checkout_abandoned`
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject: 'Looks like checkout didn\'t go through.',
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader('Your spot is still open. It takes 30 seconds to complete.')}
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:#fff;border-radius:16px;padding:36px 32px;border:1px solid #e5e7eb;">
    <img src="https://getstudyedge.com/favicon.png" alt="StudyEdge AI" style="width:36px;height:36px;border-radius:9px;margin-bottom:20px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#111;letter-spacing:-0.03em;">Looks like checkout didn't go through.</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">${name ? `Hey ${name}. ` : ''}Your ${wasTrial ? '7-day free trial' : 'Pro signup'} checkout didn't go through. Your spot is still open. Takes about 30 seconds to finish.</p>
    <a href="${ctaUrl}" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;">${wasTrial ? 'Complete your free trial →' : 'Complete signup →'}</a>
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Any questions? Just reply. We read every message.<br>The StudyEdge AI Team</p>
    <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
  </div>
</div>
</body></html>`,
      })
      break
    }

    // ── TRIGGER 6: Dormant 7+ days ─────────────────────────────────────────
    // Mapped to re-engage. Course names and exam dates pulled from userData.
    case 're-engage': {
      const courseName = courses[0]?.name ?? courses[0] ?? null
      const sylEvents = Array.isArray(userData?.syllabus_events) ? userData.syllabus_events : []
      const upcomingExam = sylEvents
        .filter(e => /exam|midterm|final|test/i.test(e.title ?? '') && new Date(e.date ?? 0) > new Date())
        .sort((a, b) => new Date(a.date) - new Date(b.date))[0]
      const examLine = upcomingExam
        ? `Your ${upcomingExam.title} is on ${new Date(upcomingExam.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`
        : null
      const ctaUrl = `https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=re_engage`
      const reEngageSubject = (() => {
        const candidate = courseName ? `Your next ${courseName} session takes 15 minutes.` : null
        return (candidate && candidate.length <= 49) ? candidate : 'Your next session takes 15 minutes.'
      })()
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject: reEngageSubject,
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader('Your study plan is still there. Your next session takes 15 minutes to start.')}
<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:36px 32px;">
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">
          ${courseName ? `Your ${courseName} plan is waiting.` : 'Your study plan is waiting.'}
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.6;">
          ${examLine ?? ''} Your next session takes 15 minutes. Open StudyEdge AI, tap your course, and start where you left off.
        </p>
        <a href="${ctaUrl}" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">Open my plan →</a>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      break
    }

    // ── welcome ────────────────────────────────────────────────────────────
    // COPY STATUS: PENDING APPROVAL
    case 'welcome': {
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject: `${name ? `${name}, your` : 'Your'} AI study assistant is ready.`,
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader('Add your first course and your study plan, session blueprints, and AI help turn on immediately.')}
<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge AI</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:36px 32px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Welcome</p>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">
          ${name ? `${name}, you're in.` : "You're in."}
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.6;">
          StudyEdge AI builds your study plan, session blueprints, and AI help around your actual courses and exam dates. It doesn't do much without a course to work from.
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
          Add your first course, give it an exam date, and your plan is live in about 30 seconds.
        </p>
        <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=welcome" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">Add my first course →</a>
        <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">Any questions, just reply. We read every one.<br>The StudyEdge AI Team</p>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      break
    }

    // ── onboarding-complete ────────────────────────────────────────────────
    // COPY STATUS: PENDING APPROVAL
    case 'onboarding-complete': {
      const yearLevel = context?.yearLevel
      const learningStyle = context?.learningStyle
      const preferredTime = context?.preferredTime
      const hasProfile = yearLevel || learningStyle || preferredTime
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject: 'Your profile is set. Now add a course.',
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader('StudyEdge AI needs a course and exam date to build your plan. One course takes 30 seconds to add.')}
<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge AI</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:36px 32px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Onboarding complete</p>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">
          ${name ? `${name}, your profile is set.` : 'Your profile is set.'}
        </h1>
        ${hasProfile ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
          ${[[yearLevel, 'Year'], [learningStyle, 'Learning style'], [preferredTime, 'Study time']].filter(([v]) => v).map(([v, k]) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #F0EDE8;">
              <span style="font-size:11px;color:#9B9B9B;text-transform:uppercase;letter-spacing:0.05em;">${k}</span>
              <span style="float:right;font-size:14px;color:#111;font-weight:500;">${v}</span>
            </td>
          </tr>`).join('')}
        </table>` : ''}
        <p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">
          Next step: add your first course with a real exam date. That is what turns your profile into an actual study plan. It takes about 30 seconds.
        </p>
        <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=onboarding_complete" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">Add my first course →</a>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      break
    }

    // ── first-plan ────────────────────────────────────────────────────────
    // COPY STATUS: PENDING APPROVAL
    case 'first-plan': {
      const planCourseNames = Array.isArray(context?.courseNames) ? context.courseNames.filter(Boolean).slice(0, 3) : []
      const courseList = planCourseNames.length
        ? `around ${planCourseNames.join(', ')}`
        : 'around your courses'
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject: 'Your first study plan is live.',
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader('Open your first session, run a Blueprint, and you have a real plan for what to study.')}
<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge AI</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:36px 32px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Plan ready</p>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">
          ${name ? `${name}, your first plan is live.` : 'Your first study plan is live.'}
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.6;">
          StudyEdge AI built your schedule ${courseList}, balanced around your exam dates. Here's how to actually use it.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          ${[
            ['Open the next session', "Tap any session card to see its Blueprint: what to study, in what order, for how long."],
            ['Mark sessions complete', "Your plan adjusts as you go. This step matters."],
            ['Use Study Coach weekly', 'Ask it to refine your plan once a week. It catches drift before you fall behind.'],
          ].map(([step, desc]) => `
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #F0EDE8;">
              <div style="font-size:14px;font-weight:700;color:#3B61C4;margin-bottom:3px;">${step}</div>
              <div style="font-size:13px;color:#6b7280;line-height:1.55;">${desc}</div>
            </td>
          </tr>`).join('')}
        </table>
        <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=first_plan" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">Open my plan →</a>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      break
    }

    // ── streak-broken ─────────────────────────────────────────────────────
    // COPY STATUS: PENDING APPROVAL
    case 'streak-broken': {
      const streakNum = parseInt(context?.streak ?? '1', 10) || 1
      const subject = streakNum >= 7
        ? `Your ${streakNum}-day streak broke. Come back today.`
        : `Your streak broke. Get it back today.`
      await resend.emails.send({
        from: 'StudyEdge AI Team <support@mail.getstudyedge.com>',
        to: email,
        subject,
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader('Students who come back within 24 hours rebuild streaks 3x faster. Your plan knows where to pick up.')}
<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">StudyEdge AI</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:36px 32px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;">Streak update</p>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111;letter-spacing:-0.03em;">
          Your ${streakNum}-day streak broke.
        </h1>
        <p style="margin:0 0 14px;font-size:15px;color:#4b5563;line-height:1.6;">
          ${streakNum >= 14
            ? `That was an impressive run. One missed day doesn't have to become a missed week.`
            : `It happens. The students who recover fastest are the ones who get back within 24 hours.`}
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
          A 10-minute session resets the streak. Your plan already knows where to pick up.
        </p>
        <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=streak_broken" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">Start a 10-min session →</a>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
      })
      break
    }

    default:
      console.warn(`[email-dispatcher] No send function for campaign: ${campaign}`)
  }
}
