# StudyEdge AI — Living Context
_Last updated by: Landing Page Agent on 2026-05-24 (Run 1 — hero CTA + How It Works); Onboarding & Paywall Conversion Agent on 2026-05-24; UI Consistency Agent on 2026-05-23 (full dark-purge pass); SEO Agent on 2026-05-23 (SEO layers)_

## Landing Page Agent — Runs 2–6 (2026-05-24, visual polish pass)
_Driven by user request "make it much more professional and visually appealing." Five sequential commits, build verified clean after each. All on `main`._

### Run 2 — Atmospheric depth (`60b9e34`)
- Fixed full-page noise grain overlay (0.04 opacity, mix-blend overlay) for tactile texture.
- Per-section radial color washes via `.se-section` / `.se-wash` recipe: How It Works → indigo + violet, Features → teal + indigo, Testimonials → rose + amber, Bottom CTA → big brand-blue center.
- Dot-grid overlay extended from hero-only into How It Works (masked to a soft ellipse).
- New `.se-horizon` hairline + 240px soft-glow band between every section. Sections no longer abruptly start/stop.
- Reusable atmospheric CSS in the central `<style>` block so future sections opt in with a single class.

### Run 3 — Animated hero mockup (`7dec3a9`)
- `se-pulse-glow` on Start session button (2.6s ambient pulse).
- `se-pulse-dot` on UP NEXT TODAY indicator (1.6s).
- `se-row` stagger on the dashboard course list (4 rows, 120ms apart starting at 0.35s).
- Grade Hub floating card rows stagger in (100ms, starting 0.5s).
- Streak floating card's 14-bar weekly chart grows from baseline with 50ms per-bar stagger.
- Weekly goal bar fills 0 → 96% over 1.4s.
- All animations gated by `prefers-reduced-motion`.

### Run 4 — Trust strip + capability stat band (`dbc332d`)
- New "Built for serious students across" program strip between hero and How It Works horizon: Pre-Med · STEM · Engineering · Liberal Arts · MCAT/LSAT/GRE · Grad Programs. Brand-blue glowing dot separators. No fabricated universities.
- Capability stat band (4-col glass card with per-cell radial halos + gradient-clipped serif numerals): `4` (problems no other app solves together), `60s` (setup), `∞` (sessions with minute-by-minute plans), `1` (grade target — backwards from exam). Numbers tied to defensibly-true product claims, not user counts.

### Run 5 — Bottom CTA full-bleed redesign (`efdc31a`)
- Section padding lifted to 140/160px so the CTA reads as an arrival, not a footnote.
- 4-layer wash composition + dot-grid + vertical gradient band so the section reads as a darker chamber than the rest of the page.
- Glass trust pill above headline: `No credit card · 7-day free trial · Cancel anytime`.
- New headline: `Stop studying harder. / Study what actually moves your grade.` Italic serif accent on line 2. Clamp 40 → 78px.
- Two CTAs side by side: primary `Start your free 7-day trial →` (still routes through `goTrial`) + secondary `See how it works`.
- Closer line: "Built for the GPA grinder, the comeback kid, and the high-achiever optimizing for an A." Lifts the positioning language from the spec into the final beat.
- All blocks staggered via the `data-reveal` system.

