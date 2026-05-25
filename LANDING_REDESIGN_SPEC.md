# StudyEdge AI — Landing Page Full Redesign Spec
_May 2026 — Full ground-up rewrite_

---

## Tech Stack & Constraints

- **File:** `src/components/LandingPage.jsx` — single React component, complete rewrite
- **Framework:** React + Vite, no Next.js
- **Prop contract:** component accepts `{ onGetStarted }` — must be preserved
- **CTA destination:** `goTrial()` = navigate to `/app?signup=1&plan=pro&billing=monthly&trial=1`
- **"Log in" link:** navigates to `/app`
- **Build check:** `npm run build` must pass with zero errors before commit
- **No new npm packages** unless absolutely necessary and justifiable
- **Animation:** Use CSS keyframes + `IntersectionObserver` for scroll reveals. Framer Motion acceptable if already in package.json.
- **Assets:** Real screenshots at `/public/ss-*.png` — use inside app mockups

---

## Visual Foundation

### Color Palette
```
Page bg:          #060614
Section alt bg:   #07091a
Card bg:          rgba(255,255,255,0.04)
Card border:      1px solid rgba(255,255,255,0.08)
Accent blue:      #3B61C4
Accent indigo:    #6366f1
Gradient:         linear-gradient(135deg, #3B61C4, #6366f1)
Text primary:     #e2e8f0
Text muted:       rgba(226,232,240,0.6)
Text dim:         rgba(226,232,240,0.35)
Glow:             rgba(99,102,241,0.15)
```

### Typography
```
Font:             Inter (load via Google Fonts or system fallback)
Headline:         font-weight 800, letter-spacing -0.03em to -0.04em
Subheadline:      font-weight 600, letter-spacing -0.02em
Body:             font-size 15-16px, line-height 1.7, font-weight 400
Section label:    font-size 11px, letter-spacing 0.1em, UPPERCASE, muted color
Button:           font-weight 700, letter-spacing -0.01em
```

### Animation System
All section content reveals on scroll entry via IntersectionObserver:
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
.reveal { opacity: 0; }
.reveal.visible { animation: fadeUp 0.5s ease forwards; }
```
Stagger children with `animation-delay: 0.1s` increments.

---

## Section 1 — Nav

**Layout:** Fixed top, full-width, blur backdrop on scroll (add `.scrolled` class after 50px scroll).

**Left:** Logo — "StudyEdge AI" in `#e2e8f0`, font-weight 700, 17px.

**Right:** "Log in" (ghost text link, `rgba(226,232,240,0.7)`, goes to `/app`) + "Start free" (gradient button, `background: linear-gradient(135deg, #3B61C4, #6366f1)`, border-radius 8px, padding `8px 18px`, font-size 14px).

**Scrolled state:**
```css
background: rgba(6,6,20,0.85);
backdrop-filter: blur(20px);
border-bottom: 1px solid rgba(255,255,255,0.06);
```

**Mobile:** Show logo + "Start free" only. Hide "Log in" to save space.

---

## Section 2 — Hero

**Layout:** Full viewport height (`min-height: 100vh`), two columns on desktop (55% left / 45% right), single column stacked on mobile.

**Background:** `#060614` with radial glow centered-right:
```css
background: radial-gradient(ellipse 80% 60% at 70% 40%, rgba(99,102,241,0.12) 0%, transparent 70%);
```

### Left Column

**Section label:** `THE AI STUDY SYSTEM` — 11px, muted, letter-spacing 0.1em, with 20px gradient left border.

**Headline:**
```
While others cram.
You execute.
```
Font size: `clamp(42px, 6vw, 72px)`. Weight 800. Letter-spacing -0.04em. Color `#e2e8f0`.

**A/B variant (code comment only — do not render):**
```
// ALT: "Know exactly what to study. Every session. All semester."
// Reasoning: more outcome-specific, less metaphorical — test against current
```

