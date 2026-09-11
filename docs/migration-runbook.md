# Migration runbook: `email_suppression` + `user_billing`

One sitting, two migrations, in this order. Everything here was checked against
production on 2026-09-10. Neither migration is an emergency; read the "what this
is not" note under each before you decide the order matters.

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

## Migration 1 — `email_suppression` (+ `email_queue`, `app_config`)

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

### Immediately after: decide about the backfill

The migration says to run `scripts/backfillEmailSuppression.mjs`. **It does not
exist.** Until something populates the list, the table is empty and lifecycle
mail will go to addresses that have already bounced or complained.

You have two safe options, and I would take the first:

- **Leave lifecycle email off until the list is populated.** Nothing has sent
  since July, so there is no regression in waiting. Populate from Resend's
  Suppressions / Bounces export, then turn the taps on.
- **Accept it and watch the bounce rate.** Only reasonable once
  `email.bounced` and `email.complained` are subscribed in the Resend webhook —
  they are still not firing, so there is currently nothing to watch.

To insert from a Resend CSV export once you have one:

```sql
-- one row per suppressed address; reason is free text ('bounce' | 'complaint')
insert into email_suppression (email, reason, created_at)
values ('someone@example.com', 'bounce', now())
on conflict do nothing;
```

### Rollback (migration 1)

```sql
DROP TABLE IF EXISTS email_queue;
DROP TABLE IF EXISTS email_suppression;
DROP TABLE IF EXISTS app_config;
ALTER TABLE user_data DROP COLUMN IF EXISTS feature_flags;
```

Safe: nothing reads these today except the guard, which returns to failing
closed. No application data is lost.

---

## Migration 2 — `user_billing`

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

### Rollback (migration 2)

Phase 1 dual-writes `user_data.subscription`, so the legacy column stays current
while this table exists. Rollback is: revert the code, and optionally

```sql
DROP TABLE IF EXISTS public.user_billing;
```

**No data is lost by dropping it during Phase 1.** That stops being true at
Phase 2, when the dual-write is removed — so if Phase 2 has shipped by the time
you read this, do not drop the table, restore the snapshot instead.

---

## After both

Nothing on the activation branch requires either migration to merge. Specifically:

- **Task A + the Confirm-email toggle** needs neither. It is independent.
- The **lifecycle** commit needs migration 1 before its two emails will actually
  send; without it they will correctly report `lifecycle_email_skipped`.
- **Task B** needs neither, and is blocked on a separate question
  (`COACH_PLAN_AI_COST`), not on schema.

Post-migration sanity, run once:

```sql
select 'suppressed' k, count(*) v from email_suppression
union all select 'queued',  count(*) from email_queue
union all select 'billing', count(*) from user_billing;
```
