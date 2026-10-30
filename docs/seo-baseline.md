# SEO baseline: /compare pages

Recorded 2026-10-30. Check again between **2026-11-20 and 2026-11-27** (3 to 4 weeks after launch).

## What launched

| URL | Launched | Notes |
|---|---|---|
| https://getstudyedge.com/compare | 2026-10-30 | Hub |
| https://getstudyedge.com/compare/studyedge-vs-quizlet | 2026-10-30 | |
| https://getstudyedge.com/compare/studyedge-vs-studyfetch | 2026-10-30 | |
| https://getstudyedge.com/compare/studyedge-vs-knowt | 2026-10-30 | |

Deployed with commit `b80e7388` (verified live, HTTP 200, on 2026-10-30). Added to
`public/sitemap.xml` and `public/llms.txt` the same day. Internal links to them (14
contextual, 131 footer) were added in the following round; see
`docs/compare-internal-links.md`. Titles were shortened to 60 characters or fewer and
competitor prices relabelled by currency in that same round.

## Baseline numbers

Search Console data ends 2026-10-28, two days before launch, so the four pages have
**no impressions and no clicks yet**. The baseline for them is zero.

Related existing pages, last 28 days (2026-09-30 to 2026-10-28), for comparison later:

| Page | Clicks | Impressions | Avg position |
|---|---|---|---|
| /what-is-studyedge-ai | 0 | 394 | 6.1 |
| /studocu-alternative | 3 | 213 | 7.0 |
| /blog/anki-vs-quizlet-vs-studyedge | 0 | 200 | 8.4 |
| /not-affiliated-with-study-edge | 1 | 143 | 10.2 |
| /anki-vs-quizlet | 0 | 52 | 7.1 |
| /quizlet-alternative | 0 | 16 | 5.6 |
| /goconqr-alternative | 0 | 1 | 9.0 |

Competitor queries, last 90 days (2026-07-30 to 2026-10-28):

| Queries containing | Impressions | Clicks | Avg position |
|---|---|---|---|
| Quizlet (or Q-Chat) | 50 | 0 | 19.7 |
| StudyFetch | 7 | 0 | 47.7 |
| Knowt | 1 | 0 | 39.0 |

## How to check in 3 to 4 weeks

The property is a domain property. The default `https://getstudyedge.com/` returns 403,
so always set `GSC_SITE`:

```
cd ~/Projects/studyedge-gsc
export GSC_SITE="sc-domain:getstudyedge.com"
python3 gsc.py pages --days 28 --min-impr 0 | grep -E "/compare|alternative|anki-vs"
for p in compare compare/studyedge-vs-quizlet compare/studyedge-vs-studyfetch compare/studyedge-vs-knowt; do
  python3 gsc.py page-queries --page "https://getstudyedge.com/$p" --days 28
done
python3 gsc.py queries --days 28 --min-impr 1 | grep -iE "quizlet|studyfetch|study fetch|knowt"
```

`page-queries` needs the full URL; a bare path returns no rows.

Things to look at: whether the compare pages are indexed (`gsc.py inspect`), their
impressions and average position, whether they take impressions away from
`/quizlet-alternative` and `/blog/anki-vs-quizlet-vs-studyedge` (cannibalization) or add to
them, and whether StudyFetch queries move from position ~48 toward page 1.
