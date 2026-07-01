-- 20260630_push_subscription.sql
-- Adds the `push_subscription` column to user_data.
-- Stores the Web Push PushSubscription JSON object (endpoint + keys).
-- The /api/push-subscribe endpoint writes this on browser opt-in.
-- The /api/push-notify cron reads it to deliver daily reminders.
--
-- HOW TO RUN (manual, one time):
--   1. Open the Supabase dashboard for the StudyEdge project
--      (https://supabase.com/dashboard/project/vpmgamaspefwqywttdtj)
--   2. SQL Editor → New query → paste the contents of this file → Run.
--   3. Verify in Table Editor that user_data.push_subscription exists.

alter table public.user_data
  add column if not exists push_subscription jsonb default null;
