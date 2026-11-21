-- 0044 — 단체운동 일정: A·B반을 없애고, 관리자가 만드는 "운동 시간대" + 회원별 고정 시간대 2개 배정
-- 2026-11-21 사용자 결정:
--   * 멤버십은 그대로 주 2회 · 4주 8회 고정
--   * 관리자만 운동 시간대(요일 하나 · 시작 시간 · 운동 시간 · 정원)를 추가·수정·닫기·삭제
--   * 관리자만 멤버마다 고정 시간대 2개를 배정 (서로 다른 요일, 시간대 정원 안에서). 회원은 고르지 않음
--   * 보강 없음 (보강 신청 막음. 예전 보강 기록은 남김)
--   * 멤버십 신청 정원은 관리자가 숫자로 정함 (site_settings.membership_capacity). 차면 대기 등록
--   * 날짜별 예외(그날만 시간 변경 / 그날 휴강), 시험 주 휴강, 매달 마지막 금요일 게더링 휴강은 유지
-- 예전 반(A·B)은 요일 하나짜리 시간대로 나눔: A → 월 19:00 + 목 19:00, B → 화 19:00 + 금 19:00. W(보강)·C는 보관(숨김).
-- 1:1 PT 예약은 열린 시간대(예외 반영)와 겹치면 막힌다.
-- Supabase → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 표 바꾸기 · 새 표
-- =====================================================================
alter table public.pt_classes add column if not exists archived boolean not null default false;
alter table public.pt_classes alter column kind set default 'regular';
alter table public.memberships alter column class_id drop not null;          -- 새 멤버십은 반 없이 신청
alter table public.class_waitlist alter column class_id drop not null;       -- 대기 등록도 멤버십 전체 기준
create unique index if not exists waitlist_one_active_general
  on public.class_waitlist (user_id) where left_at is null and class_id is null;

