// Study Buddy API
// GET  ?code={userId} — public buddy stats (streak, sessions, courses)
// POST {action:'nudge', buddyId, fromName} — send nudge email to buddy

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { verifyAuth } from '../lib/server/usage.js'
import { preheader } from '../lib/server/emailHelpers.js'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  // ── GET: fetch buddy's public stats ──────────────────────────────────────
  if (req.method === 'GET') {
    const auth = await verifyAuth(req, { requireEmailConfirmed: false })
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

    const buddyId = req.query.code
    if (!buddyId || typeof buddyId !== 'string' || buddyId.length < 10) {
      return res.status(400).json({ error: 'Invalid buddy code' })
    }

    const { data: row, error } = await supabaseAdmin
      .from('user_data')
      .select('completed_sessions, courses, streak')
      .eq('user_id', buddyId)
      .single()

    if (error || !row) return res.status(404).json({ error: 'Buddy not found' })

    const completedSessions = Array.isArray(row.completed_sessions) ? row.completed_sessions : []
    const courses = Array.isArray(row.courses) ? row.courses : []

    // Compute streak from completed_sessions if no dedicated streak column
    const streak = row.streak ?? (() => {
      const dates = [...new Set(completedSessions.map(s => s.dateStr).filter(Boolean))].sort().reverse()
      let count = 0
      const today = new Date().toISOString().split('T')[0]
      let check = today
      for (const d of dates) {
        if (d === check) { count++; const prev = new Date(check + 'T12:00:00'); prev.setDate(prev.getDate() - 1); check = prev.toISOString().split('T')[0] }
        else if (d < check) break
      }
      return count
    })()

    const lastSession = completedSessions[completedSessions.length - 1]?.dateStr ?? null
    const daysSince = lastSession
      ? Math.floor((Date.now() - new Date(lastSession + 'T12:00:00').getTime()) / 86400000)
      : null

    // Get buddy's email for display name
    let displayName = 'Your buddy'
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(buddyId)
      const email = authUser?.user?.email ?? ''
      const part = email.split('@')[0].split('.')?.[0] ?? ''
      if (part) displayName = part.charAt(0).toUpperCase() + part.slice(1)
    } catch {}

    return res.status(200).json({
      ok: true,
      displayName,
      streak,
      sessionCount: completedSessions.length,
      courseNames: courses.slice(0, 3).map(c => c.name).filter(Boolean),
      daysSinceLastSession: daysSince,
    })
  }

  // ── POST: nudge buddy ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const auth = await verifyAuth(req, { requireEmailConfirmed: false })
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

    const { action, buddyId, fromName } = req.body ?? {}
    if (action !== 'nudge') return res.status(400).json({ error: 'Unknown action' })
    if (!buddyId) return res.status(400).json({ error: 'buddyId required' })

    if (!process.env.RESEND_API_KEY) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'email_not_configured' })
    }

    // Rate-limit nudges to 1 per 24h per sender per buddy
    const gate = await canSendUserEmail(buddyId, { priority: 'high' })
    if (!gate.ok) return res.status(429).json({ error: 'Already nudged this buddy recently' })

    let buddyEmail
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(buddyId)
      buddyEmail = authUser?.user?.email
    } catch {}

    if (!buddyEmail) return res.status(404).json({ error: 'Buddy not found' })

    const senderName = fromName || 'Your study buddy'

    await resend.emails.send({
      from: 'StudyEdge <support@mail.getstudyedge.com>',
      to: buddyEmail,
      subject: `${senderName} is rooting for you 👊`,
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader(`${senderName} sent you a study nudge. Don't let them down.`)}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding-bottom:20px;text-align:center;">
        <span style="font-size:16px;font-weight:700;color:#111111;">StudyEdge</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid rgba(0,0,0,0.07);padding:32px 32px 28px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#3B61C4;letter-spacing:0.06em;text-transform:uppercase;">Study Buddy Nudge</p>
        <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#111111;letter-spacing:-0.5px;line-height:1.25;">
          ${senderName} is watching your streak. 👊
        </h1>
        <p style="margin:0 0 20px;font-size:15px;color:#6B6B6B;line-height:1.65;">
          They took a second to let you know they're rooting for you.
          Your study plan is still there — pick it up today and keep the momentum going.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
          <tr><td align="center">
            <a href="https://getstudyedge.com/app?utm_source=email&utm_medium=buddy&utm_campaign=nudge"
               style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;padding:13px 30px;">
              Open StudyEdge →
            </a>
          </td></tr>
        </table>
        <p style="margin:0;font-size:12px;color:#9B9B9B;text-align:center;line-height:1.5;">
          You received this because a friend linked you as their Study Buddy on StudyEdge.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`,
    })

    await recordUserEmail(buddyId)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
