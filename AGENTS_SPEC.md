# StudyEdge AI — Autonomous Agent System Spec
_Generated from deep interview — May 2026_

---

## App Context (Read This First — Every Agent Needs It)

**App name:** StudyEdge AI
**URL:** getstudyedge.com
**Stack:** React + Vite, Supabase (auth + DB), Vercel (hosting + serverless functions), Tailwind + inline styles
**Design system:** Light-themed only. bg `#F7F6F3`, card `#FFFFFF`, border `rgba(0,0,0,0.07)`, accent `#3B61C4`, text `#111111`, muted `#6B6B6B`. ALL dark-mode Tailwind classes (`dark:`) must be treated as bugs.
**Repo:** /Users/ryangambrell/Desktop/StudyMap

---

## What StudyEdge AI Actually Is

StudyEdge AI is **not** a study planner. It is the one app a student actually needs — solving four problems that no other tool addresses together:

1. **When to study** — AI builds a real session schedule around their exam dates, class times, and available hours
2. **What to study** — AI knows their syllabus, struggle topics, grade weights, and time to exam — it tells them exactly what to focus on in each session
3. **How to stay locked in** — Focus Mode, session blueprints, recall scoring, and the AI Tutor keep them executing, not drifting
4. **How to actually improve their grades** — Grade Hub reverse-engineers the exact score they need on remaining work; Study Coach adapts when they fall behind

**Target user:** Any student in school who wants to improve their grades through structure and efficiency. Not one specific major — anyone who is serious about their grades.

**Positioning against competitors:**
- Quizlet: just flashcards, no planning, no grade math, no personalization
- Notion: blank canvas — students have to build everything themselves
- Google Calendar: no AI, no grade connection, no session intelligence
- ChatGPT: generic — knows nothing about your course, your grades, or your exam date

**Core differentiator:** StudyEdge AI is the only tool where the AI knows your exact course structure, grade weights, struggle topics, time to exam, and study history — and uses all of it to tell you precisely what to do right now.

---

## Sensitive Info Rules (Never Commit)

- Supabase credentials, API keys, `.env` values
- Exact revenue numbers, MRR, subscriber counts
- User emails, names, or any PII
- Use directional language only: "early-stage," "growing user base," "pre-Series A"

---

## Agent Architecture

### Execution Model
Agents are **on-demand specialists** launched from the terminal with a task. Each runs with full autonomy: finds the problem, fixes it, commits it, pushes it, deploys it. No asking for permission mid-run. Three agents run simultaneously in **separate git worktrees** so they never block each other.

### Notification
After each agent run: send an iMessage summary via Twilio to the developer's phone. Message format:
```
StudyEdge AI Agent Report
Agent: [name]
Run: [timestamp]
Fixed: [N items]
Wrote: [N articles / components]
Questions for you: [any blockers]
Commit: [short hash]
```

### Shared Context
Every agent begins by reading:
1. This file (`AGENTS_SPEC.md`)
2. `CONTEXT.md` (the living app brain — see below)
3. The relevant source files for its domain

---

## CONTEXT.md — Living App Brain

Every agent must maintain and update `CONTEXT.md` at the end of its run. This file is the single source of truth about the app's current state. It includes:

- Current known bugs and status (open / fixed / in-progress)
- Dark mode violations found and purged
- SEO articles published and keywords targeted
- Design token violations fixed
- Open questions for the developer
- Last QA run results and pass/fail per flow

---

## Agent 1: QA + Bug Hunter Agent

### Purpose
Walk through StudyEdge AI as a real student would. Find everything that is broken, confusing, illogical, or embarrassing. Fix what it can autonomously. Flag what needs human input. Commit all fixes.

### Invocation
```bash
claude "Run the StudyEdge QA agent. Read AGENTS_SPEC.md first. Use Playwright to walk through every critical flow. Fix bugs you find. Commit fixes. Send iMessage summary when done."
```

### What It Looks For

**Category 1: Broken functionality**
- Flashcard generation: questions must be about the actual course, not generic trivia
- Quiz Burst: questions must make sense and relate to course content
- Study plan generation: plan must reference the user's actual topics, dates, and goals — not vague filler
- Export (PDF, notes, study plan): must complete without error
- AI Tutor: must respond with course-specific guidance, not hallucinated generic text

**Category 2: AI slop**
- Button labels, empty states, and tooltips that sound robotic or corporate ("Leverage your academic performance metrics" = bad)
- Logic that is technically correct but meaningless to a real student (like the old Grade Defense Mode message)
- Flows where a user would be confused about what to do next
- Features that exist but have never been tested end-to-end