-- 멤버별 고정 시간대 (관리자만 배정, 한 멤버십에 최대 2개)
create table if not exists public.membership_slots (
  membership_id bigint not null references public.memberships (id) on delete cascade,
  class_id bigint not null references public.pt_classes (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (membership_id, class_id)
);
create index if not exists membership_slots_class_idx on public.membership_slots (class_id);
create index if not exists membership_slots_user_idx on public.membership_slots (user_id);

-- 날짜별 예외: 그날만 시간 변경 또는 휴강
create table if not exists public.class_session_exceptions (
  class_id bigint not null references public.pt_classes (id) on delete cascade,
  session_date date not null,
  cancelled boolean not null default false,
  new_start_time time,
  note text check (note is null or char_length(note) <= 80),
  created_at timestamptz not null default now(),
  primary key (class_id, session_date),
  check (cancelled or new_start_time is not null)
);

alter table public.membership_slots enable row level security;
alter table public.class_session_exceptions enable row level security;

-- 배정: 본인 것만 읽기, 관리자는 전체 읽기. 쓰기는 관리자 함수(admin_set_member_slots)로만.
drop policy if exists "membership_slots_read_own" on public.membership_slots;
create policy "membership_slots_read_own" on public.membership_slots for select using (auth.uid() = user_id or public.is_admin());

-- 예외: 누구나 읽기(개인정보 없음), 쓰기는 관리자만
drop policy if exists "class_exceptions_read" on public.class_session_exceptions;
create policy "class_exceptions_read" on public.class_session_exceptions for select using (true);
drop policy if exists "class_exceptions_admin_write" on public.class_session_exceptions;
create policy "class_exceptions_admin_write" on public.class_session_exceptions for all using (public.is_admin()) with check (public.is_admin());

-- "일반 반은 최대 3개" 제한은 없앰 (시간대는 관리자가 필요한 만큼 만든다)
drop trigger if exists pt_classes_limit_open on public.pt_classes;

-- =====================================================================
-- 2. 계산용 함수
-- =====================================================================

-- 지금 이용 중(입금 대기 포함)인 멤버가 그 시간대에 몇 명 배정됐는지
create or replace function public.slot_assigned_count(p_class_id bigint)
returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int
  from public.membership_slots s
  join public.memberships m on m.id = s.membership_id
  where s.class_id = p_class_id
    and m.status in ('pending', 'active')
    and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today();
$$;

-- 멤버십 신청 정원 (관리자가 정함) / 남은 자리
create or replace function public.membership_capacity()
returns int
language sql stable security definer
set search_path = public
as $$
  select greatest(coalesce((select (value #>> '{}')::int from public.site_settings where key = 'membership_capacity'), 12), 0);
$$;

create or replace function public.membership_seats_left()
returns int
language sql stable security definer
set search_path = public
as $$
  select greatest(public.membership_capacity() - (
    select count(*)::int from public.memberships m
    where m.status in ('pending', 'active')
      and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today()
  ), 0);
$$;

-- 시간대의 날짜별 운동 (예외·휴강 반영)
create or replace function public.class_sessions(p_class_id bigint, p_from date, p_to date)
returns table (session_date date, start_time time, duration_min int, is_holiday boolean, is_break_week boolean,
               is_cancelled boolean, is_changed boolean)
language sql stable
set search_path = public
as $$
  select d::date,
         coalesce(case when not coalesce(x.cancelled, false) then x.new_start_time end, c.start_time),
         c.duration_min,
         exists (select 1 from public.holiday_weeks h where h.week_start = date_trunc('week', d)::date)
           or (c.skip_last_friday and public.is_last_friday(d::date)),
         exists (select 1 from public.holiday_weeks h where h.week_start = date_trunc('week', d)::date),
         coalesce(x.cancelled, false),
         x.new_start_time is not null and not coalesce(x.cancelled, false)
  from public.pt_classes c
  cross join generate_series(p_from, p_to, interval '1 day') as d
  left join public.class_session_exceptions x on x.class_id = c.id and x.session_date = d::date
  where c.id = p_class_id and extract(isodow from d)::int = any (c.weekdays)
  order by 1;
$$;

-- 예전 함수도 예외 휴강을 반영 (호환용)
create or replace function public.class_session_dates(p_class_id bigint, p_from date, p_to date)
returns table (session_date date, is_holiday boolean)
language sql stable
set search_path = public
as $$
  select s.session_date, s.is_holiday or s.is_cancelled from public.class_sessions(p_class_id, p_from, p_to) s;
$$;

-- =====================================================================
-- 3. 시간대 규칙 (관리자가 추가·수정할 때 DB가 검사)
-- =====================================================================
create or replace function public.pt_classes_prepare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day int;
  v_assigned int;
  ko text[] := array['월', '화', '수', '목', '금', '토', '일'];
  en text[] := array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
begin
  if new.kind <> 'regular' or new.archived then return new; end if;
  if coalesce(array_length(new.weekdays, 1), 0) <> 1 or new.weekdays[1] not between 1 and 5 then
    raise exception 'one_weekday_mon_fri';
  end if;
  if new.start_time < time '06:00' or new.start_time > time '22:00' or new.duration_min not between 30 and 180 then
    raise exception 'invalid_time';
  end if;
  v_day := new.weekdays[1];
  if tg_op = 'UPDATE' then
    v_assigned := public.slot_assigned_count(new.id);
    if v_assigned > 0 and (new.weekdays <> old.weekdays or not new.is_open) then raise exception 'slot_in_use'; end if;
    if new.capacity < v_assigned then raise exception 'capacity_below_assigned'; end if;
  end if;
  new.skip_last_friday := (v_day = 5);
  new.name_ko := ko[v_day] || '요일 ' || to_char(new.start_time, 'HH24:MI');
  new.name_en := en[v_day] || ' ' || to_char(new.start_time, 'HH24:MI');
  new.code := coalesce(nullif(new.code, ''), 'S' || new.id);
  new.sort := v_day * 10000 + extract(hour from new.start_time)::int * 100 + extract(minute from new.start_time)::int;
  return new;
end;
$$;
drop trigger if exists pt_classes_prepare on public.pt_classes;
create trigger pt_classes_prepare before insert or update on public.pt_classes
  for each row execute function public.pt_classes_prepare();

-- =====================================================================
-- 4. 예전 반 정리 (한 번만 실제로 바뀜)
-- =====================================================================
do $$
declare
  v_a bigint; v_b bigint; v_thu bigint; v_fri bigint;
begin
  select id into v_a from public.pt_classes where code = 'A' and weekdays = '{1,4}';
  if v_a is not null then
    update public.pt_classes set weekdays = '{1}', is_open = true where id = v_a;
    insert into public.pt_classes (code, name_ko, name_en, kind, weekdays, start_time, duration_min, capacity, is_open)
    select 'A2', '-', '-', 'regular', '{4}', start_time, duration_min, capacity, true from public.pt_classes where id = v_a
    returning id into v_thu;
    insert into public.membership_slots (membership_id, class_id, user_id)
    select m.id, x.cid, m.user_id from public.memberships m cross join (values (v_a), (v_thu)) as x(cid)
    where m.class_id = v_a and m.status in ('pending', 'active')
    on conflict do nothing;
  end if;

  select id into v_b from public.pt_classes where code = 'B' and weekdays = '{2,5}';
  if v_b is not null then
    update public.pt_classes set weekdays = '{2}', is_open = true where id = v_b;
    insert into public.pt_classes (code, name_ko, name_en, kind, weekdays, start_time, duration_min, capacity, is_open)
    select 'B2', '-', '-', 'regular', '{5}', start_time, duration_min, capacity, true from public.pt_classes where id = v_b
    returning id into v_fri;
    insert into public.membership_slots (membership_id, class_id, user_id)
    select m.id, x.cid, m.user_id from public.memberships m cross join (values (v_b), (v_fri)) as x(cid)
    where m.class_id = v_b and m.status in ('pending', 'active')
    on conflict do nothing;
  end if;

  update public.pt_classes set is_open = false, archived = true
  where code in ('W', 'C') and not archived;
end;
$$;

insert into public.site_settings (key, value) values ('membership_capacity', '12'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
-- 5. PT 예약과 겹침 확인: 열린 시간대 + 날짜별 예외 반영 (시험 주 휴강·예외 휴강이면 PT 가능)
-- =====================================================================
create or replace function public.slot_conflicts_class(p_starts_at timestamptz, p_ends_at timestamptz)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pt_classes c
    cross join lateral public.class_sessions(c.id, (p_starts_at at time zone 'Asia/Seoul')::date,
                                             (p_starts_at at time zone 'Asia/Seoul')::date) s
    where c.is_open and c.kind = 'regular' and not c.archived
      and not s.is_break_week and not s.is_cancelled
      and (p_starts_at at time zone 'Asia/Seoul')::time < s.start_time + make_interval(mins => s.duration_min)
      and (p_ends_at at time zone 'Asia/Seoul')::time > s.start_time
  );
$$;

-- =====================================================================
-- 6. 공개 정보 · 회원 기능
-- =====================================================================
create or replace function public.membership_overview()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
        'code', p.code, 'name_ko', p.name_ko, 'name_en', p.name_en, 'weeks', p.weeks, 'price', p.price,
        'installment_count', p.installment_count, 'installment_amount', p.installment_amount) order by p.sort), '[]'::jsonb)
      from public.membership_plans p where p.is_active),
    -- 운동 시간대 (요일·시간만, 누가 배정됐는지는 없음)
    'classes', (select coalesce(jsonb_agg(jsonb_build_object(
        'code', c.code, 'name_ko', c.name_ko, 'name_en', c.name_en, 'kind', c.kind,
        'weekdays', to_jsonb(c.weekdays), 'start_time', to_char(c.start_time, 'HH24:MI'),
        'duration_min', c.duration_min, 'capacity', c.capacity, 'skip_last_friday', c.skip_last_friday) order by c.sort), '[]'::jsonb)
      from public.pt_classes c where c.is_open and c.kind = 'regular' and not c.archived),
    'membership', jsonb_build_object(
        'capacity', public.membership_capacity(),
        'seats_left', public.membership_seats_left(),
        'waitlist', (select count(*) from public.class_waitlist w where w.class_id is null and w.left_at is null)),
    'early_bird', jsonb_build_object(
        'seats', public.early_bird_seats(),
        'seats_left', public.early_bird_seats_left(),
        'discount', public.early_bird_discount(),
        'used', auth.uid() is not null and exists (
          select 1 from public.early_bird_claims e where e.user_id = auth.uid() and e.status = 'active' and e.membership_id is not null),
        'reserved', auth.uid() is not null and exists (
          select 1 from public.early_bird_claims e where e.user_id = auth.uid() and e.status = 'active' and e.membership_id is null)),
    'gender', case when coalesce((select value from public.site_settings where key = 'show_gender_ratio'), 'false'::jsonb) = 'true'::jsonb then (
        select jsonb_build_object(
          'male', count(*) filter (where p.gender = 'male'),
          'female', count(*) filter (where p.gender = 'female'),
          'total', count(*))
        from public.memberships m join public.profiles p on p.id = m.user_id
        where m.status = 'active' and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today())
      end
  );
