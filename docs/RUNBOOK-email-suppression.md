# Runbook: restore email suppression

**Status as of 2026-09-15: COMPLETE. All steps done and verified. Nothing here is outstanding.**

History: on 2026-08-21 this was "broken, lifecycle mail going out with no suppression list."
The fail-closed guard then shipped, which silently changed the failure mode: from
2026-08-25 to 2026-09-15 the missing table blocked **all** lifecycle mail —
281 refusals across 61 users.

What has since been applied to production (`vpmgamaspefwqywttdtj`):

- **Step 2 — DONE 2026-09-15.** `20260821_email_suppression_and_queue_v2.sql` applied.
  `email_suppression`, `email_queue`, `app_config` exist with RLS on and zero
  anon/authenticated policies. Lifecycle sending self-healed on the next cron tick.
- **Step 6 — DONE 2026-09-15.** `api/resend-webhook.js` now writes the suppression
  list: `suppressAddress()` records complaints always, and bounces only when
  Resend reports `bounce.type === 'Permanent'`. The table populates itself from
  here on, so fault 2 below is fixed permanently.
- Also applied: `20260903_user_billing.sql` (unblocks `api/reconcile-billing.js`)
  and `20260915_user_data_email_digest.sql`.

- **Steps 0, 3, 4 — DONE 2026-09-15.** The historical backfill is applied:
  **8 addresses, all `bounced`, 0 complaints**, every one matching a real account so
  both lookups in `canSendUserEmail()` block them. Source was the Resend
  **Suppressions** export (`id,email_address,reason,reason_detail,created_at`).
  Verified read-only, per the warning in step 5 — a live send was never attempted
  against production.

  Two notes for next time. A Resend **Domains** export is the wrong file; you want
  **Suppressions**. And the export CSV is deliberately NOT committed to this repo:
  it is a list of real subscriber email addresses.

  `scripts/backfill-email-suppression.mjs` was not used — it needs the production
  service key, and its `auth.admin.listUsers()` account-mapping step would hit the
  GoTrue NULL-confirmation_token bug anyway. The insert was done directly against
  the database with the same semantics the script documents (lowercase the address,
  normalise the reason, dedupe by email, complaint outranks bounce).

---

## What is actually wrong

Three faults stacked, each of which alone would be enough:

1. **The migration was never applied.** `migrations/20260727_email_suppression_and_queue.sql` creates `email_suppression`, `email_queue` and `app_config`. Production has none of them. Do not run that file: it creates all three without row-level security. Run `migrations/20260821_email_suppression_and_queue_v2.sql`, and see step 2 for why.

2. **Nothing ever wrote to the table anyway.** The migration's comment says *"Written by resend-webhook on bounce and complaint events"*. That was never implemented. `api/resend-webhook.js` handles `email.bounced` and `email.complained` by calling `posthogCapture` and `console.warn`, and nothing else. **Applying the migration alone gets you an empty table that stays empty forever.**

3. **The read failed open.** `canSendUserEmail()` destructured only `data`, so a missing table read as "this address is not suppressed" and the send proceeded. Fixed on this branch: it now binds `error`, reports a missing relation loudly, and **fails closed**.

Consequence: since **2026-07-27**, roughly twenty lifecycle endpoints have mailed without ever consulting a suppression list.

### Where the bounce data went

Nowhere you can query.

| Sink | State |
|---|---|
| `email_suppression` | Table does not exist, and no writer exists either |
| PostHog | **Zero** `email_bounced` / `email_complained` events, ever. `posthogCapture` in the webhook has never worked: `POSTHOG_API_KEY` did not exist before ~26 Jul (early return), and has been a rejected `phx_` key since |
| Vercel runtime logs | `console.warn` only, ~24h of retention |
| Resend | **The only surviving record.** Needs `RESEND_API_KEY`, which was not available |

The webhook **is** receiving deliveries: `/api/resend-webhook` ran **17 times in 24h**. Events arrive and are discarded.

---

## Order of operations

Do not reorder. Applying the migration without the backfill gives you a suppression list that suppresses nobody, which is worse than the current state because it looks fixed.

### 0. Export the bounce data from Resend first

Resend dashboard → the bounced/complained view → export CSV. Do this **before** anything else: it is the only surviving copy, and Resend's retention is finite.

Save as `bounces.csv`. Any column layout works; the script matches headers loosely for email, reason/type/status and date.

### 1. Preflight, read-only

