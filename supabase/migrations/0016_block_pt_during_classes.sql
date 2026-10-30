-- 0016 — 그룹 PT 반 수업 시간에는 1:1 PT 예약 불가 (2026-10-30 사용자 결정, 트레이너 1명)
--   * A반(월·목 19:00), B반(화·금 19:00)처럼 "열려 있는 일반 반"의 수업 시간과 겹치는 1:1 칸을 막는다.
--     반 시간표(pt_classes)를 보고 계산하므로, 관리자가 C반(월·목 20:30)을 열면 그 시간도 자동으로 막힌다.
--   * 휴강 주(holiday_weeks)에는 그룹 수업이 없으므로 1:1 예약이 다시 열린다.
--   * 이미 들어와 있는 1:1 예약은 지우거나 바꾸지 않는다 (관리자 화면에서 확인).
-- 0015를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- 1:1 칸(시작~끝)이 그 날 열린 일반 반 수업과 겹치는지
create or replace function public.slot_conflicts_class(p_starts_at timestamptz, p_ends_at timestamptz)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pt_classes c
    where c.kind = 'regular' and c.is_open
      and extract(isodow from p_starts_at at time zone 'Asia/Seoul')::int = any (c.weekdays)
      and (p_starts_at at time zone 'Asia/Seoul')::time < c.start_time + make_interval(mins => c.duration_min)
      and (p_ends_at at time zone 'Asia/Seoul')::time > c.start_time
      and not exists (
        select 1 from public.holiday_weeks h
        where h.week_start = date_trunc('week', p_starts_at at time zone 'Asia/Seoul')::date
      )
  );
$$;

grant execute on function public.slot_conflicts_class(timestamptz, timestamptz) to authenticated;

-- 학생에게 보이는 1:1 칸에서 반 수업 시간을 뺀다 (0013 조건 + 겹침 제외)
create or replace view public.pt_slots_public as
select
  s.id,
  s.starts_at,
  s.ends_at,
  s.trainer,
  public.slot_is_booked(s.id) as is_booked
from public.pt_slots s
where extract(isodow from s.starts_at at time zone 'Asia/Seoul') between 1 and 5
  and extract(hour from s.starts_at at time zone 'Asia/Seoul') between 17 and 21
  and not public.slot_conflicts_class(s.starts_at, s.ends_at)
order by s.starts_at;

grant select on public.pt_slots_public to authenticated;

-- 예약 저장 전 검사: 0014와 같고, 반 수업 시간과 겹치면 거절하는 조건만 추가
create or replace function public.enforce_weekly_booking_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_week date;
  target_start timestamptz;
  target_end timestamptz;
  current_week date := date_trunc('week', now() at time zone 'Asia/Seoul')::date;
begin
  select
    date_trunc('week', starts_at at time zone 'Asia/Seoul')::date,
    starts_at,
    ends_at
  into target_week, target_start, target_end
  from public.pt_slots
  where id = new.slot_id;

  if target_week is null or target_start is null then
    raise exception 'The selected PT slot does not exist.' using errcode = 'P0001';
  end if;

  if target_start <= now()
    or extract(isodow from target_start at time zone 'Asia/Seoul') not between 1 and 5
    or extract(hour from target_start at time zone 'Asia/Seoul') not between 17 and 21
    or public.slot_conflicts_class(target_start, target_end) then
    raise exception 'The selected PT slot is not available.' using errcode = 'P0001';
  end if;

  if target_week > current_week + 7 then
    raise exception 'Only this week and next week can be booked.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || target_week::text));

  if exists (
    select 1
    from public.bookings b
    join public.pt_slots s on s.id = b.slot_id
    where b.user_id = new.user_id
      and b.cancelled_at is null
      and date_trunc('week', s.starts_at at time zone 'Asia/Seoul')::date = target_week
  ) then
    raise exception 'Only one PT booking is allowed per week.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';
