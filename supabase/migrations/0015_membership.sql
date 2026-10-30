-- 0015 — FitinConnection 멤버십 (그룹 PT 반 + 보강 + 게더링·등산·이벤트 + 제휴 장소)
-- 2026-10-30 사용자 결정:
--   * 1개월권 80,000원 = 4주 · 주 2회 = 8회 / 3개월권 189,000원 = 12주 (일시불 또는 63,000원 × 3회)
--   * 결제: 계좌이체 → 관리자가 회차별로 입금 확인 (1회차가 확인되면 멤버십 시작)
--   * 반: A(월·목 19:00) B(화·금 19:00) 수요일 19:00 보강 전용, C(월·목 20:30, 기본 닫힘). 일반 반은 최대 3개만 열림
--   * 보강: 다른 반 또는 수요일 보강 시간 빈자리, 4주마다 2회, 이월 없음
--   * 반이 꽉 차면 대기 등록, 같은 반 대기 3명 이상이면 관리자 알림 (관리자 화면 표시)
--   * 휴강 주: 관리자가 지정, 그 주만큼 멤버십 자동 연장
--   * 게더링 정원 7명·선착순·회원 1인 한 달(달력 기준) 1회 / 등산·이벤트는 관리자가 생성
--   * 회원 성비는 실제 가입 데이터로 계산, 관리자가 공개 여부 선택
-- 기존 1:1 PT 예약(pt_slots/bookings)과 학생 모임(meetups)은 그대로 둔다.
-- Supabase → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 표
-- =====================================================================

-- 요금제
create table if not exists public.membership_plans (
  code text primary key,                       -- '1m' | '3m'
  name_ko text not null,
  name_en text not null,
  weeks int not null check (weeks > 0),        -- 4주 = 1개월
  price int not null check (price > 0),        -- 일시불 금액
  installment_count int not null default 1 check (installment_count between 1 and 12),
  installment_amount int,                      -- 분할 1회 금액 (분할 불가면 null)
  is_active boolean not null default true,
  sort int not null default 0
);

-- 반 (일반 반 + 보강 전용 시간)
create table if not exists public.pt_classes (
  id bigint generated always as identity primary key,
  code text not null unique,                   -- 'A' | 'B' | 'C' | 'W'
  name_ko text not null,
  name_en text not null,
  kind text not null check (kind in ('regular', 'makeup')),
  weekdays int[] not null,                     -- ISO 요일 (1=월 … 7=일)
  start_time time not null,
  duration_min int not null default 60,
  capacity int not null default 6 check (capacity between 1 and 30),
  is_open boolean not null default true,
  sort int not null default 0
);

-- 휴강 주 (그 주 월요일)
create table if not exists public.holiday_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  note text,
  created_at timestamptz not null default now()
);

-- 멤버십 (한 사람이 동시에 하나)
create table if not exists public.memberships (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null references public.membership_plans (code),
  class_id bigint not null references public.pt_classes (id),
  payment_option text not null check (payment_option in ('lump', 'installment')),
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'cancelled')),
  starts_on date not null check (extract(isodow from starts_on) = 1),
  weeks int not null check (weeks > 0),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists memberships_user_idx on public.memberships (user_id, created_at desc);
create index if not exists memberships_class_idx on public.memberships (class_id) where status in ('pending', 'active');

-- 결제 (분할이면 회차마다 한 줄)
create table if not exists public.membership_payments (
  id bigint generated always as identity primary key,
  membership_id bigint not null references public.memberships (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  installment_no int not null check (installment_no >= 1),
  amount int not null check (amount > 0),
  due_on date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'cancelled')),
  paid_at timestamptz,
  memo text,
  unique (membership_id, installment_no)
);
create index if not exists membership_payments_status_idx on public.membership_payments (status, due_on);

-- 출석 (관리자가 체크)
create table if not exists public.class_attendance (
  id bigint generated always as identity primary key,
  class_id bigint not null references public.pt_classes (id),
  session_date date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('attended', 'absent')),
  checked_at timestamptz not null default now(),
  unique (class_id, session_date, user_id)
);

