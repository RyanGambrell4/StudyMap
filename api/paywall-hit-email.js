import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { verifyAuth } from '../lib/server/usage.js'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'
import { renderEmail, TRIAL_TERMS } from '../lib/server/emailTemplate.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

export const config = { maxDuration: 15 }

// Personalized messaging per paywall trigger.
//
// Subject lines lead with what the student GETS BACK, not with what they just
// ran out of. Every previous subject here opened by restating the user's
// failure ("You hit the AI limit", "You tried to add more courses"), which
// gives someone staring at a blocked action no reason to open. These name the
// unblock and the fact that it costs nothing for 7 days, which is the part
// that actually reduces friction.
//
// `resume` is the one-line bridge back to the exact thing they were doing.
// This email only ever fires at the moment of peak intent -- 25 of 777 users
// have ever hit a limit at all -- so relevance matters more here than reach.
const TRIGGER_COPY = {
  ai: {
    subject: '100 AI questions a month, free for 7 days',
    headline: 'You ran out of free AI questions.',
    what_happened: 'you hit the limit on free AI coaching sessions.',
    unlock: 'Pro gives you 100 AI actions per month. Ask anything about any of your courses, any time.',
    resume: 'Start the trial and your next question goes through straight away.',
    cta: 'Unlock 100 AI questions',
  },
  'ai-exhausted': {
    subject: '100 AI questions a month, free for 7 days',
    headline: 'You used all 5 free AI questions.',
    what_happened: 'you used up your 5 free AI coaching sessions.',
    unlock: 'Pro gives you 100 AI actions per month. Ask anything about any of your courses, any time.',
    resume: 'Start the trial and your next question goes through straight away.',
    cta: 'Unlock 100 AI questions',
  },
  'ai-struggle': {
    subject: 'You ran out mid-way through a weak spot',
    headline: 'You hit the AI limit while drilling a weak spot.',
    what_happened: 'you were working through a topic you had flagged as a struggle, and hit the free AI limit.',
    unlock: 'Pro gives you 100 AI coaching sessions a month, so you can drill a weak spot until it sticks rather than until you run out.',
    resume: 'Pick that topic back up where you left it.',
    cta: 'Finish that topic',
  },
  courses: {
    subject: 'Room for 5 courses, free for 7 days',
    headline: 'You tried to add another course.',
    what_happened: 'the free plan covers 1 course, and you went to add another.',
    unlock: 'Pro covers up to 5 courses, each with its own study plan, grade tracking and AI coaching.',
    resume: 'Add the rest of your semester in one sitting.',
    cta: 'Add my other courses',
  },
  focusMode: {
    subject: 'Unlimited focus sessions, free for 7 days',
    headline: 'You hit your free Focus Mode limit.',
    what_happened: 'you ran out of free Focus Mode time for today.',
    unlock: 'Pro gives you unlimited Focus Mode sessions, so the daily habit never stops at a cap.',
    resume: 'Get back into a session tonight.',
    cta: 'Unlock unlimited sessions',
  },
  blueprints: {
    subject: 'Unlimited session blueprints, free for 7 days',
    headline: 'You hit the free blueprint limit.',
    what_happened: 'you went to generate another study session blueprint and hit the free limit.',
    unlock: 'Pro gives you unlimited session blueprints, so you always know what to study next.',
    resume: 'Generate the plan you were after.',
    cta: 'Unlock unlimited blueprints',
  },
  examRescue: {
    subject: 'Exam Rescue, free for 7 days',
    headline: 'Exam Rescue is a Pro feature.',
    what_happened: 'you went to use Exam Rescue, the last-minute exam prep tool.',
    unlock: 'Pro unlocks Exam Rescue, which builds a focused last-48-hours cram plan for any course.',
    resume: 'If that exam is close, this is the one to start now.',
    cta: 'Unlock Exam Rescue',
  },
  cheatSheet: {
    subject: 'Unlimited AI cheat sheets, free for 7 days',
    headline: 'AI Cheat Sheets are a Pro feature.',
    what_happened: 'you went to generate an AI-written cheat sheet and hit the free limit.',
    unlock: 'Pro unlocks unlimited AI cheat sheets, pulling the key concepts out of any topic in seconds.',
    resume: 'Generate the sheet you were after.',
    cta: 'Unlock cheat sheets',
  },
}

const DEFAULT_COPY = {
  subject: 'Everything in Pro, free for 7 days',
  headline: 'You hit the free limit.',
  what_happened: 'you went to use a Pro feature and hit the free plan limit.',
  unlock: 'Pro gives you 5 courses, 100 AI actions a month, and unlimited blueprints and focus sessions.',
  resume: 'Pick up exactly where you stopped.',
  cta: 'Start my free trial',
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
      from: 'StudyEdge AI Team <ryan@getstudyedge.com>',
      to: email,
      subject: copy.subject,
      headers: listUnsubscribeHeaders(userId),
      html: renderEmail({
        // The preview line carries the offer, because that is the part that
        // decides whether a blocked user opens this at all.
        preheaderText: `${copy.unlock} ${TRIAL_TERMS}`,
        headline: copy.headline,
        paragraphs: [
          `Hey ${firstName}, ${copy.what_happened}`,
          copy.resume,
        ],
        callout: { title: 'What Pro unlocks', body: copy.unlock },
        cta: {
          label: copy.cta,
          url: 'https://getstudyedge.com/app?signup=1&plan=pro&billing=monthly&trial=1&utm_source=email&utm_medium=lifecycle&utm_campaign=paywall_hit',
        },
        // Card-required is stated on the button, not buried. Hiding it wins a
        // click and loses the charge to a dispute on day 8.
        ctaSubtext: `${TRIAL_TERMS} Card required to start.`,
        unsubscribeUrl: `https://getstudyedge.com/unsubscribe?uid=${userId}`,
      }),
    })
    await recordUserEmail(userId, 'paywall-hit')
    console.log(`[paywall-hit-email] sent to ${userId} trigger=${trigger}`)
  } catch (e) {
    console.error('[paywall-hit-email] send error', e.message)
    return res.status(500).json({ error: 'Failed to send' })
  }

  return res.status(200).json({ ok: true })
}
