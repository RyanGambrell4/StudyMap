-- Migration: user_billing — move plan, status and the AI counters out of a
-- column the user can write.
-- ============================================================================
-- PREPARED, NOT APPLIED. Phase 1 of three. See the rollout note at the bottom.
--
-- Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT DO NOTHING.
--
-- ── the problem ─────────────────────────────────────────────────────────────
-- public.user_data.subscription is a single jsonb column carrying three very
-- different things:
--
--   billing truth      plan, status, stripe ids, currentPeriodEnd, trialUsedAt
--   server counters    aiQueriesUsed, aiQueriesResetAt, feature_usage
--   nothing else       (there is no genuinely user-owned field in there)
--
-- and its RLS policy is `auth.uid() = user_id` FOR ALL, so a signed-in user
-- may write all of it. src/lib/subscription.js already writes the column
-- wholesale from the browser. reserveAiUsage() then READS that same column to
-- decide whether the user has quota left, which means every quota in the
-- product — including the podcast meter — is self-serve bypassable.
--
-- Postgres RLS is row-level, not column-level: there is no policy that says
-- "you may update these keys but not those". The alternative to splitting the
-- column is a BEFORE UPDATE trigger that diffs the jsonb and reverts protected
-- subkeys, which works until someone adds a field and forgets to add it to the
-- guard list, and then fails open. So: split it, and make the trust boundary a
-- thing you can see.
--
-- ── the lock ────────────────────────────────────────────────────────────────
-- RLS on, exactly one policy (SELECT your own row), and no INSERT / UPDATE /
-- DELETE policy at all. A command with no policy is denied to every role that
-- does not bypass RLS, so anon and authenticated can read their own plan and
-- write nothing. The service role bypasses RLS, so the Stripe webhook and
-- reserveAiUsage keep working unchanged.
--
-- The REVOKE is belt and braces, and it is not decorative on this project:
-- default privileges here grant anon and authenticated arwdDxtm on every new
-- table in public, so a permissive policy added later by accident would open
-- this up on its own. Same pattern as
-- migrations/20260821_email_suppression_and_queue_v2.sql.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_billing (
  user_id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Written by api/stripe.js on webhook events. Nothing else may write these.
  plan                   text        NOT NULL DEFAULT 'free'
                                     CHECK (plan IN ('free', 'pro', 'unlimited')),
  status                 text        NOT NULL DEFAULT 'active',
  stripe_customer_id     text,
  stripe_subscription_id text,
  billing_period         text,
  current_period_end     timestamptz,
  trial_used_at          timestamptz,

  -- Written by lib/server/usage.js and the endpoints that meter themselves.
  ai_queries_used        integer     NOT NULL DEFAULT 0 CHECK (ai_queries_used >= 0),
  ai_queries_reset_at    timestamptz,
  bonus_ai_actions       integer     NOT NULL DEFAULT 0 CHECK (bonus_ai_actions >= 0),
  first_generation_at    timestamptz,
  feature_usage          jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Comped accounts. First-class rather than buried in a blob, because these
  -- have to be excludable from every funnel and conversion number: thirteen
  -- free Unlimited accounts silently inflate retention, activation and ARPU
  -- forever otherwise, and nobody remembers why six months later.
  granted_by             text,
  granted_at             timestamptz,

  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_billing_plan_idx
  ON public.user_billing(plan);
CREATE INDEX IF NOT EXISTS user_billing_granted_by_idx
  ON public.user_billing(granted_by) WHERE granted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_billing_stripe_sub_idx
  ON public.user_billing(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- From auth.users rather than user_data, because 52 accounts have no user_data
-- row at all and 125 more have a NULL subscription. Those get the defaults and
-- a row, so readBilling() never has to reason about a missing one.
--
-- Entitlements are carried across VERBATIM. The fourteen unlimited accounts
-- stay unlimited. Revoking a comp is a decision with an email attached, not a
-- side effect of a schema change.
--
-- granted_by is the one field this migration derives rather than copies:
--   - seven rows already carry grantedBy 'manual-ops' and keep it
--   - any other non-free row with no Stripe customer is stamped
--     'legacy-unknown', because a paid plan with no Stripe customer behind it
--     is by definition not a paying customer
--   - a non-free row WITH a Stripe customer is left NULL, i.e. a real customer
-- This changes nobody's access. It only makes the comps countable.
INSERT INTO public.user_billing (
  user_id, plan, status, stripe_customer_id, stripe_subscription_id,
  billing_period, current_period_end, trial_used_at,
  ai_queries_used, ai_queries_reset_at, bonus_ai_actions,
  first_generation_at, feature_usage, granted_by, granted_at, updated_at
)
WITH src AS (
  SELECT u.id AS user_id,
         COALESCE(d.subscription, '{}'::jsonb) AS s,
         d.updated_at
    FROM auth.users u
    LEFT JOIN public.user_data d ON d.user_id = u.id
)
SELECT
  src.user_id,
  CASE WHEN s->>'plan' IN ('free','pro','unlimited') THEN s->>'plan' ELSE 'free' END,
  COALESCE(NULLIF(s->>'status', ''), 'active'),
  s->>'stripeCustomerId',
  s->>'stripeSubId',
  s->>'billingPeriod',
  (s->>'currentPeriodEnd')::timestamptz,
  (s->>'trialUsedAt')::timestamptz,
  GREATEST(COALESCE((s->>'aiQueriesUsed')::numeric, 0)::int, 0),
  (s->>'aiQueriesResetAt')::timestamptz,
  GREATEST(COALESCE((s->>'bonusAiActions')::numeric, 0)::int, 0),
  (s->>'firstGenerationAt')::timestamptz,
  COALESCE(s->'feature_usage', '{}'::jsonb),
  COALESCE(
    s->>'grantedBy',
    CASE WHEN s->>'plan' IN ('pro','unlimited') AND s->>'stripeCustomerId' IS NULL
         THEN 'legacy-unknown' END
  ),
  CASE
    WHEN s->>'grantedAt' ~ '^\d{4}-\d{2}-\d{2}' THEN (s->>'grantedAt')::timestamptz
    ELSE NULL
  END,
  COALESCE(src.updated_at, now())
FROM src
ON CONFLICT (user_id) DO NOTHING;

-- ── Lock it down ────────────────────────────────────────────────────────────
ALTER TABLE public.user_billing ENABLE ROW LEVEL SECURITY;

-- Read your own row: the client needs this to render the paywall and to take
-- the restrictive answer when the legacy blob disagrees. There is deliberately
-- no INSERT, UPDATE or DELETE policy.
DROP POLICY IF EXISTS user_billing_select_own ON public.user_billing;
CREATE POLICY user_billing_select_own ON public.user_billing
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.user_billing FROM anon, authenticated;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- 1. Locked correctly — expect relrowsecurity = true and policies = 1:
--      select c.relrowsecurity,
--             (select count(*) from pg_policies p
--               where p.schemaname='public' and p.tablename='user_billing') as policies
--        from pg_class c join pg_namespace n on n.oid=c.relnamespace
--       where n.nspname='public' and c.relname='user_billing';
--
-- 2. Only SELECT is policied — expect exactly one row, cmd = SELECT:
--      select polname, polcmd from pg_policy
--       where polrelid = 'public.user_billing'::regclass;
--
-- 3. Backfill is complete and faithful — expect billing_rows = auth_users,
--    and plan_mismatches = 0:
--      select (select count(*) from public.user_billing) as billing_rows,
--             (select count(*) from auth.users)          as auth_users,
--             (select count(*) from public.user_billing b
--                join public.user_data d on d.user_id = b.user_id
--               where coalesce(d.subscription->>'plan','free') <> b.plan) as plan_mismatches;
--
-- 4. The comps are countable — expect 13 (7 manual-ops + 6 legacy-unknown):
--      select granted_by, count(*) from public.user_billing
--       where granted_by is not null group by 1;
--
-- 5. Nothing is writable with the anon key:
--      node scripts/probeUserBillingExposure.mjs
--    Expect "No write path reachable with the anon key." and exit code 0.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Phase 1 dual-writes user_data.subscription, so the legacy column stays
-- current for as long as this table exists. Rolling back is therefore just
-- pointing the server back at the blob (revert the code) and, optionally:
--
--   DROP TABLE IF EXISTS public.user_billing;
--
-- No data is lost by dropping it during Phase 1. That stops being true at
-- Phase 2, when the dual-write is removed.
