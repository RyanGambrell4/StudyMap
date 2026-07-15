/**
 * Day 5 social proof email.
 *
 * Fires at the ~5-day mark for free users who have NOT converted.
 * Every other email in the day3-day21 sequence is a feature list.
 * This one is different: a real story. No bullet points. No feature table.
 * Just one student, one outcome, and the specific thing that changed.
 *
 * The goal is to break the "another upgrade email" pattern and make the
 * reader feel something — recognition that StudyEdge solved a real problem
 * for someone like them. That's what drives click-through after they've
 * already seen four feature lists and skipped them.
 *
 * Story is personalized by onboarding school type (university/hs/exam prep)
 * so it reads to their actual situation, not a generic college student.
 */

import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { canSendUserEmail, recordUserEmail } from '../lib/server/emailGuard.js'
import { acquireCronLock } from '../lib/server/cronLock.js'
import { preheader, listUnsubscribeHeaders } from '../lib/server/emailHelpers.js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

function pickStory(schoolType, yearLevel) {
  const st = (schoolType ?? '').toLowerCase()
  const yl = (yearLevel ?? '').toLowerCase()

  if (st === 'exam') {
    return {
      subject: 'How one student stopped guessing and passed on the second try',
      preheaderText: 'She had studied for weeks and still failed. One change made the difference.',
      audienceKicker: 'Exam prep',
      story: `
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.72;">
          A nursing student I'll call Maya had failed her NCLEX on the first attempt. Not because she didn't know the material — she'd spent months with textbooks. Because she didn't know <em>which</em> material she actually didn't know.
        </p>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.72;">
          She came to StudyEdge two weeks before her retake. She dropped her weak areas into the Study Coach, let it build a 14-day plan around her biggest gaps, and used Brain Dump every morning on the topics that felt shaky.
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 22px;">
          <tr><td style="background:#F4F7FF;border-left:3px solid #3B61C4;border-radius:0 10px 10px 0;padding:16px 20px;">
            <p style="margin:0;font-size:15px;color:#111111;line-height:1.65;font-style:italic;">"I stopped reviewing what I already knew. The app kept pointing me to the stuff I kept getting wrong. That's what changed."</p>
            <p style="margin:8px 0 0;font-size:12px;color:#9B9B9B;font-weight:600;letter-spacing:0.04em;">— Maya, nursing student, passed NCLEX on second attempt</p>
          </td></tr>
        </table>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.72;">
          The study hours were similar. The <em>targeting</em> was completely different. Pro's AI identifies the exact gaps between what you think you know and what the exam will actually test.
        </p>`,
      outcomeLabel: 'Passed on second attempt',
      ctaLabel: 'Build my exam study plan',
      ctaHref: 'https://getstudyedge.com/app?tab=coach&utm_source=email&utm_medium=lifecycle&utm_campaign=day5_proof_exam',
    }
  }

  if (st === 'hs') {
    return {
      subject: 'What changed when he stopped cramming the night before',
      preheaderText: 'He\'d been getting Bs for three years. One semester on Pro changed that.',
      audienceKicker: 'High school',
      story: `
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.72;">
          A high school junior I'll call Jake had been pulling Bs for three years — not because he wasn't capable, but because his whole study method was "cram the night before the test." It worked just well enough to keep him from taking it seriously.
        </p>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.72;">
          He started using StudyEdge at the beginning of his junior year. He added every class with its next test date, let the Study Coach build a week-by-week plan, and ran a Session Blueprint before each study block instead of just "opening his notes."
        </p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 22px;">
          <tr><td style="background:#F4F7FF;border-left:3px solid #3B61C4;border-radius:0 10px 10px 0;padding:16px 20px;">
            <p style="margin:0;font-size:15px;color:#111111;line-height:1.65;font-style:italic;">"I wasn't smarter. I just knew exactly what to study before I sat down. The Blueprint told me what to do so I didn't waste the hour."</p>
            <p style="margin:8px 0 0;font-size:12px;color:#9B9B9B;font-weight:600;letter-spacing:0.04em;">— Jake, high school junior, GPA up from 3.1 to 3.7 in one semester</p>
          </td></tr>
        </table>
        <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.72;">
          What changed wasn't how much time he spent studying. It was that every hour was pointed at the right thing. That's what Session Blueprints and the Study Coach are built to do.
        </p>`,
      outcomeLabel: '3.1 → 3.7 GPA in one semester',
      ctaLabel: 'Start building my plan',
      ctaHref: 'https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day5_proof_hs',
    }
  }

  // Default: university
  const isEarlyYear = yl.includes('1st') || yl.includes('freshman') || yl.includes('2nd') || yl.includes('sophomore')
  return {
    subject: isEarlyYear
      ? 'How a freshman went from cramming to actually understanding organic chem'
      : 'How she stopped rereading chapters and started actually knowing the material',
    preheaderText: 'She\'d been studying for hours. The problem wasn\'t the hours.',
    audienceKicker: 'Student story',
    story: `
      <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.72;">
        A sophomore I'll call Emma was taking organic chemistry for the second time. Not because she wasn't smart — because she'd been studying the way everyone told her to: highlighting chapters, rewriting notes, reviewing everything the night before.
      </p>
      <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.72;">
        She started using StudyEdge two weeks before her retake. The first thing she did was upload her syllabus. The Study Coach gave her a 14-day plan: specific topics, specific days, specific amounts of time. Not "study more" — exactly what to study on exactly which day.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 22px;">
        <tr><td style="background:#F4F7FF;border-left:3px solid #3B61C4;border-radius:0 10px 10px 0;padding:16px 20px;">
          <p style="margin:0;font-size:15px;color:#111111;line-height:1.65;font-style:italic;">"I actually knew what I didn't know. Brain Dump showed me I understood the reactions but kept getting the mechanisms wrong. I spent the last 3 days just drilling mechanisms."</p>
          <p style="margin:8px 0 0;font-size:12px;color:#9B9B9B;font-weight:600;letter-spacing:0.04em;">— Emma, sophomore, 68% → 84% on her organic chem retake</p>
        </td></tr>
      </table>
      <p style="margin:0 0 18px;font-size:15px;color:#6B6B6B;line-height:1.72;">
        She passed. 84%. The difference wasn't more hours — it was that every hour was pointed at the right thing.
      </p>`,
    outcomeLabel: '68% → 84% on organic chem retake',
    ctaLabel: 'Build my study plan',
    ctaHref: 'https://getstudyedge.com/app?utm_source=email&utm_medium=lifecycle&utm_campaign=day5_proof_uni',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, skipped: true })

  const locked = await acquireCronLock('day5-social-proof')
  if (!locked) {
    console.log('[day5-social-proof] Already ran today - skipping')
    return res.status(200).json({ ok: true, skipped: true, reason: 'already_ran_today' })
  }

  // Target users who signed up ~5 days ago (108–132h window).
  const now = new Date()
  const windowStart = new Date(now - 132 * 60 * 60 * 1000)
  const windowEnd   = new Date(now - 108 * 60 * 60 * 1000)

  const { data: rows, error } = await supabaseAdmin.rpc('list_users_by_signup_window', {
    start_ts: windowStart.toISOString(),
    end_ts:   windowEnd.toISOString(),
  })
  if (error) return res.status(500).json({ error: 'Failed to list users', detail: error.message })
  const targetUsers = (rows ?? []).map(r => ({ id: r.user_id, email: r.email }))

  console.log(`[day5-social-proof] Found ${targetUsers.length} users at 5-day mark`)
  let sent = 0, skipped = 0

  for (const user of targetUsers) {
    if (!user.email) continue

    const { data: row, error: rowErr } = await supabaseAdmin
      .from('user_data')
      .select('subscription, plan')
      .eq('user_id', user.id)
      .maybeSingle()

    if (rowErr) { skipped++; continue }

    const activeStatuses = ['active', 'trialing', 'past_due']
    const sub = row?.subscription ?? {}
    const plan = activeStatuses.includes(sub.status) ? (sub.plan ?? 'free') : 'free'
    if (plan !== 'free') { skipped++; continue }

    if (sub.day5_proof_sent) { skipped++; continue }

    const gate = await canSendUserEmail(user.id, { priority: 'normal' })
    if (!gate.ok) { skipped++; continue }

    const planData = row?.plan ?? {}
    const story = pickStory(planData.schoolType, planData.yearLevel)
    const trialUsed = !!(sub.trialUsedAt || sub.trial_activated)

    const upgradeUrl = trialUsed
      ? `https://getstudyedge.com/app?upgrade=1&utm_source=email&utm_medium=lifecycle&utm_campaign=day5_proof_winback`
      : story.ctaHref + (story.ctaHref.includes('?') ? '&signup=1&plan=pro&billing=weekly&trial=1' : '?signup=1&plan=pro&billing=weekly&trial=1')
    const ctaLabel    = trialUsed ? 'Upgrade to Pro — $2.99/wk' : story.ctaLabel
    const ctaFootnote = trialUsed ? '$2.99/wk · Cancel anytime' : '$0 today · 7-day trial · $2.99/wk after · Cancel anytime'

    try {
      await resend.emails.send({
        from: 'Ryan from StudyEdge <support@mail.getstudyedge.com>',
        to: user.email,
        subject: story.subject,
        headers: listUnsubscribeHeaders(user.email),
        tags: [
          { name: 'campaign', value: 'day5_social_proof' },
          { name: 'user_id', value: user.id },
        ],
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${story.subject}</title></head>
<body style="margin:0;padding:0;background:#F7F6F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
${preheader(story.preheaderText)}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

      <tr><td style="padding-bottom:20px;text-align:center;">
        <img src="https://getstudyedge.com/favicon.png" width="32" height="32" alt="StudyEdge" style="display:inline-block;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-right:10px;border:0;" />
        <span style="font-size:16px;font-weight:700;color:#111111;vertical-align:middle;letter-spacing:-0.3px;">StudyEdge</span>
      </td></tr>

      <tr><td style="background:#FFFFFF;border-radius:18px;border:1px solid rgba(0,0,0,0.06);padding:36px 36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <p style="margin:0 0 6px;font-size:11.5px;font-weight:600;letter-spacing:0.08em;color:#3B61C4;text-transform:uppercase;">${story.audienceKicker}</p>
        <h1 style="margin:0 0 26px;font-size:26px;font-weight:700;color:#111111;letter-spacing:-0.6px;line-height:1.25;">
          ${story.subject}
        </h1>

        ${story.story}

        <table cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 28px;background:#F7F6F3;border-radius:12px;">
          <tr>
            <td style="padding:18px 20px;" width="50%">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;margin-bottom:4px;">The outcome</div>
              <div style="font-size:15px;font-weight:700;color:#111111;">${story.outcomeLabel}</div>
            </td>
            <td style="padding:18px 20px;border-left:1px solid rgba(0,0,0,0.08);" width="50%">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:#9B9B9B;text-transform:uppercase;margin-bottom:4px;">The tool</div>
              <div style="font-size:15px;font-weight:700;color:#111111;">Study Coach + Brain Dump</div>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 22px;font-size:15px;color:#6B6B6B;line-height:1.7;">
          Pro is <strong style="color:#111111;">$2.99/week</strong> — less than a coffee.
          ${trialUsed
            ? 'You\'ve already seen what it does. Get it back.'
            : 'Try it free for 7 days. You won\'t be charged until day 8.'}
        </p>

        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr><td align="center" style="padding-bottom:10px;">
            <a href="${upgradeUrl}" style="display:inline-block;background:#3B61C4;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 36px;letter-spacing:-0.2px;">${ctaLabel}</a>
          </td></tr>
          <tr><td align="center">
            <span style="font-size:12.5px;color:#9B9B9B;">${ctaFootnote}</span>
          </td></tr>
        </table>

        <p style="margin:26px 0 0;font-size:14px;color:#6B6B6B;line-height:1.7;">
          Have a question about how the Study Coach or Brain Dump works? Reply to this email — I personally read every one.<br><br>— Ryan
        </p>
      </td></tr>

      <tr><td style="padding:22px 4px 0;text-align:center;">
        <p style="margin:0;font-size:11.5px;color:#9B9B9B;line-height:1.6;">
          You signed up for StudyEdge 5 days ago.
          <a href="https://getstudyedge.com/app" style="color:#9B9B9B;text-decoration:underline;">Open the app</a>
          &nbsp;·&nbsp;
          <a href="mailto:support@mail.getstudyedge.com" style="color:#9B9B9B;text-decoration:underline;">Contact support</a>
          &nbsp;&middot;&nbsp;
          <a href="https://getstudyedge.com/unsubscribe?email=${encodeURIComponent(user.email ?? '')}" style="color:#9B9B9B;text-decoration:underline;">Unsubscribe</a>
        </p>
        <p style="margin:14px 0 0;font-size:11.5px;color:#9B9B9B;">The StudyEdge AI team</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`,
      })

      // Mark sent on the subscription blob so it never re-fires.
      const merged = { ...sub, day5_proof_sent: new Date().toISOString() }
      await supabaseAdmin
        .from('user_data')
        .update({ subscription: merged })
        .eq('user_id', user.id)

      await recordUserEmail(user.id)
      sent++
    } catch (err) {
      console.error(`[day5-social-proof] Failed to send to ${user.email}:`, err)
    }
  }

  console.log(`[day5-social-proof] Sent ${sent}, skipped ${skipped}`)
  return res.status(200).json({ ok: true, sent, skipped })
}
