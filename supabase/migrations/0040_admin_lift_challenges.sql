-- Run after 0039. Admins prepare and publish challenges; first server-recorded
-- completion wins. Earlier admin-created challenges remain published.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lift_challenges' and column_name = 'published_at'
  ) then
    alter table public.lift_challenges add column published_at timestamptz;
    update public.lift_challenges c set published_at = c.starts_at
    where exists (
      select 1 from public.profiles p where p.id = c.creator_id and p.role = 'admin'
    );
  end if;
end;
$$;

-- Member-created legacy challenges require staff review before publication.
-- Their old completions cannot determine a winner after a later publication.
update public.lift_participants lp set reached_at = null
from public.lift_challenges c
where c.id = lp.challenge_id and c.published_at is null and lp.reached_at is not null;

drop policy if exists lift_challenges_read on public.lift_challenges;
create policy lift_challenges_read on public.lift_challenges for select to authenticated
  using (public.is_admin() or (published_at is not null and public.is_live_member()));

drop policy if exists lift_challenges_create on public.lift_challenges;
create policy lift_challenges_create on public.lift_challenges for insert to authenticated
  with check (public.is_admin() and creator_id = auth.uid() and published_at is null);

drop policy if exists lift_challenges_update_admin on public.lift_challenges;
create policy lift_challenges_update_admin on public.lift_challenges for update to authenticated
  using (public.is_admin() and published_at is null)
  with check (public.is_admin());

-- Drafts can be edited. Publishing stamps the start and end on the server.
-- Published targets and dates cannot be changed by a later update.
create or replace function public.lift_challenge_publish_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_admin() or old.published_at is not null then
    raise exception 'challenge_locked';
  end if;
  new.id := old.id;
  new.creator_id := old.creator_id;
  new.title := btrim(new.title);
  new.starts_at := old.starts_at;
  new.ends_at := old.ends_at;
  if new.published_at is not null then
    new.published_at := clock_timestamp();
    new.starts_at := new.published_at;
    new.ends_at := new.published_at + interval '30 days';
  end if;
  return new;
end;
$$;
drop trigger if exists lift_challenge_publish_guard on public.lift_challenges;
create trigger lift_challenge_publish_guard before update on public.lift_challenges
  for each row execute function public.lift_challenge_publish_guard();

-- Staff members are not automatically entered in the contests they create.
drop trigger if exists lift_creator_joins on public.lift_challenges;

create or replace function public.lift_challenge_has_winner(p_challenge bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lift_participants
    where challenge_id = p_challenge and reached_at is not null
  );
$$;

drop policy if exists lift_participants_join on public.lift_participants;
create policy lift_participants_join on public.lift_participants for insert to authenticated
  with check (public.is_live_member() and user_id = auth.uid() and exists (
    select 1 from public.lift_challenges c
    where c.id = challenge_id and c.published_at is not null
      and c.ends_at > now() and not public.lift_challenge_has_winner(c.id)
  ));

-- A winner is determined by the first completion timestamp, not by how long
-- each member took after joining. Drafts cannot accumulate progress.
create or replace function public.lift_update_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p record;
  total numeric;
  lift_count integer;
begin
  for p in
    select lp.challenge_id, lp.joined_at, c.published_at, c.target_kg
    from public.lift_participants lp
    join public.lift_challenges c on c.id = lp.challenge_id
    where lp.user_id = new.user_id and lp.reached_at is null
      and c.published_at is not null and c.published_at <= new.created_at
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
    where user_id = new.user_id and created_at >= greatest(p.joined_at, p.published_at)
      and created_at <= new.created_at;
    if lift_count = 3 and total >= p.target_kg then
      update public.lift_participants set reached_at = new.created_at
      where challenge_id = p.challenge_id and user_id = new.user_id and reached_at is null;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.lift_challenge_board(p_challenge bigint)
returns json language plpgsql stable security definer set search_path = '' as $$
declare result json;
begin
  if not public.is_live_member() then raise exception 'verification_required'; end if;
  if not exists (
    select 1 from public.lift_challenges
    where id = p_challenge and (published_at is not null or public.is_admin())
  ) then raise exception 'challenge_not_found'; end if;
  select coalesce(json_agg(row_to_json(x) order by x.reached_at nulls last, x.joined_at), '[]'::json)
  into result
  from (
    select lp.user_id = auth.uid() as is_me,
           coalesce(nullif(p.nickname, ''), 'IGC student') as nickname,
           lp.joined_at, lp.reached_at,
           coalesce(max(e.weight_kg) filter (where e.lift = 'squat'), 0) as squat,
           coalesce(max(e.weight_kg) filter (where e.lift = 'bench'), 0) as bench,
           coalesce(max(e.weight_kg) filter (where e.lift = 'deadlift'), 0) as deadlift
    from public.lift_participants lp
    join public.profiles p on p.id = lp.user_id
    join public.lift_challenges c on c.id = lp.challenge_id
    left join public.lift_entries e on e.user_id = lp.user_id
      and e.created_at >= greatest(lp.joined_at, c.published_at)
      and e.created_at <= least(c.ends_at, now())
    where lp.challenge_id = p_challenge
    group by lp.user_id, p.nickname, lp.joined_at, lp.reached_at
  ) x;
  return result;
end;
$$;

revoke all on function public.lift_challenge_publish_guard() from public, anon, authenticated;
revoke all on function public.lift_challenge_has_winner(bigint) from public, anon;
grant execute on function public.lift_challenge_has_winner(bigint) to authenticated;
grant update on public.lift_challenges to authenticated;
commit;
notify pgrst, 'reload schema';
