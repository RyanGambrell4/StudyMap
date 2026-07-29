-- 20260728_course_identity_v1.sql
-- Adds a nullable, stable course_id column to public.struggle_topics so
-- a row can survive a rename of the parent course. course_name is
-- retained as-is; it stays part of the primary key.
--
-- New writers (api/log-struggle.js, api/flag-struggle.js) stamp both
-- course_id and course_name. Readers in lib/server/courseContext.js
-- prefer course_id when present AND when it matches a course in the
-- current plan; otherwise they fall back to case-insensitive course_name
-- matching and count the row in orphan warnings.
--
-- No existing rows are rewritten. As of 2026-07-28 the table has zero
-- rows in production, so backfill is a no-op regardless.
--
-- Follow-up (NOT in this migration): if we later want write-time dedupe
-- across renames, we can drop the current PK and re-create a unique
-- index on (user_id, coalesce(course_id, course_name), topic). Deferred
-- until we have real data telling us it matters.
--
-- HOW TO RUN (manual, one time):
--   1. Open https://supabase.com/dashboard/project/vpmgamaspefwqywttdtj
--   2. SQL Editor -> New query -> paste this file -> Run.
--   3. Verify in Table Editor that public.struggle_topics has a
--      course_id text column and the new partial index.

alter table public.struggle_topics
  add column if not exists course_id text;

create index if not exists struggle_topics_user_course_id_idx
  on public.struggle_topics (user_id, course_id)
  where course_id is not null;

-- RLS: no change. The existing "owner all" policy covers the new column.
