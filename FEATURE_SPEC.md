# StudyMap — Product Feature Spec
_Written: May 17, 2026_

---

## Context & Conversion Problem

**Core insight from user interviews**: Plans feel generic. Students set up their semester, see a schedule, and feel nothing — because the plan doesn't know *what* they're studying, doesn't change when they struggle, and disappears from their mind the next day. The conversion problem is not UI polish — it's that the AI doesn't feel intelligent.

**Current state**:
- Free trial converts at <5% to paid
- Churn happens when students realize the plan is static
- Focus Mode is the visual wow moment — but only works if students come back to use it
- TikTok is the primary acquisition channel; grade anxiety is the hook

**Target users**: High school + university students. The paying persona is the *organized student at the start of semester* — someone who has their syllabus, knows their goals, and wants a system. Design for them, and the anxious students will follow.

---

## Feature 1 — Adaptive AI Rescheduling
**Priority: P0 — Core conversion driver**

### Problem
Sessions are generated once and never change. A student can mark a session complete, struggle badly, and the next session is identical. There's no feedback loop.

### What to build
After every Focus Mode session, prompt the student with a **3-second recall check**:
- "How well did you retain this material?" → 1–5 slider or Forgot / Fuzzy / Got it
- Optionally: "What topic felt hardest?" (text or tag)

The app stores this recall score against the session. A background process (can be simple rule-based first, AI second) reads recall scores and:
1. If score ≤ 2: inject a review session for that course within 48 hours
2. If score ≥ 4: push the next session slightly later (spaced repetition)
3. If 3+ sessions in a row score ≤ 2: flag the course as "struggling" and surface a coach intervention

### Adaptive UX
When the plan updates due to a recall score, show a dashboard badge: **"Your plan was updated — see what changed"**. This is a key retention moment. It proves the AI is working.

Push notification (when infra exists): "Based on your last session, we moved your [Course] review to tomorrow. Tap to see your updated schedule."

### Technical notes
- Recall scores already have a `session_recalls` column in Supabase (exists but underused)
- No need for new DB columns — store rescheduling deltas as manual sessions with `isAdaptive: true` flag
- Rule engine first (fast to ship), GPT call second (for course-level intervention messages)
- The adaptation can be entirely client-side for V1 — run on session complete, inject entries into `manual_sessions`

### Paywall placement
Recall check UI: **free**. Adaptive rescheduling (plan actually changes): **paid**. Show free users: "Your plan would update based on this score — upgrade to let it adapt."

---

## Feature 2 — Topic-Specific Study Plans (Syllabus Intelligence)
**Priority: P0 — Eliminates "feels generic" churn**

### Problem
The syllabus upload currently extracts dates and assignment names only. The study plan has no idea what topics, chapters, or concepts are in each course. Every session is labeled "Lecture Review" regardless of what's actually being studied.

### What to build
**Syllabus topic extraction**: When a student uploads a syllabus (or pastes it), run an extraction pass that pulls:
- Week-by-week topics (e.g. "Week 3: Cell Division, Meiosis")
- Assignment names and what they cover
- Exam scope (e.g. "Final covers weeks 8–14")

Store topics per course in the plan. Map each generated study session to the topic that's being covered that week based on the syllabus timeline.

**Session labels become meaningful**:
- Before: "Lecture Review — Biology"
- After: "Review: Cell Division & Meiosis — Biology"

**Topic-aware coach plans**: The StudyCoach already asks about struggles. Now it can ask "Which topics from the syllabus are you least confident in?" and use the extracted topic list as options.

### Onboarding friction note
Students often don't have exam dates when setting up. Solution: let them add a course with just the name and move on — show a "Add exam date later" reminder. Don't block setup on missing data.

Syllabus upload is unreliable for some file formats. Offer a **paste text** fallback prominently, not buried.

### Technical notes
- GPT-4o for extraction (single call per course, cached — low cost)
- Store as `syllabus_topics: [{ week: 1, topics: ['Cell Division', 'Meiosis'], dates: {...} }]` inside the course object in `plan`
- Session generator picks topic label by matching session date to topic week
- Extraction runs async after upload — show "Analyzing syllabus..." state

### Paywall
Topic extraction: **paid**. Generic sessions without topics: **free**. This directly answers "why upgrade" — paid students see what they're studying, free students don't.

---

## Feature 3 — Notification System
**Priority: P1 — Retention is currently zero without this**

### Problem
There are zero notifications. Students set up the app, feel good, close it, and forget it exists by day 2. No re-engagement hook exists.

