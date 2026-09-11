# Migration runbook: `email_suppression` + `user_billing`

**STOP. These are no longer a single sitting, and the order below is now load
bearing. Read this box before you run anything.**

| | what | when |
| --- | --- | --- |
| **1** | `user_billing` | **Now.** It blocks Task B. |
| **2** | `email_suppression` | **Not yet.** Four gated steps first, below. |

`user_billing` moved from nice-to-have to blocking: the seeded-plan grant that
keeps Task B from spending a student's whole month writes `bonus_ai_actions`,
and that column only exists in this migration. Until it is applied the grant
refuses, the seeded generation is skipped, and Task B does nothing for anyone.

`email_suppression` must NOT be run until the four steps in its section are
done, in order. Landing it early resumes lifecycle mail to every address that
has bounced since 27 July, with no bounce telemetry to see it happening.

Everything here was checked against production on 2026-09-11. `user_billing` is
not an emergency in the security sense; read its "what this is not" note.

Run both in the **Supabase SQL editor** against project `vpmgamaspefwqywttdtj`.
Both files are idempotent (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`), so a
re-run is safe if you lose your place.

> **Two scripts referenced by the migration comments do not exist in the repo:**
> `scripts/backfillEmailSuppression.mjs` and `scripts/checkSchema.mjs`. Verified
> absent on 2026-09-10. Substitute queries are given below for both. The two
> `probe*.mjs` scripts DO exist and should be run.

---

## Before you start

```bash
# From the repo root. Confirms you are about to run what you think you are.
shasum -a 256 migrations/20260821_email_suppression_and_queue_v2.sql \
              migrations/20260903_user_billing.sql
```

Take a snapshot first: Supabase Dashboard → Database → Backups → **Create
backup**. Neither migration drops or rewrites existing data, but `user_billing`
does a full-table backfill and a snapshot makes the rollback a non-event.

---

## Migration 1 — `user_billing`

**File:** `migrations/20260903_user_billing.sql` (188 lines)

**What it does:** creates `public.user_billing`, backfills one row per
`auth.users` row from `user_data.subscription`, then locks it: RLS on, exactly
one policy (`SELECT` your own row), no INSERT/UPDATE/DELETE policy at all, plus
`REVOKE`. Service role bypasses RLS, so the Stripe webhook and `reserveAiUsage`
keep working.

**What this is not — read this before you schedule it.** It is a *hardening*,
not a live-hole fix. I checked: `user_data` does carry a permissive
`FOR ALL USING (auth.uid() = user_id)` policy, **but** the trigger
`user_data_guard_subscription_trg` exists and is enabled (`tgenabled = 'O'`), so
self-serve writes to `subscription` are already reverted. The migration's own
rationale is that the trigger "works until someone adds a field and forgets to
add it to the guard list, and then fails open" — which is a good reason to do
this, and not a reason to do it tonight.

The deployed code is already written to work in **either** order (`9eb28a1`), so
there is no window where the app is broken by the table being absent or present.

### Steps

1. Paste the whole file and run it. Atomic (`BEGIN; … COMMIT;`).

2. **Verify — locked correctly.** Expect `relrowsecurity = true`, `policies = 1`:

```sql
select c.relrowsecurity,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename='user_billing') as policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname='user_billing';
```

3. **Verify — only SELECT is policied.** Expect exactly one row, `polcmd = r`:

```sql
select polname, polcmd from pg_policy
 where polrelid = 'public.user_billing'::regclass;
```

4. **Verify — backfill complete and faithful.** Expect
   `billing_rows = auth_users` and `plan_mismatches = 0`:

```sql
select (select count(*) from public.user_billing) as billing_rows,
       (select count(*) from auth.users)          as auth_users,
       (select count(*) from public.user_billing b
          join public.user_data d on d.user_id = b.user_id
         where coalesce(d.subscription->>'plan','free') <> b.plan) as plan_mismatches;
```

5. **Verify — the comps are countable.** The migration header predicts 13
   (7 `manual-ops` + 6 `legacy-unknown`). My own count on 2026-09-10 found
   **7 `manual-ops`** among unpaid Unlimited accounts and 4 more unpaid Unlimited
   with no marker, so expect roughly this; treat a wildly different number as a
   signal to stop and look, not as a failure:

```sql
select granted_by, count(*) from public.user_billing
 where granted_by is not null group by 1 order by 2 desc;
