# StudyEdge AI — Free Trial & Paywall Redesign Spec
_Derived from product interview — May 21, 2026_

---

## 1. Core Model Overview

Three states a user can be in:

| State | Description |
|-------|-------------|
| **Free (permanent)** | Default after signup. 1 course, capped usage of every feature. Never expires. |
| **Trial (7 days)** | Full Pro access. Starts when user explicitly presses "Start Free Trial." No card required. One-time use per account. |
| **Pro (paid)** | 5 courses, 75 AI actions/month, everything else unlimited. |

Key principle: **every feature is accessible on free — nothing is fully locked.** Caps exist to give users a taste of each feature and drive upgrade, not to wall off sections of the app.

---

## 2. Free Tier — Feature Caps

| Feature | Free Cap | Reset Period |
|---------|----------|--------------|
| Courses | 1 course | — (hard limit) |
| AI Tutor | 2 messages/day | Daily (midnight) |
| Session Blueprint | 1/day | Daily (midnight) |
| Coach Plan | 1 plan total (view forever, can't regenerate) | Never resets |
| Focus Mode | 1 hour/day | Daily (midnight) |
| Brain Dump | 2 uses/week | Weekly (Monday) |
| Quiz Burst | 2 uses/week | Weekly (Monday) |
| Exam Rescue | 2 uses/week | Weekly (Monday) |
| Flashcards | 20 cards/deck, 2 decks max | — (hard limit) |
| Grade Tracker | Full access (naturally limited to 1 course) | — |
| Schedule/Calendar | Unlimited sessions (naturally limited to 1 course) | — |
| Syllabus import | Works for 1 course | — |

**Reasoning:** The 1-course cap is the primary forcing function. Everything else is capped just enough to feel the feature without depending on it. AI-heavy features (tutor, blueprint, coach) have the tightest caps since they're most expensive to run and most differentiating.

---

## 3. Trial — Full Pro Access for 7 Days

### What the trial is
- **Full Pro**: 5 courses, 75 AI actions/month, all features uncapped
- **Duration**: 7 calendar days from activation
- **No credit card required**
- **One use per account, enforced server-side (Supabase)**

### When the trial clock starts
- Starts **only when the user explicitly presses "Start Free Trial"**
- Not at account creation, not at first login — the user opts in
- This means a user can sign up, add a course, explore the free tier, and choose to activate the trial when they're ready

### After trial expires
- Account drops to permanent free tier automatically
- No hard lock — they just lose the Pro caps and revert to free limits
- **Extra courses** (if they added more than 1 during trial): hidden from UI but preserved in the database. Upgrading to Pro immediately restores them with all data intact.

---

## 4. Pro Tier

| Feature | Pro Limit |
|---------|-----------|
| Courses | 5 |
| AI actions (shared pool: tutor, blueprint, coach, brain dump, quiz burst, exam rescue) | 75/month |
| Focus Mode | Unlimited |
| Flashcards | Unlimited cards, unlimited decks |
| Grade Tracker | All courses |
| Schedule | All courses, unlimited sessions |

**AI Actions Pool:** All AI-powered features draw from a single 75/month pool. Resets on billing date. This is honest, published, and covers any real student's usage (75 AI actions/month = ~2.5/day every day).

---

## 5. Trial CTA Placement — All Four Surfaces

The "Start Free Trial" CTA appears in all of these locations simultaneously:

### 5a. Post-onboarding banner
- Immediately after onboarding completes, before they land on the dashboard
- Full-screen or prominent moment: "You've got 7 days of Pro — free. No card needed."
- Primary button: "Start My Free Trial" | Secondary: "I'll try the free plan first"
- If they skip, the trial is NOT started

### 5b. Cap hit — contextual
- When a free user hits any cap (e.g., used their daily Blueprint)
- Inline message below the feature: "You've used today's free Blueprint."
- If trial not yet used: **"Start your free 7-day trial to keep going →"**
- If trial already used: **"Upgrade to Pro to unlock more →"**
- NOT a blocking modal — inline, inside the feature, low pressure

### 5c. Persistent nav chip
- Small chip/badge in the nav: "Start Free Trial" (if trial unused) or "X days left" (if trial active)
- Tapping it opens a lightweight trial activation sheet
- Disappears after trial activates, replaced by countdown

### 5d. Dashboard card
- A card on the home dashboard (below Up Next) when trial is inactive
- Shows what's included: "7 days of unlimited AI, up to 5 courses, full coach plans"
- CTA: "Start Free Trial — No Card Needed"
- Dismissable but comes back next session until trial is activated

---

## 6. Trial Countdown UX

Once the trial is active:

### Progress bar in nav/header
- Shows days used vs days remaining (e.g., filled 3/7 bars)
- Color shifts: green (days 1-4) → amber (days 5-6) → red (day 7)
- Tapping it opens trial status sheet with usage summary and upgrade CTA

### Daily summary (end of each trial day)
- On next app open after a trial day passes, show a brief summary card on the dashboard:
  > "Yesterday you used 3 blueprints, 1 coach session, and chatted with your AI tutor 8 times. **4 days left in your trial.**"
- Upgrade CTA at the bottom of the card
- Dismissable

### Final day modal
- On day 7, when they open the app: "Your trial ends today." with a specific time
- Clear upgrade CTA with one-time post-trial offer teased: "Upgrade before midnight to lock in a special rate"

---

## 7. Post-Trial Upgrade — One-Time Offer

When the trial expires, before the user's next session in the app:
- Show a one-time upgrade offer modal (24-hour window)
- **First month 50% off** (or equivalent semester discount)
- Copy: "Your trial is over. Here's a thank-you offer: first month for $X. Offer expires in [countdown]."
- After the 24-hour window closes, full price applies — no re-triggering this offer

---

## 8. Abuse Prevention

- **Email verification required before trial can be activated**
  - User must confirm their email before the "Start Free Trial" button becomes active
  - Unverified users see: "Verify your email to unlock your free trial"
- **Trial state is Supabase-only (server-side)**
  - `trial_activated: boolean` — true once trial has ever been started
  - `trial_start_date: timestamp` — when it was activated
  - Clearing localStorage or using incognito cannot reset trial state
  - The only way to get a second trial is creating a new account with a new verified email

---

## 9. Paywall/Cap Message Copy Tone

**Aspirational — show what Pro unlocks**

Cap messages should NOT:
- Guilt the user ("You've run out of...")
- Be aggressive or alarming

Cap messages SHOULD:
- Show what Pro gives them specifically
- Feel like an invitation, not a wall

### Example cap messages

**AI Tutor (2/day used):**
> "You've used today's 2 free AI messages. Upgrade to Pro for 75 AI actions/month — ask anything, anytime."
> [Start Free Trial] or [Upgrade to Pro]

**Session Blueprint (1/day used):**
> "One free Blueprint per day. Pro gives you unlimited — a full plan for every single session."
> [Start Free Trial] or [Upgrade to Pro]

**Coach Plan (1 total used):**
> "You've built your one free coach plan. Pro lets you rebuild it anytime as exams shift and life happens."
> [Start Free Trial] or [Upgrade to Pro]

---

## 10. Supabase Data Model Changes

### `user_data` table additions:
```json
{
  "trial_activated": false,       // has the user ever started a trial?
  "trial_start_date": null,       // ISO timestamp when trial was activated
  "subscription": {
    "plan": "free",               // "free" | "pro"
    "status": "active",           // "active" | "trialing" | "expired"
    ...
  }
}
```

### Plan resolution logic:
```
if subscription.plan === 'pro' → Pro
else if trial_activated && now < trial_start_date + 7 days → Trial (Pro)
else → Free
```

### Course visibility logic (post-trial):
```
if plan === 'free' → show only courses[0] (or whichever is marked primary)
extra courses: preserved in DB, hidden in UI, restored on upgrade
```

---

## 11. `subscription.js` Changes Required

### New constants:
```js
FREE_LIMITS = {
  courses: 1,
  aiTutor: { count: 2, period: 'day' },
  blueprint: { count: 1, period: 'day' },
  coachPlan: { count: 1, period: 'total' },
  focusMode: { minutes: 60, period: 'day' },
  brainDump: { count: 2, period: 'week' },
  quizBurst: { count: 2, period: 'week' },
  examRescue: { count: 2, period: 'week' },
  flashcardDecks: 2,
  flashcardCardsPerDeck: 20,
}

TRIAL_LIMITS = PRO_LIMITS  // trial = full Pro

PRO_LIMITS = {
  courses: 5,
  aiActions: { count: 75, period: 'month' },  // shared pool
  focusMode: Infinity,
  flashcardDecks: Infinity,
  flashcardCardsPerDeck: Infinity,
}
```

### New functions needed:
- `isTrialActive()` — checks trial_activated + trial_start_date + 7 days
- `hasUsedTrial()` — returns trial_activated boolean
- `getTrialDaysRemaining()` — returns 0–7
- `canUseFeature(featureName)` — returns { allowed: bool, remaining: number, resetIn: string }
- `incrementFeatureUsage(featureName)` — writes usage to Supabase metadata

---

## 12. UI Changes Required

### Components to update:
- `PaywallModal.jsx` — new cap messages per feature, trial vs upgrade CTA logic
- `AppShell.jsx` — nav trial chip, progress bar, trial countdown
- `DashboardView.jsx` — trial CTA card, daily summary card
- `Onboarding.jsx` — post-onboarding trial offer screen
- `AIChatView.jsx` — 2/day cap with trial/upgrade CTA
- `StudyCoachView.jsx` — 1 total coach plan cap
- `FocusModeView.jsx` — 60 min/day cap with timer tracking
- `BrainDumpModal.jsx` — 2/week cap
- `QuizBurstModal.jsx` — 2/week cap
- `ExamRescueModal.jsx` — 2/week cap
- `OutputView.jsx` — course visibility filtering (hide extra courses on free)
- `AccountView.jsx` — show plan status, trial CTA if unused, trial countdown if active

---

## 13. Implementation Checklist

- [ ] Add trial fields to Supabase `user_data` schema
- [ ] Update `subscription.js` with new limit constants and helper functions
- [ ] Implement feature usage tracking per feature in Supabase metadata
- [ ] Update email verification gate: trial button disabled until verified
- [ ] Add "Start Free Trial" button/flow (activates trial, writes trial_start_date)
- [ ] Trial progress bar in AppShell nav
- [ ] Daily summary card on Dashboard (shown on next open after trial day passes)
- [ ] Post-onboarding trial offer screen
- [ ] Update all feature components with new cap logic and messaging
- [ ] Course visibility filtering in OutputView (free = courses[0] only)
- [ ] Post-trial 24h discount offer modal
- [ ] Landing page + pricing page copy updates (no-card trial messaging)
- [ ] Update AccountView with trial status, days remaining, upgrade CTA