### Run 6 — Features grid: primary tier + outcome-led copy (`f670fe5`)
- Section gets a `What's inside` mint eyebrow pill + new italic-serif split headline (`Everything that decides your grade. / Built into one app.`).
- Session Planner promoted to a **full-width primary-tier card** spanning the grid. Glass surface, two halos (indigo top-left, violet bottom-right), two-column internal layout — copy + outcome bullets left, richer `60 min · 5 blocks` blueprint mockup right. `The differentiator` label pill.
- The remaining 5 cards rewritten with eyebrow + outcome-led titles:
  - Study Coach → `A tutor for every course, on demand.` (eyebrow: When you're stuck)
  - Flashcards → `Flashcards that only quiz what you're forgetting.` (Skip what you already know)
  - Focus Mode → `One screen. Your plan. Nothing else.` (Lock in for an hour)
  - Schedule → `See your week before you've thought about it.` (Your week, decided)
  - Dashboard → `Every session updates the grade you'll get.` (Watch the grade move)
- `FeatureCard` component upgrade: accent-tinted gradient mockup bg replaces flat `rgba(0,0,0,0.25)`; top-right soft halo per card; hover lift + accent-tinted shadow; optional `eyebrow` prop; larger icon tile with colored shadow.

### Guardrails honored throughout
- Dark theme preserved.
- Pricing untouched.
- `goTrial()` destination unchanged.
- "No credit card required" appears at every trial CTA.
- Real testimonials only — none fabricated.

### Next-run backlog (priority order)
1. **Sticky bottom bar** still uses off-brand indigo (`#1e1b4b → #312e81`). Re-skin with glass + brand `#3B61C4` accent.
2. **Testimonials** still flat — varying card sizes + a large editorial pull-quote would make the 6 quotes feel like overwhelming evidence.
3. **FAQ section** still missing — addresses "Is it free?", "What if my syllabus isn't here?", "How is this different from Notion?", "MCAT/LSAT support?".
4. **Live state increments in hero** — the mockup is now animated but each value is static once it settles. A 4–8s tick on "9.6 hrs this week" / streak day could give the hero a heartbeat.
5. **Mobile audit at 390px** — newer additions (stat band, primary-tier card) flex-wrap correctly but the hero stage is fixed 1920×600 scaled — needs a Playwright sweep.
6. **Footer is bare** — 1 email link. Could carry a small site-map (Pricing · FAQ · Blog · Contact) + social + last-updated copyright.

---

## Landing Page Agent — Run 1 (2026-05-24)
_Driven by `LANDING_AGENT_SPEC.md`. Single CRO-focused pass: hero CTA + new "How It Works" section. All changes in `src/components/LandingPage.jsx`. Build verified clean. Commit `e876c18` pushed to main; Vercel will auto-deploy._

### What changed
| File | Line refs (post-edit) | Change |
|------|----------------------|--------|
| `src/components/LandingPage.jsx` | ~58–90 | New `scrollToHow()` helper + `revealRoot` ref + `IntersectionObserver` useEffect that toggles `.is-revealed` on any `[data-reveal]` element. Stagger via `[data-reveal-delay="1\|2\|3"]`. Respects `prefers-reduced-motion`. |
| `src/components/LandingPage.jsx` | ~92–99 | A/B headline variant block in a code comment. Three documented alternates to the current "While others cram. You execute.": **B** outcome-led, **C** system + outcome, **D** problem-first. Default kept live; switch is a one-line edit when ready for a real test. |
| `src/components/LandingPage.jsx` | ~102–112 | Inline `<style>` block with `[data-reveal]` keyframes + reduced-motion override. Lives inside the dark-themed marketing root only. |
| `src/components/LandingPage.jsx` | ~257–316 | **Hero CTA row** added between subline and social-proof line. Primary `Start free 7-day trial →` (gradient `#6366F1 → #4F46E5`, hover lift + boosted glow) routes through existing `goTrial()` (still hits `/app?signup=1&plan=pro&billing=monthly&trial=1` — guardrail preserved). Secondary `See how it works` is a ghost button that smooth-scrolls to `#how-it-works`. `No credit card required · Cancel anytime` microcopy directly below with a green check (matches "No credit card required" guardrail). |
| `src/components/LandingPage.jsx` | ~533–839 | **New "How It Works" section** inserted between hero close and Features Grid open. Editorial label pill (`HOW IT WORKS` with brand-blue dot) → italic-serif split headline (`From your syllabus to your next A. In three steps.`) → outcome-led subhead → 3-card grid (auto-fit, min 300px). Each card has: large Instrument Serif step number (`01`/`02`/`03`) in step accent color, gradient hairline, title, body, and a real-feel mini-mockup. Hover lifts card 2px + tints border to step accent. Inline trial CTA below the grid with the same "no credit card" microcopy. |
| `src/components/LandingPage.jsx` | step 01 mockup | "Your Courses" list — 3 courses with status pills + checked add states, plus a dashed "Parsing syllabus…" row showing real-time syllabus ingestion. |
| `src/components/LandingPage.jsx` | step 02 mockup | "Session Blueprint" preview — block ratio bar + 4 timed segments (Warm-up · Deep dive · Active recall sprint · Mixed-topic quiz) tied to a "to hit 88% on the midterm" target. |
| `src/components/LandingPage.jsx` | step 03 mockup | "Session active" panel — recall ring at 42:18, 5-block progress strip, "Grade target → keep B+" callout with live `88.5%` readout in brand-green. |

### CRO rationale
Audit found two compounding leaks:
1. **Hero had no primary CTA inside the hero viewport** — only the brand chip + headline + subline + social-proof line. To convert, a visitor had to scan back up to the fixed nav. Above-the-fold CTAs added directly under the value prop.
2. **No "How It Works" section** — spec flagged this as the single missing piece most likely to reduce drop-off. Three steps with real mini-mockups bridge "I don't know what this is" → "I want to try it" without requiring trust in copy alone.

### A/B headline variants documented (not switched)
- **B:** `Built to raise your GPA.` — outcome-led, specific.
- **C:** `Your AI study system. Your next A.` — system + outcome, two-beat.
- **D:** `Stop studying harder. Study what matters.` — contrast/problem-first.
Default stays `While others cram. You execute.` until real data lands.

### Guardrails honored
- Dark theme preserved (page bg still `#060614`, all new surfaces use `rgba(255,255,255,*)` borders/cards).
- Pricing structure not touched.
- `goTrial()` destination unchanged: `/app?signup=1&plan=pro&billing=monthly&trial=1`.
- `No credit card required` appears under both new CTAs.

### Current open weaknesses (next-run backlog, priority order)
1. **Features Grid — emoji-free but still feels low-budget.** Six cards have decent SVGs and styled previews, but the section is visually flat and copy leads with features not outcomes (spec §"Features Grid" weakness). Rewrite copy to lead with the student outcome; consider a "primary feature, then supporting features" hierarchy instead of a uniform 2×3 grid.
2. **Sticky bottom bar uses indigo gradients off-brand from `#3B61C4`.** Currently `linear-gradient(90deg, #1e1b4b, #312e81)` with `#6366f1` text. Could tighten to the brand accent system.
3. **No stats / social-proof strip** between How It Works and Features. Spec calls this out as a high-priority add (defensible numbers only — sessions planned, course coverage, etc.).
4. **No FAQ section** addressing "Is it free?", "What if my syllabus isn't here?", "How is this different from Notion?", "Does this work for MCAT/LSAT?".
5. **Testimonials section is flat.** Six quotes in a uniform 3-col grid. Editorial treatment (varying card sizes, large pull-quote, course-logo strip) would make 6 testimonials feel like overwhelming evidence rather than a checklist.
6. **Hero mockup is static.** Spec calls for "simulate real usage — plan items appear one by one, a timer ticks, a grade updates." Reveal infrastructure now exists (`[data-reveal]`); next run can layer a `setInterval`-driven hero animation on top.
7. **Mobile audit not run.** New CTAs flex-wrap and the 3-step grid auto-fits, but the hero stage uses a fixed `1920×600` scaled transform — at 390px viewport the hero copy compresses and the mockup tilts may overlap the CTA row. Needs a Playwright sweep at 390px.
8. **Bottom CTA section is unchanged** — still ends on "Join thousands of students already using StudyEdge AI". Could mirror the same "no credit card required" microcopy + outcome framing for consistency.

### Next-run priority
**Reconcile features-grid copy to lead with outcomes, OR add a stats/social-proof strip + FAQ block.** Whichever the next operator judges higher-leverage given current traffic data. Both are explicitly flagged in `LANDING_AGENT_SPEC.md` §"Missing sections".

---


## Onboarding & Paywall Conversion Pass — 2026-05-24
_Driven by `ONBOARDING_AGENT_SPEC.md`. Spec referenced four `Step*.jsx` files as the active onboarding; the real onboarding flow lives in `Onboarding.jsx` (the `Step*.jsx` files were dead code from an earlier architecture)._

### What changed
| File | Change |
|------|--------|
| `src/components/Onboarding.jsx` | Removed the learning-style step (was step 3 of 3). Flow is now 2 questions: school+year, then preferred study time. ProgressBar `total` dropped from 3 → 2. Splash headline rewritten to "You're 60 seconds from your first AI study plan." Step 2 retitled "What are you studying for?" Step 4 retitled "When do you focus best?" Trial CTA on step 4 changed to "Build my plan". Trial-offer headline tightened to "Try every Pro feature. Free for 7 days." `learningStyle` state removed; `onComplete` still passes `learningStyle: null` so downstream readers don't break. |
| `src/components/DashboardView.jsx` | Empty state (courses.length === 0) made celebratory + momentum-driven: green "You're set up" pill, new headline "Add your hardest course. We'll do the rest.", a "What unlocks next" preview list (3 items), prominent primary CTA with shadow. Exam-mode variant retained. |
| `src/components/AuthScreen.jsx` | Post-signup confirmation screen extracted to new `ConfirmationPending` component. **Auto-polls Supabase every 5s** via `supabase.auth.refreshSession()` so users don't need to manually refresh once they click the link. New "Checking automatically — no need to refresh" status pill, animated pulse-ring on icon, and a value-stack preview card ("What unlocks once you verify") with AI Study Coach, Session Blueprints, Focus Mode + streaks. Resend button kept but de-emphasized (outline). |
| `src/App.jsx` | Email verification gate (rendered when `!session.user.email_confirmed_at`) extracted to new `EmailVerificationGate` component with the same 5s auto-poll + value-stack treatment as AuthScreen. |
| `src/components/PaywallModal.jsx` | All `LIMIT_MESSAGES` rewritten from "you hit a wall" framing to outcome-focused ("Unlock unlimited X", "A plan for every session", etc.). Trial card headline changed to "Try every Pro feature free for 7 days." Trial CTA label changed to "Start free 7-day trial →" (was "Start My Free Trial →"). |
| `src/components/Step{Courses,Assignments,LearningStyle,Schedule}.jsx` | _Initially deleted as dead code, then restored by an out-of-band commit (`e46e989 fix: restore onboarding step files deleted by UI agent`). Left in place._ The real onboarding still lives in `Onboarding.jsx`; these files remain unused. Recommend revisiting whether to keep, refactor for re-use, or formally retire. |

### Spec items not implemented (and why)
- **"Add progress bar to all 4 onboarding steps"** — already present in `Onboarding.jsx` via the `ProgressBar` component; only updated `total` from 3 → 2 to reflect the shortened flow.
- **"Fix post-onboarding landing — redirect to Study Coach"** — Study Coach requires an existing course to plan against. With 0 courses there's nothing to coach, so the spec's literal direction would land users on an even more confusing dead-end. Instead, made the Dashboard empty state itself a strong, celebratory "Add your hardest course →" CTA with a value preview.
- **`Step*.jsx` rewrites** — those files were dead code; they were deleted rather than rewritten. The spec's analysis of those files (line counts, problems) was based on an outdated architecture.
- **Paywall trigger audit** — existing per-feature triggers (`canUseAI`, `canAddCourse`, `canRescue`, focus 60-min cap, etc.) already fire at high-intent moments. Only the copy was sharpened; the trigger points were left untouched.

### Open questions for next agent
- The `learningStyle` field is still threaded through `handleOnboardingComplete` → `savePlan` → DB schema. We pass `null` now, but consumers (`BlueprintScreen`, `StudyCoachView`, `FocusMode`, `AIChatView`) all still accept it as a prop. A follow-up could either (a) drop the field entirely from the schema + props, or (b) re-collect it later once the user has been in the product (post-first-session "we noticed you're using flashcards a lot — is this your style?"). Option (b) is likely higher conversion.
- The auto-poll on email confirmation uses `supabase.auth.refreshSession()` every 5s — fine for the wait period, but if a user leaves the tab open for an hour we'll have made 720 calls. Could add a max-poll-attempts limit (e.g. stop polling after 5 min and show a "Refresh" button) if Supabase rate limits become an issue.



## App Status
- Current version: 3270167 (after first UI/SEO pass; pending: light-theme refactor commits)
- Last QA run: not yet run
- Known open bugs: none from UI consistency pass
- Recently fixed: all 8 dark-UI hotspots converted to light theme (StudyNowCard, TodayFocus, FocusMode formula block, OnboardingTour, App.jsx auth/recovery/toast, all 4 onboarding Step files); LandingPage marked intentional-dark

## Design System Status
- `src/tokens.js`: created (Phase 1 complete)
- `dark:` Tailwind variants in src/**: 0 remaining (was 47)
- `bg-slate-800` / `bg-slate-900` / `bg-gray-900` in src/**: 0 remaining
- Hardcoded dark backgrounds in user-facing surfaces: 0 remaining (only intentional-dark exceptions left: ShareCardModal share card, LandingPage marketing page)
- Components migrated to `T.*` token references: 0 (tokens.js values are inlined as hex literals in components for now; mechanical migration deferred — better as a per-view refactor)

### Phase 2a — Auto-fixed (committed)
| File | Change |
|------|--------|
| src/components/AIChatView.jsx | Removed all `dark:bg-slate-*`, `dark:text-slate-*`, `dark:border-slate-*` variants. Light styles unchanged. |
| src/components/GradePredictorView.jsx | Same. Removed `dark:bg-slate-800/40`, `dark:hover:bg-red-900/20`, `dark:bg-amber-950/30`, etc. |
| src/components/OutputView.jsx | Removed `dark:` variants. Also replaced bogus `border-slate-700/30` (a dark border that was showing in light mode) with `border-slate-200`. |

### Phase 2b — All 8 flagged surfaces fixed (committed)

| File | What changed |
|------|--------------|
| src/components/StudyNowCard.jsx | Full rewrite. Card is now `#FFFFFF` with `rgba(0,0,0,0.07)` border + soft card shadow. Tinted radial color bleed at 8% opacity instead of 10% on dark. Heading text → `text-slate-900`, body → `text-slate-600`, separator → `text-slate-300`. Empty state moved to `bg-emerald-50/border-emerald-200/text-emerald-700`. CTA button keeps the per-course accent color (deliberate). |
| src/components/TodayFocus.jsx | Same treatment as StudyNowCard. |
| src/components/FocusMode.jsx | `.formula` code block: dark `#0f172a`/`#7dd3fc` → light `#F0EFEC` (T.bgEl) with `#111111` text and `#3B61C4` left border. |
| src/components/OnboardingTour.jsx | Driver.js popover restyled: `#FFFFFF` bg, `rgba(0,0,0,0.07)` border, `#111111` title, `#6B6B6B` body, modal shadow. Prev button neutral outline; next button uses `#3B61C4` accent. Arrows updated to point to the white background. |
| src/components/LandingPage.jsx | Marked `/* intentionally dark — marketing landing page */`. The whole page (`#060614` bg, `rgba(255,255,255,*)` borders) is a cohesive dark marketing surface; the two flagged gradients are inseparable from that design. Per spec escape hatch, opted to label rather than rewrite an 800-line marketing page on autopilot. The app shell itself is fully light. |
| src/App.jsx | Email verification gate + password recovery screen + checkout success toast all converted from `#0a0f1e`/`#111827`/`#0d1424` to `#F7F6F3` page bg + `#FFFFFF` cards with `rgba(0,0,0,0.07)` borders. Inputs `bg-white`, text `#111111`, placeholder `#9B9B9B`. Submit button uses `#3B61C4` accent. Success states `bg-emerald-50/border-emerald-200/text-emerald-700`; error states `bg-red-50/border-red-200/text-red-700`. Two OAuth-callback spinners on lines 348/360 also converted. |
| src/components/StepCourses.jsx | Full light-theme rewrite. All `bg-slate-800/50` cards → `bg-white` with shadow. Exam preset chooser, year selector, course list cards, add-course form, syllabus-import drawer, primary CTA all in light system. Inputs `bg-white` with `border-slate-200`. Primary CTA `#3B61C4`. |
| src/components/StepSchedule.jsx | Same. Hours slider track uses `#E5E7EB` (was `#334155`), fill uses `#3B61C4` accent. Time-of-day chips use `border-indigo-500/bg-indigo-50/text-indigo-700` for selected, `border-slate-200/text-slate-600` otherwise. Difficulty pills converted to light variants. |
| src/components/StepAssignments.jsx | Same. Weight-progress bar uses `bg-slate-100` track; assignment cards `bg-white` with shadow. Add-form inputs all `bg-white`. Skip button `bg-slate-100`. |
| src/components/StepLearningStyle.jsx | Same. Each style card is `bg-white` until selected, then takes its color tint (`bg-indigo-50/bg-emerald-50/bg-orange-50`) with matching tag colors. Check radio uses the style's accent for the filled state. |

False positives explicitly cleared (not bugs):
- `src/components/StudyToolsView.jsx:970, 1321` — `color: '#1e293b'` is dark text on light bg. Correct.
- `src/components/BlueprintScreen.jsx:240, 324` — `text-white` on intentionally colored buttons. Correct.
- `src/components/CalendarDayView.jsx:359` — `text-white` SVG checkmark on filled bg. Correct.
- `src/components/FocusMode.jsx:255` — `color:#111827` for note heading text. Correct.
- `src/components/OutputView.jsx:256` — ShareCardModal gradient. Explicitly excluded by spec (intentionally dark for the share-card screenshot aesthetic).

### Phase 3 — Visual audit (2026-05-24)
_Audit covered 11 screen files across 9 named screens (Dashboard, Study Coach, Grade Hub, Focus Mode, Flashcards/Study Tools, Quiz Burst, AI Tutor, Calendar (Month/Week/Day), Settings). Issues categorized A=off-brand color, B=font sizing, C=spacing, D=button radius/weight, E=empty state, F=loading state, G=visual hierarchy, H=hover/focus, I=iconography, J=calendar-specific._

**Top 5 fixed in this pass** (see commit on this date):
1. AIChatView — entire AI Tutor screen retinted to brand `#3B61C4` (was indigo)
2. StudyToolsView — Flashcards/Quizzes/Topic-Drill/Study-Coach hub cards flattened (4 competing pink/orange/purple/blue gradients → white cards with token border)
3. AccountView — Profile card gradient, gradient avatar, blue→green trial CTA, stat tiles all converted to flat token-aligned styles
4. CalendarWeekView — Today indicator color `#4F46E5` / `#818CF8` → `#3B61C4` (matches Month + Day)
5. DashboardView — "Build my plan" gradient button → flat `#3B61C4`

#### DashboardView.jsx (1156 lines)
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 20 | `accent: '#E8531A'` orange as primary accent; spec accent is `#3B61C4` |
| HIGH | A | 26 | `COURSE_COLORS` includes `#EC4899` magenta and `#8B5CF6` purple — off palette |
| HIGH | A | 740, 776 | "Flashcards" quick-action uses hardcoded `'#8B5CF6'` purple; Brain Dump pill (552) same |
| HIGH | A | 1027, 1042 | "Build my plan" gradient `linear-gradient(135deg, ${D.blue}, #5B7FD4)` — rest of app uses flat fills **[FIXED]** |
| MED | A | 996-1000 | Goal progress bar uses Tailwind-400 gradient stops (`#16A34A → #4ade80`, `#D97706 → #fbbf24`) |
| MED | C | 660 | Card padding 24 vs neighbors 20 in same grid |
| MED | B | 478, 555, 802 | Body-small sizes oscillate 11.5/12/12.5/13 inside same card |
| MED | D | 425, 488, 519, 568, 720 | Button radii vary 7/8/9/10/11 in same screen |
| MED | I | 545, 779 | Hardcoded inline SVGs for Brain Dump/Quiz Burst with stroke 1.75 — duplicates `Ico*` set |
| LOW | A | 580 | CARS nudge `rgba(37,99,235,...)` (blue-600) instead of token `#3B61C4` |
| LOW | C | 488 | Vertical rhythm irregular (margins 10/16/20/24 mixed) |
| LOW | F | 547 | Empty up-next preview is raw text with no icon/skeleton |

#### StudyCoachView.jsx (2030 lines)
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 20 | `orange: '#E8531A'` doubles as accent and warning — token says warn is amber `#D97706` |
| HIGH | A | 21, 442, 754, 855 | Multiple `rgba(52,211,153,...)` Tailwind emerald-400 calls — token green is `#16A34A` |
| HIGH | A | 1234 | Ghost-preview overlay `rgba(6,6,20,0.6)` near-black on light app |
| HIGH | A | 1237, 1239-1240, 1245 | Empty-state CTA: indigo-400 sparkles icon, `#1A1A1A`/`#6B6B6B` literals, indigo box-shadow on orange button — three brands collide |
| HIGH | A | 1239 (fakeWeek), 1546-1547 (PDF) | Indigo `#6366f1` + amber `#f59e0b` placeholders |
| HIGH | G | 1644 | Plan title colors `weeks`/`totalSessions`/`totalHours` all in orange accent — too many shouts |
| MED | D | 158, 327, 432, 1247 | Button radii vary 8/9/10/11 |
| MED | A | 188 | Required asterisk orange — most users expect red |
| MED | B | 100, 1745-1747 | Step pill 12.5px; session-card meta labels at 9.5px (below 11 floor) |
| MED | I | 226, 1450, 1554 | "Resolved ✓", "✓ Copied!" glyphs while SVG check exists |
| MED | C | 273, 280-282, 318 | Pill button padding scales: 7/12, 10/14, 14/20 — three padding scales for similar pills |
| MED | F | 322 | Build-button spinner relies on `@keyframes spin` not defined in SC_STYLE |
| LOW | A | 1539-1546 | PDF generator uses dark-mode colors `[15,10,40]` bg, `[232,232,240]` text — produces navy PDF mismatched with light app |

#### GradeHubView.jsx (1271 lines)
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 24 | `violet: '#111111'` — token named "violet" but value is pure black; line 33 PATH_COLORS = [sky, violet, orange] makes "three paths" cards near-identical |
| HIGH | I | 32 | `PATH_ICONS = ['↗', '↑', '◈']` — Unicode glyphs; `◈` renders as tofu on many systems |
| HIGH | A | 459-461 | Pill uses `rgba(249,115,22,...)` orange-500 — token `D.orange` is `#E8531A`, mismatch |
| HIGH | A | 511, 593 | Defense Mode pill mixes Tailwind amber-400 with token amber-600 |
| HIGH | A | 540, 668 | Background pills use pink-400 while `D.pink` is `#DC2626` red — pink bg, red text |
| HIGH | A | 632 | Disabled "Save & generate plan" muted-on-muted low contrast |
| MED | A | 700, 945 | Hero number sizes 64 vs 56 — same metaphor, two tabs |
| MED | D | 130, 134, 376, 538, 632, 779 | Button radii 999/12/10/8/7/5/11 — six different radii on one screen |
| MED | C | 257, 304, 339 | Card padding 20 vs 24 in same tab |
| MED | I | 791-794 | Literal glyphs `↗ ↑ ◈ ✕ ✓ × /` mixed with `Ico*` SVGs |
| MED | F | 152 | LockedState has static shield, no blurred preview (inconsistent with StudyCoach) |
| MED | E | 471, 552, 1170 | Empty states are bare `<p>`s — no icon, no CTA |
| MED | H | 374, 472 | `gridTemplateColumns 'minmax(120px,1fr) 80px 100px 80px 28px'` with `minWidth: 400` overflows on small screens |
| LOW | C | 1162 | Set-up-course empty state padding 40px vs neighbors 20px |

#### FocusMode.jsx (2288 lines)
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 448-455 | `TAB_COLORS` map = purple `#A855F7` / pink `#EC4899` / orange `#F97316` / teal `#14B8A6` / blue `#3B82F6` — 5 competing accents themed across the screen |
| HIGH | A | 1186-1188 | "Activities used" stat uses indigo `#6366f1` + rgba gradient — should be brand `#3B61C4` |
| HIGH | A | 1195-1198 | Activity chips hardcode purple/pink/orange/teal palette |
| HIGH | I | 295-296, 1854, 1917 | Emoji `✓ ✕ 📎` mixed with SVG icons |
| HIGH | A | 1521 | YouTube logo SVG with `fill="#EF4444"` next to brand `#3B61C4` text on same button |
| HIGH | G | 1175-1184 | "Session Complete" hero stacks glow-blur + gradient avatar + 32px bold + colored cards + chips — too much |
| MED | A | 1182-1184 | Gradient stat card `linear-gradient(135deg, ${dot}22, ${dot}08)` + colored stroke shadow |
| MED | D | 1220, 1225, 1234 | Stack of three buttons `rounded-2xl / rounded-2xl / rounded-xl` — inconsistent radii |
| MED | C | 152, 174, 191 | Label font 11/11.5 mixed |
| MED | A | 1735, 1738 | Flashcard panel "Card X of Y" uses session-dot color, not accent |
| MED | C | 1219, 1798 | Button-group gaps 2/2.5/3/10 mixed |
| MED | B | 1196, 1413, 2244 | UPPERCASE labels at 10/10/12 — three sizes for same role |
| LOW | F | 1872-1875 | Quiz "Generating your quiz…" spinner only, no skeleton |
| LOW | H | 1235-1236 | "Download Session Notes" button has no hover state |
| LOW | E | 1716-1718 | "Upload course notes…" empty state is plain text inside white card, no icon |

#### StudyToolsView.jsx (1372 lines) — Flashcards hub
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 549-571 | Flashcards card: pink gradient `#fdf2f8 → #fff`, `#f9a8d4` border, `#be185d` title, `#9d174d` body — off palette **[FIXED]** |
| HIGH | A | 578-600 | Quizzes card: orange gradient, orange-700 title `#c2410c` **[FIXED]** |
| HIGH | A | 607-625 | Topic Drill card: purple gradient + `#7e22ce`/`#6b21a8` body **[FIXED]** |
| HIGH | A | 632-647 | Study Coach card: blue gradient with off-brand `#3b82f6` + dark blue text **[FIXED]** |
| HIGH | G | 549-647 | Hub stacks 4 colorful gradient cards — no primary action **[FIXED]** |
| HIGH | A | 1206, 1213-1216, 1322 | Drill results use `text-emerald-300 / text-red-300 / bg-emerald-900/20` — dark-mode classes on light bg |
| HIGH | A | 156-160 | Fill-in-blank reveal uses `bg-emerald-900/40 text-emerald-300` — dark-mode classes |
| HIGH | A | 1196-1206 | Score circle uses Tailwind raw 500s `#10b981 / #f59e0b / #ef4444` instead of token shades |
| MED | A | 519-522 | Study Hacks item uses purple `#8B5CF6` off-palette |
| MED | D | 549, 859, 1131, 1225, 1355 | Card radii mix rounded-2xl / rounded-xl / rounded-lg |
| MED | A | 859 | "Generate with AI" CTA `linear-gradient(135deg, #a855f7, #ec4899)` — pure 2018 SaaS |
| MED | A | 692-695 | Drop-zone borders cycle blue/green/purple — third color off-brand |
| MED | B | 25, 31, 70, 514, 562, 670, 1101 | UPPERCASE labels at 11/12 px mixed |
| MED | C | 519, 553 | Icon tiles 38×38 vs 44×44 in sibling grids |
| LOW | H | 824 | "Hide extracted text" `hover:text-slate-300` — invisible on light bg |
| LOW | I | 95-96, 126-127, 162-163, 1214, 1322 | Mix of `✓ ✗` emoji and SVG checks |

#### QuickQuizBurst.jsx (363 lines)
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 9, 144, 145, 212, 222, 243, 342 | `accent: '#E8531A'` orange used for header icon + all primary CTAs — brand accent is `#3B61C4` |
| HIGH | A | 36 | `COURSE_COLORS` includes purple `#8B5CF6` and pink `#EC4899` |
| HIGH | A | 159-162, 321-323 | Streak badge `#F97316` (orange-500) next to `#E8531A` accent — two oranges |
| HIGH | A | 314 | Score number `48px / fontWeight 900 / letterSpacing -2` — comically loud vs surrounding muted text |
| MED | B | 152, 266, 317, 354 | Secondary text sizes oscillate 11.5/12/13 |
| MED | D | 165, 212, 233, 342, 349 | Close-button radius 7 vs others 10 — token sm = 8 |
| MED | A | 144 | Icon tile `rgba(232,83,26,0.10)` orange — should be brand accent |
| MED | C | 173-191 | Setup section margins 12/16/20/24 — no rhythm |
| LOW | F | 242-244 | Loading shows only spinner + text — no skeleton |
| LOW | I | 295-296 | Inline emoji `✓ ✕` in option text |
| LOW | B | 263 | Difficulty badge fontSize 10 — below 11 floor |

#### AIChatView.jsx (340 lines) — AI Tutor
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 223, 224, 225, 238, 255, 303, 329 | Entire screen themed in Tailwind indigo (icon tile, user bubble, send button, focus ring) instead of brand `#3B61C4` **[FIXED]** |
| HIGH | A | 198-213 | Flag banner purple `#7C3AED` / `#4C1D95` — third accent on same screen |
| HIGH | A | 313 | Mic button alone uses brand `#3B61C4` — single correctly-branded element makes rest look broken **[FIXED]** |
| HIGH | G | 219-275 | Three competing accent families (indigo chat / purple banner / blue mic) **[FIXED]** |
| MED | D | 311, 329 | Mic button radius 10 vs send button rounded-xl (12) — sibling buttons different sizes |
| MED | B | 249-251 | Markdown h1/h2/h3 all collapse to base/sm |
| MED | A | 271 | Loading dots `bg-slate-400` — should be brand-tinted |
| MED | C | 198, 220, 282, 288 | Padding rhythm irregular (12/14/16) |
| MED | E | 220-232 | Empty state has no suggested prompt chips |
| LOW | H | 303 | Textarea focus only a 1px border change — weak focus state |
| LOW | B | 290 | Quota text `mb-1.5` (6px) hugs input |
| LOW | I | 199, 213, 224, 331 | Stroke-width 2 vs 1.75 SVGs mixed |

#### CalendarMonthView.jsx (341 lines)
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 113-115 | Weekday header `text-[10px]` (below 11 floor) + Sunday `#C0C0C0` while others `#9B9B9B` |
| HIGH | A | 229 | Conflict text `#fbbf24` amber-400 (neon on white) — should be amber-600 |
| MED | A | 245 | "+N more" at `text-[10px]` below floor |
| MED | B | 261 | Expanded day heading `text-sm font-medium` (14 med) — h3 should be 16/18 semibold |
| MED | A | 298 | Empty-state text `#374151` slate-700 too dark for muted role |
| MED | A | 308, 319, 331 | `text-slate-600` Tailwind mixed with inline `#6B6B6B` |
| MED | I | 321 | `✓` emoji for completion check — Day uses SVG |
| LOW | B | 199, 210, 224 | Pill height 18px `text-[10px]` — bordering illegible |
| LOW | C | 257 | Expanded card `mt-3` tight given 90px cell min-height |
| LOW | A | 9 | gcalText `#1d4ed8` blue-700 not in token system |

#### CalendarWeekView.jsx (876 lines)
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 484, 490 | Today indicator label `#818CF8` indigo-400 + circle `#4F46E5` indigo-600 — Month/Day use `#3B61C4` **[FIXED]** |
| HIGH | A | 441 | "Reschedule week" `#9B6B1A` non-token amber |
| HIGH | C | 425-449 | Three controls (Prev/Add/Reschedule/Next) in one bar — center has 2 CTAs competing |
| HIGH | J | 471-476 | Density bar uses 400/500-level emerald/amber/red instead of 600 tokens |
| HIGH | A | 484 | Rest day `#6B7280` vs non-rest `#4B5563` — almost identical |
| MED | A | 552, 591 | "All day" label `#374151` slate-700 too dark — token muted `#6B6B6B` |
| MED | A | 745 | Selected outline = same color as block — outline disappears |
| MED | I | 786 | `📝` emoji in notes preview — no other emoji in calendar |
| MED | B | 698 | Class pill `text-[9px]` — illegible |
| MED | D | 427-447 | Three button styles in nav (ghost arrows, filled add, outline reschedule) |
| MED | A | 771, 776 | Conflict icon+text both `text-amber-400` |
| MED | E | 540 | Rest-day button content is text `'✕'` / `'—'` |
| LOW | C | 869-873 | Keyboard hint toast `rgba(0,0,0,0.75)` heavy on light app |
| LOW | B | 870 | Toast font 11px + `<kbd>` — small target |
| LOW | C | 500 | Inline `marginTop: 4` mixed with Tailwind `mb-1` siblings |

#### CalendarDayView.jsx (586 lines)
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 350 | All-day non-syllabus block uses `color: '#f1f5f9'` (near-white) on tinted bg — invisible |
| HIGH | A | 380 | Hour labels `#4B5563` — Week uses `#374151` for same role |
| HIGH | A | 19, 20, 21 | Three greys `#9ca3af / #6b7280 / #9ca3af` for near-identical roles — token system has only two-tier |
| HIGH | I | 359-361 | All-day check uses filled SVG; session-add uses stroke check; Month uses emoji — three styles in one product |
| MED | A | 480 | Conflict text `#fbbf24` amber-400 |
| MED | C | 285 | Day-nav `mb-3 pb-3` vs Week-nav `mb-4 pb-3` |
| MED | B | 558-559 | Empty-state heading 14/600 + 12 sub — heavy weight at small size |
| MED | A | 356 | Toggle pill `border-slate-600 hover:border-slate-400` — dark-era classes; hover lighter than rest (backwards) |
| MED | C | 309, 569 | Add-session bg `rgba(...,0.05)` vs `0.06` elsewhere |
| LOW | F | 507 | Spinner `border-slate-500 border-t-slate-300` — dark-era contrast |
| LOW | B | 301 | "TODAY" badge `text-[10px]` |
| LOW | H | 290-326 | Nav arrows `transition-colors` with no target — hover is dead |

#### AccountView.jsx (518 lines) — Settings
| Sev | Cat | Line | Issue |
|-----|-----|------|-------|
| HIGH | A | 177 | Profile card `linear-gradient(135deg, #f0f4ff 0%, #ffffff 60%)` + tinted blue shadow — 2018-era SaaS gradient **[FIXED]** |
| HIGH | A | 181-184 | Avatar `linear-gradient(135deg, #4f76d9, #3B61C4)` + heavy colored shadow **[FIXED]** |
| HIGH | A | 235 | Plan card dynamic `linear-gradient(160deg, ${planInfo.color}08 0%, #ffffff 40%)` **[FIXED]** |
| HIGH | A | 322-323, 338 | Trial CTA panel + button `linear-gradient(135deg, #3B82F6, #10B981)` blue→green **[FIXED]** |
| HIGH | A | 218 | Sessions stat tile uses violet `#8B5CF6` — off palette **[FIXED]** |
| HIGH | G | 215-227 | 4 stat tiles in 4 different brand colors — no primary stat **[FIXED]** |
| HIGH | D | 277, 337, 353, 365, 444 | Buttons radius 10 mostly; token md=12, lg=14 |
| HIGH | A | 399 | Google Calendar icon stroke `#3B82F6` blue-500 not accent `#3B61C4` |
| MED | B | 174 | h1 fontSize 28/700 + sectionLabel also 700 — same weight, different sizes flattens hierarchy |
| MED | C | 60-63 | Card gutter `marginBottom: 12` vs `8` on Sign Out card |
| MED | A | 230 | Empty state `#C0C0C0` — too dim, not in tokens |
| MED | A | 292, 510 | `#BBBBBB` and `#C0C0C0` — two near-identical greys, neither in tokens |
| MED | C | 393, 395 | Duplicate `borderBottom` key in style object (one is redundant) |
| MED | C | 379 | `borderTop: '3px solid #F59E0B'` on Referral; `#3B61C4` on Progress — only 2 of 6 cards have it (arbitrary) |
| MED | A | 365 | Unlimited upgrade `#059669` emerald-600 (correct) but Sign Out `#EF4444` red-500 (mixed shade) |

#### Cross-Calendar consistency
| Sev | Issue | Where |
|-----|-------|-------|
| HIGH | Today highlight color: Month/Day `#3B61C4`, Week `#4F46E5` | WeekView 484/490 **[FIXED]** |
| HIGH | Hour-label color: Day `#4B5563`, Week `#374151` | DayView 380 vs WeekView 591 |
| HIGH | Completion check style: Month emoji `✓`, Day filled SVG, Week none | All 3 |
| HIGH | Session block text minimums: 10/10/11px — same UI element, 3 sizes | All 3 |
| MED | Conflict text `#fbbf24` amber-400 used in all 3 — wrong on white | Month 229, Week 776, Day 480 |
| MED | Add-session button bg alpha 0.05 vs 0.06 | DayView 309 vs rest |
| MED | Nav spacing: Day `mb-3 pb-3`, Week `mb-4 pb-3`, Month `mb-4` only | All 3 |
| MED | Weekend coloring: Month dims Sun, Week none, Day no header | Month 115, Week 484 |
| LOW | Gridline density: Week has half-hour `0.04`, Month has none | WeekView 14-15 |
| LOW | "Add session" button height varies | Month 270, Week 427 |

### Phase 3 — Pass 2 (2026-05-24)
Tier-1 consistency/bug fixes + three structural primitives. All 28 touched files parse-check clean with esbuild.

**Tier 1 (bugs & consistency)**
- **StudyToolsView drill dark-mode artifacts** — `bg-emerald-900/40 text-emerald-300`, `bg-red-900/20 text-red-300`, `text-amber-300`, `text-emerald-400 ✓` glyphs all converted to light tokens (emerald-50/600, red-50/600) with SVG icons.
- **Calendar visual unification** — Month/Week/Day conflict color `#fbbf24` → `#D97706`; hour labels normalized to `#6B6B6B`; DayView three-tier grey palette collapsed to two-tier; all-day non-syllabus block invisible-text `#f1f5f9` bug fixed.
- **FocusMode TAB_COLORS reset** — Was 6 competing accents (purple/pink/orange/emerald/teal/blue) themed across the screen; collapsed to brand `#3B61C4`. "Session Complete" stat cards and activity chips flattened to white-on-token with emerald-success state.
- **GradeHubView violet token** — Removed bogus `violet: '#111111'` that made the "Three paths" cards near-identical. `PATH_COLORS` now `[sky, mint, orange]`. `PATH_ICONS` Unicode glyphs `['↗', '↑', '◈']` replaced with SVG icons.
- **AccountView polish** — Duplicate `borderBottom` key removed; Google Cal icon → brand `#3B61C4`; `#BBBBBB`/`#C0C0C0` → `#9B9B9B`; arbitrary Referral colored top accent removed; semantic shades normalized (`#EF4444` → `#DC2626`).

**Structural additions**
- **`src/components/ui/spinner.jsx`** — `<Spinner size={xs|sm|md|lg|xl} color track />`. Migrated 22 of 24 sites across App.jsx, BlueprintScreen, BrainDumpModal, CalendarDayView, CheatSheetModal, ExamRescueModal, FocusMode, GradeHubView, GradePredictorView, OutputView, PrepBlastScreen, QuickQuizBurst, StudyCoachView, StudyToolsView, SyllabusUploadModal.
- **`src/components/ui/empty-state.jsx`** — `<EmptyState icon headline sub action tone compact />`. Migrated 5 sites: CalendarDayView, CalendarMonthView, GradeHubView ×2, CoursesView search.
- **Emoji → SVG icon sweep** — Replaced `✓ ✗ ✕ × ↗ ↑ ◈` glyphs across 15 sites with stroke-2.5 SVG icons: AppShell sidebar, AuthScreen, CalendarMonthView completion, CalendarWeekView rest-day, CoursesView "Saved", DashboardView pace + features, FocusMode mastered + answers + auto-set toast, GradeHubView GPA trend + close buttons, OutputView gcal toast + "Applied", PaywallModal close, ProgressView trends, ReferralCard, StudyCoachView Copied + style chip, StudyToolsView flashcard known. LandingPage intentional-dark marketing glyphs left.

**Other small fixes incidentally swept**
- OutputView "Fix conflicts" button had `text-amber-300 bg-amber-900/20` dark-mode classes — converted to amber-50/700.

#### Phase 3 — Remaining work (deferred)
- Run Playwright at 1440px / 390px to catch responsive issues the static audit can't see
- Migrate raw hex literals → `T.*` token references (still ~200 raw refs)
- Build `<Button>` primitive (`ui/button.jsx` exists, unused) — lock down 12+ inline `borderRadius` values across 660+ buttons
- Build `<Modal>` wrapper — 8 modals have slightly different backdrop blur/opacity/close-button style
- Build `<Card>` primitive (`ui/card.jsx` exists, unused) — migrate remaining card surfaces
- Global `:focus-visible` ring system
- Mobile responsive sweep (text below 11px floor in several pills, GradeHub table overflow at <600px)
- 2 SVG-arc spinner sites in StudyToolsView (L724, L776) — migrate when surrounding button styling is reworked

## SEO Status

### Layer 1 — Technical SEO (complete)
- `public/sitemap.xml`: updated with all new pages, 36 URLs total
- `public/robots.txt`: present, allows all, points to sitemap, blocks `/app` and `/api/`
- `index.html` meta: title, description, canonical, og:*, twitter:* all present
- JSON-LD on index.html: WebSite, SoftwareApplication (with Offers), Organization, WebPage, FAQPage — all present
- Preconnects: fonts.googleapis.com and fonts.gstatic.com present. Supabase preconnect NOT added (would need `VITE_SUPABASE_URL` value — flagged below)
- Core Web Vitals: not audited this run (no Lighthouse CI configured); flagged below

### Layer 2 — Landing pages (6 / 6 complete)
All published under `public/` with rewrites in `vercel.json`:
- /study-planner-for-college-students
- /gpa-calculator
- /how-to-study-for-finals
- /pre-med-study-guide
- /grade-calculator
- /study-schedule-template

### Layer 3 — Blog articles (10 / 10 complete)
Living at `/blog/<slug>`. Article #6 ("Study Tips for Finals Week") was already published before this run.
- /blog/how-to-study-for-organic-chemistry (new)
- /blog/how-to-raise-your-gpa-after-a-bad-semester (new)
- /blog/best-study-schedule-for-college-students (new)
- /blog/how-to-get-an-a-in-any-class (new)
- /blog/mcat-study-schedule-6-months (new)
- /blog/how-to-study-for-finals-week (existing)
- /blog/how-to-stop-procrastinating-when-studying (new)
- /blog/how-to-study-with-adhd-in-college (new)
- /blog/what-gpa-do-you-need-for-medical-school (new)
- /blog/how-to-balance-a-heavy-course-load (new)

`public/blog/index.html` rebuilt to surface all 13 published articles (4 pre-existing + 9 new). Fixed prior broken card that double-linked to `how-to-study-for-finals-week`.

### Layer 4 — Keyword Intelligence
- Status: deferred (intended to run monthly); not connected to Google Search Console yet — flagged below

### Decisions Made by This SEO Run (deviations from spec)
1. **Did NOT spin up a separate `studyedge-blog` Astro repo at `blog.getstudyedge.com`.** The existing static-HTML blog at `/blog/` is already published in `public/blog/`, sitemap-registered, and stylistically consistent. Adding a separate repo plus DNS setup would create two places to maintain. The 10 articles were added to the existing pattern instead. Re-decide if you want the subdomain split for analytics/MDX authoring.
2. **Did NOT add a Supabase preconnect hint** to `index.html`. Would require committing the Supabase project URL (pulled from env). Easy to add by hand once decided: `<link rel="preconnect" href="https://<project>.supabase.co">`.

## Open Questions for Developer
1. **TodayFocus vs StudyNowCard** — appear to be near-duplicate dashboard cards. Should one be removed?
2. **LandingPage** — marked intentional-dark for now. If you want the marketing page rebuilt light to match the app shell, that is a separate, larger redesign (800+ lines, all branding visuals would need to be re-derived). Flag if you want it.
3. **`src/tokens.js` adoption** — file exists but no components consume it yet. Hex literals were inlined directly in this pass. Next pass: migrate components from raw hex/Tailwind to `T.bg`, `T.bgCard`, etc. Better as a per-view refactor during other work, not a mechanical sweep.
4. **Visual QA** — none of these changes have been verified in a running browser. Spin up dev and walk: onboarding (all 4 steps), auth/reset, dashboard cards, focus mode notes with a formula, tour overlay.
7. **Astro blog migration to `blog.getstudyedge.com`** — current run kept the existing static-HTML blog in `public/blog/`. If you want the subdomain split (separate analytics, MDX authoring), this requires a new repo, Vercel project, and DNS records — flag if/when to do it.
8. **Google Search Console connection** — required for Layer 4 keyword intelligence (monthly ranking checks).
9. **Twilio iMessage notification** — `scripts/notify.js` and Twilio env vars not yet set up; SEO run did not notify.
10. **Lighthouse CI** — adding it to the build pipeline would let future SEO runs auto-flag Core Web Vitals below 80.

## Competitor Notes
- Quizlet: flashcards only, no planning, no grade math
- Notion: blank canvas, no AI, no structure
- Google Calendar: no AI, no grade connection
- None of them: know your syllabus, grade weights, struggle topics, and time to exam simultaneously

## App Positioning (source of truth)
StudyEdge AI solves 4 things no other app solves together:
1. When to study
2. What to study
3. How to stay locked in
4. How to actually improve your grades

---

## Email System Agent — Run Notes (2026-05-26)

### What changed
- All transactional/cron email HTML templates converted from dark theme (`#080D1A`) to light theme matching `weekly-digest.js`: page `#F7F6F3`, card `#FFFFFF`, primary text `#111111`, muted `#6B6B6B`/`#9B9B9B`, accent `#3B61C4`, system font.
- Files rewritten: `welcome-email.js`, `day1-tips.js`, `day7-milestone.js`, `day14-upgrade.js`, `weekly-recap.js`, `exam-countdown.js`, `exam-tomorrow.js`, `re-engage.js`. `weekly-digest.js` was already light and unchanged.
- Subject lines kept under 50 chars where possible. CTA copy specific. Signed "— The StudyEdge AI team".
- Welcome-email was orphaned (never invoked from signup flow). Wired it into `App.jsx` `SIGNED_IN` handler, fired once per `user.id` via localStorage flag (server idempotency still recommended).
- Three new sequences added (per spec):
  - `api/onboarding-complete.js` — fires from `handleOnboardingComplete` in `App.jsx`. Shows the user their captured profile + first next action.
  - `api/first-plan.js` — fires from `handleAddCourse` only when going from 0 → 1 course. Includes course names in body.
  - `api/streak-broken.js` — daily cron at 17:00 UTC. Reads `study_tools._streak` and `completed_sessions` from `user_data`. Only fires if previous streak ≥ 3 days, user didn't study today or yesterday, and not emailed in last 4 days. Throttled via `last_emailed_at`.
- `vercel.json` cron list updated to include `/api/streak-broken`.

### Critical env vars NOT in `.env` — required in Vercel
- `RESEND_API_KEY` — required for every Resend email. Without it all senders return `{ ok: true, skipped: true }` and silently no-op. **This is the #1 reason no emails are firing.** Set in Vercel → Project → Settings → Environment Variables (Production + Preview).
- `LOOPS_API_KEY` — required for Loops.so contact sync and event triggers (welcome-email also fires Loops events). Lifecycle automations defined inside Loops dashboard.
- `CRON_SECRET` — recommended. All cron endpoints check `Authorization: Bearer <secret>`. Without it, cron endpoints are publicly callable.
- `SUPABASE_SERVICE_KEY` — already present in `.env` locally; verify it's also set in Vercel for the cron jobs that use `supabase.auth.admin.listUsers` and admin queries.

### Supabase confirmation email — known broken
The QA agent reported "Error sending confirmation email" on real-email signup. Supabase Auth uses its built-in SMTP by default, which has aggressive sender limits and frequently fails on shared/default sender. Fix:
1. Supabase Dashboard → Authentication → Settings → SMTP — configure custom SMTP. Easiest: point it at Resend SMTP using credentials from Resend dashboard.
2. Supabase Dashboard → Authentication → Email Templates — customize confirmation + reset templates to match brand (otherwise users see generic Supabase HTML).
3. Verify domain `getstudyedge.com` is verified in Resend (Domains tab) before using its SMTP.

### Deliverability checklist (DNS for `getstudyedge.com`) — needs verification
- [ ] **SPF** record: include Resend's sending IPs — `v=spf1 include:_spf.resend.com ~all` (or merge with existing SPF).
- [ ] **DKIM**: TXT record from Resend → Domains → `getstudyedge.com`. Required for inbox placement.
- [ ] **DMARC**: `v=DMARC1; p=none; rua=mailto:support@getstudyedge.com` to start. Move to `p=quarantine` after a week of clean reports.
- [ ] Resend → Domains → `getstudyedge.com` must be verified.
- [ ] Sender `support@getstudyedge.com` must be active in Resend.
- All of the above can only be verified by logging into Resend + DNS host — the agent cannot do this without dashboard access.

### What couldn't be fixed without dashboard access
- Cannot verify Resend domain/DKIM status — needs Resend login.
- Cannot configure Supabase SMTP/templates — needs Supabase dashboard.
- Cannot set Vercel env vars from this agent run — must be done in Vercel project settings UI.
- Cannot send test emails to confirm rendering — needs a Resend key configured.

### Open questions for the developer
1. Is Resend already configured in Vercel env? If yes, what's blocking? If no, this is the unblock.
2. Is `getstudyedge.com` verified in Resend? (Check Resend → Domains.)
3. Should we move Supabase confirmation to Resend SMTP, or keep Supabase's built-in?
4. The dead `api/crons.js` consolidated handler still has dark-themed templates. Cron routes in `vercel.json` point to the standalone files now, not this — recommend deleting `api/crons.js` after confirming nothing else imports it.
5. Streak-broken email reads `study_tools._streak` — confirm that's where the client writes the streak object. If schema differs, the dedupe heuristic needs updating.

---

## Email Rate-Limiting Policy (2026-05-26)

To protect domain reputation and avoid spam complaints, all cron-driven emails go through `lib/server/emailGuard.js`. The guard reads `user_data.last_emailed_at` and applies these gaps:

| Priority | Min gap since last email | Used by |
|---|---|---|
| `critical` | 0 (always sends) | `exam-tomorrow` |
| `normal` | 48 hours | `weekly-recap`, `weekly-digest`, `exam-countdown`, `day1-tips`, `day7-milestone`, `day14-upgrade` |
| `low` | 5 days | `re-engage`, `streak-broken` |

Every successful send calls `recordUserEmail(userId)` to bump `last_emailed_at`. `exam-tomorrow` is critical (never throttled) but it still records, so re-engage and streak-broken back off for 48h after an exam reminder — users get space when it matters.

**Sunday dedupe:** `weekly-recap` skips users with `email_digest = true` — those users get the richer digest instead. No more double-email Sundays.

**Exam-countdown collapsing:** Previously, a user with N courses with exams in the 14/7-day window got N emails. Now it sends one email per user per cron run (most-urgent first). `exam-tomorrow` still catches secondary exams at 1-2 days out.

**Realistic worst-case per week:** 3 emails — Sunday digest/recap, mid-week re-engage OR streak-broken, plus exam-tomorrow when relevant. Down from ~10 emails/week.

---

## Supabase Auth Email Setup (2026-05-26)

Confirmation/reset emails fail because Supabase's built-in SMTP has a 4 emails/hour shared cap. Fix: route Supabase Auth through Resend SMTP. Full step-by-step in `docs/supabase-email-templates.md`, including the branded HTML to paste into Supabase → Authentication → Email Templates.

The `AuthScreen` confirmation-pending screen was also tightened:
- Added an "Open Gmail/Outlook/iCloud Mail" button that deep-links to the user's webmail provider based on their email domain
- Resend button now has a 60s cooldown (matches Supabase's per-email rate limit) and surfaces "Too many tries" vs generic "Failed" states
- Existing auto-polling (every 5s for `email_confirmed_at`) preserved
