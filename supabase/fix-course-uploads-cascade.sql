-- ============================================================================
-- Make course_uploads cascade on user delete, like every other user table
-- ============================================================================
-- PREPARED, NOT APPLIED. Run this yourself in Supabase -> SQL Editor.
--
-- ── What is wrong ───────────────────────────────────────────────────────────
-- Eight public tables reference auth.users(id). Seven cascade. One does not:
--
--   course_grade_baselines   CASCADE
--   generated_artifacts      CASCADE
--   ios_state                CASCADE
--   one_time_offers          CASCADE
--   struggle_topics          CASCADE
--   topic_signals            CASCADE
--   user_data                CASCADE
--   feedback                 SET NULL   (deliberate: feedback survives, anonymous)
--   course_uploads           NO ACTION  <-- blocks the delete entirely
--
-- migrations/20260726_course_uploads.sql declares the column as
-- `user_id uuid NOT NULL REFERENCES auth.users(id)` with no ON DELETE clause,
-- and Postgres defaults that to NO ACTION.
--
-- So deleting a user who has ever uploaded a syllabus fails:
--
--   23503  update or delete on table "users" violates foreign key constraint
--          "course_uploads_user_id_fkey" on table "course_uploads"
--
-- api/delete-account.js only cleaned three of the eight tables, course_uploads
-- not among them, so its auth delete returned that error, the route returned
-- 500, and the user was told to contact support. Anyone who had uploaded a
-- syllabus could not delete their account, and course_uploads.extracted_text
-- holds the full text of the document they uploaded.
--
-- Found by accident: this is the same 500 that stopped four throwaway probe
-- accounts being cleaned off staging on 2026-08-24.
--
-- Seven production accounts are in this state as of 2026-08-24, across 25 upload
-- rows dated 2 to 20 August.
--
-- ── Relationship to the code fix ────────────────────────────────────────────
-- api/delete-account.js now deletes from all eight tables, so deletion works
-- with or without this migration. This migration is still worth applying: it
-- stops the route depending on somebody remembering to extend a hardcoded list
-- the next time a table is added, which is exactly how the list fell three
-- short in the first place.
--
-- ── Safety ──────────────────────────────────────────────────────────────────
-- Dropping and recreating a foreign key does not touch data. It takes a brief
-- ACCESS EXCLUSIVE lock on course_uploads (25 rows), so it is effectively
-- instant. Nothing else changes.
-- ============================================================================

BEGIN;

ALTER TABLE public.course_uploads
  DROP CONSTRAINT IF EXISTS course_uploads_user_id_fkey;

ALTER TABLE public.course_uploads
  ADD CONSTRAINT course_uploads_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect every row below to read CASCADE except feedback, which is SET NULL:
--
-- select c.conrelid::regclass::text as child_table,
--        case c.confdeltype when 'a' then 'NO ACTION' when 'c' then 'CASCADE'
--                           when 'n' then 'SET NULL'  when 'r' then 'RESTRICT'
--                           else c.confdeltype::text end as on_delete
--   from pg_constraint c
--  where c.contype = 'f'
--    and c.confrelid = 'auth.users'::regclass
--    and c.connamespace = 'public'::regnamespace
--  order by 2, 1;
--
-- Then prove deletion end to end against staging:
--   set -a && . ~/.studyedge/env.staging && set +a
--   node scripts/verifyAccountDeletion.mjs
-- Expect every check to PASS, including "auth user is gone".

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER TABLE public.course_uploads DROP CONSTRAINT course_uploads_user_id_fkey;
-- ALTER TABLE public.course_uploads
--   ADD CONSTRAINT course_uploads_user_id_fkey
--   FOREIGN KEY (user_id) REFERENCES auth.users(id);
