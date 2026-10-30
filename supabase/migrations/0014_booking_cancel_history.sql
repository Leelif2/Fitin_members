-- 0014 — PT 예약 취소 기록 남기기 (2026-10-30 사용자 요청)
--   * 학생이 취소해도 예약 행을 지우지 않고 cancelled_at(취소 시각)만 기록한다.
--     → 관리자가 취소 내역과 입금 상태를 보고 보증금 환불 여부를 판단할 수 있다.
--   * 취소된 시간은 다른 학생이 다시 예약할 수 있다 (취소 안 된 예약만 시간당 1개).
--   * 취소는 cancel_booking() 함수로만, 본인 예약 + 시작 24시간 전까지만 가능 (0013 규칙 유지).
--   * 기존 예약 데이터는 하나도 지우거나 바꾸지 않는다.
-- 0013을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- 1. 취소 시각 칸 (기존 예약은 모두 비어 있음 = 취소 안 됨)
alter table public.bookings add column if not exists cancelled_at timestamptz;

-- 2. "시간당 예약 1개"를 "시간당 취소 안 된 예약 1개"로 바꾼다
alter table public.bookings drop constraint if exists bookings_slot_id_key;
create unique index if not exists bookings_one_active_per_slot
  on public.bookings (slot_id)
  where cancelled_at is null;

-- 3. 마감 표시는 취소 안 된 예약만 센다
create or replace function public.slot_is_booked(p_slot_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.bookings where slot_id = p_slot_id and cancelled_at is null);
$$;

-- 4. 예약 저장 전 검사 (0013과 같고, 주 1회 계산에서 취소된 예약만 뺀다)
create or replace function public.enforce_weekly_booking_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_week date;
  target_start timestamptz;
  current_week date := date_trunc('week', now() at time zone 'Asia/Seoul')::date;
begin
  select
    date_trunc('week', starts_at at time zone 'Asia/Seoul')::date,
    starts_at
  into target_week, target_start
  from public.pt_slots
  where id = new.slot_id;

  if target_week is null or target_start is null then
    raise exception 'The selected PT slot does not exist.' using errcode = 'P0001';
  end if;

  if target_start <= now()
    or extract(isodow from target_start at time zone 'Asia/Seoul') not between 1 and 5
    or extract(hour from target_start at time zone 'Asia/Seoul') not between 17 and 21 then
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

-- 5. 취소: 행을 지우지 않고 취소 시각만 기록
--    실패 메시지: 'Booking not found.' / 'Cancellations close 24 hours before the session.'
create or replace function public.cancel_booking(p_booking_id bigint)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_id bigint;
  v_cancelled_at timestamptz;
begin
  select slot_id into v_slot_id
  from public.bookings
  where id = p_booking_id and user_id = auth.uid() and cancelled_at is null
  for update;

  if v_slot_id is null then
    raise exception 'Booking not found.' using errcode = 'P0001';
  end if;

  if not public.booking_cancellable(v_slot_id) then
    raise exception 'Cancellations close 24 hours before the session.' using errcode = 'P0001';
  end if;

  update public.bookings set cancelled_at = now()
  where id = p_booking_id
  returning cancelled_at into v_cancelled_at;

  return v_cancelled_at;
end;
$$;

revoke all on function public.cancel_booking(bigint) from public, anon;
grant execute on function public.cancel_booking(bigint) to authenticated;

-- 6. 회원이 예약 행을 직접 지우는 것은 막는다 (취소는 위 함수로만 → 기록이 항상 남음)
drop policy if exists "bookings_delete_own" on public.bookings;

commit;

notify pgrst, 'reload schema';
