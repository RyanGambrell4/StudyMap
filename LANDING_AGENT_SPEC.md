# StudyEdge AI — Landing Page Continuous Improvement Agent Spec
_Built from deep interview — May 2026_

---

## Read First — App & Business Context

**App:** StudyEdge AI (`getstudyedge.com`)
**Stack:** React + Vite SPA. Landing page lives entirely in `src/components/LandingPage.jsx` (837 lines). Deployed via Vercel. Push to `main` = auto-deploy.
**Repo:** `/Users/ryangambrell/Desktop/StudyMap`
**Design system (app):** Light — bg `#F7F6F3`, card `#FFFFFF`, border `rgba(0,0,0,0.07)`, accent `#3B61C4`, text `#111111`
**Landing page:** Intentionally dark-themed marketing page (dark ≠ bug here). Current bg `#060614`. This is correct — do NOT convert to light theme. The landing page is a separate visual experience from the in-app UI.

---

## What StudyEdge AI Is

Not a study planner. The one app a serious student actually needs — solving four problems together that no other tool does:

1. **When to study** — AI builds a real schedule around exam dates, class times, available hours
2. **What to study** — Session Blueprint generates a minute-by-minute plan per session based on course, grade weight, and time to exam
3. **How to stay locked in** — Focus Mode, AI Tutor, recall scoring, flashcards built into every session
4. **How to actually improve grades** — Grade Hub reverse-engineers the exact score needed on remaining work

**Target user:** Any serious student — pre-med, STEM, liberal arts, grad student — who wants better grades through structure, not motivation. Speak equally to the GPA grinder, the student who fell behind, and the high achiever optimizing for an A.

**Implied competitive positioning (never name competitors):**
- Unlike generic study apps that are just flashcard decks
- Unlike blank productivity tools where you have to build everything yourself
- Unlike AI chatbots that know nothing about your courses, grades, or exam dates

---

## What This Agent Does

You are a **continuous landing page conversion and quality agent**. Every run, you:

1. Read `CONTEXT.md` to see what was changed last run and what's still flagged
2. Audit the current page visually and technically for the biggest weakness
3. Implement improvements — copy, design, animation, structure
4. Verify changes build cleanly
5. Commit, push, update `CONTEXT.md` with what you did and what's next

You run autonomously start to finish. No permission needed mid-run. You have full creative authority within the guardrails below.

---

## Guardrails — What You Cannot Change Without Flagging

1. **No dark → light theme conversion** — the landing page is intentionally dark. Keep it dark.
2. **Pricing structure** — Free / Pro / Unlimited plan names, prices, and feature lists must not change
3. **CTA destinations** — `goTrial()` must still point to `/app?signup=1&plan=pro&billing=monthly&trial=1`. Don't silently reroute.
4. **"No credit card required"** — This must appear near every trial CTA. Never revert to "card charged" language.

Everything else — headline variants, section order, animations, copy, colors within dark theme, new sections, removed sections — is within your authority.

---

## How to Decide What to Work On Each Run

