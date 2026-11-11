-- IGC three-lift challenges. Run after 0023 and 0025 in Supabase SQL Editor.
begin;

create table if not exists public.lift_challenges (
  id bigint generated always as identity primary key,
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 60),
  target_kg numeric(6,1) not null check (target_kg between 30 and 1500),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '30 days')
);
create index if not exists lift_challenges_recent_idx on public.lift_challenges (starts_at desc);

create table if not exists public.lift_participants (
  challenge_id bigint not null references public.lift_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  reached_at timestamptz,
  primary key (challenge_id, user_id)
);

create table if not exists public.lift_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lift text not null check (lift in ('squat', 'bench', 'deadlift')),
  weight_kg numeric(6,1) not null check (weight_kg between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists lift_entries_user_time_idx on public.lift_entries (user_id, created_at desc);
create index if not exists lift_entries_best_idx on public.lift_entries (user_id, lift, weight_kg desc);

alter table public.lift_challenges enable row level security;
alter table public.lift_participants enable row level security;
alter table public.lift_entries enable row level security;

create policy lift_challenges_read on public.lift_challenges for select to authenticated
  using (public.is_live_member());
create policy lift_challenges_create on public.lift_challenges for insert to authenticated
  with check (public.is_live_member() and creator_id = auth.uid());
create policy lift_participants_read on public.lift_participants for select to authenticated
  using (user_id = auth.uid());
create policy lift_participants_join on public.lift_participants for insert to authenticated
  with check (public.is_live_member() and user_id = auth.uid() and exists (
    select 1 from public.lift_challenges c where c.id = challenge_id and c.ends_at > now()
  ));
create policy lift_entries_read on public.lift_entries for select to authenticated
  using (user_id = auth.uid());
create policy lift_entries_create on public.lift_entries for insert to authenticated
  with check (public.is_live_member() and user_id = auth.uid());

-- All competition timestamps come from Postgres, not the submitted row.
create or replace function public.lift_challenge_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.starts_at := now();
  new.ends_at := new.starts_at + interval '30 days';
  new.title := btrim(new.title);
  return new;
end;
$$;
create trigger lift_challenge_stamp before insert on public.lift_challenges
  for each row execute function public.lift_challenge_stamp();

create or replace function public.lift_join_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.joined_at := now();
  new.reached_at := null;
  return new;
end;
$$;
create trigger lift_join_stamp before insert on public.lift_participants
  for each row execute function public.lift_join_stamp();

create or replace function public.lift_creator_joins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lift_participants (challenge_id, user_id) values (new.id, new.creator_id);
  return null;
end;
$$;
create trigger lift_creator_joins after insert on public.lift_challenges
  for each row execute function public.lift_creator_joins();

create or replace function public.lift_entry_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  if (select count(*) from public.lift_entries
      where user_id = auth.uid() and created_at >= now() - interval '1 day') >= 30 then
    raise exception 'daily_limit';
  end if;
  return new;
end;
$$;
create trigger lift_entry_stamp before insert on public.lift_entries
  for each row execute function public.lift_entry_stamp();

-- Lock each participation before evaluating a new lift, so a goal is recorded once.
create or replace function public.lift_update_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p record;
  total numeric;
  lift_count integer;
begin
  for p in
    select lp.challenge_id, lp.joined_at, c.target_kg
    from public.lift_participants lp
    join public.lift_challenges c on c.id = lp.challenge_id
    where lp.user_id = new.user_id and lp.reached_at is null
      and c.ends_at > new.created_at
    order by lp.challenge_id
    for update of lp
  loop
    select coalesce(max(weight_kg) filter (where lift = 'squat'), 0)
         + coalesce(max(weight_kg) filter (where lift = 'bench'), 0)
         + coalesce(max(weight_kg) filter (where lift = 'deadlift'), 0),
         count(distinct lift)
    into total, lift_count
    from public.lift_entries
    where user_id = new.user_id and created_at >= p.joined_at and created_at <= new.created_at;
    if lift_count = 3 and total >= p.target_kg then
      update public.lift_participants set reached_at = new.created_at
      where challenge_id = p.challenge_id and user_id = new.user_id and reached_at is null;
    end if;
  end loop;
  return null;
end;
$$;
create trigger lift_update_progress after insert on public.lift_entries
  for each row execute function public.lift_update_progress();

-- Exact personal bests across the entire history; no row limit in the browser.
create or replace function public.lift_my_best()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'squat', coalesce(max(weight_kg) filter (where lift = 'squat'), 0),
    'bench', coalesce(max(weight_kg) filter (where lift = 'bench'), 0),
    'deadlift', coalesce(max(weight_kg) filter (where lift = 'deadlift'), 0)
  )
  from public.lift_entries where user_id = auth.uid();
$$;

-- Only approved IGC members can see public standings. Real names and emails stay private.
create or replace function public.lift_challenge_board(p_challenge bigint)
returns json language plpgsql stable security definer set search_path = '' as $$
declare result json;
begin
  if not public.is_live_member() then raise exception 'verification_required'; end if;
  select coalesce(json_agg(row_to_json(x) order by x.elapsed_seconds nulls last, x.reached_at nulls last, x.joined_at), '[]'::json)
  into result
  from (
    select lp.user_id = auth.uid() as is_me,
           coalesce(nullif(p.nickname, ''), 'IGC student') as nickname,
           lp.joined_at, lp.reached_at,
           extract(epoch from (lp.reached_at - lp.joined_at)) as elapsed_seconds,
           coalesce(max(e.weight_kg) filter (where e.lift = 'squat'), 0) as squat,
           coalesce(max(e.weight_kg) filter (where e.lift = 'bench'), 0) as bench,
           coalesce(max(e.weight_kg) filter (where e.lift = 'deadlift'), 0) as deadlift
    from public.lift_participants lp
    join public.profiles p on p.id = lp.user_id
    join public.lift_challenges c on c.id = lp.challenge_id
    left join public.lift_entries e on e.user_id = lp.user_id and e.created_at >= lp.joined_at
      and e.created_at <= least(c.ends_at, now())
    where lp.challenge_id = p_challenge
    group by lp.user_id, p.nickname, lp.joined_at, lp.reached_at
  ) x;
  return result;
end;
$$;

revoke all on function public.lift_challenge_stamp() from public, anon, authenticated;
revoke all on function public.lift_join_stamp() from public, anon, authenticated;
revoke all on function public.lift_creator_joins() from public, anon, authenticated;
revoke all on function public.lift_entry_stamp() from public, anon, authenticated;
revoke all on function public.lift_update_progress() from public, anon, authenticated;
revoke all on function public.lift_my_best() from public, anon;
revoke all on function public.lift_challenge_board(bigint) from public, anon;
grant execute on function public.lift_my_best() to authenticated;
grant execute on function public.lift_challenge_board(bigint) to authenticated;
grant select, insert on public.lift_challenges, public.lift_participants, public.lift_entries to authenticated;
commit;
notify pgrst, 'reload schema';
