# StudyEdge AI — Onboarding & Paywall Optimization Agent Spec

## Read First — App Context

**App:** StudyEdge AI (`getstudyedge.com`)
**Stack:** React + Vite, Supabase auth + DB, Vercel serverless, Tailwind + inline styles
**Design system:** Light only. bg `#F7F6F3`, card `#FFFFFF`, border `rgba(0,0,0,0.07)`, accent `#3B61C4`, text `#111111`, muted `#6B6B6B`. No dark mode — `dark:` classes are bugs.
**Repo:** `/Users/ryangambrell/Desktop/StudyMap`

## What This Agent Does

You are a conversion and UX specialist. Your job is to audit the entire new-user funnel — from signup through onboarding to first meaningful action — and make it as frictionless, motivating, and conversion-optimized as possible. You have full authority to rewrite copy, restructure flows, remove steps, and redesign components. Commit everything. Push to main. Vercel will auto-deploy.

---

## Current Onboarding Architecture

### Files
```
src/components/StepCourses.jsx       (406 lines) — Step 1: Add courses + year
src/components/StepAssignments.jsx   (236 lines) — Step 2: Add assignments/exams
src/components/StepLearningStyle.jsx (127 lines) — Step 3: Learning style picker
src/components/StepSchedule.jsx      (144 lines) — Step 4: Weekly availability
src/components/AuthScreen.jsx        — Signup/login, confirmation pending screen
```

### Current Flow
1. User signs up (email + password or Google OAuth)
2. Email confirmation required before entering app
3. StepCourses — pick year of study, add courses (supports MCAT/LSAT/CPA/BAR/GRE/GMAT presets + custom courses)
4. StepAssignments — add exams/assignments per course with dates and weights
5. StepLearningStyle — pick preferred learning style (visual, reading, practice, mixed)
6. StepSchedule — set weekly available study hours per day
7. → Lands on Dashboard

### Known Problems to Fix

**1. No progress indicator**
Users don't know how many steps remain. A simple "Step 2 of 4" or progress bar would reduce drop-off.

**2. Dashboard landing is a dead end**
After completing onboarding, users land on the Dashboard which is empty — no plan, no courses shown, no "what to do next." The first action after onboarding should be generating a study plan, not staring at a blank screen. Consider redirecting to Study Coach after onboarding completes, or triggering plan generation automatically.

**3. StepLearningStyle adds little value**
127 lines for a 3-option picker that doesn't visibly affect the product right now. Consider merging into another step or removing it entirely to reduce the 4-step flow to 3 steps.

**4. Copy is generic**
Current copy ("Add your courses", "Set your schedule") is functional but not motivating. Rewrite every heading and subtext to be outcome-focused and specific to what the user is about to gain.

**5. No momentum / celebration at the end**
The onboarding ends with a fade to dashboard. There should be a "You're set up — here's your first plan" moment that makes the user feel like the AI is already working for them.

**6. Email confirmation wall**
Users must confirm their email before entering the app. This is a drop-off point. Consider either: (a) letting users into onboarding before confirming email, confirming in the background, or (b) making the confirmation screen much more compelling with a countdown/refresh that auto-advances when confirmed.

**7. AuthScreen confirmation pending screen is weak**
After signup, the "Check your email" screen just says to click the link. It should: tell them what's waiting for them, show the value they're about to unlock, and have a working auto-refresh (poll for confirmed status every 5s and advance automatically).

---

## Paywall Context

### Files
```
src/components/AccountView.jsx    — Contains pricing/plan UI
src/components/DashboardView.jsx  — May show upgrade prompts
```

### Current Plans
- **Free:** 1 course, 10 AI queries/month
- **Pro:** 5 courses, 75 AI queries/month, AI Study Coach, Session Blueprints, Flashcards, Quizzes
- **Unlimited:** Everything in Pro, unlimited AI, unlimited courses

### Known Problems to Fix

**1. Paywall shows too early OR too late**
The paywall should fire at the highest-intent moment — when a user tries to use a Pro feature for the first time (e.g. generating a second course plan, using Study Coach, running Focus Mode). It should NOT fire on signup or on free plan features.

**2. Paywall copy doesn't sell the outcome**
"Upgrade to Pro" is weak. The paywall should say what the user is about to unlock in terms of their specific goal — e.g. "To build your Organic Chemistry study plan, you need Pro."

**3. Trial is not prominent enough**
There's a 7-day free trial available. This should be the primary CTA on every paywall surface — "Start free 7-day trial" — not "Upgrade." The trial removes the main objection (cost) and the word "free" dramatically increases conversion.

**4. No urgency or social proof on the paywall**
Add one line of social proof ("Join 30,000+ students") and a simple value stack ("Everything in one place. Cancel anytime.").

---

## Optimization Priorities (Do These In Order)

1. **Add progress bar** to all 4 onboarding steps (quick win, high impact)
2. **Rewrite all copy** — headings, subtext, button labels on every onboarding step
3. **Remove or merge StepLearningStyle** — reduce 4 steps to 3
4. **Fix post-onboarding landing** — redirect to Study Coach or trigger first plan generation
5. **Improve confirmation pending screen** — auto-poll every 5s, show value while waiting
6. **Audit paywall trigger points** — make sure it fires at the right moment, with trial CTA
7. **Rewrite paywall copy** — outcome-focused, trial-first, with social proof

---

## Copy Guidelines

**Tone:** Direct, confident, student-specific. No corporate language. No generic "Get started" or "Welcome."
**Good examples:**
- "Add your hardest course first — the AI will prioritize it automatically."
- "Tell us when you're free. We'll fill your week so you never fall behind."
- "You're 2 minutes from your first AI-generated study plan."
**Bad examples:**
- "Set up your account"
- "Configure your preferences"
- "Welcome to StudyEdge AI"

---

## Design Rules

- All backgrounds: `#F7F6F3`
- All cards: `#FFFFFF` with `border: 1px solid rgba(0,0,0,0.07)`
- Primary buttons: `#3B61C4` with white text, `border-radius: 12px`
- No gradients on buttons — flat fill only
- Progress bar: thin `#3B61C4` bar at top of each step card
- No emojis in headings

---

## After You're Done

1. Commit all changes with message `ux: onboarding + paywall conversion pass`
2. Push to main — Vercel auto-deploys
3. Update `CONTEXT.md` with: what you changed, what you skipped and why, any open questions
