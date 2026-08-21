# The `subscription` column: who can actually write to it

Task 8. Investigation only. No billing or subscription code was changed.

## The short version

`user_data.subscription` is **write-only to the service role**. Every write from
the browser is silently reverted by a trigger. Nothing errors, and the client's
own in-memory copy still updates, so the app behaves correctly for the rest of
the session and then forgets.

The consequence nobody had measured: **`feature_usage` has never existed on a
single row**, so every non-AI free limit has been unenforced and unmeasured for
the product's entire history.

## The mechanism

`user_data_guard_subscription_trg`, `BEFORE INSERT OR UPDATE ON user_data`:

```sql
IF auth.role() <> 'service_role' THEN
  IF TG_OP = 'INSERT' THEN NEW.subscription := <safe defaults>;
  ELSIF TG_OP = 'UPDATE' THEN NEW.subscription := OLD.subscription;
  END IF;
END IF;
```

It was added by `supabase/rls-lockdown.sql` to stop a browser flipping itself to
`plan: 'unlimited'`. It does that job: verified on staging, an authenticated
client's attempt to set `plan: 'unlimited'` left the plan at `free`.

What it also does, which the application code does not account for, is discard
every *legitimate* client write to that column.

## The evidence

Production, 810 rows, 2026-08-21:

| Key | Written by | Rows carrying it |
|---|---|---|
| `lastAiCallAt` | server, `lib/server/usage.js` | **614** |
| `aiQueriesUsed > 0` | server, `lib/server/usage.js` | **155** |
| `trialUsedAt` | server, Stripe webhook | **7** |
| `bonusAiActions` | server, `api/claim-paywall-exit-gift.js` | **6** |
| `feature_usage` | **browser**, `incrementFeatureUsage()` | **0** |
| `firstGenerationAt` | browser + server (this branch) | 0 (new field) |

Every key with a server writer is present on rows. The one key written only from
the browser is present on **none**. Not empty objects, not zero counts. The key
has never been written.

That is not a clobber between two writers losing a race. A race leaves the key
present sometimes. Zero out of 810 is a categorical block.

## What this means for the numbers

`getFeatureUsage()` reads `subscription.feature_usage[name]` and falls back to
`{ count: 0 }`. Because the key is never persisted, that fallback is what
`canUseFeature()` has always seen on a fresh session. So for every feature whose
free limit lives in `FREE_LIMITS` and is counted through `feature_usage`:

`blueprint` · `coachPlan` · `practiceExam` · `brainDump` · `quizBurst` ·
`examRescue` · `focusMode` · `flashcardDecks`

...the limit has been **unenforced across sessions and unmeasured entirely**.
Within a single session it works, because `_sub` is updated in memory. Reload,
and the count is back to zero.

**Has any client-derived usage number ever been accurate? No.** Not in the
database, and not in any analysis reading the database. Any conclusion of the
form "only N users hit a limit" that was derived from `feature_usage` is
measuring a column that does not exist.

The AI quota is the exception and is trustworthy: `aiQueriesUsed` is written
exclusively by the server through `lib/server/usage.js`, which holds the service
key. That is why the 48/135 figures in the quota-restore script are sound.

## Which accounts are affected

All 810. It is not a subset, a cohort, or a date range. It is every row, for the
whole life of the trigger.

## Does this branch make it better, worse, or neither

**Better, in one specific way.** `firstGenerationAt`, which gates the card ask,
is stamped by `commitReservation()` in `lib/server/usage.js` using the service
role, on the success path of every AI call. That write persists. So the
"no card ask before a demonstrated win" rule is durable across sessions and
devices, and does not depend on the client write at all.

**Neither, on the clobber itself.** `commitReservation()` still reads the whole
`subscription` object and writes the whole thing back. Two service-role writers
racing (the usage gate and the Stripe webhook) can still lose each other's keys.
This branch inherited that shape and did not change it.
`lib/server/subscriptionMerge.js`, which fixes it by applying only the keys a
writer owns onto a freshly-read row, is on
`worktree-fix-feature-usage-clobber` and was never merged.

**One thing this branch made misleading.** `src/lib/subscription.js`
`markSuccessfulGeneration()` writes `firstGenerationAt` from the browser. That
write is discarded, always. It is dead code that reads as live, and
`src/lib/firstWin.test.js` asserts the upsert happens against a mocked Supabase,
so the test passes while the real write does nothing. The behaviour is still
correct, for a different reason than the code implies. Annotated in both files
rather than deleted, because removing the client write would also remove the
in-memory update that makes the rule work within the session.

## What to do about it, not done here

1. Merge `subscriptionMerge.js`, or reimplement it, so no writer rewrites keys
   it does not own. This is the actual clobber fix.
2. Decide where `feature_usage` should live. It is per-user usage accounting
   written by the client, which is exactly what the trigger exists to prevent.
   Either move the increments behind a server endpoint, or move the counter out
   of `subscription` into a column the trigger does not guard.
3. Treat every historical statistic derived from `feature_usage` as void.

## Consequence: the quota counter users see is always wrong

Asked separately as "find the remaining-AI-actions counter, or establish it does
not exist". It exists, in exactly one place, and it lies.

**Where it renders.** `src/components/AIChatView.jsx:451`, in the chat input
footer, free users only:

```
{remaining} free AI questions left · Pro gives you 100/month
```

That is the only surface a default user can reach. `DashboardView.jsx:199` also
computes `aiRemaining`, but DashboardView is V1 and sits behind the
`se_dashboard_v2` opt-out, so it does not render by default. Nothing on the
live dashboard, the account screen or the study tools shows a remaining count.
`getAIQueriesUsed()` and `getAIQueriesLimit()` are dead: nothing outside a test
calls them.

**Why it is wrong.** It reads `canUseFeature('aiTutor')` ->
`getFeatureUsage('aiTutor')` -> `subscription.feature_usage.aiTutor`, which is
absent on all 810 rows for the reason documented above. So it falls back to
`{ count: 0 }` and renders **"5 free AI questions left"** on every fresh
session, no matter how many the user has actually spent.

Enforcement, meanwhile, reads `aiQueriesUsed` on the server, which is accurate.

So the two disagree by construction. A free user who has spent all five sees
"5 free AI questions left", sends a sixth, and is refused with a 402. The
counter cannot warn anyone, because it never counts down across sessions.

**It also never states the period.** The copy says "free AI questions left" and
"Pro gives you 100/month". It never says the free allowance renews monthly, so
`AI_PERIOD_LABEL` has nowhere to render even now that the config agrees on
monthly.

Not fixed here: the fix is to source the counter from the server-authoritative
number rather than from `feature_usage`, which is a change to quota code and out
of scope for this build.
