# StudyEdge AI — Hard Paywall Spec

Status: approved, ready to build
Date: 2026-08-28
Amended: 2026-08-28, after a code audit found four claims in this document that were
wrong. Every amendment is marked **AMENDED** inline. Where this file and an older spec
disagree, this file wins.
Supersedes: the free-tier sections of PRICING_SPEC.md and FREE_TRIAL_SPEC.md, both of
which currently disagree with the code.

Repo of record: `~/Projects/StudyMapLocal`. The Desktop checkout at
`~/Desktop/StudyEdgeAI/Web App` is stale (stuck at 594c862) and must not be worked in.

Companion mockup: `paywall-mockup.html` in this folder. Open it in a browser. The
markup and CSS are production-usable, lift them directly.

---

## 0. The principle

**Free gets the commodity tools. Paid gets the system.**

Flashcards and a focus timer are things Quizlet and Forest already give away, so gating
them wins nothing and leaves a dead account between resets. The semester plan, grade
trajectory, tutor memory and knowledge map are what no competitor has, and critically
they **compound**.

That is also the entire answer to throwaway accounts. A new account starts at zero, so
months of accumulated understanding cannot be farmed by signing up again. We are not
adding email verification or device fingerprinting. The defense is that starting over is
genuinely expensive.

---

## 1. Tiers

Pro is the basic paid tier and gets the whole system. **AMENDED:** Unlimited removes
every cap **and adds podcast mode**. Podcast generation is genuinely expensive per run,
and if Unlimited were nothing but higher caps nobody would ever upgrade to it. It stays
Unlimited-only and stays enforced where it already is, at `api/generate-podcast.js:42`.
Weekly billing is deleted entirely.

| Capability | Free | Pro $9.99/mo | Unlimited $14.99/mo |
|---|---|---|---|
| Syllabus upload and parsing | Yes | Yes | Yes |
| Courses | 1 | 5 | Unlimited |
| Flashcards | Full | Full | Full |
| Focus Mode | Full | Full | Full |
| Quiz Burst | From the AI pool | Unlimited | Unlimited |
| Brain Dump | From the AI pool | Unlimited | Unlimited |
| AI tutor chat | From the AI pool, 1 action per message | Unlimited | Unlimited |
| AI actions | 5 in first 7 days, then 3 / week | 100 / month | Unlimited |
| Session Blueprints | Week 1 only, rest blurred | All | All |
| **Semester planner** | Blurred | Full | Full |
| **Grade Hub and predicted scores** | Locked, real data blurred | Full | Full |
| **Tutor memory** | No | Yes | Yes |
| **Knowledge map** | Blurred | Full | Full |
| Practice exams | 1 total, results blurred | Unlimited | Unlimited |
| **Exam history and mastery** | Blurred | Full | Full |
| Podcast generator | No | No | Yes |

### AMENDED. Two of these are ungated, not four

The original text claimed all four bold rows were ungated. A code audit on 2026-08-28
found that wrong. The accurate position:

- **Semester planner — ungated, in every layer.** `SemesterView.jsx` has zero plan
  checks, and `api/semester.js`, `api/semester-course.js` and `api/semester-artifact.js`
  are `verifyAuth` only. `AccountView.jsx:23` already advertises it as a Pro benefit
  while giving it away.
- **Knowledge map — ungated.** `MasteryMapView.jsx` has zero plan checks.
- **Grade Hub — ALREADY GATED.** `GradeHubView.jsx:1592` returns `<LockedState>` for any
  free user, with a dedicated locked screen at `:186` and a paywall trigger at `:245`.
- **Exam history and mastery — partly gated.** `PracticeExamResults.jsx:409` already
  gates the advanced analytics to Unlimited.

**Grade Hub's entitlement does not change.** Free stays hard-locked, and branch 6 adds
the server-side half it is missing. What changes is only what the lock *shows*: the
generic `LockedState` at `GradeHubView.jsx:186` is replaced with the student's real
grade data behind the blur, plus a count of what they cannot see. A generic lock screen
sells nothing; their own trajectory blurred out sells. Treat this as a UX change, not an
entitlement change, and do not loosen access while making it.