$$;

-- 멤버십 신청: 반 선택 없음 (p_class는 예전 화면 호환용으로 받기만 함). 정원은 관리자가 정한 숫자.
create or replace function public.create_membership(p_plan text, p_class text, p_option text, p_start text)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.membership_plans;
  v_starts date;
  v_first timestamptz;
  v_id bigint;
  v_early boolean := false;
  v_claim bigint;
  v_new_claim boolean := false;
  v_price int;
  i int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'no_profile'; end if;
  select * into v_plan from public.membership_plans where code = p_plan and is_active;
  if v_plan.code is null then raise exception 'invalid_plan'; end if;
  if p_option not in ('lump', 'installment') or (p_option = 'installment' and v_plan.installment_count < 2) then
    raise exception 'invalid_option';
  end if;
  if p_start not in ('this', 'next') then raise exception 'invalid_start'; end if;
  v_starts := date_trunc('week', public.kst_today())::date + case when p_start = 'next' then 7 else 0 end;
  if p_start = 'this' then
    -- 이번 주 첫 단체운동이 이미 시작했으면 이번 주 시작 불가
    select min(public.session_starts_at(s.session_date, s.start_time)) into v_first
    from public.pt_classes c
    cross join lateral public.class_sessions(c.id, v_starts, v_starts + 6) s
    where c.is_open and c.kind = 'regular' and not c.archived and not s.is_holiday and not s.is_cancelled;
    if v_first is null or v_first <= now() then raise exception 'start_passed'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('membership:' || v_uid::text));
  if (public.current_membership(v_uid)).id is not null then raise exception 'already_member'; end if;
  perform pg_advisory_xact_lock(hashtext('membership-capacity'));
  if public.membership_seats_left() <= 0 then raise exception 'class_full'; end if;

  -- 얼리버드: 한 번에 한 건씩 (동시에 신청해도 정원을 넘지 않게)
  perform pg_advisory_xact_lock(hashtext('early_bird'));
  select id into v_claim from public.early_bird_claims
   where user_id = v_uid and status = 'active' and membership_id is null
   order by claimed_at limit 1;
  if v_claim is not null then
    v_early := true;
  elsif not exists (select 1 from public.early_bird_claims where user_id = v_uid and status = 'active')
        and public.early_bird_seats_left() > 0 then
    v_early := true;
    v_new_claim := true;
  end if;
  v_price := greatest(0, v_plan.price - case when v_early then public.early_bird_discount() else 0 end);

  insert into public.memberships (user_id, plan_code, class_id, payment_option, starts_on, weeks, early_bird)
  values (v_uid, v_plan.code, null, p_option, v_starts, v_plan.weeks, v_early)
  returning id into v_id;

  if v_claim is not null then
    update public.early_bird_claims set membership_id = v_id, plan_code = v_plan.code where id = v_claim;
  elsif v_new_claim then
    insert into public.early_bird_claims (user_id, membership_id, plan_code, source)
    values (v_uid, v_id, v_plan.code, 'web');
  end if;

  if p_option = 'lump' then
    insert into public.membership_payments (membership_id, user_id, installment_no, amount, due_on)
    values (v_id, v_uid, 1, v_price, public.kst_today());
  else
    for i in 1..v_plan.installment_count loop
      insert into public.membership_payments (membership_id, user_id, installment_no, amount, due_on)
      values (v_id, v_uid, i, v_plan.installment_amount,
              case when i = 1 then public.kst_today() else v_starts + (i - 1) * 28 end);
    end loop;
  end if;
  update public.class_waitlist set left_at = now() where user_id = v_uid and left_at is null;
  return v_id;
