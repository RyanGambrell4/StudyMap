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

  const locked = await acquireCronLock('struggle-digest-weekly')
  if (!locked) return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_this_week' })

  // Fetch users who have struggle topics logged in the last 14 days
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: rows, error } = await supabaseAdmin
    .from('struggle_topics')
    .select('user_id, course_name, topic, flagged_at')
    .gte('flagged_at', since)
    .order('flagged_at', { ascending: false })

  if (error) return res.status(500).json({ error: 'DB error', detail: error.message })

  // Group by user
  const byUser = {}
  for (const row of (rows ?? [])) {
    if (!byUser[row.user_id]) byUser[row.user_id] = []
    byUser[row.user_id].push(row)
  }

  let sent = 0, skipped = 0

  for (const [userId, struggles] of Object.entries(byUser)) {
    // Top 3 most recent struggles, deduplicated by topic
    const seen = new Set()
    const top = []
    for (const s of struggles) {
      if (!seen.has(s.topic) && top.length < 3) {
        seen.add(s.topic)
        top.push(s)
      }
    }
    if (top.length === 0) { skipped++; continue }

    // Look up user email and plan
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
    const email = authUser?.user?.email
    if (!email) { skipped++; continue }

    const { data: userData } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle()

    const plan = userData?.subscription?.plan ?? 'free'

    const ok = await canSendUserEmail(userId, 'struggle-digest', 6 * 24 * 60) // 6-day cooldown
    if (!ok) { skipped++; continue }

    const topicList = top.map(s => `<strong>${s.topic}</strong> (${s.course_name})`).join(', ')
    const topicBullets = top.map(s => `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;">
        <div style="width:8px;height:8px;border-radius:50%;background:#dc2626;flex-shrink:0;margin-top:5px;"></div>
        <div>
          <p style="margin:0 0 1px;font-weight:700;font-size:14px;color:#111;">${s.topic}</p>
          <p style="margin:0;font-size:12.5px;color:#6b7280;">${s.course_name}</p>
        </div>
      </div>
    `).join('')

    const isPro = plan === 'pro' || plan === 'unlimited'
    const ctaText = isPro ? 'Open AI Coach →' : 'Practice with AI Coach →'
    const upgradeSection = !isPro ? `
      <div style="margin-top:16px;padding:14px 16px;background:#f5f3ff;border-radius:10px;border:1px solid #ddd6fe;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#7c3aed;">Pro tip: Exam Rescue</p>
        <p style="margin:0 0 10px;font-size:13px;color:#4b5563;line-height:1.5;">
          Pro users can run an Exam Rescue on any weak spot — the AI builds a targeted study plan around your exact gaps.
        </p>
        <a href="https://getstudyedge.com/app" style="font-size:13px;font-weight:700;color:#7c3aed;text-decoration:none;">
          Unlock Exam Rescue →
        </a>
      </div>
    ` : ''

    const firstName = email.split('@')[0].split('.')[0]
    const subject = top.length === 1
      ? `You're still struggling with ${top[0].topic} — let's fix that`
      : `${top.length} topics holding you back — here's how to catch up`

    try {
      await resend.emails.send({
        from: 'Ryan at StudyEdge <ryan@getstudyedge.com>',
        to: email,
        subject,
        headers: listUnsubscribeHeaders(userId),
        html: `
${preheader(`Your AI coach spotted gaps in ${top.map(s => s.topic).join(', ')} — practice to close them before your exam.`)}
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;padding:36px 32px;border:1px solid #e5e7eb;">
      <img src="https://getstudyedge.com/favicon.png" alt="StudyEdge AI" style="width:36px;height:36px;border-radius:9px;margin-bottom:20px;">
      <h1 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#111;letter-spacing:-0.03em;">
        Your AI coach flagged some gaps.
      </h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
        Hey ${firstName} — based on your recent study sessions, your AI coach spotted ${top.length === 1 ? 'a topic' : 'a few topics'} where you're getting stuck. Here ${top.length === 1 ? 'it is' : 'they are'}:
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
        ${topicBullets}
      </div>
      <p style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.6;">
        The fastest way to close these gaps is a focused 10-minute AI coach session — it'll ask you questions on exactly these topics and explain what you're missing.
      </p>
      <a href="https://getstudyedge.com/app" style="display:block;text-align:center;background:#dc2626;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">
        ${ctaText}
      </a>
      ${upgradeSection}
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
        StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${userId}" style="color:#9ca3af;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`,
      })
      await recordUserEmail(userId, 'struggle-digest')
      sent++
    } catch (e) {
      console.error('[struggle-digest] send error', e.message)
      skipped++
    }
  }

  return res.status(200).json({ ok: true, sent, skipped })
}
