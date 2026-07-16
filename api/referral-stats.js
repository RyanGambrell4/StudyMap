import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '../lib/server/usage.js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { listUnsubscribeHeaders, preheader } from '../lib/server/emailHelpers.js'

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const resend = new Resend(process.env.RESEND_API_KEY)

export const config = { maxDuration: 15 }

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const userId = await verifyAuth(req)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    // Count users who signed up via this user's referral link
    const { data: signups, error: signupErr } = await supabaseAdmin
      .from('user_data')
      .select('user_id, subscription')
      .filter('subscription->>referredBy', 'eq', userId)

    if (signupErr) return res.status(500).json({ error: 'DB error' })

    const total = signups?.length ?? 0
    const converted = (signups ?? []).filter(r => {
      const plan = r.subscription?.plan
      return plan && plan !== 'free'
    }).length

    // Persist the count back into referrer's subscription for client-side display
    if (total > 0) {
      const { data: me } = await supabaseAdmin
        .from('user_data')
        .select('subscription')
        .eq('user_id', userId)
        .maybeSingle()

      const currentCount = me?.subscription?.referralCount ?? 0
      if (currentCount !== total) {
        await supabaseAdmin
          .from('user_data')
          .update({ subscription: { ...(me?.subscription ?? {}), referralCount: total, referralConverted: converted } })
          .eq('user_id', userId)
      }
    }

    return res.status(200).json({ total, converted })
  }

  // POST: called when a new user's referral is recorded — notify the referrer
  if (req.method === 'POST') {
    const { referrerId, newUserEmail } = req.body
    if (!referrerId || !newUserEmail) return res.status(400).json({ error: 'Missing fields' })

    // Verify this is a legitimate server-to-server call (from App.jsx auth flow via service key header)
    const authHeader = req.headers['authorization'] ?? ''
    const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''
    if (!serviceKey || !authHeader.includes(serviceKey.slice(-12))) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { data: referrerAuth } = await supabaseAdmin.auth.admin.getUserById(referrerId)
    const referrerEmail = referrerAuth?.user?.email
    if (!referrerEmail) return res.status(200).json({ ok: true, skipped: 'no_email' })

    const ok = await canSendUserEmail(referrerId, 'referral-join', 60) // max 1/hour
    if (!ok) return res.status(200).json({ ok: true, skipped: 'cooldown' })

    const firstName = referrerEmail.split('@')[0].split('.')?.[0]

    try {
      await resend.emails.send({
        from: 'Ryan at StudyEdge <ryan@getstudyedge.com>',
        to: referrerEmail,
        subject: 'Someone just joined StudyEdge using your link 🎉',
        headers: listUnsubscribeHeaders(referrerId),
        html: `
${preheader('A friend signed up using your referral link. When they upgrade to Pro, you both get a free month.')}
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;padding:36px 32px;border:1px solid #e5e7eb;">
      <img src="https://getstudyedge.com/favicon.png" alt="StudyEdge AI" style="width:36px;height:36px;border-radius:9px;margin-bottom:20px;">
      <h1 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#111;letter-spacing:-0.03em;">
        Someone used your referral link!
      </h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
        Hey ${firstName}, a friend just signed up for StudyEdge using your referral link. When they upgrade to Pro, you'll both get a free month automatically.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#16a34a;">How rewards work</p>
        <p style="margin:0;font-size:13.5px;color:#4b5563;line-height:1.6;">When your friend upgrades to Pro, you'll both get 1 month free, automatically applied to your next billing cycle. Keep sharing to stack rewards.</p>
      </div>
      <a href="https://getstudyedge.com/app" style="display:block;text-align:center;background:#3B61C4;color:#fff;font-weight:800;font-size:15px;padding:14px 24px;border-radius:12px;text-decoration:none;letter-spacing:-0.01em;">
        Open StudyEdge →
      </a>
      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
        StudyEdge AI · <a href="https://getstudyedge.com/unsubscribe?uid=${referrerId}" style="color:#9ca3af;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`,
      })
      await recordUserEmail(referrerId, 'referral-join')
    } catch (e) {
      console.error('[referral-stats] email error', e.message)
    }

    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
