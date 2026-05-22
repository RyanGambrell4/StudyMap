# StudyEdge AI — Hero Image Redesign Spec
*Compiled from design interview, May 2026*

---

## Purpose
Replace the outdated dark-themed hero screenshot (`/ss-main-screen.png`) with a modern, light-themed, premium hero image that accurately reflects the current app and converts scrolling students into sign-ups. Deliverables: two separate compositions — a **landing page hero** and a **social card** for X/Reddit.

---

## Emotional Goal

The image must make the viewer feel three things simultaneously in under 2 seconds:

1. **Relief** — "Finally, something that has my whole semester handled."
2. **Ambition** — "This is what the top students are using."
3. **Excitement** — "This looks genuinely different from anything I've tried."

It should feel exclusive and intelligent — like a tool that self-selects for serious students. Not aspirational in a generic SaaS way. Aspirational in a *"I want to be the kind of person who uses this"* way.

---

## Headline & Copy

### Suggested Hero Headline
> **"While others cram. You execute."**

*Subheadline:*
> StudyEdge AI builds your study plan, coaches every session, tracks your grades, and tells you exactly where to focus. Every course. All semester.

**Rationale:** "Execute" signals a system, not luck. "While others" positions it as elite without saying "top students use this" outright. No "all in one." No generic value propositions. The subheadline lands the breadth without bullet points.

### Alternative Headline Options
- *"Your entire semester. Strategized before week one."*
- *"Stop guessing what to study. Start knowing."*
- *"The study system that outperforms every study tip you've ever read."*

---

## Visual Identity

### App Color Palette (Actual App)
- **Background:** Pure white `#FFFFFF` / light gray `#F8FAFC`
- **Cards:** White with `border: 1px solid #E2E8F0` and subtle shadow
- **Primary accent:** Indigo `#6366F1` / `#4F46E5`
- **Secondary accent:** Violet `#7C5CFC`, Purple `#A78BFA`
- **Text:** Dark navy `#0F172A` (primary), `#475569` (secondary), `#94A3B8` (muted)
- **Success:** Green `#22C55E`
- **Font:** Inter (system-ui fallback)

### Anti-Patterns — DO NOT USE
- Glowing brain / neural network visualizations
- Stock photography of students in libraries
- Abstract 3D floating UI blobs (non-app elements)
- Gradient mesh / aurora blob backgrounds
- Quizlet-style bright primary colors (too childish)
- Generic SaaS dark sidebar enterprise feel
- AI filter / diffusion-generated imagery that looks "off"

---

## Deliverable 1: Landing Page Hero

### Format
- **Aspect ratio:** ~16:5 to 16:6 (wide banner, fits full-width section)
- **Min width:** 1400px @ 2x
- **Background:** Transitions from dark `#060614` (matches landing page) to a lighter frosted zone where the UI sits — NOT a gradient mesh. A clean, dark-to-translucent fade that lets the light app UI float as if on frosted glass.

### Background Treatment (Mix of light + frosted glass)
- The outer edges and top of the hero section remain dark `#060614` (landing page color)
- Behind the main mockup: a frosted/glass-like zone, slightly lighter (deep navy-blue, ~`#0D1117` or `#0A0E1A`), giving the impression the UI is on a glowing surface
- A very subtle radial light bloom in indigo (`rgba(99,102,241,0.12)`) centered behind the primary screen — NOT a harsh glow ring, just ambient light
- No gradient mesh, no aurora, no swoosh shapes

### Primary Screen (Large, Dominant)
**Content:** The Dashboard command center — the light-themed main app view
- Show: Streak counter (e.g., 🔥 14-day streak), today's session queue, AI morning brief snippet, course list, upcoming sessions
- Must look realistic to the actual app — white card surfaces, indigo accents, Inter font
- The UI should be *upgraded* vs the raw screenshot: slightly denser information, tighter spacing, richer data (more courses, a compelling streak number, a vivid AI brief quote), to maximize the "wow" on first look without being fake

**Framing:** Hybrid of browser chrome + clean floating
- Use a minimal browser chrome frame (thin: just the address bar + window buttons, like Linear.app) in a very dark near-black (`#1C1C1E` or similar)
- Rounded corners on the outer frame (12-16px)
- No heavy OS chrome — just enough to signal "this is a real web app"
- Light, layered drop shadow: `0 40px 80px rgba(0,0,0,0.5), 0 0 60px rgba(99,102,241,0.15)`
- Slight perspective tilt: `perspective(1400px) rotateX(4deg)` — subtle, not dramatic

### Secondary Screens (Floating, Smaller)
Two or three smaller floating UI cards positioned to the bottom-right and/or left corner of the primary screen, partially overlapping the edge:

**Card A — Grade Tracker**
- Small card (~280px wide) showing: 2-3 courses with current grade, letter grade badge, GPA summary at bottom
- Should look like a crisp white card with indigo/green grade badges

**Card B — Streak / Study Stats Widget**
- Even smaller pill or card (~200px): "🔥 14-day streak" + "12.5 hrs studied this week" + a small sparkline graph
- Feels like a native app widget, not a fabricated element

**Optional Card C — Quiz Burst or Flashcard in Progress**
- If space allows: a compact quiz question card with answer options, or a flashcard with the "Again / Good / Easy" SM-2 buttons visible
- Shows the breadth of the tool without needing navigation

**Positioning:** Cards should overlap the primary screen's edges slightly, creating layered depth. They should not float freely in mid-air with no visual anchor. They can cast subtle shadows on the primary screen behind them.

### No Annotations
No floating labels, no callout arrows, no text overlays on the UI itself. The UI design carries the story without explanation.

### No Human Element
Pure product — no hands, no students, no desks. The UI IS the hero.

---

## Deliverable 2: Social Card (X / Reddit)

### Format
- **Dimensions:** 1200 × 628px (Open Graph / Twitter card standard)
- **Safe zone:** Keep all critical content within 1100 × 540px (some platforms crop)

### Layout
Split into two zones:

**Left zone (~45% width):**
- Dark background (`#060614`)
- StudyEdge AI logo (favicon + wordmark) top-left
- Headline: Large, bold, white
  > *"While others cram. You execute."*
- Sub-copy: 1 line, muted, smaller
  > *Your AI study system — plans, coaches, tracks, all semester.*
- CTA line: `getstudyedge.com` in indigo, small but visible
- Optional: A subtle "✦ Free trial" badge or "2,000+ students" social proof line

**Right zone (~55% width):**
- The primary dashboard mockup, cropped tighter, NO browser chrome (just the app surface)
- Slightly angled (same rotateX perspective as landing page hero)
- Frosted/glass treatment behind it — lighter than the left zone, creating visual separation
- One floating secondary card (Grade Tracker preferred — most legible at this size)

### Typography
- Headline: Inter Black / 900 weight, 48-54px, tight letter-spacing (-1px)
- Subline: Inter Regular, 18-20px, `rgba(226,232,240,0.6)`
- No decorative fonts

### Color
- Left zone: dark `#060614` with subtle indigo radial glow behind text
- Right zone: slightly lighter dark with frosted glass app UI
- Accent: Indigo `#6366F1` used only for the CTA/URL and the app's own UI elements

---

## Reference Aesthetic

**Primary reference:** Linear.app hero
- Minimal browser chrome in dark frame
- High-density, polished UI inside
- Clean negative space around the mockup
- Confidence through restraint — nothing decorative that doesn't serve the product story

**What makes it different from Linear:**
- StudyEdge is for students, not enterprise — the UI should feel energetic and personal, not cold and technical
- Color temperature: slightly warmer indigo vs Linear's blue-gray
- The secondary floating cards add warmth and breadth

---

## Creation Approach

### Recommended Tool: Claude Design (or Figma/Canva with real screenshots)

**For the Claude Design prompt (full image generation):**

> Design a premium SaaS hero image for "StudyEdge AI", a light-themed study planning web app used by serious college students. The image is a wide-format landing page hero (16:5 ratio). Background: deep dark `#060614` fading to a slightly lighter frosted zone at center. Primary element: a realistic light-themed web app dashboard inside a minimal dark browser chrome frame, showing a study planning interface with white cards, indigo (#6366F1) accents, a streak counter, today's study sessions, and course list — the UI is clean, dense, and impressive. Two small floating cards overlap the primary screen's edges: one showing a grade tracker with letter grades (A-, B+), one showing a streak widget with "🔥 14 days". No people. No neural networks. No gradient blobs. A subtle indigo radial glow behind the primary mockup only. Perspective: slight rotateX(4deg) tilt. Drop shadow: deep and realistic. Overall feel: Linear.app meets a premium student tool — elite, confident, restrained. No annotations, no labels, no stock imagery elements.

### For a realistic output: Use actual screenshots
1. Take a polished screenshot of the current app dashboard in the browser
2. Add realistic fake data (compelling course names, vivid streak, good GPA)
3. Place inside browser chrome mockup in Figma
4. Add secondary cards as Figma components
5. Export at 2x

---

## Success Criteria

The hero image works if:
- A college student who has never heard of StudyEdge can understand what it does within 3 seconds
- It looks like something a top student would screenshot and post — not something they'd scroll past
- It matches the actual app so closely that clicking through to sign up feels like a seamless continuation
- On X/Reddit, the social card gets clicks without needing the post body text to explain the product
- It does NOT look like it was generated with a generic AI image tool

---

*End of spec — ready for design execution*
