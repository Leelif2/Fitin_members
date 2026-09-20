-- Fitin member accounts + PT booking schema.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- 1. profiles — app-specific info attached to each auth.users row. Columns
-- are added with ALTER ... ADD COLUMN IF NOT EXISTS so this file is safe to
-- re-run even if an earlier version (with a single full_name column) already
-- ran against this project.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists university text;
alter table public.profiles drop column if exists full_name;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- 2. pt_slots — bookable PT time slots. No insert/update policy is defined
-- on purpose: only editable via the Supabase dashboard (Table Editor or SQL
-- Editor), which runs as service_role and bypasses RLS. Add more slots there
-- as a trainer's schedule opens up.
create table if not exists public.pt_slots (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  trainer text not null default 'Fitin Trainer',
  created_at timestamptz not null default now()
);

alter table public.pt_slots enable row level security;

drop policy if exists "slots_select_all" on public.pt_slots;
create policy "slots_select_all" on public.pt_slots
  for select using (true);

-- 3. bookings — one member per slot. The unique constraint on slot_id is
-- what actually enforces "one booking per slot" against race conditions.
create table if not exists public.bookings (
  id bigint generated always as identity primary key,
  slot_id bigint not null references public.pt_slots (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (slot_id)
);

alter table public.bookings enable row level security;

drop policy if exists "bookings_select_own" on public.bookings;
create policy "bookings_select_own" on public.bookings
  for select using (auth.uid() = user_id);

drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own" on public.bookings
  for insert with check (auth.uid() = user_id);

drop policy if exists "bookings_delete_own" on public.bookings;
create policy "bookings_delete_own" on public.bookings
  for delete using (auth.uid() = user_id);

-- 4. slot_is_booked — security-definer helper so any signed-in member can
-- see whether a slot is taken without being able to read who booked it
-- (bookings stays locked to "select own" above).
create or replace function public.slot_is_booked(p_slot_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.bookings where slot_id = p_slot_id);
$$;

grant execute on function public.slot_is_booked(bigint) to authenticated;

-- 5. pt_slots_public — what the booking page actually queries: slot details
-- plus availability, no booker identity.
create or replace view public.pt_slots_public as
select
  s.id,
  s.starts_at,
  s.ends_at,
  s.trainer,
  public.slot_is_booked(s.id) as is_booked
from public.pt_slots s
order by s.starts_at;

grant select on public.pt_slots_public to authenticated;

-- 6. Seed data — four PT slots a day (10:00, 14:00, 17:00, 19:00, UTC) for
-- the next 7 days, so the calendar isn't empty on first load. Only seeds
-- when pt_slots is still empty, so re-running this file won't duplicate
-- slots; add more any time via Table Editor -> pt_slots.
insert into public.pt_slots (starts_at, ends_at, trainer)
select
  date_trunc('day', now()) + (day_offset || ' days')::interval + (hour_offset || ' hours')::interval,
  date_trunc('day', now()) + (day_offset || ' days')::interval + (hour_offset || ' hours')::interval + interval '1 hour',
  'Fitin Trainer'
from generate_series(1, 7) as day_offset
cross join (values (10), (14), (17), (19)) as h (hour_offset)
where not exists (select 1 from public.pt_slots);
