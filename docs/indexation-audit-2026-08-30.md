# Indexation audit, 2026-08-30

Source: GSC URL Inspection API over all 317 sitemap URLs (`sc-domain:getstudyedge.com`).
This replaces the 18-row Coverage drilldown sample.

| State | Count | Share |
|---|---:|---:|
| Submitted and indexed | 244 | 77.0% |
| Discovered - currently not indexed | 41 | 12.9% |
| Crawled - currently not indexed | 17 | 5.4% |
| Not found (404) | 11 | 3.5% |
| URL is unknown to Google | 4 | 1.3% |

## Not found (404) (11)

**All 11 return HTTP 200 today.** Root cause: 11 pages shipped 2026-07-14 without `vercel.json` rewrites; Google crawled them 07-17/18 and cached 404; rewrites added 2026-07-29 (`c8333f3`). Google has not returned since. **Action: GSC > URL Inspection > Request Indexing, one click each.** No API can trigger this (the Indexing API only accepts JobPosting/BroadcastEvent). Already submitted to Bing via IndexNow; sitemap lastmod is fresh.

| URL | words | inbound | last crawled |
|---|---:|---:|---|
| `/ap-biology-study-schedule` | 733 | 9 | 2026-07-18 |
| `/ap-calculus-ab-study-schedule` | 792 | 8 | 2026-07-18 |
| `/blog/how-to-make-flashcards` | 2516 | 14 | 2026-07-21 |
| `/blog/how-to-study-smarter-not-harder` | 2786 | 24 | 2026-07-21 |
| `/blog/how-to-study-while-working-full-time` | 3228 | 3 | 2026-07-22 |
| `/blog/spaced-repetition-study-technique` | 2735 | 35 | 2026-07-20 |
| `/cornell-notes-template` | 348 | 6 | 2026-07-17 |
| `/how-students-study-report-2026` | 1458 | 22 | 2026-07-17 |
| `/pomodoro-timer` | 335 | 4 | 2026-07-18 |
| `/scholarship-gpa-requirements` | 394 | 1 | 2026-07-18 |
| `/spaced-repetition-vs-cramming` | 1473 | 16 | 2026-07-17 |

## URL is unknown to Google (4)

In the sitemap but never fetched. **Not a linking problem:** all four already carry 2 to 6 inbound internal links. This is pure crawl rationing. **Action: Request Indexing** (the only same-day lever), and note that `/what-gpa-do-you-need-for-mit` already earns Bing citations, so the demand is real and Google simply has not spent budget on it.

| URL | words | inbound | last crawled |
|---|---:|---:|---|
| `/what-gpa-do-you-need-for-mit` | 757 | 5 | never |
| `/what-gpa-do-you-need-for-nyu` | 730 | 2 | never |
| `/what-gpa-do-you-need-for-ohio-state-university` | 461 | 6 | never |
| `/what-gpa-do-you-need-for-university-of-arizona` | 453 | 3 | never |

## Crawled - currently not indexed (17)

Google fetched these and declined to index. This is a value judgment, not a technical fault, so resubmitting will not help. **Action: differentiate or consolidate.** 7 of 17 are `is-a-X-gpa-good` pages, which is the cluster flagged for consolidation.

| URL | words | inbound | last crawled |
|---|---:|---:|---|
| `/anki-alternative` | 1918 | 113 | 2026-06-26 |
| `/ap-exam-study-schedule-templates` | 1620 | 18 | 2026-08-13 |
| `/best-study-app-for-students` | 1686 | 83 | 2026-05-04 |
| `/blog/best-note-taking-apps-for-college-students` | 2456 | 5 | 2026-07-16 |
| `/blog/how-to-study-for-history` | 3470 | 8 | 2026-07-16 |
| `/blog/how-to-study-for-macroeconomics` | 2447 | 5 | 2026-07-15 |
| `/grade-calculator-college` | 1823 | 65 | 2026-07-16 |
| `/how-to-make-a-study-schedule` | 2089 | 37 | 2026-06-02 |
| `/is-a-2-0-gpa-good` | 1534 | 4 | 2026-07-16 |
| `/is-a-2-5-gpa-good` | 1716 | 9 | 2026-07-16 |
| `/is-a-2-7-gpa-good` | 1106 | 4 | 2026-07-16 |
| `/is-a-3-2-gpa-good` | 1006 | 5 | 2026-07-16 |
| `/is-a-3-3-gpa-good` | 1671 | 9 | 2026-07-16 |
| `/is-a-3-6-gpa-good` | 956 | 7 | 2026-07-16 |
| `/is-a-3-8-gpa-good` | 1479 | 11 | 2026-07-16 |
| `/what-gpa-do-you-need-for-dental-school-admissions` | 759 | 5 | 2026-07-17 |
| `/what-gpa-do-you-need-for-ucla` | 744 | 3 | 2026-07-17 |

