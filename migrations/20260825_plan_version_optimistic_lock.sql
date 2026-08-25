-- ============================================================================
-- user_data.plan_version: optimistic concurrency for the plan blob
-- ============================================================================
-- PREPARED, NOT APPLIED. Run it yourself in Supabase -> SQL Editor.
--
-- BLAST RADIUS: one integer column on user_data (846 rows), DEFAULT 0 NOT NULL.
-- A non-volatile default does not rewrite the table in Postgres 11+, so this is
-- catalog-only and effectively instant, behind a momentary ACCESS EXCLUSIVE
-- lock. No existing value changes. The code ships with a fallback (see below),
-- so applying this is safe whether or not the client is deployed yet, in either
-- order.
--
-- ── The bug ─────────────────────────────────────────────────────────────────
-- savePlan does `_upsert({ plan })` with an object built from React state. It
-- is not read-modify-write against the database, so it is NOT the race that
-- commitReservation has. But it is last-write-wins across CLIENTS: two tabs
-- open, each holding its own `courses` array, and the second tab to save
-- overwrites the first tab's course with a blob that never contained it.
--
-- ── Why a version column and not per-course rows ────────────────────────────
-- Per-course rows were the other candidate. Measured against the real data:
--
--   521 rows have a plan, 334 courses total, at most 11 on one account
--   the plan column averages 391 bytes and peaks at 3434
--   plan holds EIGHT keys: assignments, completedIds, courses, learningStyle,
--                          savedAt, schedule, schoolType, yearLevel
--
-- That last line is the argument. Extracting courses to their own table fixes
-- last-write-wins for ONE of those eight. `completedIds` is written every time
-- a session is finished, more often than courses change, and it would keep
-- racing exactly as before. So per-course rows cost a table, RLS policies, a
-- foreign key, a data migration of 334 rows, and a rewrite of every course read
-- and write in the client, and buy a fix for one eighth of the problem.
--
-- A version column covers the whole blob for one integer, and the change is
-- confined to savePlan. At 391 bytes average there is no size or query-shape
-- argument for normalising: nothing server-side needs to filter courses in SQL.
--
-- The honest cost of the version column: it DETECTS conflicts, it does not
-- merge them. On a detected conflict the client re-reads and reapplies its
-- change, which is correct for the operations that actually happen here
-- (appending a course, toggling a completed id). It is one user with two tabs,
-- not two users contending, so there is no semantic ambiguity about who wins.
--
-- If you would rather have per-course rows anyway, the migration cost is: one
-- new table, one RLS policy, an INSERT ... SELECT jsonb_array_elements over
-- 521 rows to move 334 courses, and then the client work, which is the large
-- part. It is a day, not an hour, and it still leaves the other seven keys.
-- ============================================================================

BEGIN;

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS plan_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_data.plan_version IS
  'Optimistic lock for the plan column. Clients read it, send it back on write, and the write only lands if it still matches. Bumped by user_data_bump_plan_version on every change to plan.';

-- Bump on every real change to `plan`, in the database, so no writer can forget.
-- Guarded on `IS DISTINCT FROM` so a no-op write does not burn a version and
-- cause a spurious conflict for the other tab.
CREATE OR REPLACE FUNCTION public.user_data_bump_plan_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.plan_version := coalesce(NEW.plan_version, 0);
  ELSIF NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.plan_version := OLD.plan_version + 1;
  ELSE
    NEW.plan_version := OLD.plan_version;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_data_bump_plan_version_trg ON user_data;
CREATE TRIGGER user_data_bump_plan_version_trg
  BEFORE INSERT OR UPDATE ON user_data
  FOR EACH ROW
  EXECUTE FUNCTION public.user_data_bump_plan_version();

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- 1. Column and trigger exist:
--      select count(*) from information_schema.columns
--       where table_schema='public' and table_name='user_data'
--         and column_name='plan_version';                      -- expect 1
--      select tgname, tgenabled from pg_trigger
--       where tgrelid='public.user_data'::regclass and not tgisinternal;
--      -- expect user_data_bump_plan_version_trg with tgenabled = 'O',
--      -- alongside user_data_guard_subscription_trg
--
-- 2. The bump only fires on a real change. Against staging, not production:
--      node scripts/verifyPlanVersioning.mjs
--    Expect every check to PASS, including "a no-op write does not bump" and
--    "the losing tab's write is refused rather than silently applied".
--
-- 3. Existing rows are untouched:
--      select count(*), min(plan_version), max(plan_version) from user_data;
--      -- expect 846, 0, 0 immediately after applying
--
-- ── Order of operations ─────────────────────────────────────────────────────
-- Either order is safe. src/lib/db.js sends plan_version only when it has one,
-- and falls back to the current unguarded write on 42703/PGRST204, logging once,
-- so the client works before the column exists and starts guarding the moment
-- it does. That fallback is deliberate: shipping a client that hard-requires a
-- column nobody has applied yet is precisely the failure this build exists to
-- stop repeating.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP TRIGGER IF EXISTS user_data_bump_plan_version_trg ON user_data;
--   DROP FUNCTION IF EXISTS public.user_data_bump_plan_version();
--   ALTER TABLE user_data DROP COLUMN IF EXISTS plan_version;
-- COMMIT;
