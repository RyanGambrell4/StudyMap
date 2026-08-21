-- Migration: email suppression, app_config feature flags, email_queue (v2)
-- ============================================================================
-- SUPERSEDES migrations/20260727_email_suppression_and_queue.sql. Run THIS one.
-- Do not run the 27 July file. See "why v2" below.
--
-- PREPARED, NOT APPLIED to production. Verified end to end on staging
-- (bkxcroylxubcnwkpxvqk) on 2026-08-21.
--
-- Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT DO NOTHING /
-- idempotent DDL. Safe to run on top of the 27 July file if you already ran it.
--
-- ── why v2 ──────────────────────────────────────────────────────────────────
-- The 27 July migration creates three tables and never enables row-level
-- security on any of them. This project's default privileges grant anon and
-- authenticated arwdDxtm on every new table in `public`:
--
--   pg_default_acl: {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--                    authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--
-- so a table created without RLS is world-readable and world-writable to
-- anyone holding the anon key, which ships in the browser bundle.
--
-- Measured on staging with the original DDL applied
-- (scripts/probeSuppressionTableExposure.mjs), all twelve of these succeeded:
--
--   anon, no login      read email_suppression              200, rows returned
--   anon, no login      read email_queue                    200, rows returned
--   anon, no login      read app_config                     200, rows returned
--   anon, no login      DELETE from email_suppression       200, row deleted
--   anon, no login      flip app_config lifecycle_v2        200, row updated
--   anon, no login      INSERT into email_suppression       201, row created
--   (and the same six as a logged-in student)
--
-- email_queue.context carries recipient email addresses, and email_suppression
-- is by construction a list of people who bounced or complained. Shipping the
-- 27 July file as written would have replaced a suppression list that does not
-- work with a suppression list that anyone can read, empty, or poison.
--
-- v2 is the same schema with RLS enabled and no anon/authenticated policies.
-- The service role bypasses RLS, so every server path keeps working unchanged.
-- ============================================================================

BEGIN;

-- ── 1. email_suppression ─────────────────────────────────────────────────────
-- Hard block: any address in this table never receives another lifecycle email.
CREATE TABLE IF NOT EXISTS email_suppression (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text        NOT NULL,
  reason        text        NOT NULL CHECK (reason IN ('bounced', 'complained', 'manual')),
  suppressed_at timestamptz DEFAULT now(),
  UNIQUE(email)
);
CREATE INDEX IF NOT EXISTS email_suppression_email_idx ON email_suppression(email);
CREATE INDEX IF NOT EXISTS email_suppression_uid_idx   ON email_suppression(user_id) WHERE user_id IS NOT NULL;

-- ── 2. app_config ────────────────────────────────────────────────────────────
-- Single-row global feature flags. Checked at cron startup.
CREATE TABLE IF NOT EXISTS app_config (
  id            int   PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  feature_flags jsonb NOT NULL DEFAULT '{}',
  updated_at    timestamptz DEFAULT now()
);
INSERT INTO app_config (feature_flags)
VALUES ('{"lifecycle_v2": false}')
ON CONFLICT (id) DO NOTHING;

-- ── 3. email_queue ───────────────────────────────────────────────────────────
-- Behavioral trigger queue. When lifecycle_v2 is on, crons write eligibility
-- records here instead of sending. The dispatcher cron reads, deduplicates,
-- enforces the 72h cap, and sends exactly one email per user per window.
--
-- priority: lower number = higher priority.
--   1 = checkout recovery       4 = no first session (has course)
--   2 = paywall hit             5 = no course after 24h
--   3 = first session momentum  6 = dormant re-engage
--
-- Deduplication: only one PENDING entry per user per campaign (not one per
-- lifetime), so a recurring campaign can be enqueued again once the previous
-- occurrence resolves.
CREATE TABLE IF NOT EXISTS email_queue (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign      text        NOT NULL,
  priority      int         NOT NULL DEFAULT 5,
  eligible_at   timestamptz NOT NULL DEFAULT now(),
  context       jsonb       DEFAULT '{}',
  sent_at       timestamptz,
  suppressed_at timestamptz,
  skip_reason   text,
  created_at    timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_queue_pending_unique_idx
  ON email_queue(user_id, campaign)
  WHERE sent_at IS NULL AND suppressed_at IS NULL;
CREATE INDEX IF NOT EXISTS email_queue_pending_idx
  ON email_queue(eligible_at)
  WHERE sent_at IS NULL AND suppressed_at IS NULL;

-- ── 4. feature_flags column on user_data (per-user overrides) ────────────────
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS feature_flags jsonb DEFAULT '{}';

-- ── 5. Lock all three down ───────────────────────────────────────────────────
-- These are server-only tables. RLS on with zero policies means anon and
-- authenticated can do nothing; the service role bypasses RLS entirely, so
-- emailGuard, emailQueue and featureFlags keep working with no code change.
ALTER TABLE email_suppression ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config        ENABLE ROW LEVEL SECURITY;

-- Belt and braces: drop the blanket grants the default ACL handed out, so an
-- accidentally-added permissive policy later cannot open these up on its own.
REVOKE ALL ON email_suppression FROM anon, authenticated;
REVOKE ALL ON email_queue       FROM anon, authenticated;
REVOKE ALL ON app_config        FROM anon, authenticated;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- 1. Tables exist and are locked:
--      select c.relname, c.relrowsecurity,
--             (select count(*) from pg_policies p
--               where p.schemaname='public' and p.tablename=c.relname) as policies
--        from pg_class c join pg_namespace n on n.oid=c.relnamespace
--       where n.nspname='public'
--         and c.relname in ('email_suppression','email_queue','app_config');
--    Expect relrowsecurity = true and policies = 0 for all three.
--
-- 2. Nothing is reachable with the anon key:
--      node scripts/probeSuppressionTableExposure.mjs
--    Expect "No path reachable with the anon key." and exit code 0.
--
-- 3. The code can see the schema again:
--      node scripts/checkSchema.mjs
--    Expect "All required tables, columns and functions are present."

-- ── IMPORTANT: this migration suppresses nobody ─────────────────────────────
-- It creates an EMPTY email_suppression table. Every address that hard bounced
-- or filed a complaint between 27 July and today is still absent from it, and
-- lifecycle email will keep going to all of them until the list is populated.
-- Run scripts/backfillEmailSuppression.mjs immediately after this migration.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS email_queue;
-- DROP TABLE IF EXISTS email_suppression;
-- DROP TABLE IF EXISTS app_config;
-- ALTER TABLE user_data DROP COLUMN IF EXISTS feature_flags;