end;
$$;

-- 대기 등록: 멤버십 정원이 찼을 때만 (p_class는 호환용, 쓰지 않음)
create or replace function public.join_waitlist(p_class text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if (public.current_membership(v_uid)).id is not null then raise exception 'already_member'; end if;
  if public.membership_seats_left() > 0 then raise exception 'seats_available'; end if;

  insert into public.class_waitlist (class_id, user_id) values (null, v_uid)
  on conflict do nothing;

  select count(*) into v_count from public.class_waitlist where class_id is null and left_at is null;
  if v_count >= 3 and not exists (
    select 1 from public.admin_alerts where kind = 'waitlist' and class_id is null and resolved_at is null
  ) then
    insert into public.admin_alerts (kind, class_id, message_ko, message_en)
    values ('waitlist', null,
            '멤버십 대기자가 ' || v_count || '명입니다. 정원 늘리기를 검토해 주세요.',
            v_count || ' people are waiting for a membership. Consider raising the capacity.');
  end if;
end;
$$;

create or replace function public.leave_waitlist(p_class text)
returns void
language sql security definer
set search_path = public
as $$
  update public.class_waitlist set left_at = now() where user_id = auth.uid() and left_at is null;
$$;

-- 내 멤버십 요약: 배정된 시간대 기준으로 회차 계산
create or replace function public.my_membership()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.memberships;
  v_end date;
  v_total int := 0;
  v_left int := 0;
  v_next_date date;
  v_next_time time;
  v_slots jsonb;
  v_ko text;
  v_en text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  m := public.current_membership(v_uid);
  if m.id is null then
    return jsonb_build_object(
      'membership', null,
      'waitlist', (select coalesce(jsonb_agg(jsonb_build_object(
          'class_code', pc.code,
          'name_ko', coalesce(pc.name_ko, '멤버십'), 'name_en', coalesce(pc.name_en, 'Membership'),
          'position', (select count(*) from public.class_waitlist w2
                       where w2.class_id is not distinct from w.class_id and w2.left_at is null and w2.created_at <= w.created_at))), '[]'::jsonb)
        from public.class_waitlist w left join public.pt_classes pc on pc.id = w.class_id
        where w.user_id = v_uid and w.left_at is null));
  end if;

  v_end := public.membership_end_on(m.starts_on, m.weeks);

  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', c.id, 'name_ko', c.name_ko, 'name_en', c.name_en, 'weekday', c.weekdays[1],
           'start_time', to_char(c.start_time, 'HH24:MI'), 'duration_min', c.duration_min) order by c.sort), '[]'::jsonb),
         string_agg(c.name_ko, ' · ' order by c.sort),
         string_agg(c.name_en, ' · ' order by c.sort)
    into v_slots, v_ko, v_en
  from public.membership_slots s join public.pt_classes c on c.id = s.class_id
  where s.membership_id = m.id;

  select count(*), count(*) filter (where public.session_starts_at(x.session_date, x.start_time) > now())
    into v_total, v_left
  from public.membership_slots s
  cross join lateral public.class_sessions(s.class_id, m.starts_on, v_end) x
  where s.membership_id = m.id and not x.is_holiday and not x.is_cancelled;

  select x.session_date, x.start_time into v_next_date, v_next_time
  from public.membership_slots s
  cross join lateral public.class_sessions(s.class_id, m.starts_on, v_end) x
  where s.membership_id = m.id and not x.is_holiday and not x.is_cancelled
    and public.session_starts_at(x.session_date, x.start_time) > now()
  order by x.session_date, x.start_time
  limit 1;

  return jsonb_build_object(
    'membership', jsonb_build_object(
      'id', m.id, 'status', m.status, 'plan_code', m.plan_code, 'payment_option', m.payment_option,
      'plan_name_ko', (select name_ko from public.membership_plans where code = m.plan_code),
      'plan_name_en', (select name_en from public.membership_plans where code = m.plan_code),
      'slots', v_slots,
      'assigned', jsonb_array_length(v_slots) > 0,
      'class_code', null,
      'class_name_ko', coalesce(v_ko, '운동 요일 배정 대기'),
      'class_name_en', coalesce(v_en, 'Workout days pending'),
      'weekdays', (select coalesce(jsonb_agg(e -> 'weekday'), '[]'::jsonb) from jsonb_array_elements(v_slots) e),
      'start_time', to_char(v_next_time, 'HH24:MI'),
      'starts_on', m.starts_on, 'ends_on', v_end,
      'extended_weeks', (v_end - m.starts_on + 1) / 7 - m.weeks,
      'sessions_total', v_total, 'sessions_left', v_left,
      'next_session', v_next_date, 'next_start_time', to_char(v_next_time, 'HH24:MI'),
      'makeups_used', 0, 'makeups_left', 0),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
        'installment_no', p.installment_no, 'amount', p.amount, 'due_on', p.due_on, 'status', p.status, 'paid_at', p.paid_at)
        order by p.installment_no), '[]'::jsonb)
      from public.membership_payments p where p.membership_id = m.id),
    'makeups', '[]'::jsonb,
    'bank_account', (select value #>> '{}' from public.site_settings where key = 'bank_account'),
    'waitlist', '[]'::jsonb
  );
