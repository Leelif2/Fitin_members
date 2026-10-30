-- 홈 개편 C단계: 모임 열기 / 참여.
-- Supabase 대시보드 -> SQL Editor -> New query -> 이 파일 전체를 붙여넣고 Run.
-- "Potential issue detected" 창이 뜨면 "Run and enable RLS"를 누르세요.
-- 재실행해도 안전합니다 (idempotent). 0001 ~ 0011을 먼저 실행한 상태여야 합니다.
--
-- 규칙(정원, 같은 성별, 7일 이내)은 화면이 아니라 이 DB 함수들이 강제한다.
-- 회원은 meetups에 직접 insert만 할 수 있고, 참여/나가기/취소는 아래 함수로만 가능.

begin;

-- 1. profiles.gender (0003_signup_gender.sql에서 추가됨). 이제 가입 화면은
-- 남/여만 고를 수 있고 선택 항목이다. 예전에 'undisclosed'로 저장된 회원은
-- 데이터를 그대로 두되 "성별 미입력"으로 취급해, 같은 성별 모임에 처음
-- 참여하거나 열 때 화면에서 한 번 물어본다.
alter table public.profiles add column if not exists gender text;

-- 가입 시 자동 생성 트리거 (0004와 같은 칸). 성별은 male/female만 저장하고
-- 그 외 값은 가입이 실패하지 않도록 null로 저장한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, first_name, last_name, university, date_of_birth,
    phone, experience_level, fitness_goal, gender
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'university',
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'experience_level',
    new.raw_user_meta_data ->> 'fitness_goal',
    case when new.raw_user_meta_data ->> 'gender' in ('male', 'female')
         then new.raw_user_meta_data ->> 'gender' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 성별은 한 번 남/여로 정하면 본인이 바꿀 수 없다 (같은 성별 모임 우회 방지).
-- 비어 있거나 'undisclosed'일 때만 본인이 정할 수 있다. 바꿔야 하면 관리자가 수정.
create or replace function public.protect_profile_gender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.gender in ('male', 'female')
     and new.gender is distinct from old.gender
     and auth.uid() = old.id
     and not public.is_admin() then
    new.gender := old.gender;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_gender on public.profiles;
create trigger profiles_protect_gender
  before update on public.profiles
  for each row execute function public.protect_profile_gender();

create or replace function public.my_gender()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(gender, 'undisclosed') from public.profiles where id = auth.uid();
$$;

