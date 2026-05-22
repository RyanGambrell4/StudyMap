# Study Hacks — Feature Spec

**Date:** 2026-05-17
**Goal:** Add short-term, instant-gratification features that give students quick wins before exams and convert free users under pressure. Framed as "studying smarter, not harder."

---

## Feature Cluster Name: Study Hacks

Single word entry points throughout the app. Works as noun and verb internally ("run a Hack", "Study Hacks tab"). Students will call it this naturally.

---

## Visual Identity

Same clean, clinical design language as the rest of the app. No gimmick aesthetic. The features earn their perception as "hacks" through speed and output quality, not through lightning bolt icons or neon. Same tokens: `#3B61C4` accent, `#F7F6F3` background, white cards, `rgba(0,0,0,0.07)` borders.

---

## Navigation

**Primary entry point:** Dashboard Quick Actions card (Study Hacks entries are added here — no new card). Dashboard-first discovery is the primary funnel.

**Secondary:** Study Tools hub houses all features in one place for students who go looking.

**Contextual:** Prep Blast from Focus Mode, Burst from quiz tab, readiness pills from course list.

No dedicated top-level nav tab. The Quick Actions card is the anchor.

---

## Core Conversion Mechanic

Show the number (score, status, first topic) for free. Lock the insight behind Pro. The number creates the need; the breakdown sells the upgrade.

**Upgrade moment:** Inline upgrade card overlaid on the blurred content. No navigation loss — they see pricing and upgrade without leaving the feature screen.

---

## AI Call Budget (Free Users)

Free users have a global AI call budget of **15 calls/month** across all Study Hacks features. Exceeding it surfaces an upgrade prompt. Pro users have no limit. Budget resets on the 1st of each month.

Cost management strategy: gate expensive features (full breakdown, Cheat Sheet, Rescue Plan) behind Pro so free users naturally make fewer calls. Use cheaper models for lightweight calls (Prep Blast, Brain Dump scoring) and reserve full-quality models for Cheat Sheet and Rescue Plan.

---

## AI Failure Handling

Students run these tools under deadline pressure. If an AI call fails:
1. Auto-retry twice with exponential backoff
2. Surface a clear error message with a "Try again" button — do not hide the failure
3. If retries fail, show cached/last-run result if one exists (with timestamp)

Never show a loading state indefinitely. Students need a fallback at high-stakes moments.

---

## Feature 1: AI Cheat Sheet

### What it does
In under 30 seconds, distills everything the student has in the app about a course into the 10 most likely exam topics. Feels like an insider study guide.

