# Session replay: factual summary

Prepared 2026-08-31 for legal review. **Facts only. No legal opinion, no
assessment of obligations.** Every figure is measured from the analytics event
store or read from source control, and the method is stated so it can be
re-derived or challenged.

---

## 1. What was running

Two separate session-replay systems exist in this codebase. They are configured
differently and must not be conflated.

| | **PostHog** | **Sentry** |
|---|---|---|
| Library | `posthog-js` | `@sentry/react` |
| Config location | `src/lib/analytics.js` | `src/lib/sentry.js` |
| Sampling | All sessions (no sample rate set) | 5% of sessions; 100% of sessions with an error |
| On-screen text | **Not masked** | Masked (`maskAllText: true`) |
| Media | Not blocked | Blocked (`blockAllMedia: true`) |
| Typed input | Masked (`maskAllInputs: true`) | Masked |
| Disclosed in privacy policy | **No** | Yes |

This summary concerns the **PostHog** system. Sentry's configuration matches
what the privacy policy describes; its live status in production depends on the
`VITE_SENTRY_DSN` environment variable, **which has not been verified** and
should be confirmed separately.

## 2. Which surface

The web application only, served at `getstudyedge.com/app`.

The public marketing site (`getstudyedge.com` and its static pages) has had
replay explicitly disabled for the entire period, via
`disable_session_recording: true` in `public/ph-init.js`. This is corroborated
by the event data: every marketing-surface session carries
`$recording_status = "disabled"`.

The application surface was never given the same setting. This appears to be an
omission rather than a decision; no commit records an intent to enable replay in
the app.

## 3. Period

| | |
|---|---|
| Earliest recorded session event | **2026-05-06 22:52 UTC** |
| Recording disabled in code | **2026-08-31** (commit `b232d2d`) |
| Duration | approximately 17 weeks |

The 2026-05-06 date is the earliest event carrying `$recording_status = "active"`
within a 26-week lookback. Events older than the analytics store's own retention
window cannot be queried, so **this is the earliest observable date, not
necessarily the date recording began.**

## 4. Volume

Distinct recorded sessions per calendar month, application surface,
`$recording_status = "active"`:

| Month | Recorded sessions | Distinct people |
|---|---:|---:|
| May 2026 | 482 | 303 |
| June 2026 | 137 | 127 |
| July 2026 | 557 | 444 |
| August 2026 | 696 | 517 |
| **Total** | **1,872** | **1,364 distinct people across the full period** |

The people column does not sum across rows: an individual active in more than
one month is counted once in the total and once per month above.

## 5. Users identified as under 18

Age is not collected directly. The nearest proxy is `school_type`, a
self-declared value captured during onboarding.

Over an 8-week window (2026-07-06 to 2026-08-31), among users with actively
recorded sessions:

| `school_type` | People | Recorded sessions |
|---|---:|---:|
| `hs` (high school) | **104** | **158** |
| `uni` (university) | 89 | 135 |
| `exam` | 23 | 27 |
| **not set** | **850** | **1,050** |

Two limitations that bear on the "under 18" count:

1. `school_type` is written at onboarding, so **sessions recorded before a user
   completed onboarding carry no value.** The 850 unlabelled users are of
   unknown age, and some are likely to be under 18.
2. The value is self-declared and unverified. A user in the `hs` bucket is
   stating they attend high school; it is not an age assertion, and some high
   school students are 18 or over.

The business separately estimates its user base at approximately 247 high
school and 141 university users.

## 6. What was captured, and what was masked

**Masked (not present in recordings):**
- Text typed into form inputs, including passwords — `maskAllInputs: true`
- Any element explicitly marked with the `[data-private]` attribute

**Not masked (present in recordings):**
- All other rendered on-screen content.

`maskAllInputs` masks input fields. It does not mask text the application
renders to the page. Based on the application's feature set, recordings
therefore may contain, as displayed on screen: course names, grades and
predicted grades, uploaded syllabus content after extraction, AI tutor
conversation text, essay and note content, and study schedules.

The `maskAllText` option, which would have masked rendered content, was not set
on the PostHog integration. It **was** set on the Sentry integration.

## 7. Where it is stored

- **Processor:** PostHog, Inc. (PostHog Cloud US)
- **Host:** `us.posthog.com`
- **Project:** "Default project", id `412740`, organisation "StudyEdge AI"
- **Ingestion path:** browser to a first-party reverse proxy at `/ph` on
  `getstudyedge.com`, which forwards to PostHog Cloud US. Recording payloads do
  not transit any other third party.

## 8. Retention

**Not established.** Session-replay retention is a project-level setting in the
PostHog interface (Settings, under session replay) and is not readable through
the query interface used for this summary. It must be read from the PostHog
console and recorded here before this document is complete.

PostHog applies a plan-dependent default retention to recordings; the specific
value in force for this project has not been confirmed and should not be assumed.

## 9. What the privacy policy says

`public/privacy.html` contains the following, verbatim:

> "Error and session data: application errors and, for approximately 5% of
> sessions, a session replay are sent to Sentry for debugging. Text on screen is
> masked in session replays."

The policy separately discloses PostHog, but only in connection with analytics
events:

> "...page visits, click events, and general performance metrics. This data is
> collected via PostHog and Vercel Analytics. Your email address and name are
> associated with your PostHog analytics profile."

Three factual observations, stated without characterisation:

1. The replay disclosure names **Sentry**. PostHog session replay is not
   mentioned anywhere in the policy.
2. "Text on screen is masked in session replays" corresponds to the Sentry
   configuration (`maskAllText: true`). It does not correspond to the PostHog
   configuration in force during the period, which masked inputs only.
3. "approximately 5% of sessions" corresponds to Sentry's
   `replaysSessionSampleRate: 0.05`. PostHog applied no sampling.

`public/terms.html` contains no reference to session recording, screen
recording, replay, or any analytics vendor.

## 10. Remediation to date

| Date | Action |
|---|---|
| 2026-08-31 | `disable_session_recording: true` added to `src/lib/analytics.js` and deployed (commit `b232d2d`). No new recordings are captured on any surface from that deployment onward. |

**Outstanding:** the 1,872 recordings already captured have not been deleted.
Deletion is performed in PostHog, not in application code.

---

*Compiled by the engineering workstream. Figures derived from the PostHog event
store (`$recording_status`, `school_type`, `$session_id`) and from source
control history. Any figure in this document can be re-derived on request.*
