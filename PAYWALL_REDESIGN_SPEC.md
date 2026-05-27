# Paywall Redesign Spec

> ⚠ **HISTORICAL — written under the old 7-day / $12.99 model.** Live pricing is now $2.99/wk Pro · 3-day trial. See `PRICING_SPEC.md` (PRICING_SPEC.md is the live source of truth) for current pricing.
_Derived from interview — 2026-05-20_

---

## 1. Mental Model: Three-Tier Access

| Tier | Name | Who it is | What they get |
|------|------|-----------|---------------|
| 0 | **Free** | All new users, non-converters | Full-breadth access, each key feature usable **once** (sample model). AI Tutor: 1 message/day. |
| 1 | **Pro Trial** | Free users who hit a gate and enter a card | Full Pro access for 7 days. Card charged automatically on day 8 unless cancelled. |
| 2 | **Pro** | Paying subscribers | Everything, unlimited. |

> The free tier is never explicitly marketed as a permanent product. All UX frames it as "start your free trial." The free tier is the floor users fall back to if they don't convert — not a destination.

---

## 2. Free Tier: "See It Once" Feature Quotas

Each major feature has a one-time sample on the free tier. Quotas tracked server-side in the existing **Supabase user profile row** as a compact JSON blob in `raw_user_meta_data`:

```json
{
  "feature_uses": {
    "ai_tutor_daily": 1,
    "coach_plan": 0,
    "focus_mode": 0,
    "grade_recovery": 0,
    "schedule_export": 0
  }
}
```

- `ai_tutor_daily`: resets at midnight (1 message/day). All other quotas are **lifetime** (1 use ever, no reset).
- Client reads from Supabase metadata on login. No additional DB tables required.
- Can be gamed by clearing browser state — acceptable. Gaming = high intent.

### Feature quotas

| Feature | Free allowance |
|---------|---------------|
| AI Tutor | 1 message/day |
| Coach Plan (build) | 1 lifetime build |
| Focus Mode session | 1 lifetime session |
| Grade Recovery | 1 lifetime view |
| Schedule Export | 0 (always gated, Pro-only) |
| Schedule viewing | Unlimited (core product) |
| Add courses | Up to 2 (not 1) |
| Manual session adds | Unlimited |

---

## 3. Paywall Gate Mechanics

### Soft nudge → hard gate escalation

Every gated feature follows this flow:

1. **First hit**: Contextual empty state (see §4). Strike count = 1.
2. **Second and third hits**: Same contextual empty state. Strike count increments.
3. **Fourth hit (3 dismissals)**: Hard paywall fires immediately — full-screen modal, no soft nudge step.

**Strike tracking**: stored per feature key in Supabase metadata alongside `feature_uses`. Structure:
```json
{
  "paywall_strikes": {
    "ai_tutor": 2,
    "coach_plan": 0,
    "focus_mode": 1
  }
}
```

**Strike reset**: strikes reset when the user completes a **meaningful action** — completing a study session, adding a course, or logging a grade. This signals renewed engagement and resets willingness to hear the pitch.

### Hard gate triggers (bypass soft nudge entirely)

The following trigger the hard paywall immediately on first attempt, with no soft nudge:

| Trigger | Rationale |
|---------|-----------|
| **Grade Recovery mode** | Highest emotional urgency — user is in academic distress. Most willing to pay. |
| **Adding a 3rd course** | 2 courses free, 3rd is Pro. Strong commitment signal. |
| **AI Tutor after daily limit** | AI has direct API cost. Beyond 1/day is a clear Pro value prop. |

---

## 4. Soft Nudge: Contextual Empty State

The "nudge" for gated features is **not a separate toast or banner** — it is the feature's content area itself, rendered in a locked state:

- **Blurred preview** of what the feature would show (mocked or real data at low opacity)
- **Lock icon** centered over the blur
- **Single upgrade CTA** below: `Start your free 7-day trial →`
- **Secondary text**: feature-specific one-liner about what they unlock (see §7 for copy)