So the value shift is narrower than first written: two features to gate from scratch,
one to keep locked and re-skin, one already correct.

### Pricing changes

- **Delete weekly.** Archive `$2.99/wk` and `$4.99/wk` in Stripe (archive, do not
  delete, so existing subscribers are undisturbed). Remove from all UI.
- Pro: `$9.99/month`, `$69.99/year`. Unlimited: `$14.99/month`, `$119.99/year`.
  Prices unchanged.
- **The 7-day trial converts to Pro monthly.** It currently converts to weekly. This is
  a live bug and it is visible in the Stripe history: our one real customer paid $2.99
  once, then declined three times in two minutes.
- No trial on yearly. No trial on Unlimited. Unlimited is always paid.

---

## 2. Where the wall sits

The rule: **they must watch the thing generate before it locks.** A wall placed in front
of value kills activation, and 59% of signups already die inside onboarding.

### First-run sequence

1. Sign up, upload one syllabus, watch it parse into real courses and real exam dates.
2. **The full plan generates on screen, visibly, in real time.** Every week, every
   session, real titles from their real course. Do not shortcut this with a spinner.
   The generation is the sales pitch.
3. On completion, week one stays sharp and usable. **Weeks two onward progressively
   blur**, session titles still faintly legible.
4. A count sits over the blur: "14 more sessions built for BIO 201."
5. They can run week one from their AI pool. **AMENDED:** the pool is 5 actions in the
   first 7 days after signup, then 3 per week. The first week is deliberately
   front-loaded so a committed student can finish week one rather than stalling
   mid-session and going cold for six days.

**Target: a committed student hits the wall on day one**, having already seen a complete
plan for their real course.

### The blur

Real content, progressively blurred. Not a placeholder, not lorem, not a generic upsell
card. Their session titles, their exam dates, their course code, rendered and then
blurred with increasing radius down the page.

- CSS `filter: blur()` over genuinely rendered content with a gradient mask
- `user-select: none` and `aria-hidden` on the blurred region so screen readers and
  copy-paste do not leak it
- **The server must still be the thing that refuses to act on locked content.** The blur
  is presentation, never protection.
- **AMENDED, accepted trade.** Blurred content is genuinely present in the DOM. To blur
  a student's real session titles you must ship those titles to the browser, so
  `user-select:none` and `aria-hidden` stop copy-paste and screen readers but not
  devtools. This is accepted deliberately: the defense is compounding value, not
  secrecy, and the server still refuses to *generate* anything new.
- **AMENDED, hard constraint.** Only ever blur content that was already generated for
  that user. Never generate extra content for the sole purpose of blurring it. That
  would spend real model cost to build a thing the student cannot use.

### The locked state

Read-only, nothing deleted, ever. Applies identically to three populations, which is what
keeps the rules defensible:

- a free user who ran out
- a trial that ended or whose card failed
- a Pro subscriber who cancelled

All three land in the same strict free tier with **every piece of their data retained**
for whenever they come back.

---

## 3. The one paywall screen

See `paywall-mockup.html`. One screen, opened by every blurred region and every locked
control in the app.

### Rules

- **Two taps to Stripe.** Tap a blur or locked control, this opens with Pro monthly
  preselected. Tap the button, land on Stripe. The billing toggle is optional and does
  not count as a step.
- **One component everywhere.** Replaces `PaywallModal.jsx`, `PrePaywall.jsx`, the
  dashboard trial banner and the Account upgrade CTA. All 69 gate call sites resolve
  here. Delete the multi-step prepaywall, the trust interstitial, and the exit gift.
- **Pro is the black highlighted card, not Unlimited.** The highlighted card should be
  the one we most want them on. Pro is where the trial lives.
- **The subhead is live data.** Their real course code and real locked session count. If
  either cannot be computed, fall back to "Your full plan through finals" rather than
  rendering a placeholder.
