-- ============================================================================
-- user_data.email_digest, as express opt-in
-- ============================================================================
-- PREPARED, NOT APPLIED. Run it yourself in Supabase -> SQL Editor.
--
-- BLAST RADIUS: adds two nullable columns to user_data (846 rows) with no
-- default backfill. ADD COLUMN with no volatile default does not rewrite the
-- table in Postgres 11+, so this is a catalog-only change and effectively
-- instant. It takes a brief ACCESS EXCLUSIVE lock; at 846 rows that is
-- microseconds. Nothing else changes and no existing value is touched.
--
-- ── Why the column is missing at all ────────────────────────────────────────
-- api/weekly-digest.js selects `email_digest` and filters `.eq(..., true)`.
-- api/weekly-recap.js selects it too. The column has never existed, so both
-- queries return 42703, both routes bind the error and return 500, and both
-- Sunday crons have therefore never sent a single email. That is the entire
-- weekly retention channel, dead since it was written.
--
-- ── The default, and why it is NULL rather than false ───────────────────────
-- A checkbox existed before the onboarding rewrite. The rewrite deleted the
-- checkbox and left `emailDigest: true` behind, so every account since has been
-- recorded as opted in without ever being shown the question. That has now been
-- set to false in the client.
--
-- This column defaults to NULL, not false, and the distinction is load bearing:
--
--   NULL   never asked. We have no consent and no refusal.
--   true   asked, and said yes. Express consent, with a timestamp below.
--   false  asked, and said no.
--
-- If it defaulted to false you could not tell "declined" from "never saw it",
-- which is the same ambiguity that let `true` sit there unnoticed. It also
-- means the 846 existing rows are honestly marked as never-asked rather than
-- silently recorded as having declined something they were never shown.
--
-- ── THE PART THAT MATTERS MORE THAN THE COLUMN ─────────────────────────────
-- weekly-recap.js line 44 is:
--
--     if (row.email_digest) { skipped++; continue }
--
-- The recap is the INVERSE of the digest. It sends to everyone who has NOT
-- opted in, gated only by "skip the completely inactive". So the two crons
-- partition the whole user base between them, and only one of the two halves
-- is opt-in.
--
-- Applying this migration as-is, with the client now defaulting to false, would
-- put all 846 accounts on the NOT-opted-in side and start sending them a weekly
-- commercial email on the first Sunday after it lands. The consent fix would
-- route everyone into the unconsented channel. That is worse than the current
-- state, where nothing sends at all.
--
-- So this migration deliberately does NOT make the crons start working. It adds
-- the column and leaves both crons dead until weekly-recap's targeting is
-- changed from "everyone who did not opt in" to "everyone who opted in and is
-- not getting the richer digest", or the recap is retired. Section 3 below is
-- the one-line code change that has to land with it. Until then
-- scripts/assertSchema.mjs will go green on this column while the crons stay
-- switched off, which is the correct order: schema first, consent second,
-- sending third.
-- ============================================================================

BEGIN;

-- NULL means never asked. See above for why that is not `false`.
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS email_digest boolean;

-- When they said yes. Kept separate so consent can be evidenced with a time,
-- not just a boolean, and so a later re-consent prompt can tell stale yeses
-- from fresh ones.
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS email_digest_consent_at timestamptz;

COMMENT ON COLUMN user_data.email_digest IS
  'Express opt-in to the weekly study digest. NULL = never asked, true = opted in, false = declined. Never default this to true.';
COMMENT ON COLUMN user_data.email_digest_consent_at IS
  'When email_digest was set to true. Null whenever email_digest is not true.';

-- Cheap partial index: the digest cron selects exactly this predicate, and the
-- opted-in set will be small relative to the table for a long time.
CREATE INDEX IF NOT EXISTS user_data_email_digest_optin_idx
  ON user_data(user_id) WHERE email_digest IS TRUE;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- select count(*)                                as total,
--        count(*) filter (where email_digest is true)  as opted_in,
--        count(*) filter (where email_digest is false) as declined,
--        count(*) filter (where email_digest is null)  as never_asked
--   from user_data;
-- Expect: total 846, opted_in 0, declined 0, never_asked 846.
--
-- Then:
--   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/assertSchema.mjs
-- user_data.email_digest should disappear from the failure list.

-- ── 2. The client half, already done ────────────────────────────────────────
-- src/components/Onboarding.jsx sends emailDigest: false and there is no
-- control. The checkbox to restore is specified in
-- docs/email-digest-consent.md, unchecked, with copy that names the sender,
-- the frequency and the content.

-- ── 3. The code change that MUST land before the crons are re-enabled ───────
-- api/weekly-recap.js line 44, currently:
--
--     if (row.email_digest) { skipped++; continue }        // sends to non-optins
--
-- must become one of:
--
--     if (row.email_digest !== true) { skipped++; continue }   // opt-in only
--
-- or the recap is deleted and the digest is the only Sunday email. Until one of
-- those happens, leave both crons out of vercel.json, or leave this migration
-- unapplied. Do not apply this and re-enable the crons in the same change.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP INDEX IF EXISTS user_data_email_digest_optin_idx;
--   ALTER TABLE user_data DROP COLUMN IF EXISTS email_digest_consent_at;
--   ALTER TABLE user_data DROP COLUMN IF EXISTS email_digest;
-- COMMIT;