This locked empty state is the same component whether showing the soft nudge OR the hard gate. The difference is:
- **Soft nudge**: includes a small `×` dismiss button in the corner
- **Hard gate (3rd strike)**: no dismiss button — the only exit is upgrading or navigating away

---

## 5. Hard Paywall Modal

Fires on 4th feature attempt or hard-gate triggers. Full-screen modal overlay.

### Visual hierarchy (top to bottom)

1. **Feature icon + name** — what they were trying to use (e.g. "🧠 AI Tutor")
2. **One-line value prop** — feature-specific (see §7 copy)
3. **"Start your free 7-day trial"** — primary CTA button (prominent, indigo)
4. **Plan pricing** — monthly ($12.99/mo) as default, semester ($39.99) as alternative
5. **"See what's included →"** — expandable feature diff accordion
6. **Fine print**: "Card required. Cancel anytime before day 7 and you won't be charged."

### Card entry

- Clicking "Start free trial" expands an **inline Stripe Elements form** inside the modal (no redirect)
- Card is charged automatically on day 8 if not cancelled
- On successful card entry: modal closes, feature unlocks immediately, trial counter starts

---

## 6. Trial Flow

### Starting
- User hits hard paywall modal → clicks "Start free 7-day trial" → Stripe Elements appears inline → card entered → trial begins immediately
- All Pro features unlock instantly

### During trial
- App shows **no in-app trial countdown** (silent)
- Dashboard shows a **dismissible banner**: `You're on a free trial — ${N} days left. Manage →`
- No nagging, no countdown urgency mechanics

### Ending
- **Day 7 (expiry)**: Stripe charges card. Email receipt sent. App continues without interruption. User is now Pro.
- **Cancel before day 7**: User stays on free tier. No charge. Immediate downgrade. All data preserved, Pro features re-gate.
- **No day-6/day-7 warning emails or in-app alerts** — user agreed at card entry, receipt is sufficient.

---

## 7. Paywall Copy by Trigger Context

All copy is **feature-focused** — about what unlocks, not about the user's personal situation.

| Trigger | Lock state headline | Modal value prop |
|---------|-------------------|-----------------|
| AI Tutor (quota hit) | "You've used today's free AI message" | "Unlimited AI Tutor sessions — ask anything, anytime." |
| Coach Plan | "Coach Plan is a Pro feature" | "Generate a personalized study plan built around your exam dates and struggle topics." |
| Focus Mode | "You've used your free Focus Mode session" | "Focus Mode with adaptive blueprints — get a session plan generated in real time." |
| Grade Recovery | "Grade Recovery is a Pro feature" | "Grade Recovery calculates exactly how many points you need and builds a rescue plan." |
| Adding 3rd course | "Multi-course planning is Pro" | "Manage all your courses, exams, and study sessions in one place." |
| Schedule export | "Export is a Pro feature" | "Export your schedule to Google Calendar, Apple Calendar, or PDF." |
| Post-session modal | "You completed a session" | "Unlock adaptive rescheduling — StudyMap adjusts your plan based on how each session went." |

---

## 8. Post-Session Upgrade Prompt (Free Users)

After completing a study session (recall scored, session marked done):

- A **full-screen modal** fires (same component as hard paywall)
- Hero: the Adaptation Engine feature icon
- Headline: "Nice work. Want StudyMap to adapt your plan based on how it went?"
- Value prop: lists what Pro's adaptation engine does (reschedules weak topics, adjusts difficulty)
- Primary CTA: "Start free trial"
- Secondary: "Not now" (dismisses, does NOT count as a paywall strike)

This modal fires **at most once per calendar day** to avoid spam on heavy study days.

---

## 9. Trial CTA Placement (Free Tier UI)

Beyond the paywall modal, the trial CTA appears in:

