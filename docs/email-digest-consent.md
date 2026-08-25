# The weekly digest: consent, and whether it is good enough to send

Two crons, `weekly-digest` and `weekly-recap`, have never sent an email to
anybody. Both select `user_data.email_digest`, which has never existed, so both
return `42703`, bind the error, and return 500 every Sunday. This is the review
that never happened because the channel never ran.

Migration: `migrations/20260825_email_digest_consent.sql`. Prepared, not applied.

---

## 1. The thing to fix before the column, not after

`api/weekly-recap.js` line 44:

```js
if (row.email_digest) { skipped++; continue }
```

The recap is the **inverse** of the digest. The digest sends to
`email_digest = true`; the recap sends to everyone else. Between them the two
crons partition the entire user base, and only one half is opt-in.

The client now sends `emailDigest: false`. So applying the migration as-is puts
**all 846 accounts on the not-opted-in side**, and the first Sunday afterwards
every one of them gets a weekly commercial email they were never asked about.
The consent fix would route everybody into the unconsented channel.

That is worse than today, where nothing sends. So the migration deliberately
does not switch the crons back on. One of these has to land with it:

```js
if (row.email_digest !== true) { skipped++; continue }   // opt-in only
```

or the recap is retired and the digest is the only Sunday email. My
recommendation is **retire the recap**, for reasons in section 4.

Order: schema first, consent second, sending third. Do not apply the migration
and re-enable the crons in the same change.

---

## 2. The column, and why NULL rather than false

```
NULL   never asked. No consent and no refusal.
true   asked, said yes. Timestamped in email_digest_consent_at.
false  asked, said no.
```

Defaulting to `false` would make "declined" indistinguishable from "never saw
the question", which is the same ambiguity that let `emailDigest: true` sit
unnoticed after its checkbox was deleted. It would also mark 846 people as
having declined something they were never shown.

You said the default is express opt-in, unchecked. `NULL` is how you keep that
statement true for the accounts that predate the checkbox.

---

## 3. The control to restore

Not built here: this is a product surface, and onboarding was rewritten once
already with the checkbox lost in the process. Building it blind is how that
happens twice. The spec:

**Placement.** Onboarding step 2, under "Your answers", below the last row.
Not on step 1, where it competes with the questions that gate the flow.

**Default.** Unchecked. `emailDigest` stays `false` in `profileData` unless the
student ticks it, and `email_digest_consent_at` is stamped only when true.

**Copy.** Name the sender, the frequency, and the content, and do not use
"we will keep you posted" vagueness:

> ☐ **Send me a weekly study digest**
> Every Sunday, from StudyEdge: what you studied this week, what is scheduled
> next week, and where your grades stand. Unsubscribe any time.

Three things that copy does deliberately:
- **"Every Sunday"** is the actual cadence, from the cron (`0 10 * * 0`).
- **"from StudyEdge"** names the sender, so ticking is consent to a known party.
- The content list is what the email genuinely contains, per section 4. If the
  content changes, this copy changes with it.

**What it must not do.** No pre-tick, no "recommended" badge, no bundling with
another control, and no interstitial that makes declining the slower path.

**Existing accounts.** 846 rows are `NULL`. Do not backfill them to `true`. If
you want them on the digest, ask them once, in-app, with the same control.

---

## 4. What those two emails actually contain, and whether they should send

### `weekly-digest` — send it, after the fixes below

Subject: `Your week in study · N sessions done`

Body is genuinely useful and genuinely personal. Every figure is computed from
the student's own rows, and there is no fabricated filler:

- sessions completed in the last 7 days, and total minutes
- the week ahead, up to 6 scheduled sessions with day, course, type, duration
- per-course current grade, weighted from `gradeData.components`, only for
  courses that have graded components

**Verdict: worth sending.** This is the one an opt-in is actually for.

### `weekly-recap` — retire it, or rebuild it

Subject: `Your week: N sessions completed · N-day streak`

Content overlaps the digest almost entirely (sessions, streak, hours, upcoming
exams), and then ends with a paid upgrade block:

> Your free 7-day trial is waiting. Pro gives you 100 AI boosts/month, 5
> courses, Study Coach, and Session Blueprints. $2.99/wk after the trial.

That pitch is what makes the consent question sharp. A recap of the student's
own activity is arguably service content; a recap that closes on pricing is
commercial email, and it is currently aimed at exactly the population that did
**not** opt in.

**Verdict: do not send as-is.** Either fold the useful half into the digest and
delete the recap, or make it opt-in on the same checkbox, in which case it is
redundant with the digest and should be deleted anyway. Retiring it also removes
the inverted targeting in section 1, which is the sharpest edge here.

### Both are missing List-Unsubscribe headers

`lib/server/emailHelpers.js` exports `listUnsubscribeHeaders()` precisely for
this, and its own comment says why:

> Required by Gmail bulk sender rules. Without these, users hit "Report spam"
> instead of unsubscribing, which degrades domain reputation.

**30 of 37 senders set them. These two do not.** Both carry an unsubscribe link
in the footer, which is not the same thing: the header is what puts the native
one-click control in Gmail's UI.

Given the domain has been mailing bounced and complained addresses since 27 July
because `email_suppression` does not exist, turning on a weekly bulk send with
no `List-Unsubscribe` header is the wrong order of operations. Fix the header
first. It is one spread into the existing `resend.emails.send` call:

```js
headers: listUnsubscribeHeaders(email),
```

`api/exam-countdown.js` is missing it too, and is a lifecycle email that should
have it. `daily-revenue-heartbeat` and `feedback` do not need it; the first goes
to you, the second is transactional.

---

## 5. Sequence

1. Apply `20260825_email_digest_consent.sql`. Crons stay off; nothing sends.
2. Add `listUnsubscribeHeaders` to `weekly-digest`, `weekly-recap` and
   `exam-countdown`.
3. Decide the recap: retire, or flip line 44 to `!== true`.
4. Apply the suppression cutover so bounced addresses are actually suppressed
   before any bulk send resumes (`scripts/buildSuppressionCutover.mjs`).
5. Build the checkbox to the spec above.
6. Only then put the two crons back in `vercel.json`.

Steps 1 and 2 are safe in either order. Step 6 before step 4 restarts the
reputation problem on a bigger list.
