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

## Linkable-asset layer (added 2026-07-13)

Assets built specifically to earn backlinks (tools + original data + AP subject templates + cited research). Each is cross-linked from top existing SEO pages (`/gpa-calculator`, `/ai-flashcard-maker`, `/spaced-repetition-explained`) and added to `sitemap.xml`.

| Asset | URL | Type | Backlink hook |
|---|---|---|---|
| GPA & Grade Calculator (interactive) | `/gpa-calculator` | Tool (upgraded) | Real interactive widget added: live GPA math, "grade needed on final" mode. Teachers + school resource pages. |
| 2026 Study Behavior Report | `/how-students-study-report-2026` | Original data | Report + Dataset schema, CC BY 4.0, embed code. Ed journalists, counselor blogs. |
| AP Exam Study Schedule Templates (hub) | `/ap-exam-study-schedule-templates` | Template hub | CollectionPage schema, unit-weight tables. Print-friendly. r/APStudents, teacher blogs. |
| AP Calculus AB schedule | `/ap-calculus-ab-study-schedule` | Subject template | HowTo schema. Search: "AP Calc AB study schedule" (~2k/mo Apr-May). |
| AP Biology schedule | `/ap-biology-study-schedule` | Subject template | HowTo schema. Search: "AP Bio study schedule" (~2.5k/mo Apr-May). |
| APUSH schedule | `/apush-study-schedule` | Subject template | HowTo schema. Search: "APUSH study schedule" (~4k/mo Apr-May). |
| Spaced Repetition vs Cramming | `/spaced-repetition-vs-cramming` | Research review | ScholarlyArticle schema. Cited: Ebbinghaus, Cepeda et al. 2006/2008, Dunlosky 2013. Blogs/teachers cite academic-tone pieces. |
| Free Flashcard Converter | `/flashcard-converter` | Interactive tool | SoftwareApplication + HowTo schema. Client-side. Anki/Quizlet import. Anki forums, r/Anki, study YouTubers. |

**Ongoing tasks:**
- Submit new URLs to Google Search Console URL Inspection for immediate re-crawl.
- Consider outreach: send the 2026 Study Report to 5 education journalists (Inside Higher Ed, The Chronicle, EdSurge) and 5 large study-tip YouTubers.
- Track backlinks with a monthly Ahrefs/Semrush pull. First measurement: 2026-08-13.

## Linkable-asset layer wave 2 (added 2026-07-14)

Skipped: `/study-schedule-generator` (already exists, 519 lines, comprehensive).

| Asset | URL | Type | Backlink hook |
|---|---|---|---|
| Study Hours by Major | `/study-hours-by-major` | Dataset + ScholarlyArticle | NSSE 2023 data, CC BY 4.0, sortable bar chart. Ed journalists, career sites, Reddit r/college. |
| AP Score Calculator | `/ap-score-calculator` | Interactive tool | MC + FRQ sliders for 14 AP exams, composite to 1-5 score. r/APStudents, AP tutors, teacher blogs. |
| Best Time to Study Quiz | `/best-time-to-study-quiz` | Interactive quiz | 8-question Horne-Ostberg chronotype quiz; morning/intermediate/night owl + study windows. Wellness blogs, sleep researchers, study YouTubers. |
| Grad School GPA Requirements | `/grad-school-gpa-requirements` | Dataset + filterable table | 40+ programs (MD, law, MBA, PhD, nursing, pharmacy, dental), filter by type + search. Pre-med forums, r/lawschooladmissions, r/MBA. |

Cross-links added: `/gpa-calculator` Related, `/gpa-requirements` Related, `/ap-exam-study-schedule-templates` Related.
