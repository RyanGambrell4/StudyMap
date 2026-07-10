/**
 * Founder-to-user outreach emails. Deliberately plain-text and personal —
 * the whole point is that they read like a real one-to-one message, not a
 * templated broadcast. High open + reply rates are the goal; formatting is
 * kept minimal so Gmail renders them as a personal correspondence, not a
 * marketing send.
 */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Ask a just-cancelled trial user why they cancelled. Fires from the
 * cancel-trial webhook path in api/stripe.js. Reply-to points at
 * ryan@ so replies land in a real inbox, not the support alias.
 *
 * Kept short and lowercase-ish on purpose. If it looks templated,
 * response rate drops. The video reference for this pattern got a
 * 51% open rate.
 */
export async function sendFounderCancellationEmail(toEmail, opts = {}) {
  if (!process.env.RESEND_API_KEY || !toEmail) return
  const firstName = (opts.firstName ?? '').split(' ')[0] || 'there'

  const text = [
    `Hey ${firstName},`,
    '',
    `Ryan here — I built StudyEdge AI.`,
    '',
    `I saw you cancelled your Pro trial. No hard feelings at all — I just want to`,
    `make the product better, and I read every reply personally.`,
    '',
    `Can you spare 60 seconds and hit reply with the one thing that made you`,
    `stop? Even one word helps. A few examples of the kind of thing I'm after:`,
    '',
    `  - "AI answers weren't accurate enough"`,
    `  - "Too expensive right now"`,
    `  - "Just testing, wasn't a real trial"`,
    `  - "Missing feature X"`,
    '',
    `Whatever it is, I want to know. If it's a bug, I'll fix it this week.`,
    '',
    `Thanks for giving it a shot.`,
    '',
    `— Ryan`,
    `Founder, StudyEdge AI`,
  ].join('\n')

  try {
    await resend.emails.send({
      from: 'Ryan Gambrell <ryan@mail.getstudyedge.com>',
      replyTo: 'ryan@olunix.com',
      to: toEmail,
      subject: 'quick question about your trial',
      text,
      headers: {
        // Plain, personal email — no bulk unsubscribe header. This is 1:1
        // correspondence, not a marketing broadcast.
        'X-Entity-Ref-ID': `founder-cancel-${Date.now()}`,
      },
    })
    return { ok: true }
  } catch (err) {
    console.error('[founderOutreach] send failed:', err?.message ?? err)
    return { ok: false, error: err?.message ?? String(err) }
  }
}