### What to build
Three notification types:

**1. Daily study reminder** (time-based)
- "You have 2 sessions today — [Course A] at 3pm, [Course B] at 5pm"
- Sent via email (Resend already set up) for now; push notifications when native app ships
- Student sets preferred time during onboarding (or profile settings)
- Free tier eligible — this drives re-engagement that benefits conversion

**2. Adaptive plan update alert** (event-based)
- "Your plan updated — we added a review session for [Course] based on your last recall score"
- Only fires when an adaptation actually happens
- Paid tier only (since adaptive rescheduling is paid)

**3. Weekly digest** (Sunday evening)
- Summary: sessions completed, hours studied, upcoming week preview, nearest exam countdown
- Simple email template using Resend
- Free tier eligible — keeps brand top of mind

### Implementation order
1. Weekly digest email (lowest effort, highest reach)
2. Daily reminder email (Resend + cron, student opt-in at onboarding)
3. Push notifications (requires native app or service worker setup)

### Technical notes
- Resend already configured — use existing setup
- Store notification preferences in `study_tools` (avoid new DB column)
- Cron jobs via Vercel cron or Supabase Edge Function scheduled tasks
- For push: use web push API first (works in browsers on Android + desktop Safari). iOS requires native app.

---

## Feature 4 — Grade Predictor
**Priority: P1 — Viral + sticky**

### Problem
Students are grade-anxious. The app captures target grades but does nothing predictive with them. This is an underused emotional hook.

### What to build
**Phase 1 — Simple grade tracker** (free tier)
- Student manually enters assignment/exam scores as they come in
- App shows: "Current grade: 74% — you need 81% on the final to hit your B target"
- Simple math, no AI required
- Shareable card: "My grades this semester" → TikTok/Instagram moment

**Phase 2 — AI grade predictor** (paid tier)
- Based on recall scores, session completion rate, and time spent: "At your current pace, you're trending toward a C+ in Biology"
- Inputs: target grade, sessions completed, recall scores, assignment grades
- Weekly update: "Your Biology trajectory improved from C+ to B- this week"
- Not a promise, always framed as a trend ("trending toward")

### Shareable output
Generate a clean visual grade card (similar to PDF export). Student can screenshot and share. Includes StudyMap branding. Each share is an organic acquisition event.

### Technical notes
- Phase 1: client-side math, store grades array in course object inside `plan`
- Phase 2: GPT call or simple weighted formula — "predicted final grade = f(current grade, time remaining, recall trend, session adherence)"
- Store grade entries in `plan.courses[i].grades[]` — no new DB column

---

## Feature 5 — Social Studying
**Priority: P2 — Long-term retention + virality**

### What to build (three tiers of complexity)

**Tier 1 — Stats card** (ship first, free)
- Public shareable profile card: "Ryan studied 14 hours this week across 4 courses"
- URL: `studymap.app/s/[username]`
- Primarily a TikTok/Instagram hook — studying in public creates accountability

**Tier 2 — Accountability partner** (paid)
- Link two accounts: see each other's weekly session completions (not grades, not notes — just "did they study")
- Simple: partner A sees partner B's sessions checked off for the week
- Mutual opt-in only — both students confirm the pairing

**Tier 3 — Study groups** (future, paid)
- Shared courses → shared study schedule → group progress view
- Group leaderboard for sessions completed
- Requires native app for real-time feel

### Notes
- Start with Tier 1 only. Measure whether stats cards drive signups before investing in group features.
- The acquisition flywheel: student shares stats → viewer signs up → shares their own → repeat

---

## Feature 6 — 30-Second Semester Setup
**Priority: P1 — Reduces onboarding drop-off**

### Problem
Current onboarding requires: course names, difficulties, exam dates, target grades, syllabus upload, schedule preferences. Students don't have all this at semester start. Drop-off is high.

### What to build
**Minimum viable setup**: Name + one course + one exam date = plan generated. Everything else is optional and fillable later.

**Progressive disclosure**:
- Step 1: "What's your hardest course this semester?" (one input)
- Step 2: "When's the exam?" (date picker)
- Step 3: "How many hours/week can you study?" (slider, default 10)
- → Plan generated immediately
- Step 4 (later): "Add more courses", "Upload your syllabus", "Set target grades"

**Smart defaults**: If student doesn't know exam date, offer "I'll remind you to add it" and skip. If syllabus upload fails, offer text paste inline without breaking the flow.

