-- 0019 — 매달 마지막 주 금요일은 B반 수업 대신 게더링 (2026-10-30 사용자 결정)
--   * B반(화·금 19:00)만 해당. 그날 B반 수업은 없고 게더링(20:00)으로 대체한다.
--   * 보충 없음 (사용자 결정): 그 날이 들어간 4주 동안 B반은 7회가 된다. 만료일 연장 없음.
--   * 그날은 B반으로 보강 신청도 불가, 남은 회차·캘린더·출석 명단에서 빠진다.
--   * 다른 반도 같은 규칙이 필요하면 pt_classes.skip_last_friday 를 true로 바꾸면 된다.
-- 0015를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

alter table public.pt_classes add column if not exists skip_last_friday boolean not null default false;
update public.pt_classes set skip_last_friday = true where code = 'B';

-- 그 달의 마지막 금요일인지 (7일 뒤가 다음 달이면 마지막 주)
create or replace function public.is_last_friday(p_date date)
returns boolean language sql immutable as $$
  select extract(isodow from p_date) = 5
     and extract(month from p_date + 7) <> extract(month from p_date);
$$;

-- 수업 날짜 계산: is_holiday = "그날 수업 없음" (휴강 주 + 마지막 금요일 게더링 대체)
-- 이 함수를 쓰는 남은 회차·보강·캘린더 계산이 자동으로 따라간다.
create or replace function public.class_session_dates(p_class_id bigint, p_from date, p_to date)
returns table (session_date date, is_holiday boolean)
language sql stable
set search_path = public
as $$
  select d::date,
         exists (select 1 from public.holiday_weeks h where h.week_start = date_trunc('week', d)::date)
         or (c.skip_last_friday and public.is_last_friday(d::date))
  from public.pt_classes c
  cross join generate_series(p_from, p_to, interval '1 day') as d
  where c.id = p_class_id and extract(isodow from d)::int = any (c.weekdays)
  order by 1;
$$;

-- 소개 페이지에 "마지막 주 금요일은 게더링" 표시용 값 추가 (0015와 같고 skip_last_friday만 추가)
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
        'duration_min', c.duration_min, 'capacity', c.capacity, 'skip_last_friday', c.skip_last_friday,
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

commit;

notify pgrst, 'reload schema';