### Input sources (all four, priority order)
1. Uploaded syllabus and notes (most personalized)
2. Study session history + recall scores (reveals what they actually know vs. don't)
3. AI Study Coach plan focus areas and professor emphases
4. Free-text field: "Describe your exam topic in 1-2 sentences" (zero setup, works for any student)

Even at the free-text level, a sentence like "My bio exam covers cellular respiration and genetics" yields more targeted output than a Google query. Personalization is the differentiator even at the sentence level.

### Output format
- Numbered list of 10 topics in priority order
- Each topic: name + 1-sentence explanation of why it's likely + **two separate signals**:
  - **Exam Likelihood:** High / Medium (AI confidence this topic appears on the exam)
  - **Your Readiness:** Strong / Weak (derived from recall scores and session history for that topic)
- Estimated time to review each (rough heuristic, ~8 min, everyone understands it's approximate)
- Total review time estimate at the top

### Regenerate (Pro)
Second run uses a different prompt strategy: explicitly framed as an "alternative angle" — not a correction of the first run. Language: "Here's a different perspective on what to focus on." Caps at 2 regenerations per session to prevent slot-machine behavior.

### Paywall
- **Free:** First topic only, rest blurred with inline upgrade card overlaid
- **Pro:** Full list, regenerate (2x per session), export to PDF

### Entry points
- Dashboard: Quick Actions card with "Cheat Sheet" as an option
- Study Tools hub: dedicated Study Hacks section
- Pre-session prep blast (see Feature 5)

---

## Feature 2: Brain Dump Scorer

### What it does
Student does a timed brain dump of everything they know about a topic. AI scores their readiness with a specific percentage, a category breakdown, and a grade projection.

### Interaction model
- Course selector → topic field (pre-filled from coach plan if available)
- Adjustable timer: default 60 seconds, option to set 90s or 120s before starting
- Large countdown timer starts when they tap "Start"
- Single textarea: "Write everything you know about [topic]"
- Timer creates urgency that overrides perfectionism — they just write
- Early submit allowed at any time (no need to wait for timer to expire)
- On submit: animated score reveal

### Scoring
The AI scores density and conceptual coverage, not word count. Three precise sentences naming the right concepts score higher than ten vague ones. Scores are never rounded to 5s or 10s — specificity feels calculated.

**On gap naming without a syllabus:** The AI infers likely gaps from what wasn't mentioned. False positives are acceptable — if the AI names something the student already knows, reviewing it takes 20 seconds. If it names a real gap, they learn something. Both outcomes are positive. Gaps are surfaced as possibilities, not verdicts.

**Grade projections** include a standard disclaimer: "This is an AI estimate based on your brain dump, not a guarantee." Softer language ("trending toward C+ territory") is preferred over definitive claims.

### Output (all three layers)
1. **Specific readiness score** — never rounded to 5s or 10s (e.g., 67%, 83%, 71%)
2. **Category breakdown** — scored by: Concepts, Application, Detail, Connections. Each shown as X/10. AI maps its analysis to these four buckets approximately — close enough is good enough. Specific gaps named (e.g., "We didn't see protein synthesis mentioned — worth checking.")
3. **Grade projection + time estimate** — "67% readiness = trending toward C+ territory if you stop here. ~40 min of focused review to reach B+ range." Disclaimer included.

### Paywall
- **Free:** Score only (e.g., "Your readiness: 67%") + category names visible but scores blurred
- **Pro:** Full breakdown + grade projection + gap list + recommended topics to close the gap + inline upgrade card on the blurred content

### Entry points
- Dashboard Quick Actions card
- Study Tools hub
- Inside Focus Mode as a tab option

---

## Feature 3: Exam Rescue Plan

### What it does
Student inputs current grade + hours until exam → app outputs ranked topics to study + an hour-by-hour study schedule.

### Input chain
**Grade:**
1. **GradeHub first:** Auto-fills current grade if set up
2. **AI estimate:** "Based on your study patterns, you look like B- territory — does that feel right?" — derived from recall scores and session history. Soft language absorbs misses.
3. **Slider fallback:** F to A range if they reject the estimate or have no data

**Exam date/time:**
- Pulled from exam dates entered at onboarding (see Onboarding section below)
- Pulled from syllabus events if parsed
- Manual entry as fallback

**Hours available:**
- Calculated automatically from exam datetime minus current time — no manual input needed
- If exam time is unknown, show preset options: 1h, 2h, 3h, 4h, 6h, 8h+

### Output (two-step reveal — latency driven)
**Step 1 — Ranked topics (generates first, shown immediately):**
- Top 5 topics ranked by: (exam likelihood × current weakness score)
- Each topic: priority badge (Critical / Important / Nice to have), estimated time, 1-sentence why
- Pulls from syllabus, coach plan, recall data

**Step 2 — Hourly schedule (builds in background while student reviews Step 1):**
- Given hours available, builds a literal countdown plan
- e.g., "9:00–9:45pm: [Topic 1] — focus on [specific sub-concept]. 9:45–10:15pm: [Topic 2]..."
- 10-minute buffer before exam for review built in
- Exportable as a list

### Regenerate (Pro)
Same "alternative angle" strategy as Cheat Sheet. Explicitly framed as a second perspective, not a correction. Capped at 2 regenerations per session.

### Paywall
- **Free:** Top 1 topic + schedule for first hour only + inline upgrade card
- **Pro:** Full ranked list + complete schedule + regenerate

### Entry points
- Dashboard Quick Actions card (prominent)
- Pre-exam email notification (3 days before exam date)
- Study Tools hub

---

## Feature 4: Quick Quiz Burst

### What it does
5-question burst quiz on their weakest topics. Feels like a game. Done in under 3 minutes.

### Interaction model
1. **Timed — 10 seconds per question:** Countdown bar per question. Urgency makes it feel like a game.
2. **Streak counter:** Each correct answer builds a visible streak number. Wrong answer: downplay the reset visually — the streak number quietly returns to 0 without a dramatic animation. The streak is a dopamine mechanic on correct answers, not a punishment mechanic on wrong ones.
3. **Adaptive difficulty (pre-generated curve):** All 5 questions are generated in one AI call with an explicit difficulty arc: easy → medium → hard → hard → medium. The first question is a confidence builder. The last question pulls back slightly — ends on a note they can often get right.

### End screen
- Score out of 5 with grade projection
- Streak high score
- 2 weakest topics identified
- "Go again" / "Study these topics" CTA

**"Study these topics" action:** Opens the Cheat Sheet pre-scoped to the 2 identified weak topics. Cross-feature handoff that makes the ecosystem feel connected. If Cheat Sheet data isn't available (no course context), falls back to opening a focused brain dump on those topics.

### Differentiation from existing quiz tab
The existing quiz tab is for longer, self-paced review. Burst is the 3-minute game-mode experience. Different contexts, different use cases — they coexist. Burst is not a replacement.

### Paywall
- **Free:** 5 questions, **3 total Burst uses per month** across all courses. After 3, inline upgrade card.
- **Pro:** Unlimited, longer quiz modes (10/20 questions), custom topic targeting

### Entry points
- Dashboard Quick Actions card
- Inside Focus Mode (existing quiz tab enhanced with burst mode option)
- Study Tools hub

---

## Feature 5: Pre-Session Prep Blast

### What it does
Before a Focus Mode session starts, a 20-second "prep blast" screen shows AI-generated key points to prime the student's brain before studying.

### Content — context-weighted rotation
Three modes cycle based on context (not random, not round-robin — the system chooses the most relevant):
- **Weakness review:** "Last time you struggled with X, Y, Z. Focus on these today." Pulled from recall scores. Used when no exam is imminent.
- **Exam topics:** "3 topics most likely on your upcoming exam based on your syllabus." Used when an exam is within 7 days.
- **Focus question:** A single sharp question: "Can you explain the difference between X and Y from memory?" Used when they've been studying a specific topic consistently.

Selection logic:
- Exam within 7 days → Exam Topics mode
- Recent low recall scores → Weakness Review mode
- Default / no strong signal → Focus Question mode

Even if students tap through quickly without reading, peripheral exposure still has priming value. The feature earns attention over time, not per session.

### UX
- Appears as a card between "Start Session" tap and the actual timer
- Dismissable: "Got it, start session"
- Feels like a coach briefing, not a loading screen

### Paywall
- **Free:** Weakness review only
- **Pro:** All three modes + topic-specific targeting

---

## Feature 6: Course Readiness Status (Dashboard)

### What it does
A live readiness status per course on the dashboard, always visible. Students check it like a health stat.

### Four states
| Status | Color | Meaning |
|---|---|---|
| Strong | Green | Recall scores high, consistent study, exam not imminent |
| On Track | Blue | Normal pace, moderate recall, exam manageable |
| Needs Work | Amber | Low recall scores or gaps detected, exam approaching |
| At Risk | Red | Very low recall, exam within 7 days, low study time |

### Cold start state (new users)
On day 1 with no data, the pill shows a **prompt state** instead of a status:
- Label: "Run first check — 2 min"
- Tapping it opens the Brain Dump flow
- The pill becomes a status pill after their first Brain Dump is completed

### How it's computed
Weighted combination of:
- Average recall score (last 3 sessions for that course)
- Days since last study session
- Days until next exam
- Brain dump score (if run)

**Recalculation:** Client-side on every app open using cached scores and live date math. No server call needed for the computation — days-until-exam and days-since-session update automatically. Cache refreshes when the student completes a session or rates recall.

### UX
- Shown as a colored pill next to each course name on the dashboard
- Each pill has a **paired CTA** at the status level:
  - "Needs Work" → "Run Brain Dump →"
  - "At Risk" → "Run Rescue Plan →"
  - Tapping the pill itself goes to the course's Brain Dump Scorer
- The CTA means seeing "At Risk" never feels like a dead end — there's always a one-tap action

### Paywall
- **Free:** Status pill visible with paired CTA
- **Pro:** Tap the pill to see what's driving the status (score breakdown, specific factors) + recommended action detail

---

## Feature 7: Habit Loop (Three-Layer Retention)

### Layer 1 — Weekly Readiness Check (Sunday)
- Every Sunday, a push notification (email via Resend): "Run your weekly readiness check."
- Opens a **course carousel flow**: one Brain Dump per course, stepped through sequentially. Student moves through each course: Brain Dump → score → next course. ~2 min per course.
- The **4-week readiness trend graph** is delivered inside the **Sunday email digest** — one chart per course showing readiness score over the last 4 weeks.
- Turns panic-mode behavior into a weekly habit.

**Saturday/Sunday split:** The weekly digest (session recap, stats) sends Saturday. The readiness check prompt sends Sunday. Same-day collision avoided; distinct intent for each.

### Layer 2 — Always-Visible Dashboard Status
- Course readiness status pills (Feature 6) visible every time they open the app
- Each pill has a paired action CTA so red never feels helpless

### Layer 3 — Pre-Exam Email Notification
- 3 days before any exam date in their plan, automatic email via Resend:
  "Your [Biology] exam is in 3 days. Run your Exam Rescue Plan →"
- Deep links directly into Exam Rescue Plan pre-filled for that course

---

## Onboarding Addition

Exam dates must be entered at onboarding to power the Rescue Plan auto-fill and pre-exam notifications. Add **exam date entry** as an explicit onboarding step — don't rely solely on syllabus parsing for something this important. Prompt: "When are your exams this term? You can add more later."

---

## Push / Notification Infrastructure

**All push notifications delivered via email (Resend) initially.** No web push, no service workers, no permission prompts. Email is already wired; native push can come later if engagement data justifies it.

- Sunday readiness check: email, Sunday morning
- Saturday digest: email, Saturday evening
- 3-day pre-exam alert: email, triggered by cron against exam dates
- All emails deep-link into specific in-app flows

---

## Monetization Summary

| Feature | Free | Pro |
|---|---|---|
| AI Cheat Sheet | Topic #1 only | All 10 + regenerate (2x) + export |
| Brain Dump Scorer | Score only (e.g., 71%) | Breakdown + gaps + grade projection |
| Exam Rescue Plan | Top topic + 1hr schedule | Full list + full schedule + regenerate (2x) |
| Quick Quiz Burst | 5 questions, 3 uses/month total | Unlimited + custom modes |
| Pre-Session Prep | Weakness review only | All 3 modes |
| Course Readiness Status | Status pill + action CTA | Tap to see score drivers + detail |
| Weekly Readiness Trend | 4-week chart in Sunday email | Same |
| AI Call Budget | 15 calls/month | Unlimited |

---

## API Routes

Upgrade to Vercel Pro to remove the 12-function ceiling. Stop making architecture decisions based on a $0 plan constraint.

- `POST /api/cheat-sheet` — takes course context, returns 10 ranked topics with dual signals
- `POST /api/brain-dump-score` — takes free text + timer duration, returns score + breakdown
- `POST /api/exam-rescue` — takes grade + exam datetime + course data, returns ranked topics + schedule (streaming: topics first, schedule follows)
- `POST /api/prep-blast` — takes session context + exam proximity, returns context-weighted prep type
- `POST /api/quiz-burst` — takes course/topic, returns 5 pre-generated questions with fixed difficulty curve (easy → medium → hard → hard → medium)

Each route is a separate handler. Clear separation of prompt engineering and output schemas per feature.

---

## Component Plan

| Component | Type | Notes |
|---|---|---|
| `StudyHacksView.jsx` | New | Standalone hub in Tools. Houses all features. |
| `CheatSheetModal.jsx` | New | Full-screen overlay with animated reveal. Dual-signal (likelihood + readiness) per topic. |
| `BrainDumpModal.jsx` | New | Adjustable timer (default 60s) + textarea + score reveal. Early submit allowed. |
| `ExamRescueModal.jsx` | New | Two-step streaming: topic rank shown first, schedule loads behind it. |
| `QuickQuizBurst.jsx` | New | Pre-generated 5-question game mode. Fixed difficulty curve. Soft streak reset. |
| `PrepBlastScreen.jsx` | New | Context-weighted, not random. Shown between "Start Session" and timer. |
| `ReadinessPill.jsx` | New | Colored status pill + paired action CTA. Prompt state for new users. |
| `UpgradeCard.jsx` | New | Inline upgrade card overlaid on blurred content. Reusable across all paywall moments. |
| `DashboardView.jsx` | Modified | Add Study Hacks entries to Quick Actions card. Add readiness pills per course. |
| `FocusMode.jsx` | Modified | Add PrepBlast before session start. |
| `OutputView.jsx` | Modified | Wire PrepBlast + StudyHacks entry points. |

---

## Priority Order

1. **P0:** Course Readiness Status pills — always visible, zero friction, drives all other features. Includes cold-start prompt state.
2. **P0:** Brain Dump Scorer — highest addiction potential, clearest paywall mechanic. Adjustable timer from day one.
3. **P0:** Exam Rescue Plan — highest perceived value, best conversion moment. Auto-fill hours from exam datetime.
4. **P1:** AI Cheat Sheet — high value but needs good input data. Dual confidence/readiness signals.
5. **P1:** Pre-Session Prep Blast — stickiest long-term. Context-weighted mode selection.
6. **P2:** Quick Quiz Burst — good but overlaps with existing quiz tab. Pre-generated difficulty curve.
7. **P2:** Weekly Readiness Check habit loop — retention play, lower conversion impact. Trend graph in Sunday email.

**Before any of the above:** Add Vercel Pro upgrade and exam date entry to onboarding.