**Category 3: Visual bugs**
- Dark-mode colors appearing in any user-facing component (`dark:` Tailwind classes, hardcoded dark hex values like `#1a1a2e`, `#0f172a`, `#1e293b`)
- Color inconsistencies — padding, radius, or shadow that deviates from the design system
- Mobile layout breaks (anything that overflows, clips, or is untappable on 390px iPhone width)

**Category 4: UX flow breaks**
- Calendar sessions not matching what Study Coach generated
- Grade Hub calculations that feel wrong or non-obvious
- Onboarding steps that drop users before they reach the dashboard

### Critical Test Flows (Playwright)

Run all of the following with a test Supabase account. Screenshot on failure. Log all console errors.

1. **Onboarding:** Sign up → add 2 courses with exam dates → complete setup → land on dashboard. Assert: dashboard shows both courses, next session visible.
2. **Study Coach full loop:** Select course → fill intake form with real topics → generate plan → push sessions to calendar → navigate to calendar → assert sessions appear on correct dates.
3. **Grade Hub:** Add 4 grade components summing to 100% → mark 2 as graded → enter scores → assert current grade, needed score, and defense mode all calculate correctly.
4. **Focus Mode:** Start a session → run timer → mark complete → assert session rating modal appears → submit rating → assert session shows as completed in calendar.
5. **Flashcards:** Generate flashcards for a specific course → assert front/back are course-specific → flip → mark known/unknown → assert deck progresses.
6. **Quiz Burst:** Generate quiz → assert questions are course-specific → answer all → assert score is shown.
7. **AI Tutor:** Ask a course-specific question → assert response mentions the course and is not generic → ask follow-up.
8. **Export:** Export a study plan to PDF → assert file downloads and is not blank.
9. **Mobile:** Repeat flows 1, 2, 3 at 390px viewport width. Assert no overflow, no unreadable text, all buttons tappable.

### Fix Authority
The agent may autonomously fix:
- Copy (button labels, empty states, tooltips, error messages)
- Console errors and uncaught promise rejections
- Dark-mode color leaks
- Mobile layout overflow
- Obvious logic errors (defensive null checks, wrong state resets)
- AI prompt improvements that make outputs more course-specific

The agent must flag (not auto-fix):
- Auth flow changes
- Supabase schema changes
- Anything touching Stripe or payments
- Changes that require new env variables

### Output
- Git commits with prefix `fix:` or `ux:` per change
- Updates `CONTEXT.md` with all bugs found and their status
- iMessage summary

---

## Agent 2: SEO Agent

### Purpose
Build a compounding SEO presence for StudyEdge AI. Attack all four layers: technical foundation, static landing pages, keyword strategy, and a content blog. SEO compounds over months — start everything now.

### Invocation
```bash
claude "Run the StudyEdge SEO agent. Read AGENTS_SPEC.md first. Execute all four SEO layers in order. Commit everything. Send iMessage summary when done."
```

### Layer 1: Technical SEO (do this first, one-time)

Audit and fix inside the existing Vite repo:

- `public/sitemap.xml` — generate and keep updated with all routes and blog article URLs
- `public/robots.txt` — allow all, point to sitemap
- `index.html` meta tags — verify canonical, description (150-160 chars), og:*, twitter:*
- Add JSON-LD structured data: `WebApplication` schema for the main app, `Article` schema for each blog post
- Verify Core Web Vitals via Lighthouse in Playwright headless — flag any score below 80
- Add `<link rel="preconnect">` for Supabase and Vercel domains

### Layer 2: Static Landing Pages

Create prerendered HTML pages inside `public/` for high-intent keyword clusters. Each page must have:
- Proper H1 (the keyword), H2s for subtopics
- 600-900 words of real, useful content
- Internal links to getstudyedge.com (the app)
- No AI slop — write like a smart college advisor, not a marketing bot
- JSON-LD Article schema
- No em dashes anywhere

Target pages (create all of these):
1. `/study-planner-for-college-students.html` — How to build a study schedule that actually works
2. `/gpa-calculator.html` — GPA calculator + how to protect your GPA when you're behind
3. `/how-to-study-for-finals.html` — Final exam prep strategy for college students
4. `/pre-med-study-guide.html` — Study system for pre-med students: BCPM GPA, MCAT prep, staying sane
5. `/grade-calculator.html` — What do I need on the final exam to get an A? (calculator + explanation)
6. `/study-schedule-template.html` — Weekly study schedule template + why most templates fail

### Layer 3: Astro Blog at blog.getstudyedge.com

Set up a new repository: `studyedge-blog` (separate from the main app).

