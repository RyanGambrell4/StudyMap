/**
 * Pro welcome email — fires when a trial converts to paid (trialing → active).
 *
 * This is the most important email that didn't exist. When a student converts
 * from trial to paid, that decision needs to be validated immediately. They
 * just committed money. The email should:
 *   1. Make them feel good about the decision (not sell to them — they bought)
 *   2. Give them 3 specific things to do right now
 *   3. Signal that a real human is behind the product
 *
 * Tone: warm, direct, no corporate voice. Like a message from the founder,
 * not a confirmation receipt. No "your subscription is confirmed" boilerplate.
 *
 * Called from stripe.js on `customer.subscription.updated` where
 * previousStatus === 'trialing' and sub.status === 'active'.
 */

import { Resend } from 'resend'
import { preheader, listUnsubscribeHeaders } from './emailHelpers.js'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendProWelcomeEmail(toEmail, { firstName, plan, billingPeriod, userId } = {}) {
  if (!process.env.RESEND_API_KEY || !toEmail) return

  const greeting = firstName ? `Hey ${firstName}` : 'Hey'
  const planLabel = plan === 'unlimited' ? 'Unlimited' : 'Pro'
  const billingLabel = billingPeriod === 'yearly'
    ? 'per year'
    : billingPeriod === 'monthly'
      ? 'per month'
      : 'per week'

  try {
    await resend.emails.send({
      from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
      to: toEmail,
      subject: `You're Pro. Here's what to do with it.`,
      headers: listUnsubscribeHeaders(toEmail),
      tags: [
        { name: 'campaign', value: 'pro_welcome' },
        ...(userId ? [{ name: 'user_id', value: userId }] : []),
      ],
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Pro</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader("Your subscription is live. Three things to do in the next 10 minutes to get the most out of Pro.")}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>

      <tr><td style="background:#FFFFFF;border-radius:18px;border:1px solid rgba(0,0,0,0.06);padding:36px 36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">

        <!-- Status pill -->
        <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr><td style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);border-radius:100px;padding:5px 14px;">
            <span style="font-size:12px;font-weight:700;color:#15803D;letter-spacing:0.04em;">● ${planLabel} — active</span>
          </td></tr>
        </table>

        <h1 style="margin:0 0 18px;font-size:27px;font-weight:700;color:#111111;letter-spacing:-0.6px;line-height:1.24;">
          ${greeting} — you're in.<br>Here's what to do first.
        </h1>

        <p style="margin:0 0 26px;font-size:15px;color:#6B6B6B;line-height:1.72;">
          Most people who subscribe to a study tool open it once, think "okay, cool," and close it. The students who actually get better grades are the ones who do three specific things in the first 10 minutes. Here they are:
        </p>

        <!-- 3 action steps -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">

          <tr><td style="padding:0 0 14px;">
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#F4F7FF;border-radius:14px;border:1px solid rgba(59,97,196,0.15);">
              <tr>
                <td style="width:52px;padding:18px 0 18px 20px;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0"><tr><td style="width:32px;height:32px;background:#3B61C4;border-radius:50%;text-align:center;line-height:32px;font-size:14px;font-weight:800;color:#FFFFFF;">1</td></tr></table>
                </td>
                <td style="padding:18px 20px 18px 12px;vertical-align:top;">
                  <div style="font-size:14.5px;font-weight:700;color:#111111;margin-bottom:5px;">Run the Study Coach on your hardest class</div>
                  <div style="font-size:13.5px;color:#6B6B6B;line-height:1.6;">Open the app, go to your hardest course, tap <strong style="color:#111111;">Study Coach</strong>. You now have unlimited runs — so every time the syllabus changes or a new exam gets added, redo it. Takes 2 minutes and gives you a full multi-week plan.</div>
                </td>
              </tr>
            </table>
          </td></tr>

          <tr><td style="padding:0 0 14px;">
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#F4F7FF;border-radius:14px;border:1px solid rgba(59,97,196,0.15);">
              <tr>
                <td style="width:52px;padding:18px 0 18px 20px;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0"><tr><td style="width:32px;height:32px;background:#3B61C4;border-radius:50%;text-align:center;line-height:32px;font-size:14px;font-weight:800;color:#FFFFFF;">2</td></tr></table>
                </td>
                <td style="padding:18px 20px 18px 12px;vertical-align:top;">
                  <div style="font-size:14.5px;font-weight:700;color:#111111;margin-bottom:5px;">Use a Session Blueprint before every session from now on</div>
                  <div style="font-size:13.5px;color:#6B6B6B;line-height:1.6;">Every time you sit down to study, start by generating a Blueprint for that session. You get a minute-by-minute plan for exactly what to cover. Students who do this log 3× more sessions per week than those who don't.</div>
                </td>
              </tr>
            </table>
          </td></tr>

          <tr><td style="padding:0;">
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#F4F7FF;border-radius:14px;border:1px solid rgba(59,97,196,0.15);">
              <tr>
                <td style="width:52px;padding:18px 0 18px 20px;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0"><tr><td style="width:32px;height:32px;background:#3B61C4;border-radius:50%;text-align:center;line-height:32px;font-size:14px;font-weight:800;color:#FFFFFF;">3</td></tr></table>
                </td>
                <td style="padding:18px 20px 18px 12px;vertical-align:top;">
                  <div style="font-size:14.5px;font-weight:700;color:#111111;margin-bottom:5px;">Try Exam Rescue on the topic you're most behind on</div>
                  <div style="font-size:13.5px;color:#6B6B6B;line-height:1.6;">Open a course, tap <strong style="color:#111111;">Exam Rescue</strong> on the hardest topic. It identifies your specific knowledge gaps and builds you a focused review plan. This is the one students use the night before an exam — you now have it all semester.</div>
                </td>
              </tr>
            </table>
          </td></tr>

        </table>

        <!-- Your plan summary -->
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:26px;border-top:1px solid #F0EDE8;border-bottom:1px solid #F0EDE8;">
          <tr>
            <td style="padding:16px 0;" width="50%">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;margin-bottom:4px;">Your plan</div>
              <div style="font-size:15px;font-weight:700;color:#111111;">StudyEdge ${planLabel}</div>
            </td>
            <td style="padding:16px 0;border-left:1px solid #F0EDE8;padding-left:20px;" width="50%">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;margin-bottom:4px;">Billing</div>
              <div style="font-size:15px;font-weight:700;color:#111111;">${billingLabel === 'per week' ? '$2.99' : billingLabel === 'per month' ? 'monthly' : 'annual'} · cancel in account anytime</div>
            </td>
          </tr>
        </table>

        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:10px;">
            <a href="https://getstudyedge.com/app?tab=coach&utm_source=email&utm_medium=lifecycle&utm_campaign=pro_welcome" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 36px;letter-spacing:-0.2px;">Open StudyEdge and start</a>
          </td></tr>
        </table>

        <p style="margin:28px 0 0;font-size:15px;color:#6B6B6B;line-height:1.72;">
          You just did what most people don't — you invested in how you study, not just how many hours you sit at a desk. That's the part that actually changes grades.
        </p>
        <p style="margin:14px 0 0;font-size:15px;color:#6B6B6B;line-height:1.72;">
          Reply to this email any time if you're stuck, have a question, or want to know the best way to use something. I read every message.<br><br>— Ryan
        </p>

      </td></tr>

      <tr><td style="padding:22px 4px 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You're receiving this because your StudyEdge ${planLabel} subscription is now active.<br>
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`,
    })
    console.log(`[pro-welcome] Sent to ${toEmail}`)
  } catch (err) {
    console.error('[pro-welcome] Failed to send:', err)
  }
}