-- 보강 신청
create table if not exists public.makeup_bookings (
  id bigint generated always as identity primary key,
  membership_id bigint not null references public.memberships (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  class_id bigint not null references public.pt_classes (id),
  session_date date not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create unique index if not exists makeup_one_active_per_session
  on public.makeup_bookings (user_id, class_id, session_date) where cancelled_at is null;
create index if not exists makeup_session_idx on public.makeup_bookings (class_id, session_date) where cancelled_at is null;

-- 반 대기자
create table if not exists public.class_waitlist (
  id bigint generated always as identity primary key,
  class_id bigint not null references public.pt_classes (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  left_at timestamptz
);
create unique index if not exists waitlist_one_active
  on public.class_waitlist (class_id, user_id) where left_at is null;

-- 관리자 알림 (관리자 화면에 표시)
create table if not exists public.admin_alerts (
  id bigint generated always as identity primary key,
  kind text not null,                          -- 'waitlist' 등
  class_id bigint references public.pt_classes (id),
  message_ko text not null,
  message_en text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- 제휴 장소
create table if not exists public.partner_places (
  id bigint generated always as identity primary key,
  name text not null,
  category text not null default 'cafe' check (category in ('cafe', 'restaurant', 'other')),
  address text,
  map_url text,
  photo_url text,
  description_ko text,
  description_en text,
  is_visible boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- 게더링 · 등산 · 이벤트
create table if not exists public.crew_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('gathering', 'hiking', 'event')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text,
  starts_at timestamptz not null,
  place text,
  partner_place_id bigint references public.partner_places (id) on delete set null,
  capacity int not null check (capacity between 1 and 200),
  extra_cost boolean not null default false,   -- 교통비 등 실비 별도 여부
  cost_note text,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists crew_events_starts_idx on public.crew_events (starts_at);

create table if not exists public.event_registrations (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.crew_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create unique index if not exists event_reg_one_active
  on public.event_registrations (event_id, user_id) where cancelled_at is null;

-- 이벤트 지출 (예산 = 그달 회비 입금액의 20%)
create table if not exists public.event_expenses (
  id bigint generated always as identity primary key,
  event_id bigint references public.crew_events (id) on delete set null,
  spent_on date not null,
  amount int not null check (amount >= 0),
  memo text,
  created_at timestamptz not null default now()
);

-- 사이트 설정
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null
);

-- =====================================================================
-- 2. 기본 데이터 (이미 있으면 건드리지 않음)
-- =====================================================================
insert into public.membership_plans (code, name_ko, name_en, weeks, price, installment_count, installment_amount, sort) values
  ('1m', '1개월권', '1-month', 4, 80000, 1, null, 1),
  ('3m', '3개월권', '3-month', 12, 189000, 3, 63000, 2)
on conflict (code) do nothing;

insert into public.pt_classes (code, name_ko, name_en, kind, weekdays, start_time, capacity, is_open, sort) values
  ('A', 'A반', 'Class A', 'regular', '{1,4}', '19:00', 6, true, 1),
  ('B', 'B반', 'Class B', 'regular', '{2,5}', '19:00', 6, true, 2),
  ('W', '수요일 보강', 'Wednesday make-up', 'makeup', '{3}', '19:00', 6, true, 3),
  ('C', 'C반', 'Class C', 'regular', '{1,4}', '20:30', 6, false, 4)
on conflict (code) do nothing;

insert into public.site_settings (key, value) values
  ('show_gender_ratio', 'false'::jsonb),
  ('bank_account', '"Toss 1002-3847-1558"'::jsonb),
  ('makeups_per_cycle', '2'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
-- 3. 계산용 함수
-- =====================================================================

create or replace function public.kst_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- 수업 시작 시각 (한국 시간)
create or replace function public.session_starts_at(p_date date, p_time time)
returns timestamptz language sql immutable as $$
  select (p_date + p_time) at time zone 'Asia/Seoul';
$$;

-- 멤버십 마지막 날: 기본 기간 + 기간 안의 휴강 주 수만큼 주 단위 연장 (연장된 기간의 휴강도 반영)
create or replace function public.membership_end_on(p_starts_on date, p_weeks int)
returns date
language plpgsql stable
set search_path = public
as $$
declare
  v_weeks int := p_weeks;
  v_holidays int;
  i int;
begin
  for i in 1..20 loop
    select count(*) into v_holidays from public.holiday_weeks
    where week_start >= p_starts_on and week_start < p_starts_on + v_weeks * 7;
    exit when p_weeks + v_holidays = v_weeks;
    v_weeks := p_weeks + v_holidays;
  end loop;
  return p_starts_on + v_weeks * 7 - 1;
end;
$$;

-- 기간 안의 특정 반 수업 날짜 (휴강 여부 포함)
create or replace function public.class_session_dates(p_class_id bigint, p_from date, p_to date)
returns table (session_date date, is_holiday boolean)
language sql stable
set search_path = public
as $$
  select d::date,
         exists (select 1 from public.holiday_weeks h where h.week_start = date_trunc('week', d)::date)
  from public.pt_classes c
  cross join generate_series(p_from, p_to, interval '1 day') as d
  where c.id = p_class_id and extract(isodow from d)::int = any (c.weekdays)
  order by 1;
$$;

-- 반에 자리를 차지하고 있는 회원 수 (입금 대기 포함), 특정 날짜 기준
create or replace function public.class_members_on(p_class_id bigint, p_date date)
returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int from public.memberships m
  where m.class_id = p_class_id
    and m.status in ('pending', 'active')
    and p_date between m.starts_on and public.membership_end_on(m.starts_on, m.weeks);
$$;

-- 반 등록 가능 자리 (오늘 이후 아직 끝나지 않은 회원 기준)
create or replace function public.class_seats_left(p_class_id bigint)
returns int
language sql stable security definer
set search_path = public
as $$
  select greatest(c.capacity - (
    select count(*) from public.memberships m
    where m.class_id = c.id and m.status in ('pending', 'active')
      and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today()
  ), 0)::int
  from public.pt_classes c where c.id = p_class_id;
$$;

-- 특정 수업(반+날짜)의 보강 빈자리
create or replace function public.session_free_seats(p_class_id bigint, p_date date)
returns int
language sql stable security definer
set search_path = public
as $$
  select greatest(c.capacity
    - public.class_members_on(c.id, p_date)
    - (select count(*) from public.makeup_bookings b
       where b.class_id = c.id and b.session_date = p_date and b.cancelled_at is null), 0)::int
  from public.pt_classes c where c.id = p_class_id;
$$;

-- 보강 주기: 시작일부터 4주(28일)씩
create or replace function public.cycle_index(p_starts_on date, p_date date)
returns int language sql immutable as $$
  select floor((p_date - p_starts_on) / 28.0)::int;
$$;

create or replace function public.current_membership(p_user uuid)
returns public.memberships
language sql stable security definer
set search_path = public
as $$
  select m.* from public.memberships m
  where m.user_id = p_user and m.status in ('pending', 'active')
    and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today()
  order by m.created_at desc
  limit 1;
$$;

-- =====================================================================
-- 4. 누구나 보는 정보 (소개·요금제 페이지)
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
    'classes', (select coalesce(jsonb_agg(jsonb_build_object(
        'code', c.code, 'name_ko', c.name_ko, 'name_en', c.name_en, 'kind', c.kind,
        'weekdays', to_jsonb(c.weekdays), 'start_time', to_char(c.start_time, 'HH24:MI'),
        'duration_min', c.duration_min, 'capacity', c.capacity,
        'seats_left', case when c.kind = 'regular' then public.class_seats_left(c.id) end,
        'waitlist', (select count(*) from public.class_waitlist w where w.class_id = c.id and w.left_at is null)) order by c.sort), '[]'::jsonb)
      from public.pt_classes c where c.is_open),
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

-- =====================================================================
-- 5. 회원 기능 (모두 로그인 회원만, 규칙은 여기서 검사)
-- =====================================================================

-- 멤버십 신청: p_start = 'this'(이번 주 월요일 시작) | 'next'(다음 주 월요일 시작)
create or replace function public.create_membership(p_plan text, p_class text, p_option text, p_start text)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.membership_plans;
  v_class public.pt_classes;
  v_starts date;
  v_first date;
  v_id bigint;
  i int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'no_profile'; end if;

  select * into v_plan from public.membership_plans where code = p_plan and is_active;
  if v_plan.code is null then raise exception 'invalid_plan'; end if;
  if p_option not in ('lump', 'installment') or (p_option = 'installment' and v_plan.installment_count < 2) then
    raise exception 'invalid_option';
  end if;

  select * into v_class from public.pt_classes where code = p_class and kind = 'regular' and is_open;
  if v_class.id is null then raise exception 'invalid_class'; end if;

  v_starts := date_trunc('week', public.kst_today())::date + case when p_start = 'next' then 7 else 0 end;
  if p_start not in ('this', 'next') then raise exception 'invalid_start'; end if;
  if p_start = 'this' then
    -- 이번 주 첫 수업이 이미 시작했으면 이번 주 시작 불가
    select min(session_date) into v_first from public.class_session_dates(v_class.id, v_starts, v_starts + 6);
    if v_first is null or public.session_starts_at(v_first, v_class.start_time) <= now() then
      raise exception 'start_passed';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('membership:' || v_uid::text));
  if (public.current_membership(v_uid)).id is not null then raise exception 'already_member'; end if;

  perform pg_advisory_xact_lock(hashtext('class:' || v_class.id::text));
  if public.class_seats_left(v_class.id) <= 0 then raise exception 'class_full'; end if;

  insert into public.memberships (user_id, plan_code, class_id, payment_option, starts_on, weeks)
  values (v_uid, v_plan.code, v_class.id, p_option, v_starts, v_plan.weeks)
  returning id into v_id;

  if p_option = 'lump' then
    insert into public.membership_payments (membership_id, user_id, installment_no, amount, due_on)
    values (v_id, v_uid, 1, v_plan.price, public.kst_today());
  else
    for i in 1..v_plan.installment_count loop
      insert into public.membership_payments (membership_id, user_id, installment_no, amount, due_on)
      values (v_id, v_uid, i, v_plan.installment_amount,
              case when i = 1 then public.kst_today() else v_starts + (i - 1) * 28 end);
    end loop;
  end if;

  -- 같은 반 대기 중이었다면 대기 해제
  update public.class_waitlist set left_at = now() where user_id = v_uid and left_at is null;
  return v_id;
end;
$$;

-- 입금 확인 전 신청 취소 (자리 반납)
create or replace function public.cancel_pending_membership()
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_id bigint;
begin
  select id into v_id from public.memberships
  where user_id = auth.uid() and status = 'pending' order by created_at desc limit 1 for update;
  if v_id is null then raise exception 'not_found'; end if;
  if exists (select 1 from public.membership_payments where membership_id = v_id and status = 'paid') then
    raise exception 'already_paid';
  end if;
  update public.memberships set status = 'cancelled', cancelled_at = now() where id = v_id;
  update public.membership_payments set status = 'cancelled' where membership_id = v_id and status = 'pending';
end;
$$;

-- 대기 등록 (반이 꽉 찼을 때만)
create or replace function public.join_waitlist(p_class text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_class public.pt_classes;
  v_count int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_class from public.pt_classes where code = p_class and kind = 'regular' and is_open;
  if v_class.id is null then raise exception 'invalid_class'; end if;
  if (public.current_membership(v_uid)).id is not null then raise exception 'already_member'; end if;
  if public.class_seats_left(v_class.id) > 0 then raise exception 'seats_available'; end if;

  insert into public.class_waitlist (class_id, user_id) values (v_class.id, v_uid)
  on conflict do nothing;

  select count(*) into v_count from public.class_waitlist where class_id = v_class.id and left_at is null;
  if v_count >= 3 and not exists (
    select 1 from public.admin_alerts where kind = 'waitlist' and class_id = v_class.id and resolved_at is null
  ) then
    insert into public.admin_alerts (kind, class_id, message_ko, message_en)
    values ('waitlist', v_class.id,
            v_class.name_ko || ' 대기자가 ' || v_count || '명입니다. 반 증설을 검토해 주세요.',
            v_class.name_en || ' has ' || v_count || ' people waiting. Consider opening another class.');
  end if;
end;
$$;

create or replace function public.leave_waitlist(p_class text)
returns void
language sql security definer
set search_path = public
as $$
  update public.class_waitlist w set left_at = now()
  from public.pt_classes c
  where c.id = w.class_id and c.code = p_class and w.user_id = auth.uid() and w.left_at is null;
$$;

-- 내 멤버십 요약 (마이페이지)
create or replace function public.my_membership()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.memberships;
  c public.pt_classes;
  v_end date;
  v_total int;
  v_left int;
  v_next date;
  v_cycle int;
  v_used int;
  v_max int := coalesce((select value::text::int from public.site_settings where key = 'makeups_per_cycle'), 2);
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  m := public.current_membership(v_uid);
  if m.id is null then
    return jsonb_build_object(
      'membership', null,
      'waitlist', (select coalesce(jsonb_agg(jsonb_build_object('class_code', pc.code, 'name_ko', pc.name_ko, 'name_en', pc.name_en,
                     'position', (select count(*) from public.class_waitlist w2 where w2.class_id = w.class_id and w2.left_at is null and w2.created_at <= w.created_at))), '[]'::jsonb)
                   from public.class_waitlist w join public.pt_classes pc on pc.id = w.class_id
                   where w.user_id = v_uid and w.left_at is null));
  end if;

  select * into c from public.pt_classes where id = m.class_id;
  v_end := public.membership_end_on(m.starts_on, m.weeks);
  select count(*) filter (where not is_holiday),
         count(*) filter (where not is_holiday and public.session_starts_at(session_date, c.start_time) > now()),
         min(session_date) filter (where not is_holiday and public.session_starts_at(session_date, c.start_time) > now())
    into v_total, v_left, v_next
  from public.class_session_dates(c.id, m.starts_on, v_end);

  v_cycle := greatest(public.cycle_index(m.starts_on, public.kst_today()), 0);
  select count(*) into v_used from public.makeup_bookings
  where membership_id = m.id and cancelled_at is null
    and public.cycle_index(m.starts_on, session_date) = v_cycle;

  return jsonb_build_object(
    'membership', jsonb_build_object(
      'id', m.id, 'status', m.status, 'plan_code', m.plan_code, 'payment_option', m.payment_option,
      'plan_name_ko', (select name_ko from public.membership_plans where code = m.plan_code),
      'plan_name_en', (select name_en from public.membership_plans where code = m.plan_code),
      'class_code', c.code, 'class_name_ko', c.name_ko, 'class_name_en', c.name_en,
      'weekdays', to_jsonb(c.weekdays), 'start_time', to_char(c.start_time, 'HH24:MI'),
      'starts_on', m.starts_on, 'ends_on', v_end,
      'extended_weeks', (v_end - m.starts_on + 1) / 7 - m.weeks,
      'sessions_total', v_total, 'sessions_left', v_left, 'next_session', v_next,
      'makeups_used', v_used, 'makeups_left', greatest(v_max - v_used, 0),
      'cycle_ends_on', m.starts_on + (v_cycle + 1) * 28 - 1),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
        'installment_no', p.installment_no, 'amount', p.amount, 'due_on', p.due_on, 'status', p.status, 'paid_at', p.paid_at)
        order by p.installment_no), '[]'::jsonb)
      from public.membership_payments p where p.membership_id = m.id),
    'makeups', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'class_code', pc.code, 'class_name_ko', pc.name_ko, 'class_name_en', pc.name_en,
        'session_date', b.session_date, 'start_time', to_char(pc.start_time, 'HH24:MI'),
        'cancellable', public.session_starts_at(b.session_date, pc.start_time) > now())
        order by b.session_date), '[]'::jsonb)
      from public.makeup_bookings b join public.pt_classes pc on pc.id = b.class_id
      where b.membership_id = m.id and b.cancelled_at is null and b.session_date >= public.kst_today()),
    'bank_account', (select value #>> '{}' from public.site_settings where key = 'bank_account'),
    'waitlist', '[]'::jsonb
  );