**Stack:** Astro 4, MDX, Tailwind, hosted on Vercel at blog.getstudyedge.com

**Setup steps (agent executes):**
1. `npm create astro@latest studyedge-blog -- --template minimal`
2. Add `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/tailwind`
3. Configure `astro.config.mjs` with site URL `https://blog.getstudyedge.com` and sitemap
4. Create a base layout with StudyEdge AI branding (light theme, `#F7F6F3` bg, `#3B61C4` accent, `#111111` text)
5. Header: StudyEdge AI logo + link to getstudyedge.com ("Try the app free")
6. Footer: © StudyEdge AI, links to app, disclaimer
7. Deploy to Vercel, configure custom domain

**Writing rules (enforce strictly):**
- No em dashes. Use commas, colons, or restructure the sentence.
- No "leverage," "utilize," "delve into," "game-changer," "unlock your potential"
- Write like a smart upperclassman giving real advice to a freshman
- Every article must include at least one specific, actionable tip that StudyEdge AI does natively
- Each article ends with a CTA to try StudyEdge AI free (natural, not salesy)
- Target length: 800-1,200 words per article
- H1 = exact target keyword. H2s = supporting questions students actually Google.

**First 10 articles to write (agent writes all of them):**
1. "How to Study for Organic Chemistry" — mechanisms, spaced repetition, what actually works
2. "How to Raise Your GPA After a Bad Semester" — realistic recovery plan, grade math, what to prioritize
3. "Best Study Schedule for College Students" — how to build one that accounts for your actual life
4. "How to Get an A in Any Class" — systems over motivation, the role of structure
5. "MCAT Study Schedule: How to Plan 6 Months Out" — content-heavy, very searchable
6. "Study Tips for Finals Week" — what to do in the last 7 days before an exam
7. "How to Stop Procrastinating When Studying" — behavioral science, specific tactics
8. "How to Study With ADHD in College" — high search volume, underserved, StudyEdge AI is a natural fit
9. "What GPA Do You Need for Medical School?" — data-driven, links to Grade Hub
10. "How to Balance a Heavy Course Load" — time management for students taking 18+ credits

### Layer 4: Keyword Intelligence

After publishing, the agent runs monthly to:
- Check Google Search Console (if connected) or use free tools to find which articles are ranking
- Write 2 new articles targeting keywords with high impression / low click-through
- Update existing articles to add internal links and improve headings
- Report ranking progress in CONTEXT.md

---

## Agent 3: UI Consistency Agent

### Purpose
Make StudyEdge AI look like a $100/month professional product, not an AI-generated SaaS. Establish an iron-clad design system, purge all dark-mode leakage, and fix every visual inconsistency.

### Invocation
```bash
claude "Run the StudyEdge UI consistency agent. Read AGENTS_SPEC.md first. Execute all three phases. Commit after each phase. Send iMessage summary when done."
```

### Phase 1: Extract Design Tokens

Create `src/tokens.js`:

```js
export const T = {
  bg:          '#F7F6F3',
  bgCard:      '#FFFFFF',
  bgEl:        '#F0EFEC',
  border:      'rgba(0,0,0,0.07)',
  borderStrong:'rgba(0,0,0,0.12)',
  text:        '#111111',
  muted:       '#6B6B6B',
  dim:         '#9B9B9B',
  accent:      '#3B61C4',
  accentGlow:  'rgba(59,97,196,0.2)',
  mint:        '#16A34A',
  orange:      '#E8531A',
  amber:       '#D97706',
  pink:        '#DC2626',
  sky:         '#2563EB',
  // Spacing
  radius:      { sm: 8, md: 12, lg: 14, xl: 20, full: 9999 },
  shadow:      {
    card:  '0 1px 3px rgba(0,0,0,0.06)',
    modal: '0 16px 48px rgba(0,0,0,0.12)',
    float: '0 8px 32px rgba(0,0,0,0.10)',
  },
  // Typography
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#9B9B9B' },
}
```

After creating the file, the agent does NOT mass-replace all files in one pass (too risky). It audits first.

### Phase 2: Dark Mode Purge

Scan every `.jsx` file for:
- Any `dark:` Tailwind class — remove it
- Any hardcoded dark hex: `#1a1a2e`, `#0f172a`, `#1e293b`, `#1e1b4b`, `#0d1117`, `#111827`, `#1f2937` — replace with appropriate light token
- Any hardcoded dark rgba: `rgba(255,255,255,0.XX)` used as a text color — replace with dark text token
- Any `bg-slate-800`, `bg-slate-900`, `bg-gray-900`, `text-white` that isn't on an intentionally dark UI element (like the share card screenshot feature)

