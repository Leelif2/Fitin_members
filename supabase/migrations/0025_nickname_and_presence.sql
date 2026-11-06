-- 0025 — 닉네임 + 실시간 접속 표시 (2026-11-04)
-- 목적: 메인 "실시간 모임"의 예시 숫자를 실제 접속자로 바꾼다.
--   * 회원마다 닉네임(2~12자, 한글·영문·숫자·_, 대소문자 무시 중복 불가). 실명 대신 닉네임만 보인다.
--   * 접속 표시는 DB가 직접 센다 (live_presence: 승인 계정 1개 = 1행) → 숫자를 조작해 부풀릴 수 없다.
--     - 방문자: 접속자 수만 (live_online_count)
--     - 승인 회원: 수 + 누가 어떤 탭(밥·스터디·운동)을 보고 있는지 (live_snapshot, 닉네임만)
--     - 바뀌면 비공개 실시간 채널 'fitin-live'로 "바뀌었어요" 신호만 보낸다 (내용 없음)
--   * "접속 중 표시"를 끄면 수에는 들어가지만 닉네임은 다른 회원에게 보이지 않는다.
-- 0023을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run.
-- "Potential issue detected" 창이 뜨면 "Run and enable RLS". 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 닉네임 칸
-- =====================================================================
alter table public.profiles add column if not exists nickname text;
alter table public.profiles add column if not exists show_presence boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_nickname_format') then
    alter table public.profiles add constraint profiles_nickname_format
      check (nickname is null or nickname ~ '^[0-9A-Za-z_가-힣]{2,12}$');
  end if;
end;
$$;

create unique index if not exists profiles_nickname_unique
  on public.profiles (lower(nickname))
  where nickname is not null;

-- 닉네임 정리: 앞뒤 공백 제거. 형식이 틀리면 null
create or replace function public.clean_nickname(raw text)
returns text
language sql
immutable
as $$
  select case when btrim(coalesce(raw, '')) ~ '^[0-9A-Za-z_가-힣]{2,12}$' then btrim(raw) end;
$$;

-- =====================================================================
-- 2. 가입 시 프로필 자동 생성 (0023과 같고 닉네임만 추가)
--    닉네임이 이미 쓰이고 있으면 비워 두고 가입은 그대로 진행 (메인에서 다시 정하게 한다)
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := public.clean_nickname(new.raw_user_meta_data ->> 'nickname');
begin
  if v_nick is not null and exists (select 1 from public.profiles where lower(nickname) = lower(v_nick)) then
    v_nick := null;
  end if;
  insert into public.profiles (
    id, first_name, last_name, university, date_of_birth,
    phone, experience_level, fitness_goal, gender, student_no, nickname
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
         then new.raw_user_meta_data ->> 'gender' end,
    public.normalize_student_no(new.raw_user_meta_data ->> 'student_no'),
    v_nick
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =====================================================================
-- 3. 함수
-- =====================================================================
-- 실시간 채널에 들어갈 수 있는 사람: 학생증 승인된 회원 또는 관리자
create or replace function public.is_live_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.verify_status = 'approved' or p.role = 'admin')
  );
$$;

