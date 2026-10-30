-- 0018 — 관리자 도구 (3단계) + 수요일 19시 1:1 PT 차단 (2026-10-30 사용자 결정)
--   * 수요일 19:00(보강 전용 시간)에도 1:1 PT 예약 불가 → 열린 "모든" 반(일반 + 보강 전용) 시간과 겹치면 막음
--   * 출석 명단: 그날 수업의 고정 회원 + 보강 신청자 + 출석 상태
--   * 월 매출: 멤버십 회비 "입금 확인" 기준 (1:1 PT 예약금 제외) / 이벤트 예산 = 그달 매출의 20%
--   * 성비 통계: 이용 중 회원 기준, 전체·반별
-- 0015·0016을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- 1. 1:1 칸이 열린 반(일반 + 보강 전용) 수업과 겹치는지 (0016에서 보강 전용 시간까지 포함하도록 확장)
create or replace function public.slot_conflicts_class(p_starts_at timestamptz, p_ends_at timestamptz)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pt_classes c
    where c.is_open
      and extract(isodow from p_starts_at at time zone 'Asia/Seoul')::int = any (c.weekdays)
      and (p_starts_at at time zone 'Asia/Seoul')::time < c.start_time + make_interval(mins => c.duration_min)
      and (p_ends_at at time zone 'Asia/Seoul')::time > c.start_time
      and not exists (
        select 1 from public.holiday_weeks h
        where h.week_start = date_trunc('week', p_starts_at at time zone 'Asia/Seoul')::date
      )
  );
$$;

-- 2. 출석 명단 (관리자 전용)
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
    from public.memberships m
    left join public.profiles p on p.id = m.user_id
    where m.class_id = p_class_id and m.status = 'active'
      and p_date between m.starts_on and public.membership_end_on(m.starts_on, m.weeks)
    union all
    select b.user_id,
           nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
           p.university, p.gender, 'makeup'::text, hc.name_ko,
           (select a.status from public.class_attendance a
            where a.class_id = p_class_id and a.session_date = p_date and a.user_id = b.user_id)
    from public.makeup_bookings b
    left join public.profiles p on p.id = b.user_id
    left join public.memberships m on m.id = b.membership_id
    left join public.pt_classes hc on hc.id = m.class_id
    where b.class_id = p_class_id and b.session_date = p_date and b.cancelled_at is null
    order by 5, 2;
end;
$$;

-- 3. 월 매출 · 이벤트 예산 (관리자 전용): 최근 p_months개월
create or replace function public.admin_monthly_summary(p_months int default 6)
returns table (month date, revenue bigint, budget bigint, spent bigint, paid_count int)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
    with months as (
      select generate_series(
        date_trunc('month', now() at time zone 'Asia/Seoul') - make_interval(months => greatest(least(p_months, 24), 1) - 1),
        date_trunc('month', now() at time zone 'Asia/Seoul'),
        interval '1 month')::date as m
    ),
    rev as (
      select date_trunc('month', p.paid_at at time zone 'Asia/Seoul')::date as m, sum(p.amount)::bigint as total, count(*)::int as n
      from public.membership_payments p
      where p.status = 'paid' and p.paid_at is not null
      group by 1
    ),
    exp as (
      select date_trunc('month', e.spent_on)::date as m, sum(e.amount)::bigint as total
      from public.event_expenses e
      group by 1
    )
    select months.m,
           coalesce(rev.total, 0),
           floor(coalesce(rev.total, 0) * 0.2)::bigint,
           coalesce(exp.total, 0),
           coalesce(rev.n, 0)
    from months
    left join rev on rev.m = months.m
    left join exp on exp.m = months.m
    order by months.m desc;
end;
$$;

-- 4. 성비 통계 (관리자 전용): 이용 중 회원, 전체 + 반별
create or replace function public.admin_gender_stats()
returns table (class_code text, class_name_ko text, class_name_en text, male int, female int, unknown int)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
    select coalesce(c.code, '*'), coalesce(c.name_ko, '전체'), coalesce(c.name_en, 'All'),
           count(*) filter (where p.gender = 'male')::int,
           count(*) filter (where p.gender = 'female')::int,
           count(*) filter (where p.gender is null or p.gender not in ('male', 'female'))::int
    from public.memberships m
    join public.pt_classes c on c.id = m.class_id
    left join public.profiles p on p.id = m.user_id
    where m.status = 'active' and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today()
    group by grouping sets ((c.code, c.name_ko, c.name_en, c.sort), ())
    order by c.sort nulls first;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_class_roster(bigint, date)', 'public.admin_monthly_summary(int)', 'public.admin_gender_stats()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
