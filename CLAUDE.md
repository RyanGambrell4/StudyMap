# StudyEdge AI — Claude Code Context

**App:** StudyEdge AI | **URL:** getstudyedge.com | **Repo:** /Users/ryangambrell/Desktop/StudyMap

Read `AGENTS_SPEC.md` before running any agent task. It contains the full app context, quality rules, and shared conventions that every agent must follow.

---

## App Stack
- React + Vite SPA
- Supabase (auth + DB)
- Vercel (hosting + serverless functions in `api/`)
- Tailwind + inline styles
- Stripe (subscriptions)
- PostHog (analytics — `src/lib/analytics.js`)
- Resend (transactional email)
- Loops.so (marketing automation)

## Design System (non-negotiable)
- bg `#F7F6F3`, card `#FFFFFF`, border `rgba(0,0,0,0.07)`, accent `#3B61C4`, text `#111111`, muted `#6B6B6B`
- **Light theme only.** Any `dark:` Tailwind class is a bug.
- No emojis in UI. No em dashes in copy.
- Push to `main` = Vercel auto-deploys to getstudyedge.com

## Pricing (live source of truth: `PRICING_SPEC.md`)
- Free / Pro / Unlimited tiers
- Pro: $2.99/wk · $9.99/mo · $69.99/yr — 3-day free trial via Stripe Checkout (card required, auto-bills $2.99/wk after)
- Unlimited: $4.99/wk · $14.99/mo · $119.99/yr — no trial
- `getActivePlan()` returns `'free' | 'trial' | 'pro' | 'unlimited'`

---

## Agents

### QA + Bug Hunter Agent
**Spec:** `AGENTS_SPEC.md` (Agent 1 section)
**What it does:** Walks every critical user flow with Playwright, fixes broken functionality, AI slop copy, dark-mode color leaks, and mobile layout breaks. Commits all fixes.
**Invocation:**
```
Run the StudyEdge QA agent. Read AGENTS_SPEC.md first. Use Playwright to walk through every critical flow. Fix bugs you find. Commit fixes. Send iMessage summary when done.
```

---

### SEO Agent
**Spec:** `AGENTS_SPEC.md` (Agent 2 section)
**What it does:** Builds SEO across 4 layers — technical SEO (sitemap, robots, meta, JSON-LD), static landing pages in `public/`, Astro blog at blog.getstudyedge.com, and monthly keyword intelligence.
**Invocation:**
```
Run the StudyEdge SEO agent. Read AGENTS_SPEC.md first. Execute all four SEO layers in order. Commit everything. Send iMessage summary when done.
```

---

### UI Consistency Agent
**Spec:** `AGENTS_SPEC.md` (Agent 3 section)
**What it does:** Extracts design tokens to `src/tokens.js`, purges all dark-mode leakage across every JSX file, then does a visual audit of every major view against the design system standard.
**Invocation:**
```
Run the StudyEdge UI consistency agent. Read AGENTS_SPEC.md first. Execute all three phases. Commit after each phase. Send iMessage summary when done.
```

---

### Email Agent
**Spec:** `EMAIL_AGENT_SPEC.md`
**What it does:** Fixes broken email delivery (RESEND_API_KEY not set = all emails are no-ops), rewrites all dark-themed email templates to match the light brand, audits deliverability (SPF/DKIM/DMARC), and improves the full lifecycle sequence.
**Key context:**
- All emails currently silently skip because `RESEND_API_KEY` is not set in Vercel env
- All HTML templates use a dark theme (`#080D1A` bg) — must be rewritten to light brand
- Supabase confirmation email is broken — check Supabase Dashboard → Auth → SMTP settings
**Invocation:**
```
Run the StudyEdge Email agent. Read EMAIL_AGENT_SPEC.md and AGENTS_SPEC.md first. Fix all broken email delivery, rewrite dark templates to light theme, audit deliverability. Commit all changes. Send iMessage summary when done.
```

---