end;
$$;

-- 보강 가능한 수업 목록 (앞으로 p_days일, 내 반 제외)
create or replace function public.makeup_options(p_days int default 14)
returns table (class_code text, class_name_ko text, class_name_en text, session_date date, start_time text, free_seats int, cycle_full boolean)
language plpgsql stable security definer
set search_path = public
as $$
declare
  m public.memberships;
  v_end date;
  v_max int := coalesce((select value::text::int from public.site_settings where key = 'makeups_per_cycle'), 2);
begin
  m := public.current_membership(auth.uid());
  if m.id is null or m.status <> 'active' then return; end if;
  v_end := least(public.membership_end_on(m.starts_on, m.weeks), public.kst_today() + least(greatest(p_days, 1), 28));
  return query
    select c.code, c.name_ko, c.name_en, s.session_date, to_char(c.start_time, 'HH24:MI'),
           public.session_free_seats(c.id, s.session_date),
           (select count(*) from public.makeup_bookings b
            where b.membership_id = m.id and b.cancelled_at is null
              and public.cycle_index(m.starts_on, b.session_date) = public.cycle_index(m.starts_on, s.session_date)) >= v_max
    from public.pt_classes c
    cross join lateral public.class_session_dates(c.id, greatest(public.kst_today(), m.starts_on), v_end) s
    where c.is_open and c.id <> m.class_id and not s.is_holiday
      and public.session_starts_at(s.session_date, c.start_time) > now()
      and not exists (select 1 from public.makeup_bookings b2
                      where b2.user_id = m.user_id and b2.class_id = c.id and b2.session_date = s.session_date and b2.cancelled_at is null)
    order by s.session_date, c.start_time;
