-- ============================================================================
-- Atomic AI usage increment
-- ============================================================================
-- PREPARED, NOT APPLIED. This touches the subscription column, which the
-- current build is not allowed to change. Handing it over rather than running it.
--
-- ── What is wrong today ─────────────────────────────────────────────────────
-- commitReservation in lib/server/usage.js reads `subscription` at RESERVE time
-- and writes the whole column back at COMMIT time:
--
--   const updatedSub = { ...sub, aiQueriesUsed: used + 1, ... }
--   await supabase.from('user_data').upsert({ user_id, subscription: updatedSub })
--
-- The gap between those two points is an entire AI generation. Tens of seconds.
-- Anything that writes the column inside that window is erased, and any second
-- reservation opened inside it starts from the same stale `used`.
--
-- Both failure modes reproduce on demand. scripts/verifyAiQuotaAccounting.mjs,
-- run against staging on 2026-08-24, 12 of 14 checks passed and these two failed:
--
--   5. two generations overlapping (reserve, reserve, commit, commit)
--      expected stored aiQueriesUsed = 2, got 1. One generation was free.
--
--   6. a Stripe-webhook-shaped write landing mid-generation
--      seeded plan=pro status=active stripeSubId=sub_arrived_midflight between
--      reserve and commit; after commit the row read plan=free, stripeSubId GONE.
--
-- Number 6 is the one that costs money in the wrong direction. A user who
-- upgrades while a generation is in flight is silently reverted to free: Stripe
-- bills them, our row says they are not paying, getActivePlan() returns 'free',
-- and they lose the entitlements they just bought. The Stripe webhook is not
-- retried for this, because from Stripe's side the write succeeded.
--
-- The same window is open to every other service-role writer of this column:
-- the resend-webhook engagement blob, trial_email_flags, bonusAiActions from the
-- paywall-exit gift, and quotaRestoredAt from the quota repair script.
--
-- ── Why not just re-read before writing ─────────────────────────────────────
-- worktree-fix-feature-usage-clobber narrows the window by re-reading
-- immediately before the write. That helps and it is strictly better than the
-- current code, but it is still read-modify-write from the application, so the
-- race is smaller rather than gone. The column is a single JSONB value with at
-- least six writers; the only way to stop them erasing each other is to make
-- each writer touch only its own keys, inside the database, in one statement.
--
-- ── What this does ──────────────────────────────────────────────────────────
-- One SECURITY DEFINER function that sets exactly the five keys the AI usage
-- writer owns, using jsonb_set on the CURRENT row value. Every other key on the
-- column passes through untouched because they are never read into the
-- application in the first place.
--
-- It also does the increment relative to the stored value rather than a value
-- the caller carried in, so two overlapping commits produce 2, not 1.
--
-- ── How to use it after applying ────────────────────────────────────────────
-- Replace the body of commitReservation with:
--
--   const { data, error } = await supabase.rpc('increment_ai_usage', {
--     p_user_id: userId,
--     p_reset_month: newMonth,
--   })
--   if (error) { ...existing failure logging... }
--   // data.ai_queries_used is the authoritative post-increment count
--
-- and delete the `sub`, `plan` and `used` arguments it no longer needs. Note
-- that the boost-nudge email currently fires on `used + 1 === 4` computed in
-- the application; switch it to `data.ai_queries_used === 4` so it fires on the
-- real count rather than a stale one.
--
-- ── Already validated ───────────────────────────────────────────────────────
-- This exact function was applied to staging, exercised through the harness
-- with USE_ATOMIC_RPC=1 (which swaps only the write path, keeping every
-- assertion identical), and then dropped again:
--
--   current code   12/14   checks 5 and 6 FAIL
--   with this fix  14/14   check 5: stored 2 as expected
--                          check 6: plan=pro stripeSubId=sub_arrived_midflight
--
-- Note what the harness's RPC wrapper also shows: the RPC is atomic, not
-- idempotent. Calling it twice charges twice, which is right for two
-- generations and wrong for one. The `committed` flag in the gate's closure is
-- still load-bearing and must survive the swap. Check 3 covers that.
--
-- ── Verify after applying ───────────────────────────────────────────────────
--   set -a && . ~/.studyedge/env.staging && set +a
--   env -u RESEND_API_KEY node scripts/verifyAiQuotaAccounting.mjs
-- Expect 14 of 14, specifically checks 5 and 6 flipping to PASS.
--
-- ── APPLY COMMAND, and what it costs while traffic is running ───────────────
-- Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- There is no CLI step; this is a function definition, not a data migration.
--
-- BLAST RADIUS IF YOU RUN IT DURING TRAFFIC: none that stops a request.
--
--   - CREATE OR REPLACE FUNCTION takes a lock on the function, not on
--     user_data. No table is locked, no row is rewritten, nothing is scanned.
--     There is no ACCESS EXCLUSIVE lock and no rewrite, so concurrent reads and
--     writes to user_data are unaffected for the whole duration.
--
--   - Nothing calls this function until you also change commitReservation in
--     lib/server/usage.js. Applying the SQL alone is inert: it adds an unused
--     function and changes no behaviour. That is deliberate, so you can apply
--     the database half at a quiet moment and deploy the code half separately.
--
--   - The REVOKE/GRANT lines only touch this new function's ACL. They cannot
--     affect any existing grant.
--
--   - Rollback is DROP FUNCTION, equally instant, and safe as long as the code
--     half is not deployed (or has already been reverted).
--
-- THE ORDER THAT MATTERS: apply this SQL FIRST, deploy the code SECOND.
-- The reverse order breaks every AI generation for as long as the gap lasts,
-- because commitReservation would call a function that does not exist yet and
-- every commit would fail. In the correct order the worst case is an unused
-- function sitting in the schema.
--
-- If you want to be able to roll the code back without a database change,
-- have commitReservation fall back to the old inline write when the RPC returns
-- PGRST202 (function not found). Then the two halves are independent in both
-- directions.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_user_id     uuid,
  p_reset_month boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now  timestamptz := now();
  v_sub  jsonb;
  v_used int;
