# Brand entity playbook

Written 2026-08-31. Companion to `docs/indexation-audit-2026-08-30.md`.

**The problem being solved.** In incognito, `studyedge ai` returns the competitor
(studyedge.com) at organic #1 plus an AI Overview describing *their* product,
sourced from *their* Instagram. Signed in, Google resolves the entity correctly.
Google can distinguish us when it has a prior; it lacks an independent anchor.

**What the click data does and does not say.**

| Query type | Impressions | Clicks | CTR | Position |
|---|---:|---:|---:|---:|
| contains "ai" | 1,534 | 640 | 41.7% | 1.0-1.7 |
| no "ai" | 9,859 | 112 | 1.1% | 4.7-6.0 |

We own the brand *when the query says AI*. We do not own bare "study edge" and
should not try: it is a 15-year-old brand and asserting it invites the merge.
Every asset below should carry the exact string **StudyEdge AI**.

---

## 1. Canonical listing copy

Paste verbatim. Consistency across listings is the signal; paraphrasing each
time destroys the thing we are trying to build.

**Name (exact, everywhere):** `StudyEdge AI`

**Tagline (60 chars):**
`The AI study planner that turns your syllabus into a plan`

**Short description (80 chars, Play/directory limit):**
`AI study planner that builds your schedule from your syllabus and exam dates.`

**Medium (~250 chars):**
> StudyEdge AI is an AI study planner for college and high school students. Upload
> a syllabus and it extracts every deadline, builds a study schedule around your
> exams, plans each session minute by minute, and runs it with flashcards,
> quizzes, and active recall.

**Long (~900 chars):**
> StudyEdge AI is an AI-powered study planner for college and university students.
> It turns a syllabus into a working plan: upload the PDF and it extracts
> deadlines, exam dates, and assignment weights, then builds a weekly schedule
> prioritised by urgency and difficulty.
>
> Before each session it generates a Session Blueprint, a minute-by-minute plan
> for that specific course and goal. Focus Mode then runs the session with a
> timer, AI-generated flashcards drawn from your own notes, active recall
> prompts, and quizzes. Grade Hub tracks your current grade, predicts your
> semester GPA, and calculates what you need on remaining assignments.
>
> Free to start. Pro from $2.99/week with a 7-day free trial.
>
> StudyEdge AI is not affiliated with Study Edge (studyedge.com), a separate
> Florida-based human tutoring company, or with Study Edge Intelligence
> (studyedge.eu) in the Netherlands.

**Disambiguation line — include wherever a listing allows free text:**
> Not affiliated with Study Edge (studyedge.com) or studyedge.eu.

**Category:** Education / Productivity · **Founded:** 2025 · **Site:** https://getstudyedge.com

---

## 2. Directories, ranked by entity-graph value

Ranking logic: how likely Google is to treat the listing as an independent
statement about the entity. Wikidata-usable means the listing is plausibly
citable as a reference for a Wikidata item (see section 4).

| # | Property | Why it ranks here | Wikidata-usable |
|---|---|---|---|
| 1 | **Google Play** | Google's own graph. Directly replaces the competitor's app in the brand SERP. See section 3. | Yes |
| 2 | **Crunchbase** | The single strongest third-party company-entity signal Google consumes. | Yes |
| 3 | **Wikidata** | The explicit `different from` anchor. Section 4. | n/a |
| 4 | **Product Hunt** | Already exists. Ensure the name reads exactly "StudyEdge AI". | Yes |
| 5 | **LinkedIn Company** | Already exists. Verify name string and website field. | Weak |
| 6 | **Apple App Store** | High value, blocked until the iOS app ships. | Yes |
| 7 | **G2** | Software category authority; strong for "alternatives" queries. | Yes |
| 8 | **Capterra** | One submission also populates GetApp and Software Advice (same Gartner network). | Yes |
| 9 | **AlternativeTo** | Ranks well for "X alternative", which matches existing page inventory. | Weak |
| 10 | **Trustpilot** | Review entity; only worth it once there are real users to ask. | Weak |
| 11 | **SaaSHub** | Low effort, indexes fast. | No |
| 12 | **StackShare** | Developer-facing, decent domain authority. | No |
| 13 | **SourceForge / Slashdot software** | Large software directory network. | No |
| 14 | **Common Sense Education** | Edtech-specific authority, well trusted for student tools. | Yes |
| 15 | **EdSurge Product Index** | Edtech vertical directory with editorial standing. | Yes |
| 16 | **Educational App Store** | Vertical, easy inclusion. | Weak |
| 17 | **There's An AI For That** | High-traffic AI tool directory. | No |
| 18 | **Futurepedia** | AI tool directory, fast indexing. | No |
| 19 | **Toolify** | AI directory, low effort. | No |
| 20 | **F6S / BetaList** | Startup profiles, weak but cheap. | No |

