# StudyEdge AI — Landing Page Full Redesign Spec
_Built from deep interview — May 2026_

---

## Context

**File to rewrite:** `src/components/LandingPage.jsx` (currently 837 lines, dark-themed)
**Repo:** `/Users/ryangambrell/Desktop/StudyMap`
**Deploy:** Push to `main` → Vercel auto-deploys to `getstudyedge.com`
**App design system:** bg `#F7F6F3`, card `#FFFFFF`, border `rgba(0,0,0,0.07)`, accent `#3B61C4`, text `#111111`, muted `#6B6B6B`

---

## The Single Most Important Instruction

This is a **full rewrite**, not a polish pass. The current dark page gets replaced entirely with a light, cinematic, premium design. The goal is a page that looks like it belongs next to Framer.com and Linear.app — but light-themed to match the app.

---

## Design Foundation

### Theme
- **Light-themed throughout** — no dark sections except optional subtle gradient accents
- Page background: `#F7F6F3` (app bg color)
- Card surfaces: `#FFFFFF`
- Borders: `rgba(0,0,0,0.07)`
- Primary text: `#111111`
- Muted text: `#6B6B6B`
- Accent: `#3B61C4` (brand blue — buttons, highlights, links)
- Gradient moments: soft blue washes (`rgba(59,97,196,0.06)` to `transparent`) on section backgrounds, hero glow, section dividers

### Typography
- **Sharp & editorial** — tight letter-spacing, heavy weight
- Headlines: `font-weight: 800`, `letter-spacing: -0.035em`, large sizes (clamp 48–96px for hero)
- Section labels above headlines: `font-size: 11px`, `letter-spacing: 0.12em`, `text-transform: uppercase`, color `#3B61C4`
- Body: 15–16px, `line-height: 1.7`, color `#6B6B6B`
- Font stack: `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif` (already loaded)
- Mono for code/data moments: `'JetBrains Mono'` (already loaded)

### Color Usage
- Blue `#3B61C4`: CTA buttons, section label chips, active states, key data highlights
- Gradient washes: `linear-gradient(135deg, rgba(59,97,196,0.05) 0%, transparent 60%)` — use on hero bg, bento card hovers, section backgrounds
- Semantic: `#16A34A` green (success/grade up), `#D97706` amber (warning/streak), `#DC2626` red (urgent)
- No dark backgrounds anywhere — not even in feature cards

### Animations
Full cinematic treatment. Every section reveals on scroll. Use `IntersectionObserver` with `data-reveal` attributes (infrastructure already exists in current page — preserve and expand it).

**Required animations:**
- Hero: stagger-in for headline words (each word fades up 80ms apart)
- Hero mockup: screenshot fades in with a subtle upward drift
- Bento grid: cards reveal with 60ms stagger per card
- Stat counters: count up from 0 when they enter viewport
- Testimonial cards: stagger-in from bottom
- CTA sections: fade + scale from 0.97
- Hover on all cards: `transform: translateY(-3px)`, `box-shadow` lift
- All animations gated by `prefers-reduced-motion` media query

---

## Available Assets (use these — they're real screenshots)

```
/public/ss-hero.png           — Main dashboard overview
/public/ss-main.png           — Dashboard with schedule
/public/ss-coach.png          — Study Coach / plan view
/public/ss-blueprint.png      — Session blueprint
/public/ss-flashcard.png      — Flashcard UI
/public/ss-focus.png          — Focus mode
/public/ss-calendar.png       — Calendar view
/public/ss-progress.png       — Progress / grade view
/public/ss-study-plan.png     — Study plan
/public/ss-courses.png        — Course setup
/public/lp-grade-predictor.png
/public/lp-daily-view.png
/public/lp-ai-tutor.png
/public/logo.png              — App logo
/public/og-hero-v1.png        — OG image (1200×630)
```

Use real screenshots in feature cards and hero. Do not use stock imagery or placeholder blobs.

---

## Page Architecture (CRO-ordered)

```
1. Nav
2. Hero (split screen)
3. Stats strip
4. How It Works (3 steps)
5. Features Bento Grid
6. Testimonials (card wall)
7. Pricing (full table)
8. FAQ
9. Final CTA
10. Footer
```

---

## Section Specs

### 1. Nav
**Style:** Clean top bar, full-width. Transparent at top, transforms to `background: rgba(247,246,243,0.92)` with `backdrop-filter: blur(16px)` and `border-bottom: 1px solid rgba(0,0,0,0.07)` on scroll.

**Layout:** Logo + wordmark left → `Blog` `Features` `Pricing` links center → `Sign in` (ghost) + `Start free →` (blue pill) right

**Logo:** `<img src="/logo.png" />` (32px) + "StudyEdge AI" wordmark in `#111111`, `font-weight: 700`

