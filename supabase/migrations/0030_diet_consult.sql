-- 0030 — 식단 상담 설문 + 스터디 모임 없애기 (2026-11-06 사용자 결정)
--   * 메인 첫 화면의 Eat 카드 → 식단 상담 설문(diet.html). 승인된 회원만 보낼 수 있다.
--     목표·식습관(하루 식사 횟수, 학식 이용, 하루 식비), 못 먹는 음식(알레르기 포함, 선택), 인스타그램 아이디(DM 연락), 남길 말
--   * 들어오면 관리자 페이지에 알림 + "식단 상담" 탭. 관리자가 연락함/완료로 바꾸면 알림이 닫힌다.
--   * 같은 회원이 답을 기다리는 중에 다시 보내면 새로 쌓지 않고 내용을 바꾼다 (알림도 1건).
--   * 스터디 모임은 더 열 수 없다 (이미 열린 스터디 모임은 끝날 때까지 그대로).
-- 0012, 0023, 0026, 0028을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run.
-- "Potential issue detected" 창이 뜨면 "Run and enable RLS". 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 식단 상담 신청
-- =====================================================================
create table if not exists public.diet_consults (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  goal text not null check (goal in ('lose', 'gain', 'muscle', 'maintain', 'health')),
  meals_per_day int not null check (meals_per_day between 1 and 6),
  cafeteria text not null check (cafeteria in ('daily', 'sometimes', 'rarely')),
  budget int check (budget is null or budget between 0 and 200000),        -- 하루 식비(원)
  avoid_foods text check (avoid_foods is null or char_length(avoid_foods) <= 200),
  health_consent boolean not null default false,                           -- 못 먹는 음식(알레르기) 적을 때 동의
  instagram text not null check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),     -- @ 없이 저장
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'new' check (status in ('new', 'contacted', 'done')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  handled_at timestamptz,
  constraint diet_consults_health_consent check (avoid_foods is null or health_consent)
);
create index if not exists diet_consults_user_idx on public.diet_consults (user_id, created_at desc);

alter table public.diet_consults enable row level security;
drop policy if exists "diet_consults_read_own" on public.diet_consults;
create policy "diet_consults_read_own" on public.diet_consults
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "diet_consults_admin_write" on public.diet_consults;
create policy "diet_consults_admin_write" on public.diet_consults
  for update using (public.is_admin()) with check (public.is_admin());
-- 회원은 아래 함수로만 보낸다 (insert·delete 정책이 없어서 직접 쓰기 불가, 수정은 관리자만)

-- 확인 안 한 식단 상담 알림은 회원당 1건 (0026의 member_user_id 사용)
create unique index if not exists admin_alerts_one_open_diet
  on public.admin_alerts (member_user_id)
  where kind = 'diet' and resolved_at is null;