## Discovered - currently not indexed (41)

Google knows the URL but has not spent budget fetching it. **Adding internal links will not fix this** and I was wrong to propose it earlier: these pages already carry 3 to 11 inbound links, and `/best-study-app-for-ukzn-students` has 11 and is still unfetched. **Action: reduce the number of URLs competing for the budget.** With 62 of 317 URLs (20%) returning nothing, and non-brand CTR flat at ~0.5% from position 3 to 20, consolidating the weakest clusters is the highest-value move available. Deletion really is a growth tactic here.

| URL | words | inbound | last crawled |
|---|---:|---:|---|
| `/best-study-app-for-emory-students` | 504 | 3 | never |
| `/best-study-app-for-northeastern-university-students` | 522 | 3 | never |
| `/best-study-app-for-northwestern-students` | 594 | 5 | never |
| `/best-study-app-for-princeton-students` | 491 | 3 | never |
| `/best-study-app-for-rutgers-students` | 733 | 4 | never |
| `/best-study-app-for-stanford-students` | 617 | 3 | never |
| `/best-study-app-for-ukzn-students` | 878 | 11 | never |
| `/best-study-app-for-unc-chapel-hill-students` | 515 | 4 | never |
| `/best-study-app-for-university-of-rochester-students` | 797 | 3 | never |
| `/best-study-app-for-university-of-washington-students` | 516 | 3 | never |
| `/best-study-app-for-up-students` | 869 | 11 | never |
| `/is-a-3-0-gpa-good` | 1046 | 16 | never |
| `/is-a-3-5-gpa-good` | 1144 | 18 | never |
| `/not-affiliated-with-study-edge` | 878 | 42 | never |
| `/note-taking-apps-for-students` | 1489 | 3 | never |
| `/notion-alternative` | 1067 | 4 | never |
| `/notion-for-studying` | 598 | 66 | never |
| `/photomath-alternative` | 537 | 4 | never |
| `/pricing` | 597 | 41 | never |
| `/quizlet-qchat-alternative` | 738 | 3 | never |
| `/study-hours-by-major` | 620 | 7 | never |
| `/study-schedule-maker` | 675 | 3 | never |
| `/studyedge-app` | 109 | 3 | never |
| `/what-gpa-do-you-need-for-architecture-school-admissions` | 532 | 3 | never |
| `/what-gpa-do-you-need-for-boston-university` | 436 | 7 | never |
| `/what-gpa-do-you-need-for-case-western-reserve` | 463 | 4 | never |
| `/what-gpa-do-you-need-for-columbia` | 711 | 5 | never |
| `/what-gpa-do-you-need-for-duke` | 715 | 2 | never |
| `/what-gpa-do-you-need-for-harvard` | 764 | 13 | never |
| `/what-gpa-do-you-need-for-law-school-admissions` | 782 | 10 | never |
| `/what-gpa-do-you-need-for-mba-programs` | 781 | 7 | never |
| `/what-gpa-do-you-need-for-medical-school-admissions` | 799 | 21 | never |
| `/what-gpa-do-you-need-for-penn-state-university` | 492 | 5 | never |
| `/what-gpa-do-you-need-for-pharmacy-school-admissions` | 534 | 6 | never |
| `/what-gpa-do-you-need-for-princeton` | 734 | 5 | never |
| `/what-gpa-do-you-need-for-stanford` | 737 | 10 | never |
| `/what-gpa-do-you-need-for-uc-berkeley` | 716 | 7 | never |
| `/what-gpa-do-you-need-for-university-of-texas-austin` | 509 | 4 | never |
| `/what-gpa-do-you-need-for-university-of-washington` | 475 | 3 | never |
| `/what-gpa-do-you-need-for-wake-forest-university` | 450 | 4 | never |
| `/what-is-studyedge-ai` | 1012 | 6 | never |

## What this changes

62 of 317 URLs (20%) produce nothing: 41 discovered-not-fetched, 17 crawled-and-declined,
4 never discovered. Indexed is 244 (77%), better than the 202/327 (62%) figure this work
started from.

The 11 stale 404s are the only free win, and they are free: the pages are healthy, Google
just holds a cached 404 from a 15-day window in July. `/how-students-study-report-2026` is
among them, which means the one asset capable of earning backlinks has been unreachable to
Google for six weeks.

Everything else in the not-indexed set has adequate internal linking already. That rules out
the cheap fix and points at crawl budget and site authority, which is a consolidation and
off-site problem, not an on-page one.