- **Feature rows expand.** The circled `+` opens one line of plain explanation.
  Collapsed by default so the screen stays short on a phone.
- **Mobile. AMENDED, made explicit.** Below 768px: feature lists collapse by default,
  cards stack with Pro first, and the Pro card shows its price, its CTA and three
  features above the fold. Unlimited sits below the fold and is reached by scrolling.
  That is the correct trade, because Pro is where nearly everyone should land. Almost
  all traffic is students on phones, and a two-tap flow that needs a scroll between the
  two taps is not a two-tap flow.
- **No dismissal trickery.** A visible close. On close, ask one question: "What stopped
  you?" with a free-text box, captured to PostHog as `paywall_dismissed.stopped_reason`.

### Annual state

- Pro becomes `$69.99/yr`, badge "Save 42%". Unlimited becomes `$119.99/yr`, badge
  "Save 33%". Use the real percentages. "2 months free" does not match our maths and a
  student who checks is exactly the student who was going to buy.
- **The trial disappears on Annual.** Pro's button becomes "Get Pro" and the fine print
  becomes the real charge.

---

## 4. Making the walls real

Seven of eleven limits currently reset when a student presses reload, because the counter
is written by the browser and `user_data_guard_subscription_trg` silently reverts it.
Confirmed in production: **0 of 891 accounts have any `feature_usage` data.**

Every limit moves server-side, locks on hit, and resets weekly.

### One entitlement check

Build `lib/server/entitlements.js`:

```js
checkEntitlement(userId, capability) -> {
  allowed:   boolean,
  plan:      'free' | 'pro' | 'unlimited',
  remaining: number | null,
  resetsAt:  ISO8601 | null,
  reason:    'ok' | 'plan_required' | 'quota_exhausted'
}
```

- Reads the database row directly with the service key. Never the browser's cached state.
- Counters live in the `subscription` jsonb, written only server-side, which is what gets
  past the guard trigger.
- Every gated endpoint calls it before doing work and returns **402 with `reason` and
  `resetsAt`** so the client renders the right screen without guessing.

### Weekly reset, computed not scheduled

Follow the existing pattern in `usage.js`. Store `weeklyResetAt`; on each request compare
to now; if more than 7 days have passed, zero the counters and stamp fresh. Nothing runs
on a cron.

Weekly rather than monthly matters: a student who signs up 2 September and burns a
monthly allowance is dead until 1 October, which is the entire midterm run-up. Weekly
gives four conversion attempts a month and the account never goes cold.

### Two bugs to fix on the way

**AMENDED.** This section used to list three. The middle one, "stamp `firstGenerationAt`
before the quota check," has been deleted. `firstGenerationAt` means "an AI action
actually produced something" — `commitReservation()` at `usage.js:288` sets it on the
success path only, and it drives both `first_generation_succeeded` and the
`studyedge:first-win` event that schedules a paywall at `App.jsx:171`. Stamping it
before the quota check would record a 402 refusal as a success and fire a first-win
paywall off a failure. The 23 users it was meant to rescue are already freed by bug 1,
which removes the suppression gate outright.

1. **Paywall suppression.** `openPaywall()` at `App.jsx:143` returns early unless the
   user has a `firstGenerationAt` stamp, which only started being written 2026-08-25. It
   is suppressed for **875 of 891 accounts**. Remove the gate and backfill the stamp for
   the 180 accounts that have used AI.
2. **The dead upgrade link.** 16 lifecycle email endpoints point at `/app?upgrade=1`,
   including the nudge at 4-of-5 actions. `App.jsx:116` only recognises
   `plan=pro|unlimited`, so every one of those emails lands on a dashboard with no
   paywall. Make it open the new screen.

### Marketing links

Links carrying `?plan=...&billing=weekly` redirect straight into Stripe on app load.
**Keep that behaviour** for readers who are already sold, but repoint every one to Pro
monthly, since weekly is being deleted and those links currently target a price that
will not exist.