**Time-to-value target**: Student sees their first study session on the calendar within 60 seconds of landing on the app.

---

## Feature 7 — Past Paper & Practice Exam Integration
**Priority: P1 — Direct student request + clear paid value**

### Problem
Students explicitly ask for past papers. The app gives them a study schedule but not the actual practice material. This is a gap between plan and execution.

### What to build
**Phase 1 — Practice question generation** (paid)
- Student opens a session → "Generate practice questions for [topic]"
- GPT generates 5–10 questions based on session type (quiz → MCQ, essay → prompts)
- If topic extracted from syllabus, questions are topic-specific
- Student answers, submits → immediate feedback + recall score auto-filled

**Phase 2 — Past paper upload**
- Student uploads a past exam PDF
- App extracts questions, stores them, makes them available in future sessions
- "Practice with last year's questions" option in Focus Mode

**Phase 3 — Question bank**
- Curated question banks per course category (e.g. intro biology, calculus 101)
- Partnership model or AI-generated — future revenue stream

### Technical notes
- Phase 1 is a single GPT call, can reuse existing `/api/studycoach` or new `/api/practice` endpoint
- Store generated questions in session data (ephemeral per session, no persistence needed for V1)
- Past paper upload: parse with GPT vision or PDF text extraction (same pipeline as syllabus upload)

### Paywall
Practice question generation: **paid**. This is a clear, immediate value add that free users will hit quickly and want.

---

## Pricing Model Shift
**Priority: P0 — Current model isn't working**

### Proposed model

**Free tier** (always free, no trial):
- Unlimited courses
- AI-generated study schedule
- Calendar + Focus Mode
- Weekly digest email
- Stats card (shareable)
- Grade tracker (manual input, simple math)

**Pro — $9/month or $59/year**:
- Topic-specific sessions (syllabus intelligence)
- Adaptive rescheduling (plan updates from recall scores)
- Practice question generation
- AI grade predictor (trending toward)
- Accountability partner
- Daily reminder emails + plan update alerts
- PDF export
- Priority AI response times

**Teams/Group — future**:
- Study groups
- Shared schedules
- Group leaderboard

### Rationale
The current model puts structure behind a paywall. Students don't need to pay to *organize* — they need to pay to *improve*. Giving away structure builds habit; charging for intelligence drives conversion.

The free tier must feel complete enough that students use it daily, but limited enough that they feel the ceiling. The ceiling should be hit naturally through usage, not through artificial feature blocks.

### Risk mitigation
Concern: students might not need AI if structure is free.
Answer: Structure alone doesn't change grades. The students who convert are the ones who've used the free tier long enough to see they need more — better topics, adaptive plans, practice questions. The goal is to turn free users into power users before asking for money.

---

## Implementation Priority Order

| Priority | Feature | Effort | Impact |
|---|---|---|---|
| P0 | Pricing model shift (structure free) | Low — config change | Reduces paywall friction immediately |
| P0 | Recall check after session | Low — 1 UI component | Unlocks all adaptive features |
| P0 | Adaptive rescheduling (rule-based) | Medium | Core conversion driver |
| P0 | Topic extraction from syllabus | Medium — GPT call + schema | Eliminates "feels generic" |
| P1 | Weekly digest email | Low — Resend + cron | Zero-cost retention |
| P1 | Daily reminder email | Low | Re-engagement |
| P1 | 30-second setup flow | Medium — onboarding rewrite | Reduces drop-off |
| P1 | Practice question generation | Medium — new API endpoint | Direct student request |
| P1 | Grade predictor Phase 1 | Low — client-side math | Viral + sticky |
| P2 | Stats card (shareable) | Low | TikTok acquisition |
| P2 | Accountability partner | High | Retention |
| P3 | Past paper upload | High | Power user feature |
| P3 | Grade predictor Phase 2 (AI) | Medium | Paid upsell |
| P4 | Study groups | Very high | Long-term play |
| P4 | Native app | Very high | Required for push notifications |

---

## 90-Day Execution Focus

Given the goal of moving fast on all fronts:

**Month 1**: Pricing shift + recall check UI + weekly digest email + 30-second setup
**Month 2**: Adaptive rescheduling + topic extraction + practice questions + daily reminders
**Month 3**: Grade predictor + stats card + accountability partner beta

Each month ships something students see immediately (recall UI, email, setup) and something that builds the AI layer (adaptive, topics, predictor). The AI layer compounds — every recall score makes the plan smarter, which makes the next session more valuable.

---

_End of spec. Questions or scope changes: update this file._