**CTA button:** `background: #3B61C4`, `color: #fff`, `border-radius: 999px`, `padding: 9px 22px`, `font-size: 14px`, `font-weight: 700`

---

### 2. Hero
**Layout:** Split screen. Left 50%: copy + CTAs. Right 50%: app screenshot.

**Left side:**
- Label chip: `STUDYEDGE AI` in blue uppercase chip
- Headline (clamp 52–88px, weight 800, letter-spacing -0.035em):
  ```
  While others cram.
  You execute.
  ```
  Each word animates in with 80ms stagger (fade up from Y+20px)
- Subline (16px, color `#6B6B6B`, max-width 480px):
  `The AI study system that builds your schedule, plans every session, and tracks your grades — every course, all semester.`
- Student type strip (12px chips): `Built for Pre-Med · STEM · Liberal Arts · MCAT/LSAT · Grad Programs`
- Primary CTA: Large blue button `Start free — no credit card required →` (full-width on mobile)
- Secondary: `Sign in` ghost link underneath
- Trust micro-copy: `Free to start · 7-day Pro trial included · No card required`

**Right side:**
- Display `ss-hero.png` or `ss-main.png` — the current hero mockup image
- Convert to light theme: apply `filter: brightness(1.02) saturate(0.95)` if the image looks dark
- Wrap in a subtle rounded container: `border-radius: 16px`, `box-shadow: 0 24px 80px rgba(0,0,0,0.12)`, `overflow: hidden`
- Animate in: fade + translateY(-12px) over 0.6s, delayed 0.3s after headline
- Two floating stat chips anchored to the image (absolute positioned):
  - Bottom-left: `📅 14-day streak` chip in white card with green dot
  - Bottom-right: `GPA 3.78 ↑` chip in white card with blue accent

**Background:**
- Base: `#F7F6F3`
- Radial gradient glow behind the image: `radial-gradient(ellipse 60% 50% at 70% 50%, rgba(59,97,196,0.08) 0%, transparent 70%)`
- Subtle dot grid overlay at 5% opacity (existing pattern is fine)

**Below hero fold:** a thin horizontal divider with `overflow: hidden` marquee of student type tags scrolling slowly left. `Pre-Med · Organic Chemistry · Finals Week · GPA 3.8 → 3.9 · MCAT 2026 · Linear Algebra · Study Coach ·` etc. Color `#9B9B9B`, font-size 12px.

---

### 3. Stats Strip
Horizontal band, `background: #FFFFFF`, `border-top: 1px solid rgba(0,0,0,0.07)`, `border-bottom: 1px solid rgba(0,0,0,0.07)`. Padding 48px 0.

4 stats in a row (center-aligned, equal width):

| Stat | Label |
|---|---|
| `4+` | Study sessions planned per user |
| `68s` | Avg time to first plan generated |
| `≈ 1` | GPA point improvement reported |
| `1` | App for scheduling, coaching, and grades |

**Styling:** Giant gradient-clipped serif numeral (clamp 56–80px, `background: linear-gradient(135deg, #3B61C4, #6B8FE8)`, `-webkit-background-clip: text`, `color: transparent`). Label underneath in `#6B6B6B`, 13px.

**Animation:** Numbers count up from 0 when they enter viewport.

**Important:** Only use defensibly-true stats. The above are directional and honest. Do not fabricate large user counts.

---

### 4. How It Works
**Label:** `HOW IT WORKS`
**Headline:** `From signup to your first plan in 68 seconds.`
**Subline:** `Tell us your courses. We build the schedule. You execute.`

3-step horizontal layout (stack on mobile):

**Step 1 — Add your courses**
- Icon: graduation cap SVG
- Visual: `ss-courses.png` in a rounded card
- Copy: "Add your courses, exam dates, and how many hours you have. Takes 2 minutes."

**Step 2 — AI builds your plan**
- Icon: sparkle/AI SVG
- Visual: `ss-coach.png` or `ss-study-plan.png`
- Copy: "StudyEdge builds a week-by-week schedule optimized around your exam dates and grade weights."

**Step 3 — Execute every session**
- Icon: lightning bolt SVG
- Visual: `ss-blueprint.png`
- Copy: "Open the app each day. Your session is planned minute-by-minute. The AI tracks your progress and adapts."

**CTA below:** `Start building your plan →` blue button, centered.

**Connecting line:** A subtle dashed line connecting the 3 steps horizontally on desktop.

---

### 5. Features Bento Grid
**Label:** `FEATURES`
**Headline:** `Everything a serious student needs. Nothing they don't.`

CSS grid layout — asymmetric bento. On desktop: a 12-column grid with cards spanning different widths.

**Layout:**
```
[  AI Study Coach — 7 cols  ] [ Focus Mode — 5 cols ]
[ Session Blueprint — 5 cols ] [ Grade Hub — 7 cols  ]
[     Smart Flashcards + Quiz — 12 cols (wide)       ]
```

