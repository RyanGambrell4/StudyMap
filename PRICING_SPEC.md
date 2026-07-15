# Pricing Redesign Spec

## Overview

Four tiers: Free, Pro, Unlimited. Pro and Unlimited each have three billing periods (Weekly / Monthly / Annual). Weekly is the primary offer — lowest friction, "less than a coffee" positioning.

---

## Pricing Table

| Tier       | Weekly      | Monthly      | Annual         | Notes                          |
|------------|-------------|--------------|----------------|--------------------------------|
| Free       | —           | —            | —              | Always available               |
| Pro        | $2.99/week  | $9.99/month  | $69.99/year    | 7-day free trial (no card)     |
| Unlimited  | $4.99/week  | $14.99/month | $119.99/year   | No trial                       |

**Savings framing:**
- Pro Monthly vs Weekly: "Save 17%" (~$3.33/week equivalent)
- Pro Annual vs Weekly: "Save 55%" (~$1.35/week equivalent)
- Unlimited Monthly vs Weekly: "Save 25%" (~$3.75/week equivalent)
- Unlimited Annual vs Weekly: "Save 53%" (~$2.31/week equivalent)

---

## Plan Limits

### Free
- 1 course
- 2 AI Tutor actions/day
- 1 Coach Plan ever (total)
- 1 Practice Exam ever (total)
- 2 Brain Dumps/week
- 2 Quiz Bursts/week
- 2 Exam Rescues/week
- 2 flashcard decks, 20 cards/deck
- 60 min Focus Mode/day
- No trial

### Pro
- 5 courses
- **100 AI actions/month** (across all AI features)
- Unlimited Focus Mode
- Unlimited flashcard decks and cards
- All features except Unlimited-only (see below)
- **7-day free trial via Stripe Checkout (card required, auto-bills $2.99/wk after unless canceled)**
- Billed weekly / monthly / annual depending on chosen period

### Unlimited
- **Unlimited courses**
- **Unlimited AI actions** (no monthly cap)
- Everything in Pro, plus:
  - **AI Tutor with session memory** — tutor retains context of the full conversation within a session for richer, non-repetitive responses
  - **Advanced Practice Exam Analytics** — score trend graphs across all exams per course + AI-predicted real exam score with confidence range
- No trial — pay to start

---

## Trial

- **Duration: 7 days
- **Credit card:** Not required
- **Applies to:** Pro only (all three billing periods)
- **Rationale:** Creates urgency. At $2.99/week, hitting the paywall after 3 days is a low-friction upgrade decision.
- **Implementation:** `trial_activated` flag in subscription, `trial_start_date`, expires after 168 hours (7 days). Already built — just duration constant: 7 days.

---

## Landing Page — Pricing Section

### Layout
3 cards: **Free | Pro | Unlimited**

Each card has a **Weekly / Monthly / Annual** billing toggle. Default: Weekly selected.

```
┌─────────────────────┐  ┌──────────────────────────┐  ┌─────────────────────┐
│ Free                │  │ Pro          ← FEATURED   │  │ Unlimited           │
│                     │  │                           │  │                     │
│ Get started         │  │ [Weekly][Monthly][Annual] │  │ [Weekly][Monthly]   │
│                     │  │                           │  │ [Annual]            │
│ $0 forever          │  │ $2.99/week                │  │ $4.99/week          │
│                     │  │ ← default shown           │  │                     │
│ • 1 course          │  │                           │  │ Everything in Pro + │
│ • Limited AI        │  │ 7-day free trial          │  │ • Unlimited AI      │
│ • Basic features    │  │ Card required, cancel any │  │ • Tutor memory      │
│                     │  │                           │  │ • Exam analytics    │
│ [Get started free]  │  │ [Start free trial →]      │  │ [Get Unlimited →]   │
└─────────────────────┘  └──────────────────────────┘  └─────────────────────┘
```

- Pro card is center, slightly larger/elevated with "Most Popular" badge
- Annual option on Pro shows "Save 55%" badge
- Annual option on Unlimited shows "Save 53%" badge
- Free card is visually de-emphasized — smaller, no shadow
- Below cards: "Already a member? Sign in"

### Billing toggle behavior
- Switching weekly/monthly/annual updates the price shown in all 3 cards simultaneously
- The savings % badge appears on annual option only
- Default is **Weekly** — lowest number displayed, best for conversion