**Do 1-8 first.** Items 11-20 are volume, not authority; they help the AI-tool
directory surface and cost little, but they will not move entity resolution on
their own. Note that finderlaunch.com already ranks for the brand and describes
the product correctly, which is proof this mechanism works.

---

## 3. Google Play scope

Highest-value item on this list, and not a checkbox. Current state and gaps:

**Already in place**
- `applicationId com.getstudyedge.app`, versionCode 2, versionName 1.0
- `minSdk 24`, `compileSdk 36`, `targetSdk 36` (meets Play's current target-API rule)
- Only `INTERNET` permission requested, which keeps the Data Safety form simple
- Launcher icons present across density buckets
- Account deletion exists (`api/delete-account.js` + AccountView), which Play requires
- Privacy policy live at `/privacy`
- Capacitor bundles `dist` locally rather than remote-loading a URL

**Blockers, in order of severity**

1. **Payments. This is the real one.** The bundled SPA sends paid upgrades to
   Stripe Checkout (`subscription.js:176` -> `createCheckoutSession`). Play's
   Payments policy requires Google Play Billing for in-app digital
   subscriptions, so shipping as-is risks removal. Three options:
   - *Play Billing via RevenueCat* — one integration covering Play and
     StoreKit, which the iOS app already implements natively. Best long-term
     given both platforms need this. Largest effort.
   - *Play Billing direct* — a Capacitor billing plugin. Less abstraction, more
     platform-specific code, and duplicates the StoreKit work.
   - *Ship Android free-tier only* — strip upgrade entry points from the Android
     build, no purchases in-app at all. Fastest path to a listing, and the
     listing is the point here. Revenue continues via web and iOS.
2. **No signing config.** `app/build.gradle` has no `signingConfigs`. Need an
   upload keystore plus Play App Signing enrolment.
3. **Closed testing requirement.** Personal Play developer accounts created
   after Nov 2023 must run closed testing with 12+ testers for 14 continuous
   days before production access. Organisation accounts are exempt. **Confirm
   which account type this is — it is the difference between roughly a week and
   roughly a month.**
4. **Store assets not produced.** Needed: 512x512 icon (PNG, 32-bit), 1024x500
   feature graphic, 2-8 phone screenshots at 16:9 or 9:16 (min 320px). The
   existing `App ScreenShots/` are desktop captures from April and are not
   usable.
5. **Forms.** Data Safety declaration (collects email, uploaded documents,
   usage data), IARC content rating questionnaire, target audience declaration.
   If under-13 users are in scope, Families policy applies and adds work.

**Recommendation.** Take option 1c (free-tier-only Android) to get the listing
live fast, then add Play Billing via RevenueCat alongside the iOS StoreKit work.
The strategic value here is displacing a competitor's app from the brand SERP,
and that value is realised by *existing on Play*, not by monetising there.

---

## 4. Wikidata submission draft

Wikidata's bar is materially lower than Wikipedia's: an item needs to be a
clearly identifiable entity describable with serious, publicly available
references. It does **not** require significant independent coverage.

**Minimum references needed: 2-3 independent, non-self-published.** A Google
Play listing, a Crunchbase profile, and one genuine press or newsletter mention
would plausibly clear it. Do sections 2 and 5 first.

```
Label (en):        StudyEdge AI
Description (en):  AI study planning application for students
Aliases (en):      Study Edge AI · StudyEdgeAI · getstudyedge

Statements
  instance of (P31)          mobile app (Q620615)
  instance of (P31)          web application (Q193424)
  official website (P856)    https://getstudyedge.com
  inception (P571)           2025
  different from (P1889)     <Study Edge, studyedge.com - Florida tutoring company>
  different from (P1889)     <Study Edge Intelligence, studyedge.eu - Netherlands>
  operating system (P306)    Android, iOS, web
  genre / field of work      educational software (Q1155922)
```

`different from` is the point of the whole exercise: it is the only public,
machine-readable statement that explicitly separates the three entities. If no
Wikidata item exists for the Florida or Dutch companies, create stubs for them
first, otherwise the statement has nothing to point at.

---

## 5. Digital PR: the one asset that can earn links

`/how-students-study-report-2026` is first-party behavioural data under CC BY
4.0 with a methodology section. It is the only thing on this domain capable of
earning a link, and **Google currently believes the URL 404s** (stale crawl from
July; fixed since, needs Request Indexing).

**Citable figures, each strong enough to carry a pitch on its own:**

| Stat | Angle |
|---|---|
| Median session **47 min**, down from ~52 min in 2024 | Attention spans / study behaviour shift |
| Peak weekday study **9:14 pm**; **35%** of study happens 9pm-midnight | Student sleep, campus service hours |
| **78%** of students used an AI tool during study sessions | The headline AI-adoption number |
| **Organic Chemistry** highest "crisis session" share at **31%** | Weed-out course coverage |
| **39% gap** between planned and actual study hours | Planning/procrastination angle |
| Only **14%** of tracked study meets true spaced practice | Learning-science angle |
| Flashcard use **+34% YoY** | Study-tool trend |

**Pitch targets, ranked by realistic hit rate for a domain with no authority.**
Be honest about the top of this list: national higher-ed press rarely covers a
small startup's first dataset. The middle of the list is where links actually
come from.

*Tier 1 — realistic*
1. **Student newspapers** (Daily Californian, Michigan Daily, Daily Tar Heel, The
   Crimson, Daily Bruin). Angle: the 9:14 pm peak and the 39% planning gap, localised.
2. **r/college, r/GetStudying, r/premed** — not a link, but seeds citation and
   brand search. Post the data, not the product.
3. **Study/productivity newsletters** (Ness Labs, Superhuman, TLDR). Angle: the
   14% spaced-practice finding.
4. **Learning-science bloggers and academics** — the 14% figure is genuinely
   novel and this audience links to primary data.
5. **AI tool newsletters** (Ben's Bites, The Rundown). Angle: 78% AI adoption.

*Tier 2 — plausible with a strong hook*
6. **eSchool News**, 7. **EdTech Magazine**, 8. **Campus Technology**,
9. **EdSurge**, 10. **The Hechinger Report** (angle: Organic Chemistry as an
equity/weed-out story).

*Tier 3 — low probability, high value*
11. **Inside Higher Ed**, 12. **Chronicle of Higher Education**,
13. **Times Higher Education**.

**Outreach email template**

```
Subject: Data: college students now study at 9:14pm, and plan 39% more than they do

Hi <name>,

We tracked study sessions from <N> college students through the 2025-26 year and
published the results under CC BY 4.0, so the figures and charts are free to
reuse with attribution.

Two findings that might fit <publication>:

  - Peak weekday studying is now 9:14pm, and 35% of all study happens between
    9pm and midnight.
  - Students plan 39% more study time than they complete, consistently.

Full report with methodology: https://getstudyedge.com/how-students-study-report-2026

Happy to pull a custom cut for <publication>'s audience, or send the underlying
chart data.

<name>
StudyEdge AI
```

Swap the two bullets per target using the table above. Do not send the same two
stats to every outlet; the specific-stat match is what earns the reply.

**Before any outreach:** get the URL out of its stale-404 state via Request
Indexing. Pitching a page Google thinks is dead wastes the pitch.