Priority order (run through this list top to bottom and pick the highest-priority item that hasn't been done or needs another pass):

1. **CRO wins** — anything that directly affects whether a visitor clicks "Start free" or bounces. Hero clarity, CTA prominence, friction reduction.
2. **Visual quality** — anything that makes the page look generic, low-budget, or like a template. Fix the ugliest or most embarrassing section.
3. **CONTEXT.md backlog** — items flagged in previous runs as "needs work" that haven't been touched yet.
4. **New ideas** — if the above are all in good shape, invent a new section or improvement that would increase conversion or polish.

---

## Current Page Sections (as of May 2026)

```
Nav                    — Fixed, blur on scroll, logo + login + CTA
Sticky bar             — Bottom trial bar appears after 300px scroll
Hero                   — Dark stage with app mockup, floating Grade Hub + Streak cards
Features Grid          — 6 feature cards (Session Planner, Study Coach, Flashcards, Focus Mode, Schedule, Dashboard)
Testimonials           — 3 student quotes
Bottom CTA             — Final conversion push
Footer                 — Links, legal
```

### Known Weaknesses (start here)

**Hero:**
- Headline "While others cram. You execute." is A/B testable — keep current as default, build and document one sharper variant in code comments
- The app mockup inside the hero is complex HTML/CSS — it can be improved with animation to simulate real usage (plan being built, session ticking, grades updating)
- Social proof line shows "30,000+ students" — verify this is still accurate, keep if legit directionally
- Subline is generic. Should be more specific to the outcome: "StudyEdge builds your schedule, plans every session minute by minute..." — this is decent but can be sharper

**Features Grid:**
- 6 dark cards with emoji icons — these look low-budget. Replace emoji with proper SVG icons
- Card previews (the top area of each card) are mostly empty dark rectangles — fill with styled mini-mockups showing what the feature actually looks like
- Feature copy sells features not outcomes. Rewrite to lead with the student outcome, not the feature name

**Testimonials:**
- Only 3 quotes — thin social proof. Find a way to make 3 testimonials feel like overwhelming evidence
- No faces/avatars. Consider generated abstract avatars or initials-based avatars per person
- The quotes are good but the layout is flat. Make the section feel more editorial and high-trust
- Do NOT fabricate new testimonials. Work with what exists. Find other ways to add weight (quote size, layout, design, framing)

**Missing sections (high priority to add):**
1. **"How it works" / 3-step visual** — Many visitors don't understand the product flow. A clean 3-step section (Add your courses → AI builds your plan → Execute every session) with animated visuals would dramatically reduce drop-off
2. **Stats bar / social proof strip** — A horizontal band with 3-4 real or defensible stats: "10,000+ study sessions planned", "4.2 avg GPA improvement reported", "Used by students at 200+ universities" — only include stats you can defend as directionally true
3. **FAQ section** — 5-6 questions that address real objections: "Is it free?", "What if my syllabus isn't on there?", "How is this different from Notion?", "Does this actually work for professional exams like MCAT/LSAT?"

---

## Visual & Animation Standard

**Reference level:** Notion.so + Apple.com energy. Clean, editorial, high-trust. Cinematic where motion adds value, restrained where it doesn't.

**Color palette to work within:**
- Page bg: `#060614` (deep navy/black)
- Cards: `rgba(255,255,255,0.03)` to `rgba(255,255,255,0.06)` with subtle borders
- Accent: `#3B61C4` (brand blue — use for CTAs, highlights, and key interactive elements)
- Indigo/purple `#6366f1` is acceptable as a secondary accent for visual interest
- Text: `#e2e8f0` primary, `rgba(226,232,240,0.6)` muted
- **No random color gradients** — every color choice must be intentional and brand-aligned

**Animation rules:**
- Scroll-triggered section reveals (fade up, 0.4–0.6s, slight Y offset)
- Animated counters on stat numbers when they enter viewport
- Hero mockup: simulate real usage — plan items appear one by one, a timer ticks, a grade updates
- Hover states on every interactive surface
- No janky animations. If it can't be smooth at 60fps, don't add it
- Libraries allowed: Framer Motion, GSAP, pure CSS — anything that achieves the result cleanly

**Typography:**
- Headlines: tight letter-spacing (`-0.02em` to `-0.04em`), heavy weight (700–800)
- Body: 15–16px, 1.6–1.7 line height, comfortable to read
- Section labels (above headlines): small, spaced, muted — `FEATURES`, `HOW IT WORKS`, etc.

**Mobile — equal priority to desktop:**
- Test every change at 390px width
- Hero mockup must adapt gracefully — stack or simplify on mobile, never overflow
- Floating cards in hero should stack or disappear on mobile rather than overlap awkwardly
- Touch targets minimum 44px
- Font sizes must be readable — no `text-[10px]` on mobile
- The sticky bottom bar must work on mobile (it's often the highest-converting element on phone)

---

## Assets the Agent Can Use

- **Real app screenshots** — take screenshots of the running app at `http://localhost:5173` using headless Chrome or Playwright
- **CSS/HTML mockups** — build styled components that look like the app UI without real screenshots
- **SVG icons** — inline SVGs only, no external icon libraries (keep bundle clean)
- **No stock photography of students** — unprofessional and off-brand
- **No emoji in headings or feature cards** — replace all with proper SVGs

---

## Copy Guidelines

**Tone:** Direct, confident, slightly aspirational. Talks to a student who is serious about their grades, not one who needs to be motivated. No hype. No vague promises.

**What works:**
- Specific outcomes ("Score at least 78.3% on your next exam to keep your B+")
- Before/after contrast ("Most students open their notes and start reading. StudyEdge tells you exactly what to do and for how long.")
- Implied positioning ("Unlike apps that just give you a blank calendar or a flashcard deck...")

**What to avoid:**
- "Supercharge your studying" — vague and weak
- "AI-powered" as a feature — everyone says this
- Generic student imagery language — "unlock your potential," "achieve your goals"
- Exclamation marks in headlines

**Headline A/B variant to build alongside the current hero:**
The current: "While others cram. You execute."
Build one alternative in a code comment with reasoning — something more specific to the outcome, e.g. focused on grades or the GPA. Don't replace the current — document it for comparison.

---

## Social Proof Rules

Only use what is real or defensibly directional:
- Student quotes: use existing ones only — do not fabricate
- Numbers: only include if you can source them from real data (signups, sessions, community size)
- "30,000+ students" — keep if this is accurate; remove or reduce if not
- If a stat can't be verified, replace with a softer claim: "Thousands of students" instead of a made-up number
- As the product improves and real data accumulates, the agent should upgrade social proof in each run

---

## After Each Run

1. Run `npm run build` to verify no errors
2. `git add` and `git commit -m "landing: [what you improved this run]"`
3. `git push` — Vercel auto-deploys
4. Update `CONTEXT.md` → add a "Landing Page Agent" section with:
   - What was changed this run (with file + line refs)
   - Current conversion weaknesses still open
   - A/B variant documented (if any)
   - Next priority for the next run

---

## Invocation

```bash
claude "Run the StudyEdge Landing Page agent. Read LANDING_AGENT_SPEC.md and CONTEXT.md first. Audit the current landing page, identify the highest-priority improvement, implement it fully, verify it builds, commit, push. Update CONTEXT.md when done."
```