BEGIN
  -- Lock the row for the duration of the statement so two concurrent commits
  -- serialise instead of both reading the same value.
  SELECT subscription INTO v_sub
    FROM user_data
   WHERE user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'increment_ai_usage: no user_data row for %', p_user_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_sub := coalesce(v_sub, '{}'::jsonb);

  -- Count from the CURRENT stored value, not from whatever the caller read at
  -- reserve time. This is what makes two overlapping generations cost two.
  v_used := CASE
    WHEN p_reset_month THEN 0
    ELSE coalesce((v_sub->>'aiQueriesUsed')::int, 0)
  END;

  v_sub := jsonb_set(v_sub, '{aiQueriesUsed}', to_jsonb(v_used + 1), true);
  v_sub := jsonb_set(v_sub, '{lastAiCallAt}',  to_jsonb(v_now),      true);

  IF p_reset_month OR v_sub->>'aiQueriesResetAt' IS NULL THEN
    v_sub := jsonb_set(v_sub, '{aiQueriesResetAt}', to_jsonb(v_now), true);
  END IF;

  -- Stamped once, on the first AI action that actually produced something.
  IF v_sub->>'firstGenerationAt' IS NULL THEN
    v_sub := jsonb_set(v_sub, '{firstGenerationAt}', to_jsonb(v_now), true);
  END IF;

  -- Preserve the defaults the old code filled in on a bare row, but never
  -- overwrite a plan or status somebody else already wrote.
  IF v_sub->>'plan'   IS NULL THEN v_sub := jsonb_set(v_sub, '{plan}',   '"free"',   true); END IF;
  IF v_sub->>'status' IS NULL THEN v_sub := jsonb_set(v_sub, '{status}', '"active"', true); END IF;

  UPDATE user_data
     SET subscription = v_sub,
         updated_at   = v_now
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ai_queries_used', (v_sub->>'aiQueriesUsed')::int,
    'plan',            v_sub->>'plan',
    'status',          v_sub->>'status'
  );
END;
$$;

-- Server code only. The browser must never be able to move its own counter,
-- which is the whole point of user_data_guard_subscription_trg.
REVOKE ALL     ON FUNCTION public.increment_ai_usage(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_ai_usage(uuid, boolean) TO service_role;

COMMIT;

-- ── NOTE on the guard trigger ───────────────────────────────────────────────
-- user_data_guard_subscription_trg reverts subscription writes when
-- auth.role() <> 'service_role'. This function is SECURITY DEFINER, so it runs
-- as its owner, but auth.role() reads the request JWT and is unaffected by
-- that. Called through the service key it passes the guard as before. Called by
-- anyone else it would be reverted by the trigger anyway, and the EXECUTE grant
-- above means nobody else can call it. Two independent layers, both intact.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.increment_ai_usage(uuid, boolean);
-- (and restore the previous commitReservation body)