---

## Paywall Modal

### Default state
- Opens showing **Pro Weekly ($2.99/week)** highlighted
- Billing toggle at top: Weekly | Monthly | Annual
- Headline: **"Unlock everything for less than a coffee"**
- Subheadline: **"$2.99/week · Cancel anytime"**

### Context-aware behavior
- If user hits an **Unlimited-only feature** (advanced analytics, tutor memory): show Unlimited card highlighted with "This feature requires Unlimited" note
- Otherwise: show Pro Weekly as default

### Tone
Value-focused, not guilt-based. Lead with price, not with what they're missing.

```
┌──────────────────────────────────────────────┐
│  Unlock everything for less than a coffee    │
│  $2.99/week · Cancel anytime                 │
│                                              │
│  [Weekly ●] [Monthly] [Annual]               │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │  Pro — $2.99/week                   │     │
│  │  7-day free trial · card required   │     │
│  │  [Start free trial]                 │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  Or go Unlimited for $4.99/week →            │
│                                              │
│  [Maybe later]                               │
└──────────────────────────────────────────────┘
```

---

## Stripe Configuration

### New products to create
| Product          | Price ID (to create)         | Amount     | Interval |
|------------------|------------------------------|------------|----------|
| Pro Weekly       | price_pro_weekly             | $2.99      | week     |
| Pro Monthly      | price_pro_monthly            | $9.99      | month    |
| Pro Annual       | price_pro_annual             | $69.99     | year     |
| Unlimited Weekly | price_unlimited_weekly       | $4.99      | week     |
| Unlimited Monthly| price_unlimited_monthly      | $14.99     | month    |
| Unlimited Annual | price_unlimited_annual       | $119.99    | year     |

### Existing products
- Keep existing `unlimited` plan as-is for any current subscribers (grandfather)
- Archive old `pro monthly` Stripe product — no new signups go there
- New signups always go to new price IDs

### Plan resolution in code
`getActivePlan()` currently returns `'free' | 'pro' | 'unlimited'`. This stays the same — weekly/monthly/annual are just billing periods, not separate plan tiers. The plan tier determines feature access; billing period determines price.

---

## Code Changes Required

### `src/lib/subscription.js`
- Update `PRO_LIMITS.aiActions` from 75 to 100/month
- Add `UNLIMITED_LIMITS` object (separate from `PRO_LIMITS`):
  - `aiActions: Infinity`
  - `courses: Infinity`
  - `practiceExamAnalytics: true`
  - `tutorMemory: true`
- Update trial duration constant: `7 * 24 * 60 * 60 * 1000` → `3 * 24 * 60 * 60 * 1000`
- Add `canUseUnlimitedFeature(featureName)` helper

### `api/stripe.js`
- Accept `billingPeriod: 'weekly' | 'monthly' | 'yearly'`
- Map plan + billingPeriod to correct Stripe price ID
- Weekly billing = `interval: 'week'` in Stripe

### `src/components/PaywallModal.jsx`
- Add billing period toggle (Weekly/Monthly/Annual)
- Default to Weekly for Pro
- Context-aware: if trigger is an Unlimited feature, highlight Unlimited card
- New copy: "Unlock everything for less than a coffee"

### `src/components/LandingPage.jsx`
- Pricing section: 3 cards with shared billing toggle
- Pro card centered, "Most Popular" badge
- Annual shows savings % badge
- Free card de-emphasized

### `src/components/PracticeExamResults.jsx` (Unlimited analytics)
- For Unlimited users: show score trend graph (pull from `getCachedPracticeExams`)
- Show AI-predicted exam score (requires new API endpoint or client-side calculation)
- For Pro/Free: show basic results only, with "Unlock advanced analytics" upsell

---

## Unlimited-Only Features Summary

| Feature                        | Where enforced                          |
|--------------------------------|-----------------------------------------|
| Unlimited AI actions           | `verifyAndCheckAiUsage` in server usage |
| AI Tutor session memory        | `TutorView.jsx` — inject full session history for Unlimited users |
| Score trend graphs             | `PracticeExamResults.jsx` — gated by `getActivePlan() === 'unlimited'` |
| Predicted exam score           | `PracticeExamResults.jsx` — same gate   |

---

## Out of Scope (this sprint)

- Pause subscription UI (future)
- Referral/discount codes
- Student verification discount (future)
- Family/group plans
