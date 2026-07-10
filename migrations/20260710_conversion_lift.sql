-- 20260710_conversion_lift.sql
-- Backs the conversion-lift work shipped 2026-07-10:
--   1. Enables the email throttle (emailGuard.js references last_emailed_at
--      but the column did not exist — the guard was failing open on every
--      send, so throttling never actually applied).
--   2. Tracks which new lifecycle emails have already fired per user so we
--      never double-send (day1_tips_sent, day2_progress_sent,
--      founder_cancel_sent, offer_sent).
--   3. Adds a `feedback` table for in-app "Send feedback" submissions.
--   4. Adds a `one_time_offers` table for time-limited discount coupons
--      generated when a trial is cancelled.
--
-- HOW TO RUN (manual, one time):
--   1. Open the Supabase dashboard for the StudyEdge project
--      (https://supabase.com/dashboard/project/vpmgamaspefwqywttdtj)
--   2. SQL Editor → New query → paste this file → Run.
--   3. Verify in Table Editor that `feedback` and `one_time_offers` exist
--      with RLS enabled, and that `user_data` has `last_emailed_at` +
--      `trial_email_flags` columns.

-- 1. Email throttle timestamp -------------------------------------------------
alter table public.user_data
  add column if not exists last_emailed_at timestamptz;

create index if not exists user_data_last_emailed_at_idx
  on public.user_data (last_emailed_at);

-- 2. Trial email lifecycle flags ---------------------------------------------
alter table public.user_data
  add column if not exists trial_email_flags jsonb not null default '{}'::jsonb;

-- 3. In-app feedback ---------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete set null,
  email       text,
  message     text not null,
  route       text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_user_id_idx    on public.feedback (user_id);

alter table public.feedback enable row level security;

drop policy if exists "authenticated inserts feedback" on public.feedback;
create policy "authenticated inserts feedback"
  on public.feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "owner reads feedback" on public.feedback;
create policy "owner reads feedback"
  on public.feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 4. One-time discount offers ------------------------------------------------
-- Generated when a user cancels a trial; redeemable via a Stripe promotion
-- code embedded in the cancel email. The Stripe coupon expiry is the source
-- of truth; `expires_at` here is just for display in the email copy.
create table if not exists public.one_time_offers (
  code           text primary key,
  user_id        uuid not null references auth.users on delete cascade,
  stripe_coupon  text not null,
  discount_pct   integer not null,
  reason         text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  redeemed_at    timestamptz
);

create index if not exists one_time_offers_user_id_idx on public.one_time_offers (user_id);
create index if not exists one_time_offers_expires_idx on public.one_time_offers (expires_at);

alter table public.one_time_offers enable row level security;

drop policy if exists "owner reads offers" on public.one_time_offers;
create policy "owner reads offers"
  on public.one_time_offers
  for select
  to authenticated
  using (auth.uid() = user_id);
