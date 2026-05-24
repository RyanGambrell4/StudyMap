# StudyEdge AI — Living Context
_Last updated by: UI Consistency Agent on 2026-05-23 (full dark-purge pass); SEO Agent on 2026-05-23 (SEO layers)_

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