**Each card:**
- `background: #FFFFFF`
- `border: 1px solid rgba(0,0,0,0.07)`
- `border-radius: 20px`
- `overflow: hidden`
- Top half: real app screenshot (`object-fit: cover`, `height: 200–280px` depending on card size)
- Bottom half: padding 24px
  - Label chip (colored per feature)
  - Headline (outcome-led, 17–20px, weight 700, `#111111`)
  - 2-line description (`#6B6B6B`, 14px)
- Hover: `transform: translateY(-4px)`, `box-shadow: 0 16px 48px rgba(0,0,0,0.10)`, transition 0.25s

**Feature cards (outcome-led copy):**

1. **AI Study Coach** — screenshot: `ss-coach.png`
   - Chip: blue `STUDY COACH`
   - Headline: `A tutor for every course, on demand.`
   - Desc: `Generates a personalized week-by-week plan based on your exam dates, grade weights, and struggle topics.`

2. **Focus Mode** — screenshot: `ss-focus.png`
   - Chip: green `FOCUS MODE`
   - Headline: `Lock in. The AI runs the session.`
   - Desc: `Pomodoro-style sessions with a built-in blueprint. No more opening your notes and staring.`

3. **Session Blueprint** — screenshot: `ss-blueprint.png`
   - Chip: amber `SESSION BLUEPRINT`
   - Headline: `Every minute of every session, planned.`
   - Desc: `Before each session, the AI generates a minute-by-minute agenda based on what you need to cover.`

4. **Grade Hub** — screenshot: `ss-progress.png`
   - Chip: blue `GRADE HUB`
   - Headline: `Know exactly what score you need.`
   - Desc: `Enter your grade weights and current scores. Grade Hub reverse-engineers the number you need on every remaining assignment.`

5. **Smart Flashcards + Quiz** — screenshot: `ss-flashcard.png` (wide card)
   - Chip: purple `FLASHCARDS & QUIZ`
   - Headline: `Flashcards that only quiz what you're forgetting.`
   - Desc: `Upload your notes. The AI builds a flashcard deck and quiz calibrated to your weak spots — not generic trivia.`

**Inline CTA below grid:** `Start free — no credit card required →`

---

### 6. Testimonials (Card Wall)
**Label:** `WHAT STUDENTS SAY`
**Headline:** `Built for students who are serious about their grades.`

A CSS grid of testimonial cards — 3 columns on desktop, 1 on mobile. Cards have slightly different heights for an organic feel.

**Card style:**
- `background: #FFFFFF`
- `border: 1px solid rgba(0,0,0,0.07)`
- `border-radius: 16px`
- `padding: 24px`
- Large opening quote mark in `#3B61C4` at 40px
- Quote text: 15px, `#111111`, `line-height: 1.6`
- Author: 13px, `font-weight: 600`, `#111111` + course/year in `#6B6B6B`
- Stagger-reveal animation: each card delays 60ms

**Use existing testimonials only.** Do not fabricate quotes. If only 3 exist, display them at a larger size rather than padding with fake ones.

**Inline CTA below:** `Join them — start free →`

---

### 7. Pricing (Full Table)
**Label:** `PRICING`
**Headline:** `Free to start. Pro when you're serious.`
**Subline:** `No credit card required to begin. Upgrade when you're ready.`

3-column card layout: Free / Pro / Unlimited

**Card structure:**
- Plan name (18px, weight 700)
- Price (clamp 36–48px, weight 800, letter-spacing -0.03em) + `/month` in muted
- 1-line positioning statement
- Feature list with checkmarks
- CTA button

**Free card:**
- `background: #FFFFFF`, standard border
- Price: `$0`
- Tagline: `Everything you need to get started.`
- Features: 1 course, 10 AI boosts/month, Basic scheduling, Grade tracking
- CTA: `Get started free` (ghost/outline button)

**Pro card (featured):**
- `background: #3B61C4`, `color: #FFFFFF`, larger, slightly elevated with shadow
- Price: `$X/mo` (use actual price)
- Badge: `MOST POPULAR` chip at top right
- Tagline: `For students who want real results.`
- Features: 5 courses, 75 AI boosts/month, AI Study Coach, Session Blueprints, Flashcards & Quiz, Grade Hub, Focus Mode
- CTA: `Start 7-day free trial →` (white button, blue text)
- Microcopy: `No credit card required`

**Unlimited card:**
- `background: #FFFFFF`, standard border
- Price: `$X/mo`
- Tagline: `No limits. Everything, forever.`
- Features: Unlimited courses, Unlimited AI boosts, Everything in Pro
- CTA: `Start free →` (blue button)

---