-- =====================================================================
-- 2. 회원: 설문 보내기
-- =====================================================================
create or replace function public.submit_diet_consult(
  p_goal text, p_meals int, p_cafeteria text, p_budget int,
  p_avoid text, p_health_consent boolean, p_instagram text, p_message text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ig text := nullif(btrim(regexp_replace(coalesce(p_instagram, ''), '^@', '')), '');
  v_avoid text := nullif(btrim(coalesce(p_avoid, '')), '');
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_id bigint;
  v_name text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not public.is_live_member() then raise exception 'verification_required'; end if;
  if v_ig is null or v_ig !~ '^[A-Za-z0-9._]{1,30}$' then raise exception 'instagram_invalid'; end if;
  if v_avoid is not null and not coalesce(p_health_consent, false) then raise exception 'consent_required'; end if;

  perform pg_advisory_xact_lock(hashtext('diet:' || v_uid::text));
  select id into v_id from public.diet_consults where user_id = v_uid and status = 'new' order by id desc limit 1;
  if v_id is null then
    insert into public.diet_consults (user_id, goal, meals_per_day, cafeteria, budget, avoid_foods, health_consent, instagram, message)
    values (v_uid, p_goal, p_meals, p_cafeteria, p_budget, v_avoid, coalesce(p_health_consent, false) and v_avoid is not null, v_ig, v_msg)
    returning id into v_id;
  else
    update public.diet_consults
    set goal = p_goal, meals_per_day = p_meals, cafeteria = p_cafeteria, budget = p_budget,
        avoid_foods = v_avoid, health_consent = coalesce(p_health_consent, false) and v_avoid is not null,
        instagram = v_ig, message = v_msg, updated_at = now()
    where id = v_id;
  end if;

  select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), nickname, '회원') into v_name
  from public.profiles where id = v_uid;
  update public.admin_alerts
  set created_at = now(),
      message_ko = format('%s님이 식단 상담을 신청했어요 (인스타 @%s).', coalesce(v_name, '회원'), v_ig),
      message_en = format('%s asked for a diet consultation (Instagram @%s).', coalesce(v_name, 'A member'), v_ig)
  where kind = 'diet' and member_user_id = v_uid and resolved_at is null;
  if not found then
    insert into public.admin_alerts (kind, member_user_id, message_ko, message_en)
    values ('diet', v_uid,
            format('%s님이 식단 상담을 신청했어요 (인스타 @%s).', coalesce(v_name, '회원'), v_ig),
            format('%s asked for a diet consultation (Instagram @%s).', coalesce(v_name, 'A member'), v_ig));
  end if;
  return v_id;
end;
$$;

-- =====================================================================
-- 3. 관리자: 목록 / 상태 바꾸기
-- =====================================================================
create or replace function public.admin_diet_consults()
returns table (
  id bigint, user_id uuid, first_name text, last_name text, nickname text, university text,
  goal text, meals_per_day int, cafeteria text, budget int, avoid_foods text, instagram text, message text,
  status text, admin_note text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
  select d.id, d.user_id, p.first_name, p.last_name, p.nickname, p.university,
         d.goal, d.meals_per_day, d.cafeteria, d.budget, d.avoid_foods, d.instagram, d.message,
         d.status, d.admin_note, d.created_at, d.updated_at
  from public.diet_consults d
  join public.profiles p on p.id = d.user_id
  order by (d.status = 'new') desc, d.updated_at desc
  limit 300;
end;
$$;

create or replace function public.admin_update_diet_consult(p_id bigint, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('new', 'contacted', 'done') then raise exception 'invalid_status'; end if;
  update public.diet_consults
  set status = p_status,
      admin_note = nullif(btrim(coalesce(p_note, '')), ''),
      handled_at = case when p_status = 'new' then null else coalesce(handled_at, now()) end
  where id = p_id
  returning user_id into v_user;
  if v_user is null then raise exception 'not_found'; end if;
  -- 연락했거나 끝났으면 그 회원의 알림을 닫는다
  if p_status <> 'new' and not exists (select 1 from public.diet_consults where user_id = v_user and status = 'new') then
    update public.admin_alerts set resolved_at = now()
    where kind = 'diet' and member_user_id = v_user and resolved_at is null;
  end if;
end;
$$;

revoke all on function public.submit_diet_consult(text, int, text, int, text, boolean, text, text) from public, anon;
revoke all on function public.admin_diet_consults() from public, anon;
revoke all on function public.admin_update_diet_consult(bigint, text, text) from public, anon;
grant execute on function public.submit_diet_consult(text, int, text, int, text, boolean, text, text) to authenticated;
grant execute on function public.admin_diet_consults() to authenticated;
grant execute on function public.admin_update_diet_consult(bigint, text, text) to authenticated;

-- =====================================================================
-- 4. 스터디 모임은 더 열 수 없게 (0028과 같고 category 확인만 추가)
-- =====================================================================
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
  if new.category not in ('meal', 'workout') then
    raise exception 'bad_category';
  end if;
  if new.starts_at <= now() or new.starts_at >= public.meetup_window_end() then
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

commit;

notify pgrst, 'reload schema';