| Location | Form |
|----------|------|
| **Dashboard top banner** | Full-width dismissible banner: "Try StudyMap Pro free for 7 days →". Returns next session if dismissed. |
| **Feature empty states** | Embedded in the contextual locked state (see §4). |
| **Settings / Profile page** | Under "Plan": Shows "Free Plan" label with "Start free trial" button. This is the one place "Free Plan" is explicitly shown. |

The nav/sidebar does **not** show a persistent upgrade CTA — keeps the core experience clean.

### Free tier identity in UI
- During normal use: no "Free" label surfaced. Silent degradation via locked states.
- Settings page: explicitly shows "Free Plan" with upgrade option.
- Everything else frames the next step as "Start free trial" — the permanent free tier has no distinct product identity in the UX.

---

## 10. PostHog Analytics Events

All four event types tracked:

```js
// On every paywall appearance
posthog.capture('paywall_shown', {
  feature: 'ai_tutor' | 'coach_plan' | 'focus_mode' | 'grade_recovery' | 'export',
  trigger_type: 'soft_nudge' | 'hard_gate' | 'post_session',
  strike_count: 0 | 1 | 2 | 3,
  user_plan: 'free' | 'trial',
})

// When user enters card and trial activates
posthog.capture('trial_started', {
  card_entered: true,
  trigger_feature: 'ai_tutor', // what triggered the paywall
  days_since_signup: N,
})

// When user dismisses paywall without converting
posthog.capture('paywall_dismissed', {
  feature: 'ai_tutor',
  strike_count: N, // strike count at time of dismissal
  trigger_type: 'soft_nudge' | 'hard_gate',
})

// When trial card charges successfully (day 8)
posthog.capture('trial_converted', {
  days_used: 7,
  last_feature_used: 'ai_tutor', // last Pro feature used before conversion
  plan: 'monthly' | 'semester',
})
```

---

## 11. Implementation Checklist

### Backend / Data
- [ ] Add `feature_uses` and `paywall_strikes` JSON to Supabase user metadata schema
- [ ] API route: `POST /api/feature-use` — increments a feature use counter, returns updated quota state
- [ ] API route: `POST /api/trial-start` — creates Stripe subscription with trial period, saves `trial_start` to user metadata
- [ ] Stripe webhook: `invoice.paid` → mark user as Pro in Supabase; `customer.subscription.deleted` → downgrade to free
- [ ] Daily cron: reset `ai_tutor_daily` counter at midnight UTC

### Frontend / Subscription logic
- [ ] Update `subscription.js` — add `isTrial()`, `getFeatureUses()`, `hasHitQuota(feature)`, `getStrikeCount(feature)`, `incrementStrike(feature)`, `resetStrikes()`
- [ ] Build `<PaywallGate feature="...">` wrapper component — renders children if unlocked, locked empty state if not
- [ ] Build `<PaywallModal>` component — takes `feature` prop, shows contextual copy, embeds Stripe Elements
- [ ] Build `<LockedEmptyState>` component — blurred preview, lock icon, trial CTA, optional dismiss button
- [ ] Dashboard trial banner component
- [ ] Post-session upgrade modal (daily rate-limit logic in localStorage)
- [ ] Settings page: show Free Plan label + upgrade CTA

### Tracking
- [ ] Wrap all `onShowPaywall` calls with `posthog.capture('paywall_shown', ...)`
- [ ] Fire `paywall_dismissed` on modal close without conversion
- [ ] Fire `trial_started` on successful Stripe card entry
- [ ] Stripe webhook fires `trial_converted` event to PostHog via server

---

## 12. Out of Scope (Deliberate Decisions)

- **Semester plan is NOT the default** — monthly ($12.99) stays default. Lower upfront friction.
- **No in-app trial countdown** — silent charge, receipt email only. Minimizes cancel anxiety during trial.
- **No social proof in paywall modal** — copy is feature-focused, not testimonial-driven.
- **No referral or share mechanic** — out of scope for this iteration.
- **No family/team plans** — single-user product.
