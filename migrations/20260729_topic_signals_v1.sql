-- 20260729_topic_signals_v1.sql
-- Adds public.topic_signals, the row-per-event store for topic-level
-- learning signals (quiz answers, brain-dump gaps, teach-it-back grades,
-- practice-exam answers, repair-misconception events). The course brain
-- (lib/server/courseContext.js) reads these to compute per-topic mastery
-- with recency decay at prompt-assembly time. Nothing is precomputed
-- into a mastery column; the score is derived at read time.
--
-- Writers:
--   Server-side (source='server_graded'):
--     api/brain-dump-score.js       -> one row per possibleGaps[i]
--     api/teach-it-back.js          -> one row per request
--     api/repair-misconception.js   -> one row per request
--   Client-side, server-generated topics (source='client_graded_server_generated'):
--     api/record-signals.js         -> batched from quiz-burst / practice-exam
--                                       grading paths in the client. This
--                                       endpoint forces source to
--                                       'client_graded_server_generated'
--                                       regardless of what the body claims,
--                                       so the trust weighting cannot be
--                                       forged by a hostile client.
--
-- Retention: no server-side deletion in v1. courseContext queries a
-- 180-day window with LIMIT, so unbounded row growth cannot bloat a
-- prompt. Revisit if a real user hits real volume.
--
-- Every write carries the stable string course_id resolved via
-- src/lib/courseIdentity.js. Numeric array indexes are never accepted.
--
-- HOW TO RUN (manual, one time):
--   1. Open https://supabase.com/dashboard/project/vpmgamaspefwqywttdtj
--   2. SQL Editor -> New query -> paste this file -> Run.
--   3. Verify in Table Editor that public.topic_signals exists, RLS is
--      enabled, and the "owner all" policy is present.
--
-- Rollback (if needed before any writes land):
--   drop table if exists public.topic_signals;

create table if not exists public.topic_signals (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  course_id    text not null,
  course_name  text not null,
  topic        text not null,
  topic_key    text generated always as (lower(btrim(topic))) stored,
  signal_type  text not null check (signal_type in (
    'brain_dump_gap',
    'teach_it_back',
    'repair_misconception',
    'quiz_answer',
    'practice_exam_answer'
  )),
  source       text not null check (source in (
    'server_graded',
    'client_graded_server_generated'
  )),
  score        real not null check (score >= 0 and score <= 1),
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- Primary read path from lib/server/courseContext.js is:
--   select ... from topic_signals
--   where user_id = $1 and course_id = $2 and created_at > now() - interval '180 days'
--   order by created_at desc
--   limit N
create index if not exists topic_signals_user_course_recent_idx
  on public.topic_signals (user_id, course_id, created_at desc);

-- Secondary path (per-topic drill-down, trend calculation):
create index if not exists topic_signals_user_course_topic_key_idx
  on public.topic_signals (user_id, course_id, topic_key);

alter table public.topic_signals enable row level security;

create policy "owner all" on public.topic_signals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service-role writes (from server endpoints listed above) bypass RLS
-- as usual; no additional grant needed.