**AMENDED, wider than first counted.** The original text said 60 links across 52 static
pages. An audit found `billing=weekly` in **80 files**. Branch 3 must cover all of them,
explicitly including:

- the 52 static marketing pages in `public/`
- the three lifecycle email CTAs inside `api/stripe.js` at `:154`, `:387` and `:619`
- the hard-coded Stripe checkout copy at `api/stripe.js:1241` ("then $2.99/week"), which
  is shown on Stripe's own page and will otherwise state a price we no longer charge
- all five trial-billing sites: `src/lib/subscription.js:166`,
  `lib/server/trialPlan.js:18`, the forcing chokepoint `api/stripe.js:1121`, the copy at
  `:1241`, and `src/lib/trialPlan.test.js`, which asserts weekly and will fail the build
  until it is updated with the rest
- the live landing page is root `index.html`. **Skip `src/components/LandingPage.jsx`** —
  CLAUDE.md documents it as dead code and it is imported nowhere.

---

## 5. Migration

All 891 accounts at once. Paid users untouched.

- **Verify the exclusion before deploying. AMENDED: there is now a real person behind
  this.** User **`ab7de9ae-b5ad-475d-9693-a72b266e2a6a`** (`sub_1U99vfKCY4pCgrHv3gnF1dn7`,
  Unlimited monthly, active since 2026-08-27) is a live paying subscriber and the only
  one. Under the new tier Unlimited keeps everything, so nothing should change for them,
  but that must be **verified and written down before the migration deploys**, not
  assumed. Query every account with an active, trialing or past_due subscription and
  confirm in writing that none change tier.
- Free counters reset to zero on the new weekly cycle. The 23 currently locked out get a
  fresh allowance and, for the first time, a working paywall.
- **Nothing is deleted for anyone, ever.** Semester plans, grades, decks and exam history
  are retained regardless of tier.
- No advance warning email. The 30% offer is the message and it lands the same day.

---

## 6. The 30% campaign

Every active user, by email and in-app, on the day the new tier ships.

- **Stripe coupon, 30% off, `duration: once`**, applied automatically at checkout. No
  code to type, no field to mistype on a phone.
- Applies to Pro monthly and Unlimited monthly. Not to yearly, which is already
  discounted.
- **Real end date, promoted as a real date.** No countdown timer, no per-student clock.
- In-app: one dismissible banner. Tap opens the paywall screen with the discount already
  visible in the price.
- Email: one send, plain text, from Ryan's own address. Say the price, the date, nothing
  else.

Flow: see the notification, tap it, land on Stripe with 30% already applied.

---

## 7. Tracking

**AMENDED. The original diagnosis in this section was wrong.**

It claimed server-side capture "dropped every event since 2026-07-26" and asked for
response-status logging. Both were incorrect, and the truth is worse.

What production actually shows:

- `checkout_started` did **not** break on 2026-07-26. It was a client event
  (`$lib=web`) until 2026-07-27 and was then deliberately moved server-side;
  `src/lib/subscription.js:506` documents `checkout_button_clicked` replacing it.
- Server-side capture **works**. A server `checkout_started` landed 2026-08-20, along
  with three probe events on 2026-08-20 and 2026-08-21.
- `lib/server/posthog.js` **already does everything this section asked for**: it logs
  the HTTP status and body at `:135-145`, logs a falsy `distinctId` at `:108-112`, and
  classifies the key type via `posthogKeyKind()`. That hardening shipped 2026-08-20.

The real number, and the reason this matters:

> Since 27 July there have been **185 `checkout_button_clicked` from 126 distinct
> users** and **1 server-side `checkout_started`**. `checkout_error` also stopped
> firing after 2026-08-11.

That is not a broken gauge.

**AMENDED again, and half of it is now settled.** The 2026-08-27 purchase proves Stripe
sessions **are** being created and paid, at least sometimes: that customer reached
Stripe's hosted page four separate times, abandoned three, and completed the fourth. So
this is **not a total checkout outage**. It is a conversion problem, and possibly also a
tracking problem, and the two are separable:

- **Conversion.** 185 `checkout_button_clicked` from 126 distinct users, against a
  handful of completed payments. People are reaching Stripe and not finishing. The
  purchase timeline below is the best evidence we have about why, and abandonment on the
  Stripe page itself is now a first-class thing to instrument.
- **Tracking.** `checkout_started` fires server-side after the session exists, and has
  landed once since 27 July. Step 1's preview test still discriminates this half: click
  through to Stripe's page on production and check whether a server `checkout_started`
  appears. If it does not, the deployed function's `POSTHOG_API_KEY` is wrong; Vercel
  sensitive env vars cannot be read back, so this is the only way to tell.

**A correction to the suppression claim in section 4.** "Suppressed for 875 of 891
accounts" was a count of accounts lacking a `firstGenerationAt` stamp, not an observed
blocking rate, and it overstated the effect. Observed over 60 days:
`paywall_shown` fired **118 times for 64 distinct users**, while
`paywall_suppressed_no_win` fired **10 times for 4 users**. The 2026-08-27 customer saw
the paywall eight times without ever holding a stamp. So at least one paywall surface
bypasses `openPaywall()`'s gate. Bug 1 should still remove the gate, but branch 2 must
also establish **which** surfaces route through `openPaywall()` and which do not, because
the answer is currently not what the code reads like.

### Events

| Event | Properties |
|---|---|
| `wall_hit` | capability, plan, resetsAt, days_since_signup |
| `paywall_shown` | trigger, locked_count, course_code, days_to_exam |
| `plan_selected` | plan, billing_period, discount_applied |
| `checkout_started` | plan, billing_period, amount, discount_applied |
| `paywall_dismissed` | trigger, stopped_reason |
| `trial_started` / `trial_converted` / `trial_failed` | plan, failure_reason |

Funnel to watch daily: `wall_hit` → `paywall_shown` → `checkout_started` → payment in
Stripe. If the first step is large and the last is zero, the wall works and checkout does
not.

---

## 8. Build order

One branch each, reviewed and merged before the next.

1. **Verify the Stripe customer branch does not regress a now-proven path. No card, no
   spend.**

   **AMENDED twice.** This step originally read "prove checkout takes money... it has
   never been verified," and was then amended to buy Unlimited monthly. Both are
   obsolete: the path was proven by a real customer on 2026-08-27, one day before this
   spec was written.

   Evidence the whole chain works end to end:

   | Stage | Evidence |
   |---|---|
   | Charge settled | `ch_3U99vfKCY4pCgrHv1ZOCqpg9`, **$14.99 captured**, 2026-08-27 20:29 UTC |
   | Subscription created | `sub_1U99vfKCY4pCgrHv3gnF1dn7`, Unlimited monthly, status `active`, no trial |
   | Webhook fired and entitlement written | user `ab7de9ae-b5ad-475d-9693-a72b266e2a6a` reads `plan: unlimited, status: active, billingPeriod: monthly` |

   Buying it again proves nothing new. What is still unproven is that the Stripe customer
   branch does not **break** that path, since it changes checkout auth. So this step is
   now a free regression test: deploy the branch to a preview, click through to Stripe's
   own page, confirm it renders **$14.99 / month, StudyEdge Unlimited**, and **stop
   there**. Then repeat the stale-tab case — load the app, redeploy, and click upgrade in
   the still-open tab without reloading.

   On Radar: the blocked charges are **not** our checkout. Every one belongs to a single
   Ghanaian prepaid Visa on Unlimited weekly, and each is `description: "Subscription
   update"` — dunning retries on a `past_due` subscription, scored
   `highest_risk_level` by Stripe's default model. No custom rule is blocking new
   checkouts.
2. **Fix the two bugs and settle the analytics question.** Paywall suppression and the
   backfill, `?upgrade=1`, and confirming whether the deployed function's PostHog key
   works. Also commit this spec and its mockup into the repo, and fix `CLAUDE.md`, which
   names the wrong repo path and calls `PRICING_SPEC.md` the "live source of truth" when
   it is neither. All pure repairs, none depend on the new tier.
