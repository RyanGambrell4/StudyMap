# SEO baseline, 2026-10-24

## Check-ins (do these)

Scheduled reminders were not set up: session cron jobs end with the session,
and a cloud routine cannot reach the Search Console token, which lives only on
this Mac at `~/Projects/studyedge-gsc/token.json`. These are manual.

- [ ] **Around 2026-11-07: 3.7 GPA page CTR.** Pull `/is-a-3-7-gpa-good` from
  Search Console for 2026-10-24 to 2026-11-06, US only, and compare it to the
  "Before" row in the 3.7 section below (9,542 US impressions, 3 clicks,
  position 8.6 over 60 days). Compare CTR, not raw clicks, since the windows
  differ in length. Quickest route:
  `python3 ~/Projects/studyedge-gsc/gsc.py page-queries --page /is-a-3-7-gpa-good --days 14`
  (use the Python that has `requests`, currently `/opt/anaconda3/bin/python3`).
  Also check the 3.4, 3.5, 3.6 and 3.8 pages, retitled 2026-10-24 in `08d59fd`.
- [ ] **2026-11-14: landing page to signup.** Open the saved PostHog funnel
  [SEO landing page to signup (post identity fix)](https://us.posthog.com/project/412740/insights/sAKt88RY)
  and report the top 10 landing pages by signups and by conversion rate. It
  already starts at 2026-10-23 13:20 UTC, so it contains only valid data. For
  signup counts by landing page, use the `first_landing_path` property on
  `signup_completed`, not `initial_source_landing_path`, which the app sets to
  `/app` on its own first load.

Snapshot taken the day after the SEO and conversion audit, so the effect of the
changes below can be measured against something fixed. Numbers come from Google
Search Console (property `sc-domain:getstudyedge.com`) and PostHog, pulled on
2026-10-23 over the trailing 60 days unless stated otherwise.

## Site-wide, Search Console, 60 days

| Metric | Value |
|---|---|
| Clicks | about 960 |
| Average position | 8.3 |
| CTR | 0.74% |

CTR is held down by AI Overview fan-out: long synthetic queries that log an
impression and never a click. Do not read the site-wide CTR as a measure of
title quality.

## /is-a-3-7-gpa-good, Search Console, 60 days

| Metric | Value |
|---|---|
| US impressions | 9,542 |
| Clicks (all countries) | 3 |
| Average position | 8.6 |

Its ten largest queries are short, real searches ("is a 3.7 gpa good", "3.7
gpa", "is a 3.7 gpa good in college") and every one of them had zero clicks.

### Title and description change

Commit `56287c3`, live 2026-10-23.

| | Before | After |
|---|---|---|
| Title | Is a 3.7 GPA Good? (2026) — Competitive for Top Programs | Is a 3.7 GPA Good? Law School, Med School, and Honors |
| Description | Is a 3.7 GPA good? What it means for jobs, grad school, and scholarships in 2026, and how to hold it. Free GPA calculator inside. | Yes, but it depends on the goal. A 3.7 sits at the median for the lower T14 law schools, often earns magna cum laude, and clears most employer GPA cutoffs. |

(The "before" title is quoted exactly as it was, em dash included.)

## Attribution, PostHog

Commit `e81d099`, live 2026-10-23.

Of 369 `signup_completed` users in the 60 days to 2026-10-23, only 6 were linked
to any marketing-page pageview. The app called `posthog.reset()` on Supabase's
`INITIAL_SESSION` event, which fires with a null session for every logged-out
visitor, so each visitor got a new anonymous id on reaching `/app`.

Consequence: every landing page to signup conversion rate from before
2026-10-23 is invalid, including the homepage's apparent 0% (392 organic
visitors, 0 signups). Compare only data collected after the fix.

## Commits

| Commit | What |
|---|---|
| `e81d099` | Analytics identity no longer reset for logged-out visitors |
| `56287c3` | `/is-a-3-7-gpa-good` title and description rewrite, em dashes removed from five sibling titles |
