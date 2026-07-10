/**
 * POST /api/feedback
 *
 * Accepts an in-app feedback submission from the "Send feedback" button and:
 *   1. Writes it to `public.feedback` (Supabase) for durable record + later review.
 *   2. Fires a real-time notification to a Slack webhook if configured
 *      (SLACK_FEEDBACK_WEBHOOK), otherwise falls back to an email to
 *      FEEDBACK_NOTIFY_EMAIL (default: support@mail.getstudyedge.com).
 *
 * This is the direct feedback loop referenced in the conversion plan — the
 * whole point is that Ryan sees each submission the moment it lands so he
 * can act on the friction that's blocking conversion.
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { verifyAuth } from '../lib/server/usage.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

const MAX_MESSAGE_LEN = 4000
// Where the email fallback ships feedback to when SLACK_FEEDBACK_WEBHOOK is
// not set. Kept on the studyedge domain by default — set FEEDBACK_NOTIFY_EMAIL
// in Vercel to route to any other inbox.
const NOTIFY_EMAIL = process.env.FEEDBACK_NOTIFY_EMAIL || 'support@mail.getstudyedge.com'

async function postToSlack({ webhookUrl, message, email, route, plan }) {
  try {
    const body = {
      text: `📥 *New StudyEdge feedback*`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📥 New feedback from ${email ?? 'anonymous'}` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '```' + message.replace(/```/g, '``​`') + '```' },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `*Plan:* ${plan ?? 'free'}` },
            { type: 'mrkdwn', text: `*Route:* ${route ?? '(unknown)'}` },
            { type: 'mrkdwn', text: `*When:* <!date^${Math.floor(Date.now()/1000)}^{date_short_pretty} {time}|${new Date().toISOString()}>` },
          ],
        },
      ],
    }
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) console.error(`[feedback] Slack post failed: ${r.status}`)
  } catch (err) {
    console.error('[feedback] Slack post error:', err?.message ?? err)
  }
}

async function emailNotify({ message, email, route, plan }) {
  if (!process.env.RESEND_API_KEY) return
  try {
    await resend.emails.send({
      from: 'StudyEdge Feedback <support@mail.getstudyedge.com>',
      to: NOTIFY_EMAIL,
      replyTo: email || 'support@mail.getstudyedge.com',
      subject: `📥 Feedback from ${email ?? 'anonymous'}`,
      text: [
        `${message}`,
        ``,
        `— — —`,
        `From:  ${email ?? 'anonymous'}`,
        `Plan:  ${plan ?? 'free'}`,
        `Route: ${route ?? '(unknown)'}`,
        `When:  ${new Date().toISOString()}`,
      ].join('\n'),
    })
  } catch (err) {
    console.error('[feedback] email notify failed:', err?.message ?? err)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const auth = await verifyAuth(req, { requireEmailConfirmed: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const rawMessage = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!rawMessage) return res.status(400).json({ error: 'Feedback message is required' })
  if (rawMessage.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LEN} chars)` })
  }

  const route = typeof body?.route === 'string' ? body.route.slice(0, 200) : null
  const metadata = (body?.metadata && typeof body.metadata === 'object') ? body.metadata : null

  // Look up email + plan for the notification context. Fail-open if either
  // query breaks — we still want the feedback recorded.
  let email = null
  let plan = 'free'
  try {
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(auth.userId)
    email = userRes?.user?.email ?? null
  } catch { /* ignore */ }
  try {
    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', auth.userId)
      .maybeSingle()
    plan = row?.subscription?.plan ?? 'free'
  } catch { /* ignore */ }

  // 1. Persist first — even if notification fails we haven't lost the feedback.
  const { error: insertErr } = await supabaseAdmin
    .from('feedback')
    .insert({
      user_id: auth.userId,
      email,
      message: rawMessage,
      route,
      metadata,
    })

  if (insertErr) {
    console.error('[feedback] insert failed:', insertErr)
    return res.status(500).json({ error: 'Failed to record feedback' })
  }

  // 2. Notify — Slack preferred, email fallback. Non-blocking either way.
  const webhookUrl = process.env.SLACK_FEEDBACK_WEBHOOK
  const notifyCtx = { message: rawMessage, email, route, plan }
  if (webhookUrl) {
    postToSlack({ webhookUrl, ...notifyCtx }).catch(e => console.error('[feedback] slack fail:', e))
  } else {
    emailNotify(notifyCtx).catch(e => console.error('[feedback] email fail:', e))
  }

  return res.status(200).json({ ok: true })
}