end;
$$;

-- 보강 없음: 목록은 비우고 신청은 막는다 (예전 보강 기록·취소는 그대로)
create or replace function public.makeup_options(p_days int default 14)
returns table (class_code text, class_name_ko text, class_name_en text, session_date date, start_time text, free_seats int, cycle_full boolean)
language sql stable security definer
set search_path = public
as $$
  select null::text, null::text, null::text, null::date, null::text, null::int, null::boolean where false;
$$;

create or replace function public.book_makeup(p_class text, p_date date)
returns bigint
language plpgsql security definer
set search_path = public
as $$
begin
  raise exception 'makeup_disabled';
end;
$$;

-- 내 운동 일정 (캘린더): 배정된 시간대의 날짜, 예외로 휴강한 날은 빼고 바뀐 시간은 반영
create or replace function public.my_pt_sessions(p_from date, p_to date)
returns table (session_date date, start_time text, class_code text, class_name_ko text, class_name_en text, kind text, is_holiday boolean)
language plpgsql stable security definer
set search_path = public
as $$
declare
  m public.memberships;
  v_end date;
begin
  m := public.current_membership(auth.uid());
  if m.id is null then return; end if;
  v_end := public.membership_end_on(m.starts_on, m.weeks);
  return query
    select x.session_date, to_char(x.start_time, 'HH24:MI'), c.code, '단체운동'::text, 'Group workout'::text, 'regular'::text, x.is_holiday
    from public.membership_slots s
    join public.pt_classes c on c.id = s.class_id
    cross join lateral public.class_sessions(c.id, greatest(p_from, m.starts_on), least(p_to, v_end)) x
    where s.membership_id = m.id and not x.is_cancelled
    order by 1, 2;
