import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { listUnsubscribeHeaders, preheader } from '../lib/server/emailHelpers.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

export const config = { maxDuration: 120 }

// One-time personal email from Ryan to all non-converted users who signed up 3+ days ago.
// Protected by service key — not meant to run on a cron, trigger manually via GET with auth header.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Auth: must include service key suffix in Authorization header
  const authHeader = req.headers['authorization'] ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''
  if (!serviceKey || !authHeader.includes(serviceKey.slice(-16))) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: 'no_resend' })

  // Dry-run mode: pass ?dry=1 to preview without sending
  const dryRun = req.query?.dry === '1'

  // Find all free users who signed up at least 3 days ago
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: '2020-01-01T00:00:00Z',
    end_ts: cutoff,
  })
  if (error) return res.status(500).json({ error: 'RPC failed', detail: error.message })

  const users = (rows ?? []).filter(r => r.email)
  console.log(`[founder-outreach] ${users.length} candidate users (cutoff: ${cutoff})`)

  let sent = 0, skipped = 0, errors = 0
  const results = []

  for (const user of users) {
    const { data: row } = await supabaseAdmin
      .from('user_data')
      .select('subscription')
      .eq('user_id', user.user_id)
      .maybeSingle()

    // Skip paid users and trial users
    const plan = row?.subscription?.plan ?? 'free'
    if (plan !== 'free') { skipped++; continue }
    if (row?.subscription?.trialUsedAt) { skipped++; continue }

    // Skip if no onboarding data (ghost signups who never opened the app)
    if (!row) { skipped++; continue }

    // EmailGuard: skip users emailed in the last 48h
    const guard = await canSendUserEmail(user.user_id, { priority: 'normal' })
    if (!guard.ok) { skipped++; continue }

    const firstName = (user.email.split('@')[0].split('.')?.[0] ?? 'there')
    const cap = firstName.charAt(0).toUpperCase() + firstName.slice(1)

    if (dryRun) {
      results.push({ email: user.email, firstName: cap, status: 'dry_run' })
      sent++
      continue
    }

    try {
      await resend.emails.send({
        from: 'Ryan Gambrell <ryan@getstudyedge.com>',
        to: user.email,
        subject: 'honest question about StudyEdge',
        headers: listUnsubscribeHeaders(user.user_id),
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheader('Quick question from the founder — takes 30 seconds.')}
  <div style="max-width:540px;margin:0 auto;padding:40px 16px;">
    <div style="background:#fff;border-radius:12px;padding:36px 32px;border:1px solid #e5e7eb;">

      <p style="margin:0 0 18px;font-size:15px;color:#111;line-height:1.7;">
        Hey ${cap},
      </p>
      <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;">
        I'm Ryan — I built StudyEdge AI. You signed up a few days ago and I wanted to reach out personally.
      </p>
      <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;">
        I noticed you haven't tried the Pro trial yet and I'm genuinely curious: <strong>what held you back?</strong>
      </p>
      <p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;">
        Was it the price? Not sure if it was worth it? Didn't get to try it properly? Something else?
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
        I read every reply and use the feedback to make the app better. Even a one-line answer helps a lot.
      </p>

      <div style="border-top:1px solid #e5e7eb;padding-top:24px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:13.5px;font-weight:700;color:#111;">If you haven't used StudyEdge much yet:</p>
        <p style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.6;">
          The fastest way to see what it does: add one course, put in your next exam date, and hit "Generate Plan." It takes about 60 seconds and gives you a full week-by-week study schedule calibrated to your exam.
        </p>
        <a href="https://getstudyedge.com/app?plan=pro&billing=weekly&trial=1" style="display:inline-block;background:#3B61C4;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;text-decoration:none;">
          Try Pro free for 3 days →
        </a>
        <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;">No charge during the trial. $2.99/wk or $9.99/month after.</p>
      </div>

      <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">
        Either way — reply to this email. I'll write back.
      </p>
      <p style="margin:12px 0 0;font-size:15px;color:#374151;">Ryan</p>
      <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Founder, StudyEdge AI</p>

      <p style="margin:24px 0 0;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;">
        StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${user.user_id}" style="color:#9ca3af;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`,
      })
      await recordUserEmail(user.user_id, 'founder-outreach')
      results.push({ email: user.email, status: 'sent' })
      sent++
    } catch (e) {
      console.error(`[founder-outreach] error for ${user.email}:`, e.message)
      results.push({ email: user.email, status: 'error', error: e.message })
      errors++
    }

    // Small delay to stay within Resend rate limits (~10/s)
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`[founder-outreach] done — sent=${sent} skipped=${skipped} errors=${errors} dry=${dryRun}`)
  return res.status(200).json({ ok: true, sent, skipped, errors, dryRun, results })
}
