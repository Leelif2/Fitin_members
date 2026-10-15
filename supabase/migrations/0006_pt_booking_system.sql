-- PT booking: daily 17:00-21:00 KST slots, one member per slot, and one
-- booking per member per KST calendar week. Run in Supabase SQL Editor.
begin;

create table if not exists public.pt_slots (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  trainer text not null default 'Fitin Trainer',
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id bigint generated always as identity primary key,
  slot_id bigint not null references public.pt_slots (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (slot_id)
);

alter table public.pt_slots enable row level security;
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

create unique index if not exists pt_slots_starts_at_key on public.pt_slots (starts_at);

-- Create every 17:00, 18:00, 19:00, and 20:00 KST slot for the current week
-- and the following seven weeks. Existing slots are left untouched.
insert into public.pt_slots (starts_at, ends_at, trainer)
select
  (day_value + make_interval(hours => hour_value)) at time zone 'Asia/Seoul',
  (day_value + make_interval(hours => hour_value + 1)) at time zone 'Asia/Seoul',
  'Fitin Trainer'
from (
  select (date_trunc('week', now() at time zone 'Asia/Seoul')::date + day_offset) as day_value
  from generate_series(0, 55) as day_offset
) as days
cross join (values (17), (18), (19), (20)) as hours(hour_value)
on conflict (starts_at) do nothing;

create or replace function public.slot_is_booked(p_slot_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.bookings where slot_id = p_slot_id);
$$;

grant execute on function public.slot_is_booked(bigint) to authenticated;

-- Only the evening PT slots are visible to members. `is_booked` reveals a
-- slot's availability without exposing the member who reserved it.
create or replace view public.pt_slots_public as
select
  s.id,
  s.starts_at,
  s.ends_at,
  s.trainer,
  public.slot_is_booked(s.id) as is_booked
from public.pt_slots s
where extract(hour from s.starts_at at time zone 'Asia/Seoul') between 17 and 20
order by s.starts_at;

grant select on public.pt_slots_public to authenticated;

-- Serialise attempts for the same member/week, then reject a second booking.
-- The database rule protects the limit even if two browser requests arrive
-- at almost the same time.
create or replace function public.enforce_weekly_booking_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_week date;
  target_start timestamptz;
begin
  select
    date_trunc('week', starts_at at time zone 'Asia/Seoul')::date,
    starts_at
  into target_week, target_start
  from public.pt_slots
  where id = new.slot_id;

  if target_week is null or target_start is null then
    raise exception 'The selected PT slot does not exist.' using errcode = 'P0001';
  end if;

  if target_start <= now()
    or extract(hour from target_start at time zone 'Asia/Seoul') not between 17 and 20 then
    raise exception 'The selected PT slot is not available.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || target_week::text));

  if exists (
    select 1
    from public.bookings b
    join public.pt_slots s on s.id = b.slot_id
    where b.user_id = new.user_id
      and date_trunc('week', s.starts_at at time zone 'Asia/Seoul')::date = target_week
  ) then
    raise exception 'Only one PT booking is allowed per week.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_enforce_weekly_limit on public.bookings;
create trigger bookings_enforce_weekly_limit
  before insert on public.bookings
  for each row execute function public.enforce_weekly_booking_limit();

commit;