end;
$$;

-- =====================================================================
-- 7. 관리자 기능
-- =====================================================================

-- 배정 화면용: 지금 이용 중(입금 대기 포함)인 멤버십 + 배정된 시간대
create or replace function public.admin_assignment_list()
returns table (membership_id bigint, user_id uuid, member_name text, status text, plan_code text,
               starts_on date, ends_on date, class_ids bigint[])
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
    select m.id, m.user_id,
           coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.nickname),
           m.status, m.plan_code, m.starts_on, public.membership_end_on(m.starts_on, m.weeks),
           coalesce((select array_agg(s.class_id order by c.sort) from public.membership_slots s
                     join public.pt_classes c on c.id = s.class_id where s.membership_id = m.id), '{}'::bigint[])
    from public.memberships m
    left join public.profiles p on p.id = m.user_id
    where m.status in ('pending', 'active')
      and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today()
    order by m.starts_on, m.created_at;
end;
$$;

-- 멤버 고정 시간대 배정 (최대 2개, 서로 다른 요일, 정원 안에서). 빈 배열이면 배정 해제.
create or replace function public.admin_set_member_slots(p_membership_id bigint, p_class_ids bigint[])
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  m public.memberships;
  v_ids bigint[];
  v_before bigint[];
  v_cid bigint;
  v_class public.pt_classes;
  v_ko text;
  v_en text;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into m from public.memberships where id = p_membership_id for update;
  if m.id is null or m.status not in ('pending', 'active')
     or public.membership_end_on(m.starts_on, m.weeks) < public.kst_today() then
    raise exception 'not_found';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}') into v_ids from unnest(coalesce(p_class_ids, '{}')) x where x is not null;
  if coalesce(array_length(v_ids, 1), 0) > 2 then raise exception 'max_two_slots'; end if;
  if exists (select 1 from unnest(v_ids) x
             where not exists (select 1 from public.pt_classes c
                               where c.id = x and c.kind = 'regular' and c.is_open and not c.archived)) then
    raise exception 'invalid_class';
  end if;
  if (select count(distinct c.weekdays[1]) from public.pt_classes c where c.id = any (v_ids)) < coalesce(array_length(v_ids, 1), 0) then
    raise exception 'same_weekday';
  end if;

  select coalesce(array_agg(class_id order by class_id), '{}') into v_before
  from public.membership_slots where membership_id = m.id;

  -- 새로 들어가는 시간대만 정원 확인 (동시에 배정해도 넘지 않게 시간대마다 잠금)
  foreach v_cid in array v_ids loop
    if not (v_cid = any (v_before)) then
      perform pg_advisory_xact_lock(hashtext('slot:' || v_cid::text));
      select * into v_class from public.pt_classes where id = v_cid;
      if public.slot_assigned_count(v_cid) >= v_class.capacity then raise exception 'slot_full'; end if;
    end if;
  end loop;

  delete from public.membership_slots where membership_id = m.id and not (class_id = any (v_ids));
  insert into public.membership_slots (membership_id, class_id, user_id)
  select m.id, x, m.user_id from unnest(v_ids) x
  on conflict do nothing;

  select string_agg(c2.name_ko, ' · ' order by c2.sort), string_agg(c2.name_en, ' · ' order by c2.sort)
    into v_ko, v_en
  from public.pt_classes c2 where c2.id = any (v_ids);

  if v_before is distinct from v_ids then
    perform public.add_member_notification(m.user_id, 'schedule_assigned',
      m.id::text || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text,
      case when v_ko is null then '운동 요일 배정이 취소됐어요' when cardinality(v_before) = 0 then '운동 요일이 정해졌어요' else '운동 요일이 바뀌었어요' end,
      case when v_en is null then 'Your workout days were cleared' when cardinality(v_before) = 0 then 'Your workout days are set' else 'Your workout days changed' end,
      case when v_ko is null then '운영자가 곧 다시 배정해 드려요.' else '매주 ' || v_ko || ' (주 2회 고정)' end,
      case when v_en is null then 'The trainer will set them again soon.' else 'Every week: ' || v_en || ' (twice a week)' end,
      'mypage.html');
  end if;

  return jsonb_build_object('class_ids', to_jsonb(v_ids), 'names_ko', v_ko, 'names_en', v_en);