**Subline:**
```
StudyEdge builds your schedule, plans every session minute by minute,
and shows you the exact grade you need on every remaining assignment.
One app. Every course. All semester.
```
Font-size 16px. Color `rgba(226,232,240,0.65)`. Line-height 1.7. Max-width 440px.

**CTA group:**
- Primary: "Start free 7-day trial →" — gradient bg, border-radius 10px, padding `14px 28px`, font-size 15px, weight 700. Calls `onGetStarted('signup')`.
- Microcopy: "No credit card required · Cancel anytime" — 12px, muted.
- Secondary: "Log in →" — 14px, `rgba(226,232,240,0.55)`.

**Floating stat chips** (absolutely positioned around mockup, animate in with delay):
- "GPA 3.84 ↑"
- "🔥 12-day streak"
- "2h 15m studied today"

Chip style: `background: rgba(255,255,255,0.06)`, border `1px solid rgba(255,255,255,0.12)`, border-radius 10px, padding `8px 14px`, font-size 13px, backdrop-blur.

### Right Column — App Mockup

Browser-style frame:
```css
background: rgba(255,255,255,0.03);
border: 1px solid rgba(255,255,255,0.1);
border-radius: 16px;
box-shadow: 0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.2);
```

Use best available screenshot from `/public/ss-*.png` (prefer dashboard/grade hub view). Display as `<img>` with `object-fit: cover`.

**Mobile:** Mockup stacks below headline, max-width 340px, centered. Floating chips hidden.

---

## Section 3 — Trust Strip

**Layout:** Horizontal band. `background: rgba(255,255,255,0.02)`. Border top/bottom `1px solid rgba(255,255,255,0.05)`. Padding `20px 0`.

**Left label:** "Built for serious students —" (muted, 13px, static)

**Right:** Infinite CSS marquee scrolling left:
```
Pre-Med · STEM · Engineering · Computer Science · Liberal Arts · Psychology · MCAT · LSAT · GRE · Grad School · Nursing · Law · MBA · Biochemistry · Physics
```
Separators `·` in `#3B61C4`. Duplicate content for seamless loop.

```css
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.marquee-track { animation: marquee 20s linear infinite; white-space: nowrap; }
```

---

## Section 4 — Stats Band

**Layout:** 4 columns desktop, 2×2 grid mobile. Padding `80px 0`.

**Each stat:** Large animated number + descriptor line.

Stats:
1. `10,000+` — "study sessions planned"
2. `60s` — "from signup to first plan"
3. `4` — "problems solved in one app"
4. `∞` — "courses supported"

Number style: `font-size: clamp(40px, 5vw, 64px)`, weight 800, gradient text:
```css
background: linear-gradient(135deg, #e2e8f0, #6366f1);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

Count-up: trigger on IntersectionObserver entry, increment from 0 over 1.5s with ease-out.

---

## Section 5 — How It Works

**Section label:** `HOW IT WORKS`
**Headline:** "From zero to a full study plan in 60 seconds."

**3 steps, horizontal on desktop, vertical on mobile:**

```
01 Add your courses        02 AI builds your plan     03 Execute every session
Tell StudyEdge your        Based on exam dates,       Open your session plan.
courses, exam dates,       grade weights, and         StudyEdge tells you exactly
and available hours        your schedule, AI          what to do and for how long.
per week.                  builds your full           Focus mode, coach, and
                           semester plan.             recall scoring built in.
