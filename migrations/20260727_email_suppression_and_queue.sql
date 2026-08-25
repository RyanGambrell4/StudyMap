-- ============================================================================
-- SUPERSEDED. DO NOT RUN THIS FILE.
-- Run migrations/20260821_email_suppression_and_queue_v2.sql instead.
--
-- This version creates all three tables without enabling row-level security.
-- This project's default privileges grant anon and authenticated full
-- arwdDxtm on every new table in public, so running this file leaves
-- email_suppression, email_queue and app_config readable and writable by
-- anyone holding the anon key, which ships in the browser bundle. Proven on
-- staging: scripts/probeSuppressionTableExposure.mjs, 12 of 12 operations
-- succeeded, including DELETE from email_suppression with no login at all.
--
-- v2 is the identical schema plus ENABLE ROW LEVEL SECURITY and REVOKE.
-- ============================================================================

-- Migration: email suppression, app_config feature flags, email_queue
-- Run in Supabase SQL Editor BEFORE deploying code changes.
-- Safe to re-run (all statements are IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ── 1. email_suppression ─────────────────────────────────────────────────────
-- Hard block: any address in this table never receives another lifecycle email.
-- Written by resend-webhook on bounce and complaint events.
CREATE TABLE IF NOT EXISTS email_suppression (
  id           uuid     DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid     REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text     NOT NULL,
  reason       text     NOT NULL CHECK (reason IN ('bounced', 'complained', 'manual')),
  suppressed_at timestamptz DEFAULT now(),
  UNIQUE(email)
);
CREATE INDEX IF NOT EXISTS email_suppression_email_idx ON email_suppression(email);
CREATE INDEX IF NOT EXISTS email_suppression_uid_idx   ON email_suppression(user_id) WHERE user_id IS NOT NULL;

-- ── 2. app_config ────────────────────────────────────────────────────────────
-- Single-row global feature flags. Checked at cron startup.
-- Flip lifecycle_v2 to true to activate the behavioral trigger engine.
CREATE TABLE IF NOT EXISTS app_config (
  id            int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
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
--   1 = checkout recovery
--   2 = paywall hit (has usage intent)
--   3 = first session momentum
--   4 = no first session (has course)
--   5 = no course after 24h
--   6 = dormant re-engage
--
-- Deduplication: only one PENDING entry per user per campaign (not one per lifetime).
-- re-engage and streak-broken are recurring — the constraint is scoped to unsent
-- rows so a new occurrence can be enqueued after the previous one resolves.
CREATE TABLE IF NOT EXISTS email_queue (
  id           uuid   DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign     text   NOT NULL,
  priority     int    NOT NULL DEFAULT 5,
  eligible_at  timestamptz NOT NULL DEFAULT now(),
  context      jsonb  DEFAULT '{}',
  sent_at      timestamptz,
  suppressed_at timestamptz,
  skip_reason  text,
  created_at   timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_queue_pending_unique_idx
  ON email_queue(user_id, campaign)
  WHERE sent_at IS NULL AND suppressed_at IS NULL;
CREATE INDEX IF NOT EXISTS email_queue_pending_idx
  ON email_queue(eligible_at)
  WHERE sent_at IS NULL AND suppressed_at IS NULL;

-- ── 4. feature_flags column on user_data (per-user overrides) ───────────────
-- Overrides the global app_config flag for a specific user.
-- e.g. {"lifecycle_v2": true} enables v2 for one user while global is off.
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS feature_flags jsonb DEFAULT '{}';
