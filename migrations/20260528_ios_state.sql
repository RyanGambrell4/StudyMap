-- 20260528_ios_state.sql
-- Adds the `ios_state` table that backs the iOS write-through sync.
-- The iOS app upserts a JSON snapshot of AppState here every time the user
-- mutates their data. On a new install / new device, the app pulls the latest
-- snapshot to hydrate before showing the dashboard.
--
-- HOW TO RUN (manual, one time):
--   1. Open the Supabase dashboard for the StudyEdge project
--      (https://supabase.com/dashboard/project/vpmgamaspefwqywttdtj)
--   2. SQL Editor → New query → paste the contents of this file → Run.
--   3. Verify in Table Editor that `public.ios_state` exists with RLS enabled.
--
-- Conflict resolution is last-writer-wins by the server-managed `updated_at`.
-- Row Level Security guarantees a user can only read/write their own row.

create table if not exists public.ios_state (
    user_id     uuid primary key references auth.users on delete cascade,
    snapshot    jsonb not null,
    updated_at  timestamptz not null default now()
);

alter table public.ios_state enable row level security;

-- Drop-and-recreate policies so re-running the migration is safe.
drop policy if exists "owner reads ios_state"   on public.ios_state;
drop policy if exists "owner writes ios_state"  on public.ios_state;
drop policy if exists "owner updates ios_state" on public.ios_state;

create policy "owner reads ios_state"
    on public.ios_state
    for select
    using (auth.uid() = user_id);

create policy "owner writes ios_state"
    on public.ios_state
    for insert
    with check (auth.uid() = user_id);

create policy "owner updates ios_state"
    on public.ios_state
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Bump updated_at on every upsert. Without this, last-writer-wins relies on the
-- client sending the timestamp, which is fragile across clock drift.
create or replace function public.touch_ios_state_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists ios_state_set_updated_at on public.ios_state;
create trigger ios_state_set_updated_at
    before insert or update on public.ios_state
    for each row
    execute function public.touch_ios_state_updated_at();