-- 2. meetups — 모임. host_id / host_gender / status는 트리거가 채운다.
create table if not exists public.meetups (
  id bigint generated always as identity primary key,
  host_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('meal', 'study', 'workout')),
  title text not null check (char_length(btrim(title)) between 1 and 60),
  place text not null check (char_length(btrim(place)) between 1 and 60),
  starts_at timestamptz not null,
  max_people int not null default 2 check (max_people between 2 and 10),
  lang_ko boolean not null default true,
  lang_en boolean not null default false,
  same_gender boolean not null default false,
  host_gender text check (host_gender is null or host_gender in ('male', 'female')),
  status text not null default 'open' check (status in ('open', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint meetups_lang_check check (lang_ko or lang_en)
);

create index if not exists meetups_open_starts_at_idx
  on public.meetups (starts_at) where status = 'open';

alter table public.meetups enable row level security;

-- 3. meetup_members — 누가 어느 모임에 참여했는지. 모임을 연 사람도 자동 포함.
create table if not exists public.meetup_members (
  meetup_id bigint not null references public.meetups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create index if not exists meetup_members_user_id_idx on public.meetup_members (user_id);

alter table public.meetup_members enable row level security;

-- 4. 모임 생성 규칙: 지금~7일 이내, 같은 성별 모임은 성별 필요,
-- 한 사람이 동시에 열어둘 수 있는 모임은 최대 5개.
create or replace function public.meetups_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_count int;
begin
  new.host_id := auth.uid();
  if new.host_id is null then
    raise exception 'not_signed_in';
  end if;
  if new.starts_at <= now() or new.starts_at > now() + interval '7 days' then
    raise exception 'bad_time';
  end if;

  new.host_gender := (select nullif(gender, 'undisclosed') from public.profiles where id = new.host_id);
  if new.same_gender and new.host_gender is null then
    raise exception 'gender_required';
  end if;

  select count(*) into open_count
  from public.meetups
  where host_id = new.host_id and status = 'open' and starts_at > now();
  if open_count >= 5 then
    raise exception 'too_many';
  end if;

  new.title := btrim(new.title);
  new.place := btrim(new.place);
  new.status := 'open';
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists meetups_before_insert on public.meetups;
create trigger meetups_before_insert
  before insert on public.meetups
  for each row execute function public.meetups_before_insert();

create or replace function public.meetups_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.meetup_members (meetup_id, user_id)
  values (new.id, new.host_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists meetups_after_insert on public.meetups;
create trigger meetups_after_insert
  after insert on public.meetups
  for each row execute function public.meetups_after_insert();

-- 5. RLS 정책.
-- meetups: 로그인 회원은 "열린 모임"을 볼 수 있다. 단, 같은 성별 모임은
-- 같은 성별(또는 아직 성별 미입력) 회원에게만 보인다. 본인 모임과 관리자는 전체.
drop policy if exists "meetups_select_visible" on public.meetups;
create policy "meetups_select_visible" on public.meetups
  for select to authenticated
  using (
    host_id = auth.uid()
    or public.is_admin()
    or (
      status = 'open'
      and (not same_gender or public.my_gender() is null or host_gender = public.my_gender())
    )
  );

drop policy if exists "meetups_insert_own" on public.meetups;
create policy "meetups_insert_own" on public.meetups
  for insert to authenticated
  with check (host_id = auth.uid());

-- update/delete 정책은 일부러 없음 → 취소는 cancel_meetup() 함수로만.

-- meetup_members: 본인 참여 기록과 관리자만 직접 조회. 다른 참여자는
-- list_meetups()가 이름 첫 글자로만 보여준다. insert/delete는 함수로만.
drop policy if exists "meetup_members_select_own" on public.meetup_members;
create policy "meetup_members_select_own" on public.meetup_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- 6. 홈 화면 목록. 연락처/이메일/성은 절대 내보내지 않고 이름 첫 글자만.
create or replace function public.list_meetups()
returns table (
  id bigint,
  category text,
  title text,
  place text,
  starts_at timestamptz,
  max_people int,
  lang_ko boolean,
  lang_en boolean,
  same_gender boolean,
  host_initial text,
  is_host boolean,
  joined boolean,
  member_count int,
  member_initials text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, m.category, m.title, m.place, m.starts_at, m.max_people,
    m.lang_ko, m.lang_en, m.same_gender,
    upper(left(coalesce(nullif(btrim(hp.first_name), ''), '?'), 1)),
    m.host_id = auth.uid(),
    exists (select 1 from public.meetup_members mm
            where mm.meetup_id = m.id and mm.user_id = auth.uid()),
    (select count(*)::int from public.meetup_members mm where mm.meetup_id = m.id),
    array(
      select upper(left(coalesce(nullif(btrim(p.first_name), ''), '?'), 1))
      from public.meetup_members mm
      left join public.profiles p on p.id = mm.user_id
      where mm.meetup_id = m.id
      order by mm.joined_at
      limit 5
    )
  from public.meetups m
  left join public.profiles hp on hp.id = m.host_id
  where auth.uid() is not null
    and m.status = 'open'
    and m.starts_at > now()
    and (not m.same_gender or public.my_gender() is null or m.host_gender = public.my_gender())
  order by m.starts_at
  limit 100;
$$;

-- 7. 참여. 모임 행을 잠그고(for update) 인원을 세기 때문에, 두 사람이
-- 동시에 마지막 자리를 눌러도 한 명만 들어간다.
create or replace function public.join_meetup(p_meetup_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.meetups%rowtype;
  me uuid := auth.uid();
  my_g text;
  member_total int;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;

  select * into m from public.meetups where meetups.id = p_meetup_id for update;
  if not found or m.status <> 'open' or m.starts_at <= now() then
    raise exception 'closed';
  end if;

  if exists (select 1 from public.meetup_members
             where meetup_id = m.id and user_id = me) then
    return;
  end if;

  if m.same_gender then
    select nullif(gender, 'undisclosed') into my_g from public.profiles where profiles.id = me;
    if my_g is null then
      raise exception 'gender_required';
    end if;
    if my_g is distinct from m.host_gender then
      raise exception 'gender_mismatch';
    end if;
  end if;

  select count(*) into member_total from public.meetup_members where meetup_id = m.id;
  if member_total >= m.max_people then
    raise exception 'full';
  end if;

  insert into public.meetup_members (meetup_id, user_id) values (m.id, me);
end;
$$;

-- 8. 나가기. 모임을 연 사람은 나갈 수 없고 취소해야 한다.
create or replace function public.leave_meetup(p_meetup_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  if exists (select 1 from public.meetups where meetups.id = p_meetup_id and host_id = me) then
    raise exception 'host_cannot_leave';
  end if;
  delete from public.meetup_members where meetup_id = p_meetup_id and user_id = me;
end;
$$;

-- 9. 취소. 연 사람 또는 관리자만.
create or replace function public.cancel_meetup(p_meetup_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.meetups
  set status = 'cancelled'
  where meetups.id = p_meetup_id
    and status = 'open'
    and (host_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'forbidden';
  end if;
end;
$$;

-- 10. 함수 실행 권한: 로그인 회원만. (트리거 함수는 직접 호출할 필요가 없음)
revoke execute on function public.list_meetups() from public, anon;
revoke execute on function public.join_meetup(bigint) from public, anon;
revoke execute on function public.leave_meetup(bigint) from public, anon;
revoke execute on function public.cancel_meetup(bigint) from public, anon;
revoke execute on function public.my_gender() from public, anon;
grant execute on function public.list_meetups() to authenticated;
grant execute on function public.join_meetup(bigint) to authenticated;
grant execute on function public.leave_meetup(bigint) to authenticated;
grant execute on function public.cancel_meetup(bigint) to authenticated;
grant execute on function public.my_gender() to authenticated;

commit;

-- Supabase API가 새 표와 함수를 바로 인식하도록.
notify pgrst, 'reload schema';
