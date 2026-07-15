/**
 * Resend webhook handler — email lifecycle events → PostHog + Supabase.
 *
 * Receives Svix-signed POST requests from Resend and:
 *   1. Verifies the signature using HMAC-SHA256 (no extra dependency — uses Node crypto)
 *   2. Fires PostHog events (email_opened, email_clicked, email_bounced, email_complained)
 *      so email engagement appears in the funnel alongside trial/purchase events
 *   3. Writes a compact `email_engagement` blob into user_data.subscription so cron emails
 *      can branch on "did they open the last email?" without hitting PostHog at send time
 *
 * Setup (one-time):
 *   - Resend dashboard → Webhooks → Add endpoint: https://getstudyedge.com/api/resend-webhook
 *   - Subscribe to: email.opened, email.clicked, email.bounced, email.complained
 *   - Copy the signing secret → set RESEND_WEBHOOK_SECRET in Vercel env vars
 *
 * User identification:
 *   - Primary: `user_id` tag set at send time (all emails send this tag now)
 *   - Fallback: email address used as PostHog distinct_id for older sends without tags
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: { bodyParser: false },
}

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// ─── Svix signature verification ────────────────────────────────────────────
// Spec: https://docs.svix.com/receiving/verifying-payloads/how-manual
function verifySignature(rawBody, headers, secret) {
  const msgId        = headers['svix-id']
  const msgTimestamp = headers['svix-timestamp']
  const msgSignature = headers['svix-signature']
  if (!msgId || !msgTimestamp || !msgSignature) return false

  // Reject messages older than 5 minutes to prevent replay attacks
  const ts = parseInt(msgTimestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false

  // Strip "whsec_" prefix, base64-decode the rest into raw key bytes
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')

  const toSign     = `${msgId}.${msgTimestamp}.${rawBody}`
  const expected   = createHmac('sha256', secretBytes).update(toSign).digest('base64')
  const provided   = msgSignature.split(' ').map(s => s.replace(/^v1,/, ''))

  return provided.some(sig => {
    try {
      const a = Buffer.from(sig, 'base64')
      const b = Buffer.from(expected, 'base64')
      return a.length === b.length && timingSafeEqual(a, b)
    } catch { return false }
  })
}

// ─── PostHog server-side capture ────────────────────────────────────────────
async function posthogCapture(event, distinctId, properties = {}) {
  if (!process.env.POSTHOG_API_KEY || !distinctId) return
  try {
    await fetch('https://us.i.posthog.com/capture/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.POSTHOG_API_KEY,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'resend-webhook' },
        timestamp: new Date().toISOString(),
      }),
    })
  } catch { /* analytics is non-critical — never block the 200 response */ }
}

// ─── Campaign fallback for emails sent before tagging was added ──────────────
function campaignFromSubject(subject = '') {
  const s = subject.toLowerCase()
  if (s.includes('7 days') && s.includes('free'))        return 'welcome'
  if (s.includes('one thing to do'))                      return 'early_activation'
  if (s.includes('day 1') || s.includes('do this first')) return 'day1_trial_tips'
  if (s.includes('half gone') || s.includes('day 2'))     return 'day2_trial_progress'
  if (s.includes('day 3') || s.includes('10 minutes'))    return 'day3_trial_tips'
  if (s.includes('trial ends') || s.includes('24 hour'))  return 'trial_warning'
  if (s.includes('trial ended') || s.includes('you lost')) return 'trial_expired'
  if (s.includes("you're pro") || s.includes('here\'s what to do with it')) return 'pro_welcome'
  if (s.includes('exam') && s.includes('day'))            return 'exam_approaching'
  if (s.includes('got a') || s.includes('gpa'))           return 'day5_social_proof'
  return 'unknown'
}

// ─── Write engagement state into user_data for cron branching ───────────────
async function updateEngagement(userId, type, campaign, extra = {}) {
  try {
    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', userId)
      .single()
    if (!row) return

    const sub = row.subscription ?? {}
    const eng = sub.email_engagement ?? {}
    const now  = new Date().toISOString()

    const isOpen  = type === 'email.opened'
    const isClick = type === 'email.clicked'

    const openedList  = eng.opened_campaigns  ?? []
    const clickedList = eng.clicked_campaigns ?? []

    await supabaseAdmin
      .from('user_data')
      .update({
        subscription: {
          ...sub,
          email_engagement: {
            ...eng,
            ...(isOpen  && { last_opened_at: now, last_opened_campaign: campaign,
                              opened_campaigns: openedList.includes(campaign) ? openedList : [...openedList, campaign] }),
            ...(isClick && { last_clicked_at: now, last_clicked_campaign: campaign,
                              clicked_campaigns: clickedList.includes(campaign) ? clickedList : [...clickedList, campaign],
                              ...extra }),
          },
        },
      })
      .eq('user_id', userId)
  } catch (err) {
    console.error('[resend-webhook] updateEngagement failed:', err)
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    if (!verifySignature(rawBody, req.headers, secret)) {
      console.warn('[resend-webhook] Signature verification failed')
      return res.status(401).json({ error: 'Invalid signature' })
    }
  } else {
    console.warn('[resend-webhook] RESEND_WEBHOOK_SECRET not set — skipping verification')
  }

  let payload
  try { payload = JSON.parse(rawBody) } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { type, data } = payload
  if (!type || !data) return res.status(200).json({ ok: true })

  const email    = Array.isArray(data.to) ? data.to[0] : null
  const tags     = data.tags ?? {}
  const userId   = tags.user_id   ?? null
  const campaign = tags.campaign  ?? campaignFromSubject(data.subject ?? '')
  const subject  = data.subject   ?? ''
  const emailId  = data.email_id  ?? null

  // Use userId as PostHog distinct_id when known; fall back to email for
  // emails sent before tagging was added so they still appear in the funnel.
  const distinctId = userId ?? email

  const baseProps = {
    campaign,
    subject,
    email_id: emailId,
    ...(email  && { email }),
    ...(userId && { user_id: userId }),
  }

  switch (type) {
    case 'email.opened': {
      await posthogCapture('email_opened', distinctId, baseProps)
      if (userId) await updateEngagement(userId, type, campaign)
      console.log(`[resend-webhook] opened  campaign=${campaign} user=${userId ?? email}`)
      break
    }

    case 'email.clicked': {
      const clickUrl = data.click?.link ?? null
      await posthogCapture('email_clicked', distinctId, { ...baseProps, click_url: clickUrl })
      if (userId) await updateEngagement(userId, type, campaign, { last_clicked_url: clickUrl })
      console.log(`[resend-webhook] clicked campaign=${campaign} url=${clickUrl} user=${userId ?? email}`)
      break
    }

    case 'email.bounced': {
      await posthogCapture('email_bounced', distinctId, baseProps)
      console.warn(`[resend-webhook] bounced  email=${email}`)
      break
    }

    case 'email.complained': {
      await posthogCapture('email_complained', distinctId, baseProps)
      console.warn(`[resend-webhook] complained email=${email}`)
      break
    }

    default:
      // email.sent and other events — no action needed
      break
  }

  return res.status(200).json({ ok: true })
}