### Landing Page Agent
**Spec:** `LANDING_AGENT_SPEC.md`
**What it does:** Continuously improves getstudyedge.com's landing page for conversion and visual quality. Audits the biggest weakness each run and implements it.
**Key context:**
- Landing page lives in `src/components/LandingPage.jsx`
- Landing page is INTENTIONALLY DARK (`#060614` bg) — do NOT convert to light theme
- This is the exception to the light-only rule — landing page dark theme is by design
- CTA `goTrial()` must always point to `/app?signup=1&plan=pro&billing=weekly&trial=1`
- Trial CTAs must NOT say "no credit card required" — the trial goes through Stripe Checkout and collects a card. Use "3-day free trial · Cancel anytime" instead.
**Invocation:**
```
Run the StudyEdge Landing Page agent. Read LANDING_AGENT_SPEC.md and AGENTS_SPEC.md first. Audit the current landing page, identify the highest-priority improvement, implement it fully, verify it builds, commit, push. Update CONTEXT.md when done.
```

---

### Onboarding Agent
**Spec:** `ONBOARDING_AGENT_SPEC.md`
**What it does:** Audits and optimizes the new-user funnel from signup through onboarding to first meaningful action. Fixes copy, reduces steps, improves post-onboarding landing, fixes the email confirmation wall.
**Key context:**
- ONBOARDING_AGENT_SPEC.md references old 7-day/$12.99 pricing — **ignore those numbers**
- Live pricing is in `PRICING_SPEC.md`: 3-day free trial, $2.99/wk Pro
- Onboarding files: `StepCourses.jsx`, `StepAssignments.jsx`, `StepLearningStyle.jsx`, `StepSchedule.jsx`, `AuthScreen.jsx`
- Known issues: no progress bar, blank dashboard after onboarding, generic copy, weak confirmation pending screen
**Invocation:**
```
Run the StudyEdge Onboarding agent. Read ONBOARDING_AGENT_SPEC.md, PRICING_SPEC.md, and AGENTS_SPEC.md first. Optimize the signup-to-first-action funnel. Commit all changes. Send iMessage summary when done.
```

---

### Paywall Agent
**Spec:** `PAYWALL_REDESIGN_SPEC.md` (design intent) + `PRICING_SPEC.md` (live pricing — use this)
**What it does:** Implements the full paywall system — feature gating, PaywallModal component, soft nudge locked states, trial flow, and PostHog tracking for every paywall event.
**Key context:**
- `PAYWALL_REDESIGN_SPEC.md` is HISTORICAL (written for old 7-day/$12.99 model) — use it for the UX design intent only
- `PRICING_SPEC.md` is the live source of truth for all prices, limits, and plan names
- Pro-only features (require paywall): AI Cheat Sheet, Exam Rescue, Practice Exam
- `onShowPaywall('pro')` is the hook to trigger the paywall modal
- Current `subscription.js` has `getActivePlan()`, `canUseAI()`, `canUseFeature()`, `incrementFeatureUsage()`
**Invocation:**
```
Run the StudyEdge Paywall agent. Read PAYWALL_REDESIGN_SPEC.md, PRICING_SPEC.md, and AGENTS_SPEC.md first. Implement the full paywall system per the spec. Use PRICING_SPEC.md for all prices and limits. Commit all changes. Send iMessage summary when done.
```

---

## Other Spec Files (reference, not agent invocations)
- `PRACTICE_EXAM_SPEC.md` — Practice Exam feature spec (already implemented)
- `STUDY_HACKS_SPEC.md` — Study Hacks feature spec
- `NAV_RESTRUCTURE_SPEC.md` — Nav restructure spec
- `HERO_IMAGE_SPEC.md` — Hero image spec
- `FREE_TRIAL_SPEC.md` — Free trial implementation spec
- `FEATURE_SPEC.md` — General feature spec
- `LANDING_REDESIGN_SPEC.md` — Landing redesign spec

---

## Shared Rules (All Agents)
1. Read `AGENTS_SPEC.md` + the relevant spec file before starting any work
2. Check `CONTEXT.md` for current app state and open issues
3. No em dashes in any copy or generated content
4. No AI slop — every user-facing string must sound like a real human wrote it
5. Commit atomically: `fix:`, `ux:`, `seo:`, `design:`, `content:` prefixes
6. Update `CONTEXT.md` at the end of every run
7. Never commit `.env` changes — document what env vars are needed
8. Never touch Stripe or Supabase schema without flagging it
