# Next 5 comparison pages: proposal (not built)

Status: waiting for Ryan's approval. Nothing below has been built.

## Where the numbers come from

Google Search Console for `sc-domain:getstudyedge.com`, pulled 2026-10-30 with
`~/Projects/studyedge-gsc/gsc.py`:

- Queries: 90 days, 2026-07-30 to 2026-10-28, 3,406 queries with at least 1 impression.
- Pages: 28 days, 2026-09-30 to 2026-10-28.

Two limits, stated plainly so the proposal is read the right way:

1. **Search Console only shows queries we already appear for.** It does not measure
   total demand for "StudyEdge AI vs X". Market volume needs a keyword tool (Ahrefs,
   Semrush or Google Keyword Planner), and we have none connected, so no volume
   figures are quoted here.
2. **Competitor demand reaching us is small.** Every query naming another study app adds
   up to about 170 impressions in 90 days, against 18,778 for brand queries ("study
   edge", "studyedge"). Page-level impressions are larger than query-level ones because
   Google hides rare queries, which is why both are shown.

## Ranked proposal

| # | Page | Query evidence (90 days) | Page evidence (28 days) | Why |
|---|---|---|---|---|
| 1 | **StudyEdge AI vs Studocu** | "studocu vs notion ai" 13 impr, pos 7.5; "studeersnel alternatives" 3, pos 7.3; "studocu vs quizlet" 2, pos 7.0; "studocu vs chegg" 1, pos 11.0 | `/studocu-alternative`: 213 impr, 3 clicks, pos 7.0 (our best comparison-type page) | Already ranking near page 1 for vs-queries; the only comparison page earning clicks |
| 2 | **StudyEdge AI vs Anki** | "anki vs quizlet" 6 impr, pos 18.8; Anki-related total 14 impr | `/blog/anki-vs-quizlet-vs-studyedge`: 200 impr, pos 8.4; `/anki-vs-quizlet`: 52 impr, pos 7.1 | Strongest topical fit (flashcards plus spaced repetition), two existing pages to link from |
| 3 | **StudyEdge AI vs RemNote** | "remnote vs quizlet for college students?" 7 impr, pos 4.9; "is remnote worth paying for..." 1, pos 8.0 | No RemNote page yet | Already at position 4.9 for a vs-query with no dedicated page |
| 4 | **StudyEdge AI vs GoConqr** | "goconqr" 13 impr, pos 29.4; "goconqr alternatives" 10, pos 16.1; "goconqr competitors" 7, pos 16.7 | `/goconqr-alternative`: 1 impr | Most competitor impressions of any app, but we rank poorly; worth it only if paired with internal links |
| 5 | **StudyEdge AI vs Notion AI** | "studocu vs notion ai" 13 impr, pos 7.5 (shared with #1) | `/notion-alternative`: no data in the window | Weakest data; included because Notion is a common student tool and the query shows up |

## Considered and not proposed

- **Gizmo:** zero impressions in 90 days. Nothing in the data supports it yet.
- **ChatGPT for studying:** 4 impressions. We already have
  `/blog/chatgpt-vs-studyedge-for-studying`; a second ChatGPT page would compete with it.
  Better option: move that post to `/compare/studyedge-vs-chatgpt` with a 301, if you want
  it in the compare set.
- **Goodnotes:** 16 impressions, but the queries are "is goodnotes worth it for college",
  which is a review intent, not a comparison, and Goodnotes is a note-taking app.
- **StudyFetch / Knowt / Quizlet:** already built.

## Biggest search opportunity in the same data (not a compare page)

"study edge" has 11,447 impressions at position 6.7 with 16 clicks, and "studyedge"
5,361 impressions at position 5.5 with 46 clicks. Most of those searchers are probably
looking for Study Edge (studyedge.com), the unrelated tutoring company, which is the
known brand-confusion problem. Worth its own discussion.

## Process for each approved page

Same as the first three: competitor facts only from the competitor's own site or app
store listing with a read date and a Sources list, "not stated" where they are silent,
the competitor's better-fit case first, prices labelled with currency, title at most 60
characters, no em dashes, `content/compare/<name>.json` built by
`scripts/build-compare.py`, then links from the existing pages that discuss that app.