-- 가입 화면에서 닉네임을 미리 확인 (쓸 수 있으면 true)
create or replace function public.nickname_available(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.clean_nickname(p_nickname) is not null
     and not exists (
       select 1 from public.profiles
       where lower(nickname) = lower(public.clean_nickname(p_nickname))
         and id is distinct from auth.uid()
     );
$$;

-- 내 닉네임 + 접속 중 표시
create or replace function public.my_live_profile()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('nickname', p.nickname, 'show_presence', p.show_presence)
  from public.profiles p
  where p.id = auth.uid();
$$;

-- 내 닉네임 / 접속 중 표시 바꾸기. p_nickname이 null이면 닉네임은 그대로 둔다.
create or replace function public.set_my_live_profile(p_nickname text default null, p_show boolean default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nick text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_nickname is not null then
    v_nick := public.clean_nickname(p_nickname);
    if v_nick is null then raise exception 'nickname_invalid'; end if;
    if exists (select 1 from public.profiles where lower(nickname) = lower(v_nick) and id <> v_uid) then
      raise exception 'nickname_taken';
    end if;
  end if;
  begin
    update public.profiles
    set nickname = coalesce(v_nick, nickname),
        show_presence = coalesce(p_show, show_presence)
    where id = v_uid;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;
  return public.my_live_profile();
end;
$$;

-- =====================================================================
-- 4. 접속 표시 — DB가 직접 센다 (조작 방지)
--    승인 회원 계정 1개 = 행 1개(user_id가 기본키, 본인만 함수로 갱신).
--    화면은 25초마다 "나 아직 보고 있어요"(live_ping)를 보내고, 70초 넘게 소식이 없으면 접속 끝으로 본다.
--    숫자·목록은 이 표에서만 계산하므로, 실제 승인 계정을 여러 개 만들지 않는 한 부풀릴 수 없다.
--    누구도 이 표를 직접 읽거나 쓰지 못한다 (RLS 켜고 정책 없음, 아래 함수로만).
-- =====================================================================
create table if not exists public.live_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  view text not null default 'all' check (view in ('all', 'meal', 'study', 'workout')),
  last_seen timestamptz not null default now()
);
alter table public.live_presence enable row level security;
revoke all on public.live_presence from anon, authenticated;

-- 접속자가 바뀌었다고 회원 화면에 알리기 (내용 없는 신호만 — 누가인지는 보내지 않음)
create or replace function public.live_notify()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(jsonb_build_object(), 'changed', 'fitin-live', true);
exception when others then
  null; -- 실시간 기능이 없어도 접속 기록은 계속 (화면이 30초마다 다시 읽음)
end;
$$;

-- 나 아직 보고 있어요 (+ 지금 보고 있는 탭)
create or replace function public.live_ping(p_view text default 'all')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_view text := case when p_view in ('all', 'meal', 'study', 'workout') then p_view else 'all' end;
  v_old public.live_presence;
  v_found boolean;
begin
  if v_uid is null or not public.is_live_member() then raise exception 'verification_required'; end if;
  select * into v_old from public.live_presence where user_id = v_uid for update;
  v_found := found;
  -- 10초 안에 같은 내용으로 또 오면 아무것도 하지 않는다 (DB 쓰기 폭주 방지)
  if v_found and v_old.view = v_view and v_old.last_seen > now() - interval '10 seconds' then
    return;
  end if;
  insert into public.live_presence (user_id, view, last_seen) values (v_uid, v_view, now())
  on conflict (user_id) do update set view = excluded.view, last_seen = excluded.last_seen;
  -- 새로 들어왔거나, 끊겼다 돌아왔거나, 탭을 바꿨을 때만 알린다
  if not v_found or v_old.view <> v_view or v_old.last_seen < now() - interval '70 seconds' then
    perform public.live_notify();
  end if;
end;
$$;

-- 나가요 (페이지를 닫거나 로그아웃할 때)
create or replace function public.live_leave()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.live_presence set last_seen = now() - interval '1 day'
  where user_id = auth.uid() and last_seen > now() - interval '70 seconds';
  if found then perform public.live_notify(); end if;
end;
$$;

-- 누구나: 지금 접속 중인 회원 수 (숫자만)
create or replace function public.live_online_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.live_presence l
  join public.profiles p on p.id = l.user_id
  where l.last_seen > now() - interval '70 seconds'
    and (p.verify_status = 'approved' or p.role = 'admin');
$$;

-- 승인 회원: 접속자 수 + 탭별 수 + 닉네임 목록 (회원 id·실명은 내보내지 않음, 숨긴 사람은 수만)
create or replace function public.live_snapshot()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out json;
begin
  if not public.is_live_member() then raise exception 'verification_required'; end if;
  with online as (
    select l.user_id, l.view, l.last_seen, p.nickname, p.show_presence
    from public.live_presence l
    join public.profiles p on p.id = l.user_id
    where l.last_seen > now() - interval '70 seconds'
      and (p.verify_status = 'approved' or p.role = 'admin')
  )
  select json_build_object(
    'total', (select count(*) from online),
    'views', json_build_object(
      'all', (select count(*) from online where view = 'all'),
      'meal', (select count(*) from online where view = 'meal'),
      'study', (select count(*) from online where view = 'study'),
      'workout', (select count(*) from online where view = 'workout')),
    'hidden', (select count(*) from online where not (show_presence and nickname is not null)),
    'people', coalesce((
      select json_agg(json_build_object('nickname', x.nickname, 'view', x.view, 'me', x.user_id = auth.uid())
                      order by x.user_id = auth.uid() desc, x.last_seen desc)
      from (select * from online where show_presence and nickname is not null
            order by user_id = auth.uid() desc, last_seen desc limit 200) x
    ), '[]'::json)
  ) into v_out;
  return v_out;
end;
$$;

-- 이전 방식(브라우저끼리 주고받는 Presence) 정리 — 예전 0025를 실행했어도 다시 실행하면 정리된다
drop function if exists public.live_nicknames(uuid[]);

-- 실시간 신호 채널 'fitin-live': 승인 회원만 받기. 회원은 보낼 수 없다 (보내는 건 DB만)
do $$
begin
  if to_regclass('realtime.messages') is not null then
    -- realtime.messages는 Supabase가 RLS를 켜 둔 표라 따로 켤 필요 없음 (켜려고 하면 "must be owner" 오류)
    execute 'drop policy if exists "fitin_live_track" on realtime.messages';
    execute 'drop policy if exists "fitin_live_read" on realtime.messages';
    execute $p$
      create policy "fitin_live_read" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() = 'fitin-live'
          and realtime.messages.extension in ('broadcast')
          and public.is_live_member()
        )
    $p$;
  end if;
end;
$$;

-- =====================================================================
-- 5. 함수 권한
-- =====================================================================
revoke all on function public.is_live_member() from public, anon;
revoke all on function public.my_live_profile() from public, anon;
revoke all on function public.set_my_live_profile(text, boolean) from public, anon;
revoke all on function public.live_notify() from public, anon, authenticated;
revoke all on function public.live_ping(text) from public, anon;
revoke all on function public.live_leave() from public, anon;
revoke all on function public.live_snapshot() from public, anon;
grant execute on function public.is_live_member() to authenticated;
grant execute on function public.my_live_profile() to authenticated;
grant execute on function public.set_my_live_profile(text, boolean) to authenticated;
grant execute on function public.live_ping(text) to authenticated;
grant execute on function public.live_leave() to authenticated;
grant execute on function public.live_snapshot() to authenticated;
grant execute on function public.live_online_count() to anon, authenticated;
grant execute on function public.nickname_available(text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