```

Step number chip: gradient text, monospace, small. Connector lines between steps (desktop): `1px dashed rgba(255,255,255,0.1)`. Cards: transparent, no heavy borders — spacious.

---

## Section 6 — Features (Alternating Rows)

4 full-width alternating rows. Each: 50% text / 50% visual. `120px` gap between rows.

### Row 1 — Session Planner (text left, visual right)
**Label:** `SESSION PLANNER`
**Headline:** "A minute-by-minute plan for every study session."
**Body:** "Most students open their notes and start reading. StudyEdge tells you exactly what to review, in what order, for how long — based on your exam in 4 days and your weakest topics."
**Bullets:** Built from syllabus and grade weights · Adapts to time available · Covers every course

### Row 2 — Grade Hub (text right, visual left)
**Label:** `GRADE HUB`
**Headline:** "See the exact score you need. On every assignment."
**Body:** "Grade Hub reverse-engineers your GPA target. Tell it your goal grade — it calculates the minimum score needed on every remaining quiz, exam, and project."
**Bullets:** Live grade tracking · Reverse-calculated minimums · See which assignments matter most

### Row 3 — AI Study Coach (text left, visual right)
**Label:** `AI STUDY COACH`
**Headline:** "An AI that knows your courses, grades, and schedule."
**Body:** "Unlike ChatGPT, StudyEdge's coach has full context — it knows you have an orgo exam in 6 days, that you're weakest on stereochemistry, and that you only have 90 minutes tonight."
**Bullets:** Course-aware answers · Flashcards from weak topics · Recall score tracking

### Row 4 — Focus Mode (text right, visual left)
**Label:** `FOCUS MODE`
**Headline:** "Lock in. Timer running. No distractions."
**Body:** "Built-in Pomodoro timer, ambient sound, and session progress bar. StudyEdge keeps you on task — and when the session ends, it logs your streak automatically."
**Bullets:** Pomodoro + custom timer modes · Ambient focus sounds · Automatic streak tracking

**Visuals:** Use `/public/ss-*.png` screenshots where available. Fall back to CSS-built styled mockups that resemble the actual UI.

---

## Section 7 — Testimonials

**Section label:** `SOCIAL PROOF`
**Headline:** "From students who stopped cramming."

**3 cards, horizontal grid desktop, stack mobile.**

Card style:
```css
background: rgba(255,255,255,0.03);
border: 1px solid rgba(255,255,255,0.08);
border-radius: 16px;
padding: 32px;
position: relative;
```

Large opening quote mark:
```css
content: '"';
font-size: 80px;
color: rgba(99,102,241,0.3);
position: absolute;
top: 16px; left: 24px;
font-family: Georgia, serif;
```

Quote text: 15px, `rgba(226,232,240,0.8)`, padding-top 40px to clear quote mark.
Attribution: Name bold `#e2e8f0` + Major muted. Avatar: gradient circle with initials (no photos).

**Use only the 3 existing real quotes.** Do not fabricate. Make 3 feel weighty through layout and design.

---

## Section 8 — Comparison

**Headline:** "Everything you need. Nothing you don't."
**Layout:** 3-column table. Centered, max-width 800px.

Columns: StudyEdge AI | Generic Study Apps | Blank Productivity Tools

StudyEdge column: gradient header bg, brand blue border highlight.

Rows:
```
Feature                           StudyEdge   Generic   Blank
AI-generated study schedule          ✓           ✗         ✗
Session-by-session plans             ✓           ✗         ✗
Grade reverse-engineering            ✓           ✗         ✗
AI coach (course-aware)              ✓           ✗         ✗
Built-in focus mode                  ✓           ~         ✗
Flashcards & quizzes                 ✓           ✓         ✗
Works for every course type          ✓           ~         ✓
```

`✓` in `#34d399`. `✗` in `rgba(226,232,240,0.2)`. `~` as muted dash.

---

## Section 9 — FAQ

**Layout:** Accordion. Max-width 680px, centered. Smooth CSS `max-height` transition on open/close.

**6 questions:**

1. **Is it actually free to start?**
   Yes. The free plan includes 10 AI study boosts per month, one course, and the full Grade Hub. No credit card required.

2. **What if my syllabus isn't on there?**
   You enter your course name, topics, and exam dates manually — or paste your syllabus. StudyEdge builds your plan from what you give it.

3. **How is this different from Notion or a planner app?**
   Notion gives you a blank page. StudyEdge gives you a complete, AI-generated study schedule, session plans, and grade calculations in 60 seconds. You don't build anything.

