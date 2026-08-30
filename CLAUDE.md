# StudyEdge AI — Claude Code Context

**App:** StudyEdge AI | **URL:** getstudyedge.com | **Repo:** /Users/ryangambrell/Desktop/StudyEdge AI/Web App

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

**Source of truth: `src/theme/tokens.js`** — import from there, never hard-code hexes in components.

**V2 tokens (current, ship going forward):**
- `bg` `#F7F8FA` · `card` `#FFFFFF` · `border` `rgba(0,0,0,0.07)`
- `text` `#1C1B18` · `muted` `#5C5952` · `dim` `#6E6B64`
- `blue` `#3452D9` (primary CTA) · `blueHov` `#2A43B8` · `blueBg` `rgba(52,82,217,0.08)`
- `red` `#D64545` (urgency, e.g. Exam Rescue) · `redBg` `rgba(214,69,69,0.08)`
- `neutral` `#696E78` · `neutralBg` `#EFF1F4` (segmented control track, chip background)
- `amber` `#8A6A2E` · `amberBg` `rgba(232,177,74,0.18)` · `green` `#10A56E` · `greenBg` `rgba(16,165,110,0.10)`
- Fonts: `SERIF` = `'Source Serif 4', Georgia, serif` (headlines only), `SANS` = `'Inter', system-ui, sans-serif` (everything else)
- `COURSE_COLORS`: 6-entry palette of `{dot, halo}` pairs; use `courseColor(idx)` to pick one deterministically per course

**Deprecated V1 tokens (still present in older component files, do NOT introduce in new code):**
- ~~bg `#F7F6F3` · accent `#3B61C4` · text `#111111` · muted `#6B6B6B`~~
- Older modals (QuickQuizBurst, BrainDumpModal, TeachItBackModal, etc.) still declare a local `D` object with the old palette. Do not port those values into new components. When touching an older modal for other reasons, migrate its local `D` object to import from `src/theme/tokens.js`.

**Rules:**
- **Light theme only.** Any `dark:` Tailwind class is a bug.
- No emojis in UI. No em dashes in copy.
- Push to `main` = Vercel auto-deploys to getstudyedge.com

**V2 redesign feature flags** (both default ON — set to `'0'` in `localStorage` to opt out):
- `se_dashboard_v2` → `DashboardViewV2` in the Dashboard section.
- `se_tools_v2` → `StudyToolsViewV2` in the Study Tools section.

## Pricing (live source of truth: this section + `src/lib/subscription.js`)

> `PRICING_SPEC.md` was labelled the live source of truth and was not: it
> described a no-card 3-day trial, 2 AI actions a day, and a 60-minute focus
> cap, none of which the code has ever done. Treat the code as authoritative
> and this section as its summary.
- Free / Pro / Unlimited tiers
- Pro: $9.99/mo · $69.99/yr — 7-day free trial via Stripe Checkout (card required, auto-bills $9.99/mo after)
- Unlimited: $14.99/mo · $119.99/yr — no trial
- **Weekly and semester are retired.** They are not sellable periods. `PRICE_IDS`
  in `api/stripe.js` deliberately omits them so no checkout can target one, and
  `resolveCheckoutPlan()` converts any request naming one to monthly rather than
  failing it — 85 files carried `billing=weekly` links, and old links must sell
  the current price rather than break.
- `getActivePlan()` returns `'free' | 'trial' | 'pro' | 'unlimited'`

**REVENUE-CRITICAL trial invariant.** The 7-day free trial is ALWAYS Pro/monthly.
`TRIAL_PLAN` and `TRIAL_BILLING_PERIOD` in `src/lib/subscription.js` are the only
source of truth — never pass a plan into `activateTrial()`, and never point a
trial CTA at Unlimited. Trial entitlements are `PRO_LIMITS` and `getActivePlan()`
reports `'pro'` while trialing, so billing the trial on Unlimited charges users
$4.99/wk for a tier they never had (this shipped once and was caught in
production). `src/lib/trialPlan.test.js` locks this down. Any trial copy change
must keep "Pro" and "$9.99/mo after 7 days" consistent across PrePaywall,
PaywallModal, DashboardView, AccountView, Onboarding, PaywallExitGift, AuthScreen
and the `index.html` landing page.

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
- Landing page lives in the root `index.html` (embedded React via Babel, ~2500 lines). `src/components/LandingPage.jsx` is legacy dead code — do NOT edit it and do NOT import it back into `App.jsx`.
- Landing page is INTENTIONALLY DARK (`#060614` bg) — do NOT convert to light theme
- This is the exception to the light-only rule — landing page dark theme is by design
- CTA `goTrial()` must always point to `/app?signup=1&plan=pro&billing=monthly&trial=1`
- Trial CTAs must NOT say "no credit card required" — the trial goes through Stripe Checkout and collects a card. Use "7-day free trial · Cancel anytime" instead.
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
- Live pricing: 7-day free trial, $9.99/mo Pro
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

## Patterns to watch

### Two ID shapes, one tolerant reader

The most expensive bug found in this codebase so far: the same logical value was
stored in two different shapes, and only *some* readers knew it.

`plan.courses[].id` is an opaque string (`mtayo3uplg2`), but every session the
scheduler writes stores `courseId` as the course's **array index** — a number.
Verified 2026-08-28: of 861 sessions across all 35 users who have any, 861 carry
a number and none carry the id. `classifyCourseRow` in `courseContext.js` knew
this and handled both. `loadUserAndCourse`, three hundred lines up the same file,
did a strict `String(c.id) === String(courseId)` and could therefore never
resolve a session-launched request. Every AI tool opened from inside a focus
session failed, for every user, silently, for months. It surfaced only because
the one paying customer used it hard enough to generate 31 errors in thirteen
minutes.

**What made it invisible:** it failed as a clean, plausible error message
(`course 3 not found for user ...`) that reads like bad input rather than a
broken lookup, and the affected path had no alerting.

When you find a value stored in two shapes:

1. **Grep for every reader before fixing one.** A tolerant reader next to a
   strict one is the signature — if one place handles both shapes, assume the
   others should and check.
2. **Put the tolerance in one function**, and make the precedence explicit (here:
   opaque id wins, index is a fallback, so a course whose id is literally `"3"`
   is not shadowed by index 3).
3. **Fix the reader before the writer.** Correcting the writer leaves all
   existing rows broken and needs a migration; a tolerant reader repairs history
   at once and buys time to fix the writer properly.
4. **Related smell:** a column that does not exist. Sixteen lifecycle endpoints
   selected `user_data.courses`; courses live at `plan->courses`. supabase-js
   returns `{data: null, error}` rather than throwing, so the whole endpoint
   degraded to "skip every user" instead of failing loudly.

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