### 8. FAQ
**Label:** `FAQ`
**Headline:** `Common questions.`

Accordion-style. Each question expands on click. 6 questions:

1. **Is it really free to start?** — Yes. Free plan includes 1 course and 10 AI boosts per month. No card required.
2. **How is this different from Notion or Google Calendar?** — Unlike blank tools where you build everything yourself, StudyEdge AI knows your course structure, grade weights, exam dates, and study history — and uses all of it to tell you exactly what to do right now.
3. **What if my syllabus isn't uploaded anywhere?** — You can paste text, upload a PDF, or just add your topics manually. The AI adapts to however much information you give it.
4. **Does it work for professional exams like MCAT, LSAT, CPA?** — Yes. StudyEdge has presets for MCAT, LSAT, GRE, GMAT, CPA, and Bar Exam with the correct section structure built in.
5. **Will the AI actually know my course material?** — You upload your notes or syllabus and the AI uses your actual content — not generic study tips — to build flashcards, quizzes, and session plans.
6. **Can I cancel anytime?** — Yes. Cancel from your account settings at any time. No hidden fees.

**Accordion animation:** Height transition 0.3s ease, chevron rotates 180deg on open.

---

### 9. Final CTA Section
Full-bleed section. `background: linear-gradient(135deg, #3B61C4 0%, #2d4fa8 100%)`. `padding: 120px 0`.

**Headline** (white, clamp 40–72px, weight 800, letter-spacing -0.03em):
```
Stop studying harder.
Study what actually moves your grade.
```

**Subline** (white at 70% opacity, 18px): `Free to start. Your first plan in 68 seconds.`

**CTA button:** White background, `#3B61C4` text. `border-radius: 999px`. `padding: 16px 40px`. `font-size: 17px`, `font-weight: 700`. `Start free →`

**Microcopy:** `No credit card required · Cancel anytime` in white at 50% opacity, 13px.

**Background decoration:** Subtle radial gradient lighter spot behind the headline.

---

### 10. Footer
4-column layout + a final CTA row at the very top of the footer.

**Top row (CTA):**
- Headline: `Ready to start?` + blue `Start free →` button
- This is the absolute last conversion moment before the legal links

**4 columns:**
1. **StudyEdge AI** — Logo + tagline + social icons (Twitter/X, Instagram)
2. **Product** — Features, How it works, Pricing, Blog (blog.getstudyedge.com)
3. **Resources** — How to study for finals, GPA calculator, Study schedule, MCAT prep (link to blog articles)
4. **Company** — About, Privacy, Terms, Contact (support@getstudyedge.com)

**Bottom bar:** `© 2026 StudyEdge AI. All rights reserved.` — 12px, `#9B9B9B`

---

## Mobile Rules (equal priority to desktop)

- Hero: stack vertically. Copy on top, screenshot below (max-height 340px, `object-fit: cover`, rounded corners)
- Floating stat chips: hide on mobile to avoid clutter
- Bento grid: single column, all cards full-width
- Stats strip: 2×2 grid on mobile
- How It Works: vertical stack with a vertical connecting line on the left
- Pricing: vertical stack, Pro card appears first
- Nav: hamburger menu with slide-down drawer on mobile
- All font sizes: clamp properly — never below 14px for body, never below 32px for hero headline on mobile
- Touch targets: minimum 44×44px

---

## Technical Requirements

**Libraries allowed (install freely):**
- `framer-motion` — for scroll animations and stagger effects
- `gsap` — if needed for complex timeline animations
- Pure CSS for simple transitions

**Preserve:**
- `onGetStarted` prop (called on all CTAs)
- `goTrial()` must navigate to `/app?signup=1&plan=pro&billing=monthly&trial=1`
- Sticky bottom bar (reskin to light theme — white background, blue text, not dark purple)
- `prefers-reduced-motion` gating on all animations

**Do not preserve:**
- The dark color scheme
- Any `rgba(255,255,255,0.x)` dark-mode card backgrounds
- The current hero stage scaling system (replace with simpler split-screen layout)

---

## Completion Checklist

- [ ] All sections built and responsive at 390px and 1440px
- [ ] All animations gated by `prefers-reduced-motion`
- [ ] Real screenshots used in hero and all feature cards
- [ ] `npm run build` passes with no errors
- [ ] `git commit -m "landing: full redesign — light theme, cinematic, premium"`
- [ ] `git push` → Vercel auto-deploys
- [ ] `CONTEXT.md` updated with redesign completion + any open items

---

## Invocation

```bash
claude "Read LANDING_REDESIGN_SPEC.md completely. Then fully rewrite src/components/LandingPage.jsx from scratch according to the spec. This is a complete replacement — not a patch. Build all 10 sections, make it responsive, animate everything, use real screenshots from /public/ss-*.png. Verify npm run build passes. Commit and push."
```