end;
$$;

create or replace function public.book_makeup(p_class text, p_date date)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.memberships;
  c public.pt_classes;
  v_used int;
  v_id bigint;
  v_max int := coalesce((select value::text::int from public.site_settings where key = 'makeups_per_cycle'), 2);
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  m := public.current_membership(v_uid);
  if m.id is null then raise exception 'no_membership'; end if;
  if m.status <> 'active' then raise exception 'membership_not_active'; end if;

  select * into c from public.pt_classes where code = p_class and is_open;
  if c.id is null or c.id = m.class_id then raise exception 'invalid_class'; end if;
  if not exists (select 1 from public.class_session_dates(c.id, p_date, p_date) where not is_holiday) then
    raise exception 'no_session';
  end if;
  if public.session_starts_at(p_date, c.start_time) <= now() then raise exception 'session_passed'; end if;
  if p_date < m.starts_on or p_date > public.membership_end_on(m.starts_on, m.weeks) then raise exception 'outside_membership'; end if;

  perform pg_advisory_xact_lock(hashtext('makeup-user:' || v_uid::text));
  select count(*) into v_used from public.makeup_bookings
  where membership_id = m.id and cancelled_at is null
    and public.cycle_index(m.starts_on, session_date) = public.cycle_index(m.starts_on, p_date);
  if v_used >= v_max then raise exception 'makeup_limit'; end if;

  perform pg_advisory_xact_lock(hashtext('session:' || c.id::text || ':' || p_date::text));
  if public.session_free_seats(c.id, p_date) <= 0 then raise exception 'session_full'; end if;

  insert into public.makeup_bookings (membership_id, user_id, class_id, session_date)
  values (m.id, v_uid, c.id, p_date)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'already_booked';
