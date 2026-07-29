-- 20260729_my_semester_v1.sql
-- Adds two tables for the My Semester feature:
--
--   public.generated_artifacts
--     One row per AI-generated output (cheat sheet, practice exam, quiz
--     burst, diagram, podcast, brain dump, essay outline, mnemonic,
--     flashcard set). The payload column stores the full generation
--     response as JSONB, which is sufficient to re-render and re-grade
--     any artifact client-side without a new AI call.
--
--     Writers (server-side, fire-and-forget via lib/server/artifactWriter.js):
--       api/cheat-sheet.js               -> cheat_sheet
--       api/generate-practice-exam.js    -> practice_exam
--       api/quiz-burst.js                -> quiz_burst
--       api/generate-diagram.js          -> diagram
--       api/generate-podcast.js          -> podcast
--       api/brain-dump-score.js          -> brain_dump
--       api/essay-outline.js             -> essay_outline
--       api/generate-mnemonic.js         -> mnemonic
--       api/generate-study-tools.js      -> flashcard_set (default mode only)
--
--     Every write is wrapped so a failed insert logs a warning but never
--     blocks the student from receiving their generated artifact.
--
--     artifact_type has no check constraint: adding a new type never
--     requires a schema migration. Application code enforces the list.
--
--   public.course_grade_baselines
--     One row per (user, course). Captures the weighted grade percentage
--     at the moment a course first has any graded component, so My
--     Semester can show honest "from X" movement rather than a computed
--     delta that resets on each load.
--
--     Written by api/capture-grade-baseline.js using a service-role
--     client with INSERT ... ON CONFLICT DO NOTHING, so the row is
--     immutable after first write. The client triggers the write by
--     supplying only courseId; the server computes the grade itself from
--     user_data grade components so the student cannot supply a fake
--     starting number.
--
-- HOW TO RUN (manual, one time):
--   1. Open https://supabase.com/dashboard/project/vpmgamaspefwqywttdtj
--   2. SQL Editor -> New query -> paste this file -> Run.
--   3. Verify in Table Editor that both tables exist, RLS is enabled,
--      and the owner policies are present on each.
--
-- Rollback (if needed before any writes land):
--   drop table if exists public.generated_artifacts;
--   drop table if exists public.course_grade_baselines;

-- ── generated_artifacts ───────────────────────────────────────────────────────

create table if not exists public.generated_artifacts (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  course_id     text        not null,
  course_name   text        not null,
  artifact_type text        not null,
  title         text        not null,
  topic         text,
  payload       jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Primary read path: all artifacts for a course, newest first.
create index if not exists generated_artifacts_user_course_recent_idx
  on public.generated_artifacts (user_id, course_id, created_at desc);

-- Semester view aggregate: per-user counts and type breakdown.
create index if not exists generated_artifacts_user_type_idx
  on public.generated_artifacts (user_id, artifact_type);

alter table public.generated_artifacts enable row level security;

create policy "owner all" on public.generated_artifacts
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service-role writes from generator endpoints bypass RLS automatically.

-- ── course_grade_baselines ────────────────────────────────────────────────────

create table if not exists public.course_grade_baselines (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  course_id      text        not null,
  baseline_grade real        not null,
  captured_at    timestamptz not null default now(),
  primary key (user_id, course_id)
);

-- Primary key (user_id, course_id) covers the only lookup path.

alter table public.course_grade_baselines enable row level security;

create policy "owner all" on public.course_grade_baselines
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- api/capture-grade-baseline.js uses INSERT ... ON CONFLICT DO NOTHING
-- so the baseline row is immutable after first write.
-- Service-role writes bypass RLS automatically.
