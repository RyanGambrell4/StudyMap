# StudyEdge AI — Email System Agent Spec

## Read First — App Context

**App:** StudyEdge AI (`getstudyedge.com`)
**Stack:** React + Vite, Supabase auth + DB, Vercel serverless, Tailwind + inline styles
**Repo:** `/Users/ryangambrell/Desktop/StudyMap`

## What This Agent Does

You are an email deliverability and lifecycle marketing specialist. Your job is to:
1. Diagnose and fix why signup confirmation emails are failing
2. Audit and fix every existing email template (they're all dark-themed — the app is light)
3. Improve deliverability (SPF, DKIM, DMARC, sender reputation)
4. Audit the full email sequence and suggest/implement improvements
5. Make sure every email that fires actually fires correctly

You have full authority to edit API files, rewrite HTML templates, and update config. Do NOT commit `.env` changes — document what env vars are needed and their purpose.

---

## Current Email Infrastructure

### Services in Use
- **Resend** — transactional emails (welcome, day1-tips, etc.) via `api/` serverless functions
- **Loops.so** — marketing automation (contact sync + event triggers)
- **Supabase Auth** — sends signup confirmation + password reset emails natively

### Environment Variables Status (CRITICAL — READ THIS)
```
RESEND_API_KEY     = NOT SET in .env — all Resend emails are silently skipped
LOOPS_API_KEY      = NOT SET in .env — Loops contact sync is silently skipped
SUPABASE_SERVICE_KEY = EMPTY — admin operations fail silently
```

**This means:** Every email in the system is currently a no-op. No welcome email fires. No day-1 tips fire. No upgrade nudges fire. The entire email lifecycle is broken.

### Supabase Auth Email
Supabase sends its own confirmation + password reset emails using its built-in SMTP. These are configured separately in the Supabase dashboard (not via Resend). The QA agent confirmed: **signup confirmation emails are failing** with "Error sending confirmation email." This is likely because:
- Supabase Auth → Email settings has no custom SMTP configured
- Or the sender domain `getstudyedge.com` isn't verified in Resend/Supabase
- Check: Supabase Dashboard → Authentication → Email Templates + SMTP Settings

---

## Email Files to Audit

```
api/welcome-email.js      — Fires on signup, promotes Pro trial
api/day1-tips.js          — Cron: fires ~24h after signup, 3 tips
api/day7-milestone.js     — Cron: fires 7 days after signup, milestone check
api/day14-upgrade.js      — Cron: fires 14 days after signup, upgrade push
api/weekly-digest.js      — Weekly study summary
api/weekly-recap.js       — Weekly recap variant
api/exam-countdown.js     — Fires when exam is approaching
api/exam-rescue.js        — Fires when user is behind on prep
api/exam-tomorrow.js      — Fires night before an exam
api/prep-blast.js         — Pre-exam preparation email
api/re-engage.js          — Re-engagement for inactive users
api/session-debrief.js    — After a study session
lib/server/loops.js       — Loops.so integration layer
```

---

## Critical Bugs to Fix First

### Bug 1: RESEND_API_KEY not set → all emails silently skipped
Every `api/*.js` email file checks `if (!process.env.RESEND_API_KEY)` and returns `{ ok: true, skipped: true }` without sending anything. This is correct graceful degradation BUT means zero emails are going out. Document what value this key needs to be set to in Vercel env vars.

### Bug 2: Supabase confirmation email broken
The QA agent confirmed: signing up with a real email returns "Error sending confirmation email." Steps to diagnose:
1. Check Supabase Dashboard → Authentication → Settings → SMTP
2. Check if custom SMTP is configured or if Supabase is using its default sender
3. Check if the sender domain `getstudyedge.com` has SPF/DKIM records
4. Check Resend dashboard for any failed sends or domain verification issues

### Bug 3: All email templates are dark-themed
Every HTML email uses `background: #080D1A` and `color: #F1F5F9` — a dark design that doesn't match the light StudyEdge brand. Rewrite all HTML templates to match:
- Background: `#F7F6F3` (page) / `#FFFFFF` (card)
- Text: `#111111` (primary) / `#6B6B6B` (muted)
- Accent: `#3B61C4`
- Font: system-ui or Inter
- Clean, light, editorial — not dark SaaS

---

## Email Sequence Audit

### Current Sequence (what should exist)
| Trigger | File | Status |
|---|---|---|
| Signup | welcome-email.js | Broken (no API key) |
| +24h | day1-tips.js | Broken (no API key) |
| +7 days | day7-milestone.js | Broken (no API key) |
| +14 days | day14-upgrade.js | Broken (no API key) |
| Weekly | weekly-digest.js | Broken (no API key) |
| Exam approaching | exam-countdown.js | Broken (no API key) |
| Behind on prep | exam-rescue.js | Broken (no API key) |
| Night before exam | exam-tomorrow.js | Broken (no API key) |
| Inactive user | re-engage.js | Broken (no API key) |

### What's Missing (Should Be Added)
1. **Post-onboarding email** — fires after onboarding completes, shows them what was just set up and what to do first
2. **First plan generated** — "Your first StudyEdge plan is ready" with a link back to the app
3. **Streak broken** — "You missed a study day — here's how to catch up" (requires streak tracking in DB)

---

## Deliverability Checklist

Check and fix each item:

**DNS Records for getstudyedge.com**
- [ ] SPF record: `v=spf1 include:amazonses.com include:_spf.resend.com ~all` (or equivalent for Resend)
- [ ] DKIM: Resend requires adding a TXT record — check Resend dashboard → Domains → getstudyedge.com
- [ ] DMARC: `v=DMARC1; p=none; rua=mailto:support@getstudyedge.com`

**Resend Config**
- [ ] Domain `getstudyedge.com` verified in Resend
- [ ] Sender `support@getstudyedge.com` is active
- [ ] Check sending limits on current Resend plan

**Supabase Auth Email**
- [ ] Auth → Settings → SMTP: either use Resend SMTP or verify default sender
- [ ] Auth → Email Templates: customize confirmation + reset templates to match brand

---

## Email Copy Guidelines

**Subject lines — rules:**
- Under 50 characters
- No ALL CAPS
- No clickbait — be specific
- Bad: "Don't miss out!!!" / Good: "Your Organic Chemistry plan is ready"

**Body copy — rules:**
- First line is the most important — make it count
- Be specific to what the student just did or needs to do
- One primary CTA per email — not three
- Sign off as "The StudyEdge AI team" not "Team StudyEdge" or no signature

**Tone:** Direct, like a smart study advisor. Not a startup. Not corporate. Not "Hey there!"

---

## What to Document in CONTEXT.md

After your run, add a section to CONTEXT.md with:
- Whether RESEND_API_KEY needs to be set and where (Vercel env vars)
- Whether Supabase confirmation email is fixed and how
- Which email templates were rewritten (light theme)
- DNS records status for deliverability
- Any emails that couldn't be fixed without API access
- Open questions for the developer

---

## Completion Checklist

- [ ] Diagnosed and documented root cause of signup confirmation failure
- [ ] All email HTML templates converted to light theme
- [ ] Documented exactly what env vars need to be set in Vercel and what values
- [ ] Deliverability DNS checklist completed
- [ ] welcome-email.js copy improved
- [ ] day1-tips.js copy improved
- [ ] CONTEXT.md updated
- [ ] All changes committed and pushed to main
