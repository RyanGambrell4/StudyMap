-- Migration: add the missing user_data.email_digest column
-- ============================================================================
-- APPLIED to production 2026-09-15.
--
-- api/weekly-recap.js selects and filters on user_data.email_digest, and
-- api/weekly-digest.js filters `.eq('email_digest', true)`, but the column was
-- never created. Both crons died on:
--
--   code 42703, "column user_data.email_digest does not exist"
--
-- src/lib/db.js also upserts it from the browser (`_upsert({ email_digest })`),
-- so the in-app weekly-digest toggle never persisted either.
--
-- Default false, deliberately: weekly-digest is the opt-in richer email and
-- weekly-recap is what everybody else gets. Defaulting true would silently
-- move every existing user onto the digest and mute their recap.
--
-- Safe to re-run.
ALTER TABLE public.user_data
  ADD COLUMN IF NOT EXISTS email_digest boolean NOT NULL DEFAULT false;

-- Verify — expect one row, data_type boolean, default false:
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='user_data'
--      and column_name='email_digest';