3. **Pricing collapse.** Archive weekly, remove from UI, repoint every `billing=weekly`
   site across the 80 files listed in section 4, fix the trial to convert to Pro monthly,
   reconcile `PRICING_SPEC.md` with the code.
4. **The entitlement layer.** `checkEntitlement()`, weekly reset, 402 responses, every
   gated endpoint calling it. No UI changes.
5. **The one paywall screen.** Build it, route all 69 call sites to it, delete PrePaywall
   and the trust interstitial and the exit gift.
6. **Blur and lock the compounding features. AMENDED:** gate the semester planner and
   the knowledge map from scratch, add the missing server-side half to Grade Hub while
   keeping its existing lock, and re-skin `GradeHubView.jsx:186` to show real blurred
   data instead of a generic locked screen. Exam analytics are already gated at
   `PracticeExamResults.jsx:409`. Server gate plus progressive blur throughout.
7. **Migration and campaign.** Reset free counters, verify paid exclusion, create the
   coupon, ship the banner and the email.

---

## 9. Risks

- **Activation collapses.** We already lose 59% inside onboarding and 83% before a course
  is added. A day-one wall could take the 17% who activate down further. **Watch
  `signup_completed` → `course_added` daily for the first week.** If it drops below 17%,
  the wall landed in front of the value instead of after it and must move.
- **Support load.** 891 accounts change rules the same day with no warning. Have a
  one-line reply written before deploying.
- **App stores. AMENDED, and this is an Android problem today, not a future iOS one.**
  The audit found `capacitor.config.json` sets `server.hostname: getstudyedge.com`, so
  the Capacitor shell loads **production**. We are already published on Google Play, and
  Google Play Billing carries the same digital-goods rule Apple does, so shipping a web
  checkout into that shell is a policy violation on a **live listing**. The repo is
  Android-only today: there is no `ios/` directory and no `@capacitor/ios` dependency.
  There is also **no platform detection anywhere in `src/`**, so the paywall currently
  cannot be hidden in a native shell at all.
  Required, and built before the paywall screen ships: a small `isNativeShell()` helper
  wrapping `Capacitor.isNativePlatform()` with a safe web fallback. When it returns true
  the paywall component renders a "Manage your plan at getstudyedge.com" panel instead of
  any price, plan or checkout control. No IAP, no StoreKit, no Play Billing. Free tier
  limits still apply inside the shell; only the purchase path is hidden.

---

## 10. Decisions already made, do not relitigate

| Question | Decision |
|---|---|
| App store billing | Web-only paywall. Native shells (Play today, iOS later) show no price, plan or purchase control, via `isNativeShell()`. Limits still apply. |
| Locked content | Read-only, blurred beyond week one. Never deleted. |
| Wall position | Mid-generation. Show the full plan, then lock. |
| Existing accounts | Reset all at once. Paid users excluded. |
| Trial | Keep card-required 7-day, Pro monthly only. |
| Multi-account abuse | No policing. Compounding paid value is the defense. |
| Marketing links | Stay direct to Stripe, repointed to Pro monthly. |
| Enforcement | All limits server-side. Lock on hit, weekly reset. |
| Reset cadence | Weekly, on one pool. 5 actions in the first 7 days after signup, then 3 per week. No second counter, no split of `canUseAI()`. |
| Free tools | Flashcards, Focus Mode, Quiz Burst, Brain Dump, syllabus upload. Tutor chat draws from the one AI pool at 1 action per message. |
| Pro vs Unlimited | Pro gets the whole system. Unlimited removes every cap and adds podcast mode. |
| Course cap | Free stays at 1. |
| After cancel | Strict free tier, data kept. |
| Exit offer | Delete the gift. Ask "what stopped you?" instead. |
| Discount | 30% off first month, auto-applied Stripe coupon, no code. |