end;
$$;

-- 시간대 삭제: 배정된 멤버가 있으면 불가. 예전 기록(출석 등)이 있으면 삭제 대신 보관(숨김).
create or replace function public.admin_delete_slot(p_class_id bigint)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if not exists (select 1 from public.pt_classes where id = p_class_id) then raise exception 'not_found'; end if;
  if public.slot_assigned_count(p_class_id) > 0 then raise exception 'slot_in_use'; end if;
  begin
    delete from public.membership_slots where class_id = p_class_id;   -- 끝난 멤버십의 옛 배정
    delete from public.pt_classes where id = p_class_id;
    return 'deleted';
  exception when foreign_key_violation then
    update public.pt_classes set is_open = false, archived = true where id = p_class_id;
    return 'archived';
  end;
end;
$$;

-- 출석 명단: 그날 그 시간대에 배정된 이용 중 멤버
create or replace function public.admin_class_roster(p_class_id bigint, p_date date)
returns table (user_id uuid, member_name text, university text, gender text, kind text, home_class text, attendance text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
    select m.user_id,
           nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
           p.university, p.gender, 'regular'::text, null::text,
           (select a.status from public.class_attendance a
            where a.class_id = p_class_id and a.session_date = p_date and a.user_id = m.user_id)
    from public.membership_slots s
    join public.memberships m on m.id = s.membership_id
    left join public.profiles p on p.id = m.user_id
    where s.class_id = p_class_id and m.status = 'active'
      and p_date between m.starts_on and public.membership_end_on(m.starts_on, m.weeks)
    order by 2;
end;
$$;

-- 성비 통계: 반이 없어졌으므로 전체 한 줄
create or replace function public.admin_gender_stats()
returns table (class_code text, class_name_ko text, class_name_en text, male int, female int, unknown int)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
    select '*'::text, '전체'::text, 'All'::text,
           count(*) filter (where p.gender = 'male')::int,
           count(*) filter (where p.gender = 'female')::int,
           count(*) filter (where p.gender is null or p.gender not in ('male', 'female'))::int
    from public.memberships m
    left join public.profiles p on p.id = m.user_id
    where m.status = 'active' and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today();
end;
$$;

-- 회원 상세: 멤버십 줄에 배정된 운동 요일 표시 (0031과 같고 멤버십 부분만 바뀜)
create or replace function public.admin_member_detail(p_user uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out json;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_found'; end if;
  select json_build_object(
    'profile', (select json_build_object(
        'id', p.id, 'email', u.email, 'first_name', p.first_name, 'last_name', p.last_name, 'nickname', p.nickname,
        'university', p.university, 'gender', p.gender, 'student_no', p.student_no, 'verify_status', p.verify_status,
        'verified_at', p.verified_at, 'role', p.role, 'created_at', p.created_at, 'show_presence', p.show_presence,
        'last_sign_in_at', u.last_sign_in_at)
      from public.profiles p join auth.users u on u.id = p.id where p.id = p_user),
    'logins', coalesce((select json_agg(x order by x.created_at desc) from (
        select l.event_type, l.device, l.ip_address, l.created_at
        from public.login_events l where l.user_id = p_user
        order by l.created_at desc limit 30) x), '[]'::json),
    'bookings', coalesce((select json_agg(x order by x.starts_at desc) from (
        select b.id, s.starts_at, b.created_at, b.cancelled_at, b.deposit_status, b.attendance_status
        from public.bookings b join public.pt_slots s on s.id = b.slot_id
        where b.user_id = p_user
        order by s.starts_at desc limit 50) x), '[]'::json),
    'memberships', coalesce((select json_agg(x order by x.created_at desc) from (
        select ms.id, ms.plan_code, ms.status, ms.starts_on, ms.weeks, ms.created_at, ms.early_bird,
               coalesce((select string_agg(sc.name_ko, ' · ' order by sc.sort) from public.membership_slots ss
                         join public.pt_classes sc on sc.id = ss.class_id where ss.membership_id = ms.id), c.name_ko) as class_ko,
               coalesce((select string_agg(sc.name_en, ' · ' order by sc.sort) from public.membership_slots ss
                         join public.pt_classes sc on sc.id = ss.class_id where ss.membership_id = ms.id), c.name_en) as class_en,
               (select coalesce(json_agg(json_build_object('no', mp.installment_no, 'amount', mp.amount, 'status', mp.status) order by mp.installment_no), '[]'::json)
                  from public.membership_payments mp where mp.membership_id = ms.id) as payments
        from public.memberships ms left join public.pt_classes c on c.id = ms.class_id
        where ms.user_id = p_user
        order by ms.created_at desc limit 20) x), '[]'::json),
    'diet', coalesce((select json_agg(x order by x.created_at desc) from (
        select d.goal, d.instagram, d.status, d.created_at from public.diet_consults d
        where d.user_id = p_user order by d.created_at desc limit 10) x), '[]'::json),
    'timetable_uploaded_at', (select max(r.created_at) from public.routine_plans r where r.user_id = p_user),
    'notes', coalesce((select json_agg(x order by x.created_at desc) from (
        select n.id, n.body, n.created_at,
               coalesce(nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), ''), a.nickname, '관리자') as author
        from public.member_notes n left join public.profiles a on a.id = n.author_id
        where n.member_id = p_user order by n.created_at desc limit 100) x), '[]'::json)
  ) into v_out;
  return v_out;