```

6. **Verify — nothing is writable with the anon key.** Expect
   `No write path reachable with the anon key.` and exit code 0:

```bash
node scripts/probeUserBillingExposure.mjs
```

### Rollback (user_billing)

Phase 1 dual-writes `user_data.subscription`, so the legacy column stays current
while this table exists. Rollback is: revert the code, and optionally

```sql
DROP TABLE IF EXISTS public.user_billing;
```

**No data is lost by dropping it during Phase 1.** That stops being true at
Phase 2, when the dual-write is removed — so if Phase 2 has shipped by the time
you read this, do not drop the table, restore the snapshot instead.

---

## Migration 2 — `email_suppression` (+ `email_queue`, `app_config`)

**File:** `migrations/20260821_email_suppression_and_queue_v2.sql` (148 lines)

**What it does:** creates three locked tables and adds `user_data.feature_flags`.
RLS on, **zero policies**, `REVOKE ALL` from `anon` and `authenticated` — service
role only.

**What it unblocks:** `canSendUserEmail()` fails closed while the table is
missing, so **every** lifecycle email is currently refused. This is why nothing
has sent. It also unblocks the `lifecycle` commit on the activation branch.

**What this is not:** it does not suppress anybody. It creates an *empty* table.
Every address that hard-bounced or complained since 27 July is still absent from
it, so the moment it exists, lifecycle mail resumes to all of them.

**DO NOT RUN THIS YET.** Four gates, in order. The migration is step 4.

The reason is in the note above: this creates an **empty** suppression list.
`canSendUserEmail` currently fails closed, so nothing is sending at all. The
moment the table exists the guard starts passing, and lifecycle mail resumes to
every address that has hard-bounced or complained since 27 July — while
`email.bounced` and `email.complained` still are not firing in the Resend
webhook, so there would be nothing watching it happen. Empty list plus no
telemetry is strictly worse than the current silence.

| # | Gate | Owner | Done when |
| --- | --- | --- | --- |
| 1 | Subscribe `email.bounced` and `email.complained` in the Resend webhook | Ryan | Both appear in PostHog as `email_bounced` / `email_complained` |
| 2 | Export the bounce + complaint list from Resend | Ryan | CSV in hand |
| 3 | Turn that CSV into the populate step | Claude | SQL written against the real columns |
| 4 | Run the migration, then immediately the populate step | Ryan | Verifications below pass and the list is non-empty |

**Gate 1 check** — run this before going further. It must return two rows; if it
returns nothing, the webhook subscription has not taken and gates 2 to 4 are
premature:

```sql
-- PostHog, not Postgres. Confirms bounce telemetry is actually arriving.
--   select event, count() from events
--    where event in ('email_bounced','email_complained')
--      and timestamp > now() - interval 7 day
--    group by event
```

**Gate 3 note.** The populate step is deliberately not pre-written here. The
column shape is known (`email`, `reason`, `user_id`, `created_at`) but the CSV's
is not, and a guessed `COPY` against a real export is how you end up suppressing
the wrong addresses or none of them. Send the CSV header and a sample row and it
takes a minute to write properly.

Only once gates 1 to 3 are done:

### Steps

1. Paste the whole file into the SQL editor and run it. It is wrapped in
   `BEGIN; … COMMIT;` so it lands atomically.

2. **Verify — locked correctly.** Expect three rows, `relrowsecurity = true`,
   `policies = 0` for all three:

```sql
select c.relname, c.relrowsecurity,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public'
   and c.relname in ('email_suppression','email_queue','app_config');
```

3. **Verify — not reachable with the anon key.** Expect
   `No path reachable with the anon key.` and exit code 0:

```bash
node scripts/probeSuppressionTableExposure.mjs
```

4. **Verify — schema is complete.** `scripts/checkSchema.mjs` does not exist;
   use this instead. Expect all four rows present:

```sql
select table_name from information_schema.tables
 where table_schema='public'
   and table_name in ('email_suppression','email_queue','app_config')
union all
select 'user_data.feature_flags' from information_schema.columns
 where table_schema='public' and table_name='user_data'
   and column_name='feature_flags';
```

### Immediately after the migration: populate the list

Run the populate step from gate 3 in the same sitting, before anything has a
chance to send. Then confirm it is not empty:

```sql
select count(*) as suppressed, count(*) filter (where reason ilike '%complain%') as complaints
  from email_suppression;
```

A count of 0 here means the guard is now passing for addresses that should be
blocked. If that happens and you cannot populate immediately, the safe move is
the rollback below, which returns the guard to failing closed.

### Rollback (email_suppression)

```sql
DROP TABLE IF EXISTS email_queue;
DROP TABLE IF EXISTS email_suppression;
DROP TABLE IF EXISTS app_config;
ALTER TABLE user_data DROP COLUMN IF EXISTS feature_flags;
```

Safe: nothing reads these today except the guard, which returns to failing
closed. No application data is lost.

---

## What each one unblocks

- **Task B** needs `user_billing`, and nothing else. The seeded-plan grant writes
  `bonus_ai_actions`; until the column exists the grant refuses, the seed is
  skipped, and Task B is a no-op. This is the dependency that was missed when
  the bonus-grant approach was chosen.
- **Task A + the Confirm-email toggle** needs neither migration. Independent.
- The **lifecycle** commit needs `email_suppression` before its two emails send.
  Until then they correctly report `lifecycle_email_skipped`, which is the
  intended state, not a fault.

Post-migration sanity, run once:

```sql
select 'suppressed' k, count(*) v from email_suppression
union all select 'queued',  count(*) from email_queue
union all select 'billing', count(*) from user_billing;
```