**Intentionally dark exceptions (do not touch):**
- `ShareCardModal` in OutputView.jsx — the share card is intentionally dark for the screenshot aesthetic
- Any element explicitly labeled with a comment `/* intentionally dark */`

After each file fix, visually verify by running the preview and taking a screenshot of that view.

### Phase 3: Visual Audit Against Professional Standard

For each major view (Dashboard, Calendar, Study Coach, Grade Hub, Tools, Account), the agent:
1. Takes a screenshot at 1440px and 390px
2. Checks against the design system rules:
   - Cards: `borderRadius: 14`, `padding: 20-24`, `boxShadow: T.shadow.card`
   - Modals: `borderRadius: 20`, `maxWidth: 360-480`, `boxShadow: T.shadow.modal`
   - Labels: uppercase, 11px, 700 weight, `#9B9B9B`
   - Buttons: consistent height (`padding: 12px 20px` for primary), radius matches card context
   - No mixed border styles (some `1px solid` some `border`)
   - No inconsistent gap values (6/8/10/12/16/20/24/32 — only these)
3. Fixes any glaring deviation from the standard
4. Flags subjective inconsistencies in CONTEXT.md for human review

### The Standard
The bar is: "Could this ship as a feature in Linear, Notion, or Superhuman?"

If the answer is no, fix it. If it's borderline, flag it. Never leave it as-is and say nothing.

---

## Running All Three Agents in Parallel

Use Claude Code's worktree isolation:

```bash
# Terminal 1 — QA Agent
cd /Users/ryangambrell/Desktop/StudyMap
claude --worktree "Run the StudyEdge QA agent per AGENTS_SPEC.md"

# Terminal 2 — SEO Agent
cd /Users/ryangambrell/Desktop/StudyMap
claude --worktree "Run the StudyEdge SEO agent per AGENTS_SPEC.md"

# Terminal 3 — UI Agent
cd /Users/ryangambrell/Desktop/StudyMap
claude --worktree "Run the StudyEdge UI consistency agent per AGENTS_SPEC.md"
```

Each runs in an isolated worktree branch. When done, review diffs and merge the best of each.

---

## iMessage Notification Setup

To enable agent-to-phone iMessage notifications:

**Option A: Twilio SMS (recommended — works on any device)**
1. Sign up at twilio.com, get a phone number (~$1/month)
2. Add to `.env`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `DEVELOPER_PHONE`
3. Create `scripts/notify.js`:
```js
const twilio = require('twilio')
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
async function notify(message) {
  await client.messages.create({
    body: message,
    from: process.env.TWILIO_FROM,
    to: process.env.DEVELOPER_PHONE,
  })
}
module.exports = { notify }
```
4. Each agent calls `node scripts/notify.js "[summary]"` at the end of its run

**Option B: AppleScript iMessage (Mac only, no cost)**
```applescript
tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "YOUR_PHONE_NUMBER" of targetService
  send "AGENT REPORT: ..." to targetBuddy
end tell
```
Agent runs: `osascript -e 'tell application "Messages" ...'`

---

## CONTEXT.md Template

The agent creates and maintains this file:

```markdown
# StudyEdge AI — Living Context
_Last updated by: [agent name] on [date]_

## App Status
- Current version: [git hash]
- Last QA run: [date] — [pass/fail summary]
- Known open bugs: [list]
- Recently fixed: [list]

## Design System Status
- Dark mode violations found: [N]
- Dark mode violations purged: [N]
- Components using design tokens: [N / total]

## SEO Status
- Technical SEO: [complete / in-progress]
- Landing pages published: [N / 6]
- Blog articles published: [N / 10]
- Top ranking keyword: [keyword + position]

## Open Questions for Developer
- [anything the agent couldn't resolve autonomously]

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
```

---

## Agent Quality Rules (Apply to All Three)

1. **No em dashes** in any copy, comments, or generated content. Use commas, colons, or restructure.
2. **No AI slop copy.** Every string that a user sees must sound like a real human wrote it for a real student.
3. **Professional standard** — the bar is Linear/Notion/Superhuman. Not "good enough for a side project."
4. **Light theme only.** Any dark color in a user-facing UI is a bug.
5. **Commit atomically.** One logical change per commit. Prefix: `fix:`, `ux:`, `seo:`, `design:`, `content:`.
6. **Update CONTEXT.md** at the end of every run.
7. **Never modify** `.env`, `package.json` dependencies, or Supabase schema without flagging it first.
8. **Test after fixing.** Don't commit a fix without verifying it doesn't break something else.
