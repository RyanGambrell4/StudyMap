import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { verifyAuth } from '../lib/server/usage.js'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { listUnsubscribeHeaders, preheader } from '../lib/server/emailHelpers.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

export const config = { maxDuration: 15 }

// Personalized messaging per paywall trigger
const TRIGGER_COPY = {
  ai: {
    subject: 'You hit the AI limit on StudyEdge',
    headline: 'You ran out of free AI questions.',
    what_happened: 'You hit the limit on free AI coaching sessions.',
    unlock: 'Pro gives you 100 AI actions per month — ask anything about any of your courses, any time.',
  },
  'ai-exhausted': {
    subject: 'You hit the AI limit on StudyEdge',
    headline: 'You ran out of free AI questions.',
    what_happened: 'You used up your free AI coaching sessions for this period.',
    unlock: 'Pro gives you 100 AI actions per month — ask anything about any of your courses, any time.',
  },
  'ai-struggle': {
    subject: 'You were trying to work through a tough topic',
    headline: 'You hit the AI limit while drilling a weak spot.',
    what_happened: 'You were working through a topic you flagged as a struggle — and hit the free AI limit.',
    unlock: 'Pro gives you 100 AI coaching sessions per month so you can drill weak spots until they stick, not just until you run out.',
  },
  courses: {
    subject: 'You tried to add more courses on StudyEdge',
    headline: 'You tried to add another course.',
    what_happened: 'The free plan covers 1 course. You tried to add more.',
    unlock: 'Pro gives you up to 5 courses — full study plans, grade tracking, and AI coaching for each one.',
  },
  focusMode: {
    subject: 'You hit your free focus session limit',
    headline: 'You hit your free Focus Mode limit.',
    what_happened: 'You ran out of free Focus Mode time for today.',
    unlock: 'Pro gives you unlimited Focus Mode sessions — build the daily habit without hitting a cap.',
  },
  blueprints: {
    subject: 'You tried to generate another blueprint on StudyEdge',
    headline: 'You hit the free blueprint limit.',
    what_happened: 'You tried to generate another study session blueprint and hit the free limit.',
    unlock: 'Pro gives you unlimited session blueprints — so you always have a plan for what to study next.',
  },
  examRescue: {
    subject: 'You tried to use Exam Rescue on StudyEdge',
    headline: 'Exam Rescue is a Pro feature.',
    what_happened: 'You tried to use Exam Rescue — the last-minute exam prep tool.',
    unlock: 'Pro unlocks Exam Rescue so you can generate a focused last-48-hour cram plan for any course.',
  },
  cheatSheet: {
    subject: 'You tried to generate a cheat sheet on StudyEdge',
    headline: 'AI Cheat Sheets are a Pro feature.',
    what_happened: 'You tried to generate an AI-written cheat sheet and hit the free limit.',
    unlock: 'Pro unlocks unlimited AI cheat sheets — pull the key concepts from any topic in seconds.',
  },
}

const DEFAULT_COPY = {
  subject: 'You hit the free limit on StudyEdge',
  headline: 'You hit the free limit.',
  what_happened: 'You tried to use a Pro feature and hit the free plan limit.',
  unlock: 'Pro gives you 5 courses, 100 AI actions/month, unlimited blueprints and focus sessions — everything you need to actually stay on top of your coursework.',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: 'no_resend' })

  const auth = await verifyAuth(req)
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized' })
  const userId = auth.userId

  const { trigger } = req.body ?? {}

  // Only send to free users who haven't started a trial
  const { data: row } = await supabaseAdmin
    .from('user_data')
    .select('subscription')
    .eq('user_id', userId)
    .maybeSingle()

  const plan = row?.subscription?.plan ?? 'free'
  if (plan !== 'free') return res.status(200).json({ ok: true, skipped: 'not_free' })
  if (row?.subscription?.trialUsedAt) return res.status(200).json({ ok: true, skipped: 'trial_used' })

  // Max 1 paywall-hit email per 48 hours — don't spam
  const guard = await canSendUserEmail(userId, { priority: 'normal' })
  if (!guard.ok) return res.status(200).json({ ok: true, skipped: 'cooldown' })

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
  const email = authUser?.user?.email
  if (!email) return res.status(200).json({ ok: true, skipped: 'no_email' })

  const firstName = (authUser?.user?.user_metadata?.full_name ?? email.split('@')[0].split('.')?.[0] ?? 'there')
    .split(' ')[0]

  const copy = TRIGGER_COPY[trigger] ?? DEFAULT_COPY

  try {
    await resend.emails.send({
      from: 'Ryan at StudyEdge <ryan@getstudyedge.com>',
      to: email,
      subject: copy.subject,
      headers: listUnsubscribeHeaders(userId),
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader(copy.unlock)}
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;padding:36px 32px;border:1px solid #e5e7eb;">
      <img src="https://getstudyedge.com/favicon.png" alt="StudyEdge AI" style="width:36px;height:36px;border-radius:9px;margin-bottom:20px;">

      <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#111;letter-spacing:-0.03em;">
        ${copy.headline}
      </h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
        Hey ${firstName} — ${copy.what_happened}
      </p>

      <div style="background:#f8f9ff;border:1px solid rgba(59,97,196,0.15);border-left:4px solid #3B61C4;border-radius:12px;padding:16px 18px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#3B61C4;">What Pro unlocks</p>
        <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;">${copy.unlock}</p>
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 18px;margin-bottom:24px;">
        <p style="margin:0;font-size:13.5px;color:#166534;line-height:1.6;">
          <strong>Try Pro free for 3 days.</strong> No charge during the trial. $2.99/week or $9.99/month after — cancel anytime.
        </p>
      </div>

      <a href="https://getstudyedge.com/app?plan=pro&billing=weekly&trial=1" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">
        Start Free 3-Day Trial →
      </a>

      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        If you have any questions about whether Pro is right for you, just reply to this email. I read every reply.
      </p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280;">— Ryan, StudyEdge AI</p>

      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
        StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`,
    })
    await recordUserEmail(userId, 'paywall-hit')
    console.log(`[paywall-hit-email] sent to ${userId} trigger=${trigger}`)
  } catch (e) {
    console.error('[paywall-hit-email] send error', e.message)
    return res.status(500).json({ error: 'Failed to send' })
  }

  return res.status(200).json({ ok: true })
}
