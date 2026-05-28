-- 20260528_struggle_topics.sql
-- Adds the `struggle_topics` table that backs /api/flag-struggle.
-- The iOS app POSTs a (courseName, topic) pair each time the AI tutor detects
-- the student is struggling with a concept, and the personalization layer
-- reads from this table to bias future prompts and study plans.
--
-- HOW TO RUN (manual, one time):
--   1. Open the Supabase dashboard for the StudyEdge project
--      (https://supabase.com/dashboard/project/vpmgamaspefwqywttdtj)
--   2. SQL Editor -> New query -> paste the contents of this file -> Run.
--   3. Verify in Table Editor that `public.struggle_topics` exists with RLS enabled.

create table if not exists public.struggle_topics (
  user_id uuid not null references auth.users on delete cascade,
  course_name text not null,
  topic text not null,
  flagged_at timestamptz not null default now(),
  primary key (user_id, course_name, topic)
);
alter table public.struggle_topics enable row level security;
create policy "owner all" on public.struggle_topics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
