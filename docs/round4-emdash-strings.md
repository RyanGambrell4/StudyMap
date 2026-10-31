# App and email em dashes removed (2026-10-31)

User-facing strings only. No logic changed. Shipped in f7d83be6 (src) and 531558eb (api/lib).
Tests: 61 files, 995 tests passed after each batch.

## src/ (37 strings, 14 files)

| File:line | Before | After |
|---|---|---|
| components/DiagramsView.jsx:783 | `— {node.note}` | `({node.note})` |
| components/QuickQuizBurst.jsx:783 | Missed N question(s) — added to your review deck. | Missed N question(s), added to your review deck. |
| components/QuickQuizBurst.jsx:799 | Well calibrated — your confidence matches reality. | Well calibrated: your confidence matches reality. |
| components/QuickQuizBurst.jsx:801 | That's the real gap — you didn't know what you didn't know. | That's the real gap: you didn't know what you didn't know. |
| components/QuickQuizBurst.jsx:803 | You know more than you trust — push yourself harder. | You know more than you trust, so push yourself harder. |
| components/QuickQuizBurst.jsx:804 | Your confidence signals are mixed — worth another quiz to sharpen the read. | Your confidence signals are mixed. Another quiz is worth it to sharpen the read. |
| components/QuickQuizBurst.jsx:861 | {topic} sits at N/100 — target it in your next session. | {topic} sits at N/100. Target it in your next session. |
| components/QuickQuizBurst.jsx:942 | Not quite — here's the fix: | Not quite. Here's the fix: |
| components/DashboardViewV2.jsx:544 | Weekly goal — not set yet | Weekly goal: not set yet |
| components/DashboardViewV2.jsx:592 | Recall N% — needs work | Recall N%, needs work |
| components/DashboardViewV2.jsx:1015 | Let's get you set up — two minutes, tops. | Let's get you set up. Two minutes, tops. |
| components/SessionBundle.jsx:100 | **60s brain dump** — spill everything… | **60s brain dump:** spill everything… |
| components/SessionBundle.jsx:101 | **5 questions** — targeted quiz… | **5 questions:** targeted quiz… |
| components/SessionBundle.jsx:102 | **Wrap** — what you moved… | **Wrap:** what you moved… |
| components/ProblemSolverView.jsx:548 | You worked through this yourself — you'll remember it… | You worked through this yourself, so you'll remember it… |
| components/ProblemSolverView.jsx:593 | **{action}** — {work} | **{action}:** {work} |
| components/CourseDiagnostic.jsx:144 | …every other feature — Quiz Burst, Cheat Sheet, Study Coach — starts personalized… | …every other feature (Quiz Burst, Cheat Sheet, Study Coach) starts personalized… |
| components/CourseDiagnostic.jsx:164 | Skip — I'll set it up manually later | Skip, I'll set it up manually later |
| components/CourseDiagnostic.jsx:218 | {n}/{total} right — but the score doesn't matter. | {n}/{total} right, but the score doesn't matter. |
| components/StudyToolsViewV2.jsx:29 | Type any topic — instant 5-question practice. | Type any topic for instant 5-question practice. |
| components/StudyToolsViewV2.jsx:224 | separator ` — {reason}` | separator `: {reason}` |
| components/GapCloser.jsx:138 | I know it — skip | I know it, skip |
| components/GapCloser.jsx:226 | Added to review — we'll circle back. | Added to review. We'll circle back. |
| components/tools/UploadMaterialModal.jsx:321 | PDF, slides, docs, images — up to 50 MB | PDF, slides, docs, images (up to 50 MB) |
| components/tools/UploadMaterialModal.jsx:369 | MP3, M4A, or record right here — up to 2 hours | MP3, M4A, or record right here (up to 2 hours) |
| components/tools/toolBestPick.js:40 | No focus data yet — pick any topic | No focus data yet. Pick any topic |
| components/tools/toolBestPick.js:74 | No exam date set — add one to unlock rescue plans | No exam date set. Add one to unlock rescue plans |
| components/tools/toolBestPick.js:75 | Your exam is today — start now | Your exam is today. Start now |
| components/tools/toolBestPick.js:103 | No cards yet — upload material first | No cards yet. Upload material first |
| components/tools/toolBestPick.js:139 | {course} recall is strong — lock it in | {course} recall is strong, so lock it in |
| lib/lastSessionBridge.js:59 | ` — target {topic} (N/100) next` | `. Target {topic} (N/100) next` |
| lib/deckAdditions.js:84 | flashcard back `{answer} — {explanation}` | `{answer} ({explanation})` |
| lib/deckAdditions.js:114 | same as above | same as above |
| lib/smartDefault.js:62 | weakest topic — mastery N/100 | weakest topic (mastery N/100) |
| lib/deckHealth.js:77 | You have N cards due — start a 10-min review. | You have N cards due. Start a 10-min review. |
| lib/deckHealth.js:78 | N cards you keep missing — worth a targeted drill. | N cards you keep missing, worth a targeted drill. |
| lib/deckHealth.js:79 | N cards untouched in 2 weeks — refresh them before they decay further. | N cards untouched in 2 weeks. Refresh them before they decay further. |
| lib/deckHealth.js:80 | N card(s) due — knock them out. | N card(s) due. Knock them out. |

Left on purpose in src/: code comments, `console.error` text, the course-name regex in utils/strings.js
(logic), test labels and the tests that assert no em dash appears, and the AI prompt line in
lib/courseContext.js:280 (read by the model, not shown to users).

## api/ and lib/ (6 strings, 2 user emails)

| File:line | Before | After |
|---|---|---|
| lib/server/proWelcomeEmail.js:85 | You now have unlimited runs — so every time the syllabus changes… | You now have unlimited runs, so every time the syllabus changes… |
| lib/server/proWelcomeEmail.js:113 | …the night before an exam — you now have it all semester. | …the night before an exam. You now have it all semester. |
| lib/server/proWelcomeEmail.js:142 | You just did what most people don't — you invested in how you study… | You just did what most people don't: you invested in how you study… |
| lib/server/proWelcomeEmail.js:145 | — The StudyEdge AI Team | The StudyEdge AI Team |
| lib/server/founderOutreach.js:31 | No hard feelings at all — we just want to | No hard feelings at all. We just want to |
| lib/server/founderOutreach.js:46 | — The StudyEdge AI Team | The StudyEdge AI Team |

Left on purpose in api/ and lib/: about 160 code comments, 15 developer log messages, 23 lines of text
sent only to the AI model, 4 lines in founder-only internal emails (api/feedback.js:73,
api/daily-revenue-heartbeat.js:172/332/349), the dash-stripping regex in lib/server/sessionContent.js,
and test files.
