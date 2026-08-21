-- ============================================================================
-- Remove the redundant permissive policy left behind by rls-lockdown.sql
-- ============================================================================
-- PREPARED, NOT APPLIED. Run it yourself.
--
-- WHAT WAS FOUND, AND WHAT IT IS NOT
-- ----------------------------------
-- rls-lockdown.sql creates four named policies on user_data but never drops the
-- older "Users can manage their own data" (FOR ALL), which is still live.
-- Postgres combines permissive policies with OR, so the concern was that the
-- old policy might be broader and the lockdown therefore cosmetic.
--
-- It is not. The old policy is:
--
--   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
--
-- which is the SAME predicate as the four that replaced it. OR-ing identical
-- predicates yields identical access, so it grants nothing extra.
--
-- Verified empirically on staging 2026-08-21 with two signed-in students and
-- real credentials (scripts/rls-probe.mjs), not by reading this SQL:
--
--   cross-user read, 9 tables          0 rows every time
--   unscoped scan, 4 tables            only the caller's own rows
--   cross-user UPDATE                  0 rows changed
--   cross-user INSERT                  42501 insufficient_privilege
--   cross-user DELETE                  0 rows deleted
--   self-upgrade to plan 'unlimited'   blocked, plan stayed 'free'
--   cron_locks / stripe_idempotency    0 rows
--   control: own-row UPDATE            1 row, so the probe can see a success
--
-- So there is NO live cross-user access path. This file is hygiene, not a
-- security fix, and it is not urgent.
--
-- Worth being clear about where the real protection lives: the four policies do
-- not protect the `subscription` column at all. The trigger does
-- (user_data_guard_subscription, which reverts any non-service-role write to
-- that column). The self-upgrade attempt above was blocked by the trigger, not
-- by any policy.
--
-- WHY REMOVE IT THEN
-- ------------------
-- Two overlapping definitions of the same rule is how the next person concludes
-- the lockdown works because of the four policies, edits those, and does not
-- realise the FOR ALL policy is still granting the access they just removed.
-- That failure is latent today and would be live the moment someone narrows the
-- named policies.
--
-- ORDER MATTERS: keep the four in place while dropping the old one, so there is
-- no window with no policy at all.
-- ============================================================================

BEGIN;

-- Confirm the four replacements exist before removing the old one. If this
-- returns fewer than 4, STOP and do not commit.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'user_data'
    AND policyname IN ('user_data_select_own','user_data_insert_own',
                       'user_data_update_own','user_data_delete_own');
  IF n < 4 THEN
    RAISE EXCEPTION 'Only % of the 4 replacement policies exist. Refusing to drop the permissive one.', n;
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can manage their own data" ON public.user_data;

COMMIT;

-- ── Verify after running ────────────────────────────────────────────────────
-- Expect exactly the four, and nothing named "Users can manage their own data":
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename='user_data' ORDER BY policyname;
--
-- Then re-run the probe against staging to confirm nothing regressed:
--
--   node --env-file=.env.local scripts/rls-probe.mjs
--
-- ── Rollback ────────────────────────────────────────────────────────────────
-- CREATE POLICY "Users can manage their own data" ON public.user_data
--   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