4. **Does it work for professional exams like MCAT or LSAT?**
   Yes. StudyEdge supports any exam-based studying including MCAT, LSAT, GRE, CPA, bar exam, and more.

5. **What happens when I run out of AI boosts?**
   Free users get 10 AI boosts per month — they reset automatically. Pro users get 75. Upgrade anytime from within the app.

6. **Can I cancel anytime?**
   Yes. Cancel from your account settings, no questions asked. If you cancel before day 7 of your trial, you pay nothing.

Accordion style:
```css
.faq-item { border-bottom: 1px solid rgba(255,255,255,0.07); }
.faq-question { padding: 20px 0; cursor: pointer; font-weight: 600; color: #e2e8f0; display: flex; justify-content: space-between; }
.faq-answer { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; color: rgba(226,232,240,0.65); font-size: 15px; line-height: 1.7; }
.faq-item.open .faq-answer { max-height: 200px; padding-bottom: 20px; }
```

---

## Section 10 — Bottom CTA

**Layout:** Full-bleed. Padding `160px 0`. Centered.

**Background:**
```css
background: linear-gradient(180deg, #060614 0%, rgba(59,97,196,0.08) 40%, #060614 100%);
```

**Headline:**
```
The semester is already moving.
Start executing.
```
Font-size: `clamp(36px, 5vw, 60px)`. Weight 800. Letter-spacing -0.03em.

**Subline:** "Your personalized study plan is 60 seconds away. No credit card required." — 16px, muted.

**CTA buttons:**
- Primary: "Start free 7-day trial →" — gradient, padding `16px 36px`, font-size 16px. Calls `onGetStarted('signup')`.
- Secondary: "Log in" — ghost/text style.

**Microcopy:** "Free plan available · No card required · Cancel before day 7, pay nothing" — 12px, dim.

---

## Footer

**Layout:** 4-column grid desktop, 2-column mobile. `border-top: 1px solid rgba(255,255,255,0.07)`. Padding `60px 0 40px`.

Col 1: Logo + 1-line description + copyright
Col 2: Product (Features, Pricing, How it works)
Col 3: Support (Contact, FAQ)
Col 4: Legal (Privacy, Terms)

Text: 13px, `rgba(226,232,240,0.45)`. Links → `rgba(226,232,240,0.7)` on hover.

---

## Sticky Bottom Trial Bar

Appears after 300px scroll, fixed bottom, z-index 998.

```css
position: fixed; bottom: 0; left: 0; right: 0;
background: rgba(6,6,20,0.92);
backdrop-filter: blur(20px);
border-top: 1px solid rgba(255,255,255,0.08);
padding: 12px 24px;
display: flex; align-items: center; justify-content: space-between;
```

**Left:** "Join thousands of students studying smarter." — 14px, muted
**Right:** "Start free — No card required" — small gradient button. Calls `onGetStarted('signup')`.

---

## Mobile Breakpoints

At `max-width: 768px`:
- Hero: single column, mockup below headline (max-width 340px), floating chips hidden
- Stats: 2×2 grid
- Features: single column, visual above text
- Comparison: horizontal scroll or simplified 2-col (StudyEdge vs others combined)
- Footer: 2-column grid
- Nav: logo + "Start free" only

At `max-width: 390px`:
- Hero headline: font-size 36px minimum
- All section padding: reduce by ~30%
- Primary CTA buttons: full width

---

## Implementation Order

1. Global CSS (vars, reset, font import, animation classes, scrollbar)
2. Nav + scroll behavior
3. Hero (structure → content → animations → chips)
4. Sticky trial bar
5. Trust strip + marquee
6. Stats band + count-up animation
7. How It Works
8. Features (all 4 rows)
9. Testimonials
10. Comparison table
11. FAQ accordion
12. Bottom CTA
13. Footer
14. Full mobile pass (390px + 768px)
15. Animation polish (scroll reveals, hover states, counter triggers)
16. `npm run build` — zero errors required
17. Commit and push