```bash
cd ~/Projects/StudyMapLocal/.claude/worktrees/fix-funnel-course-gate
SUPABASE_URL=https://vpmgamaspefwqywttdtj.supabase.co \
SUPABASE_SERVICE_KEY=<production service key> \
  node scripts/check-schema.mjs
```

Expect: 12 required tables `ok`, and the three listed as `still absent`.

### 2. Apply the migration

Supabase dashboard → SQL Editor → paste **`migrations/20260821_email_suppression_and_queue_v2.sql`** → Run. It is `IF NOT EXISTS` throughout, so it is safe to re-run, and safe to run on top of the 27 July file if you already ran that one.

> **Do not run `migrations/20260727_email_suppression_and_queue.sql`.** It creates the three tables and never enables row-level security on them. This project's default privileges grant `anon` and `authenticated` full `arwdDxtm` on every new table in `public`, so all three land world-readable and world-writable to anyone holding the anon key, which ships in the browser bundle.
>
> Measured on staging with the 27 July DDL applied, via `scripts/probeSuppressionTableExposure.mjs`. All twelve of these returned success:
>
> | actor | operation | result |
> |---|---|---|
> | anon, not logged in | read `email_suppression` | 200, rows returned |
> | anon, not logged in | read `email_queue` | 200, rows returned |
> | anon, not logged in | read `app_config` | 200, rows returned |
> | anon, not logged in | `DELETE` from `email_suppression` | 200, row deleted |
> | anon, not logged in | flip `app_config.lifecycle_v2` | 200, row updated |
> | anon, not logged in | `INSERT` into `email_suppression` | 201, row created |
> | logged-in student | the same six | same |
>
> `email_queue.context` carries recipient email addresses, and `email_suppression` is by construction a list of people who bounced or complained. Shipping the 27 July file would replace a suppression list that does not work with one that anyone can read, empty, or poison. v2 is the identical schema with RLS enabled, zero policies, and the anon/authenticated grants revoked. The service role bypasses RLS, so `emailGuard`, `emailQueue` and `featureFlags` keep working with no code change.

Re-run step 1. The three should now read `now present`.

Then confirm they are locked, not just present:

```bash
SUPABASE_URL=https://vpmgamaspefwqywttdtj.supabase.co \
SUPABASE_ANON_KEY=<production anon key> \
SUPABASE_SERVICE_KEY=<production service key> \
ALLOW_PROD=1 \
  node scripts/probeSuppressionTableExposure.mjs
```

Expect `No path reachable with the anon key.` and exit code 0. It seeds and removes its own throwaway rows and student, and sends no email.

### 3. Backfill, dry run first

```bash
SUPABASE_URL=https://vpmgamaspefwqywttdtj.supabase.co \
SUPABASE_SERVICE_KEY=<production service key> \
  node scripts/backfill-email-suppression.mjs --from-csv bounces.csv
```

Prints counts, how many map to real accounts, and the first ten. Writes nothing.

### 4. Backfill, for real

```bash
SUPABASE_URL=https://vpmgamaspefwqywttdtj.supabase.co \
SUPABASE_SERVICE_KEY=<production service key> \
  node scripts/backfill-email-suppression.mjs --from-csv bounces.csv --apply --allow-production
```

`--allow-production` is required and deliberate. Without it the script refuses.

### 5. Verify suppression actually suppresses

```sql
-- Should be > 0, and should match the backfill count.
SELECT reason, count(*) FROM public.email_suppression GROUP BY reason;

-- Pick one and confirm it maps to an account.
SELECT s.email, s.reason, s.user_id IS NOT NULL AS has_account
FROM public.email_suppression s LIMIT 5;
```

Then confirm the guard reads it. On **staging**, with a suppressed address seeded, `canSendUserEmail()` must return `{ ok: false, reason: 'Suppressed (bounced)' }`. Do not test this against production, because a wrong result means a real send.

### 6. Teach the webhook to write

Still outstanding, and deliberately not done in this build because it changes a live webhook. `scripts/backfill-email-suppression.mjs` carries the exact patch in its closing comment. Until it lands, the list is a snapshot that goes stale from the day you load it.

---

## The kill switch

This branch makes `canSendUserEmail()` **fail closed**: if the suppression list cannot be read, no lifecycle mail goes out. That is deliberate. The two risks are not symmetric — a delayed lifecycle email costs nothing, a send to a complained address costs sender reputation and compounds.

Once deployed, this **pauses lifecycle sends by itself** until step 2 lands, and self-heals the moment the table exists.

To override without a code change:

```
EMAIL_SUPPRESSION_FAIL_OPEN=1
```

Only set that if you have decided the reputation risk is acceptable.
