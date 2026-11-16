-- 0043 — 관리자만 같은 주에 PT 시간을 여러 개 선택(예약)할 수 있게 (2026-11-16 사용자 결정)
--   * 일반 회원: 그대로 같은 주에 PT 1번만.
--   * 관리자(profiles.role = 'admin'): 주 1회 제한 없음 → 같은 주에 여러 시간 선택 가능.
--   * 그대로인 규칙(관리자도 똑같이 적용): 월~금 17~22시만, 이번 주·다음 주만, 지난 시간 불가,
--     그룹 PT 반 수업 시간 불가, 한 시간에는 예약 1건만(다른 회원이 잡은 시간은 못 잡음).
--   * 0016의 enforce_weekly_booking_limit와 같고 "주 1회" 확인에 관리자 예외만 추가.
-- 0016을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

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
  booker_is_admin boolean;
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

  -- 관리자 여부는 예약 주인(new.user_id)의 DB 값으로 확인한다 (화면에서 보낸 값이 아님)
  select exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'admin')
    into booker_is_admin;

  if not booker_is_admin then
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
  end if;

  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';
