# StudyEdge AI Keyword Baseline

Established 2026-06-03. Baseline target keywords for the static landing pages in `public/` and future blog content at blog.getstudyedge.com. Use this as the input for Layer 3 (Astro blog) and subsequent Layer 4 monthly intelligence runs.

Volumes are rough monthly US estimates. Difficulty is a qualitative read on the SERP, not a paid-tool score.

## Tier 1: High intent, primary targets

These map directly to existing landing pages in `public/` or are obvious next builds.

| Keyword | Est. monthly volume | Difficulty | Page |
|---|---|---|---|
| gpa calculator | 110k+ | High | `/gpa-calculator` |
| grade calculator | 90k+ | High | `/grade-calculator` |
| college gpa calculator | 14k | Medium | `/gpa-calculator` (extend) |
| what do i need on the final | 8k | Low–Medium | `/grade-calculator` |
| study planner for college students | 2.4k | Medium | `/study-planner-for-college-students` |
| study schedule template | 5k | Medium | `/study-schedule-template` |
| how to study for finals | 9k | Medium | `/how-to-study-for-finals` |
| pre med study schedule | 1.6k | Low–Medium | `/pre-med-study-guide` |
| mcat study schedule | 6k | Medium | Future blog: "MCAT study schedule 6 months" |

## Tier 2: Long-tail, faster to rank

Lower volume, but stronger conversion intent and easier SERPs. Good first blog articles.

| Keyword | Est. monthly volume | Difficulty | Target |
|---|---|---|---|
| how to raise your gpa after a bad semester | 1.3k | Low | Blog |
| how to get an a in any class | 900 | Low | Blog |
| how to study for organic chemistry | 2.4k | Medium | Blog |
| best study schedule for college students | 1.1k | Low | Blog |
| how to stop procrastinating when studying | 1.8k | Medium | Blog |
| how to study with adhd in college | 1.4k | Low | Blog (underserved) |
| what gpa do you need for medical school | 4.4k | Medium | Blog (links to Grade Hub) |
| how to balance a heavy course load | 400 | Low | Blog |
| study tips for finals week | 2.9k | Medium | Blog |
| how to make a study schedule | 5.4k | Medium | Existing `/how-to-make-a-study-schedule` |

## Tier 3: Comparison and alternative

Capture searchers already in the tool category. Existing pages exist for these.

| Keyword | Est. monthly volume | Page |
|---|---|---|
| quizlet alternative | 9k | `/quizlet-alternative` |
| anki alternative | 3.2k | `/anki-alternative` |
| anki vs quizlet | 1.8k | `/anki-vs-quizlet` |
| best study app for students | 2.4k | `/best-study-app-for-students` |
| ai flashcard maker | 3.6k | `/ai-flashcard-maker` |
| ai tutor | 14k | `/ai-tutor` |
| ai study coach | 480 | `/ai-study-coach` |
| active recall app | 720 | `/active-recall-app` |

## Tier 4: Watch list

High volume but very competitive. Worth tracking, not chasing for first 90 days.

- best study apps
- how to study effectively
- study tips
- time management for college students
- how to take notes
- pomodoro technique

## Notes for next Layer 4 run

- Confirm Google Search Console verification is wired (existing `google-site-verification` meta is in `index.html` — verify property is connected in GSC dashboard).
- After 30 days of indexing, pull GSC query report and update this file with: impressions, clicks, average position per Tier 1 page.
- Watch for cannibalization between `/gpa-calculator` and any future Tier 2 blog post on GPA recovery.
- Brand disambiguation: pages must consistently use "StudyEdge AI" (never "Study Edge") to avoid Google merging us with studyedge.com tutoring company. The `/not-affiliated-with-study-edge` canonical page handles this.