end;
$$;

create or replace function public.cancel_makeup(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_ok boolean;
begin
  update public.makeup_bookings b set cancelled_at = now()
  from public.pt_classes c
  where b.id = p_id and b.user_id = auth.uid() and b.cancelled_at is null and c.id = b.class_id
    and public.session_starts_at(b.session_date, c.start_time) > now()
  returning true into v_ok;
  if v_ok is null then raise exception 'not_found'; end if;
end;
$$;

-- 이벤트 목록 (기간), 내 신청 여부 포함
create or replace function public.list_crew_events(p_from date, p_to date)
returns table (id bigint, kind text, title text, description text, starts_at timestamptz, place text,
               partner_place_id bigint, capacity int, registered int, extra_cost boolean, cost_note text,
               status text, my_registration_id bigint)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.kind, e.title, e.description, e.starts_at, e.place, e.partner_place_id, e.capacity,
         (select count(*)::int from public.event_registrations r where r.event_id = e.id and r.cancelled_at is null),
         e.extra_cost, e.cost_note, e.status,
         (select r.id from public.event_registrations r where r.event_id = e.id and r.user_id = auth.uid() and r.cancelled_at is null)
  from public.crew_events e
  where e.status <> 'cancelled'
    and (e.starts_at at time zone 'Asia/Seoul')::date between p_from and p_to
  order by e.starts_at;
$$;

-- 이벤트 신청: 이용 중 회원만, 정원·선착순, 게더링은 한 달(달력) 1회
create or replace function public.register_event(p_event_id bigint)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e public.crew_events;
  v_id bigint;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if (public.current_membership(v_uid)).status is distinct from 'active' then raise exception 'membership_not_active'; end if;

  perform pg_advisory_xact_lock(hashtext('event:' || p_event_id::text));
  select * into e from public.crew_events where id = p_event_id;
  if e.id is null or e.status <> 'open' then raise exception 'event_closed'; end if;
  if e.starts_at <= now() then raise exception 'event_passed'; end if;
  if exists (select 1 from public.event_registrations where event_id = e.id and user_id = v_uid and cancelled_at is null) then
    raise exception 'already_registered';
  end if;
  if (select count(*) from public.event_registrations where event_id = e.id and cancelled_at is null) >= e.capacity then
    raise exception 'event_full';
  end if;
  if e.kind = 'gathering' and exists (
    select 1 from public.event_registrations r join public.crew_events e2 on e2.id = r.event_id
    where r.user_id = v_uid and r.cancelled_at is null and e2.kind = 'gathering' and e2.status <> 'cancelled'
      and date_trunc('month', e2.starts_at at time zone 'Asia/Seoul') = date_trunc('month', e.starts_at at time zone 'Asia/Seoul')
  ) then
    raise exception 'gathering_limit';
  end if;

  insert into public.event_registrations (event_id, user_id) values (e.id, v_uid) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_event_registration(p_event_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_ok boolean;
begin
  update public.event_registrations r set cancelled_at = now()
  from public.crew_events e
  where r.event_id = p_event_id and e.id = r.event_id and r.user_id = auth.uid() and r.cancelled_at is null
    and e.starts_at > now()
  returning true into v_ok;
  if v_ok is null then raise exception 'not_found'; end if;
end;
$$;

-- 내 PT 일정 (캘린더용): 내 반 수업 + 보강, 휴강 표시
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
    select s.session_date, to_char(c.start_time, 'HH24:MI'), c.code, c.name_ko, c.name_en, 'regular'::text, s.is_holiday
    from public.pt_classes c
    cross join lateral public.class_session_dates(c.id, greatest(p_from, m.starts_on), least(p_to, v_end)) s
    where c.id = m.class_id
    union all
    select b.session_date, to_char(c.start_time, 'HH24:MI'), c.code, c.name_ko, c.name_en, 'makeup'::text, false
    from public.makeup_bookings b join public.pt_classes c on c.id = b.class_id
    where b.membership_id = m.id and b.cancelled_at is null and b.session_date between p_from and p_to
    order by 1, 2;
end;
$$;

-- =====================================================================
-- 6. 보안 (RLS): 본인 데이터만, 관리자는 전체. 회원 쓰기는 위 함수로만.
-- =====================================================================
alter table public.membership_plans enable row level security;
alter table public.pt_classes enable row level security;
alter table public.holiday_weeks enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_payments enable row level security;
alter table public.class_attendance enable row level security;
alter table public.makeup_bookings enable row level security;
alter table public.class_waitlist enable row level security;
alter table public.admin_alerts enable row level security;
alter table public.partner_places enable row level security;
alter table public.crew_events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_expenses enable row level security;
alter table public.site_settings enable row level security;

-- 누구나 읽기: 요금제, 열린 반, 휴강 주, 보이는 제휴 장소, 취소 안 된 이벤트
drop policy if exists "plans_read" on public.membership_plans;
create policy "plans_read" on public.membership_plans for select using (true);
drop policy if exists "classes_read" on public.pt_classes;
create policy "classes_read" on public.pt_classes for select using (is_open or public.is_admin());
drop policy if exists "holidays_read" on public.holiday_weeks;
create policy "holidays_read" on public.holiday_weeks for select using (true);
drop policy if exists "places_read" on public.partner_places;
create policy "places_read" on public.partner_places for select using (is_visible or public.is_admin());
drop policy if exists "events_read" on public.crew_events;
create policy "events_read" on public.crew_events for select using (status <> 'cancelled' or public.is_admin());

-- 본인 것만 읽기
drop policy if exists "memberships_read_own" on public.memberships;
create policy "memberships_read_own" on public.memberships for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "payments_read_own" on public.membership_payments;
create policy "payments_read_own" on public.membership_payments for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "attendance_read_own" on public.class_attendance;
create policy "attendance_read_own" on public.class_attendance for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "makeups_read_own" on public.makeup_bookings;
create policy "makeups_read_own" on public.makeup_bookings for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "waitlist_read_own" on public.class_waitlist;
create policy "waitlist_read_own" on public.class_waitlist for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "event_reg_read_own" on public.event_registrations;
create policy "event_reg_read_own" on public.event_registrations for select using (auth.uid() = user_id or public.is_admin());

-- 관리자 전용 읽기: 알림, 지출, 설정 (설정 중 공개값은 함수로만 노출)
drop policy if exists "alerts_admin_read" on public.admin_alerts;
create policy "alerts_admin_read" on public.admin_alerts for select using (public.is_admin());
drop policy if exists "expenses_admin_read" on public.event_expenses;
create policy "expenses_admin_read" on public.event_expenses for select using (public.is_admin());
drop policy if exists "settings_admin_read" on public.site_settings;
create policy "settings_admin_read" on public.site_settings for select using (public.is_admin());

-- 관리자 쓰기 (다음 단계 관리자 페이지에서 사용)
do $$
declare t text;
begin
  foreach t in array array['membership_plans', 'pt_classes', 'holiday_weeks', 'memberships', 'membership_payments',
                           'class_attendance', 'makeup_bookings', 'class_waitlist', 'admin_alerts', 'partner_places',
                           'crew_events', 'event_registrations', 'event_expenses', 'site_settings']
  loop
    execute format('drop policy if exists "%s_admin_write" on public.%I', t, t);
    execute format('create policy "%s_admin_write" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end;
$$;

-- 일반 반은 최대 3개까지만 열 수 있다
create or replace function public.limit_open_regular_classes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind = 'regular' and new.is_open
     and (select count(*) from public.pt_classes where kind = 'regular' and is_open and id <> new.id) >= 3 then
    raise exception 'max_open_classes';
  end if;
  return new;
end;
$$;
drop trigger if exists pt_classes_limit_open on public.pt_classes;
create trigger pt_classes_limit_open before insert or update on public.pt_classes
  for each row execute function public.limit_open_regular_classes();

-- 1회차 입금이 확인되면 멤버십 시작
create or replace function public.activate_membership_on_payment()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.installment_no = 1 and new.status = 'paid' and old.status is distinct from 'paid' then
    update public.memberships set status = 'active', activated_at = now()
    where id = new.membership_id and status = 'pending';
  end if;
  if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists membership_payments_activate on public.membership_payments;
create trigger membership_payments_activate before update on public.membership_payments
  for each row execute function public.activate_membership_on_payment();

-- =====================================================================
-- 7. 함수 실행 권한
-- =====================================================================
revoke all on function public.membership_overview() from public;
grant execute on function public.membership_overview() to anon, authenticated;

-- 공개 정보(반·제휴 장소·이벤트) 읽기 정책이 is_admin()을 쓰므로, 로그인 안 한 방문자도 호출할 수 있어야 한다.
-- 비로그인은 auth.uid()가 없어서 항상 false를 돌려주므로 안전하다.
grant execute on function public.is_admin() to anon;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_membership(text, text, text, text)', 'public.cancel_pending_membership()',
    'public.join_waitlist(text)', 'public.leave_waitlist(text)', 'public.my_membership()',
    'public.makeup_options(int)', 'public.book_makeup(text, date)', 'public.cancel_makeup(bigint)',
    'public.list_crew_events(date, date)', 'public.register_event(bigint)', 'public.cancel_event_registration(bigint)',
    'public.my_pt_sessions(date, date)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- 내부 계산 함수는 직접 호출 불필요 (security definer 함수 안에서만 사용)
revoke all on function public.class_members_on(bigint, date) from public, anon, authenticated;
revoke all on function public.class_seats_left(bigint) from public, anon, authenticated;
revoke all on function public.session_free_seats(bigint, date) from public, anon, authenticated;
revoke all on function public.current_membership(uuid) from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