end;
$$;

-- 날짜별 예외가 생기거나 바뀌거나 지워지면, 그날 그 시간대에 배정된 멤버에게 알림
create or replace function public.notify_session_exception()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  c public.pt_classes;
  v_date date := coalesce(new.session_date, old.session_date);
  v_cid bigint := coalesce(new.class_id, old.class_id);
  v_day_ko text;
  v_day_en text;
  v_ko text;
  v_en text;
  v_stamp text := floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
begin
  if v_date < public.kst_today() then return null; end if;
  select * into c from public.pt_classes where id = v_cid;
  if c.id is null then return null; end if;
  v_day_ko := to_char(v_date, 'FMMM/FMDD') || '(' || (array['월', '화', '수', '목', '금', '토', '일'])[extract(isodow from v_date)::int] || ')';
  v_day_en := to_char(v_date, 'Dy, Mon FMDD');
  if tg_op = 'DELETE' then
    v_ko := v_day_ko || ' 단체운동은 원래대로 ' || to_char(c.start_time, 'HH24:MI') || '에 진행돼요.';
    v_en := 'Group workout on ' || v_day_en || ' is back to ' || to_char(c.start_time, 'HH24:MI') || '.';
  elsif new.cancelled then
    v_ko := v_day_ko || ' 단체운동은 휴강이에요.' || coalesce(' 사유: ' || new.note, '');
    v_en := 'No group workout on ' || v_day_en || '.' || coalesce(' Note: ' || new.note, '');
  else
    v_ko := v_day_ko || ' 단체운동 시간이 ' || to_char(new.new_start_time, 'HH24:MI') || '(으)로 바뀌었어요.' || coalesce(' ' || new.note, '');
    v_en := 'Group workout on ' || v_day_en || ' moves to ' || to_char(new.new_start_time, 'HH24:MI') || '.' || coalesce(' ' || new.note, '');
  end if;
  for r in
    select distinct m.user_id
    from public.membership_slots s join public.memberships m on m.id = s.membership_id
    where s.class_id = v_cid and m.status in ('pending', 'active')
      and v_date between m.starts_on and public.membership_end_on(m.starts_on, m.weeks)
  loop
    perform public.add_member_notification(r.user_id, 'schedule_changed',
      v_cid::text || ':' || v_date::text || ':' || v_stamp || ':' || left(r.user_id::text, 8),
      '단체운동 일정이 바뀌었어요', 'Your group workout schedule changed', v_ko, v_en, 'calendar.html');
  end loop;
  return null;
end;
$$;
drop trigger if exists class_session_exceptions_notify on public.class_session_exceptions;
create trigger class_session_exceptions_notify after insert or update or delete on public.class_session_exceptions
  for each row execute function public.notify_session_exception();

-- =====================================================================
-- 8. 함수 실행 권한
-- =====================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_assignment_list()', 'public.admin_set_member_slots(bigint, bigint[])', 'public.admin_delete_slot(bigint)',
    'public.admin_class_roster(bigint, date)', 'public.admin_gender_stats()', 'public.admin_member_detail(uuid)',
    'public.create_membership(text, text, text, text)', 'public.join_waitlist(text)', 'public.leave_waitlist(text)',
    'public.my_membership()', 'public.makeup_options(int)', 'public.book_makeup(text, date)', 'public.my_pt_sessions(date, date)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

revoke all on function public.slot_assigned_count(bigint) from public, anon, authenticated;
revoke all on function public.membership_capacity() from public, anon, authenticated;
revoke all on function public.membership_seats_left() from public, anon, authenticated;
revoke all on function public.pt_classes_prepare() from public, anon, authenticated;
revoke all on function public.notify_session_exception() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
