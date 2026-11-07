-- 0037 — 1:1 PT 가격: 예약금 10,000원(참석 시 5,000원 환불) → PT 1시간 20,000원 (2026-11-07 사용자 결정)
--   * 새 예약은 금액이 항상 20,000원 (화면이 다른 값을 보내도 DB가 20,000으로 저장).
--   * 이미 들어온 10,000원 예약 기록은 그대로 둔다 (그래서 10,000도 허용).
--   * 취소 규칙은 그대로: 시작 24시간 전까지 전액 환불, 이후 취소 불가, 노쇼 환불 없음.
--   * 확정·취소 알림 문구를 "PT 이용료"로 바꾼다 (0035와 같고 문구만).
-- 0008, 0035를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

alter table public.bookings drop constraint if exists bookings_deposit_amount_check;
alter table public.bookings add constraint bookings_deposit_amount_check check (deposit_amount in (10000, 20000));
alter table public.bookings alter column deposit_amount set default 20000;

create or replace function public.bookings_set_pt_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.deposit_amount := 20000;
  return new;
end;
$$;
drop trigger if exists bookings_set_pt_price on public.bookings;
create trigger bookings_set_pt_price
  before insert on public.bookings
  for each row execute function public.bookings_set_pt_price();
revoke all on function public.bookings_set_pt_price() from public, anon, authenticated;

create or replace function public.member_notify_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz := (select starts_at from public.pt_slots where id = new.slot_id);
  v_info jsonb := (select value from public.site_settings where key = 'pt_info');
begin
  if tg_op = 'INSERT' then
    perform public.add_member_notification(new.user_id, 'booking_confirmed', new.id::text,
      'PT 예약이 확정됐어요 · ' || public.kst_label(v_start, 'ko'),
      'Your PT session is booked · ' || public.kst_label(v_start, 'en'),
      format('장소: %s · 준비물: %s. 5분 전에 와 주세요. PT 이용료(1시간 20,000원)는 인스타그램 @fitinconnection_official 로 DM 주시면 계좌와 입금 방법을 알려드려요. 시작 24시간 전까지 PT 예약 화면에서 취소할 수 있어요.',
             coalesce(v_info ->> 'place_ko', 'IGC 체육관'), coalesce(v_info ->> 'bring_ko', '운동복, 물')),
      format('Place: %s · Bring: %s. Please arrive 5 minutes early. For the session fee (KRW 20,000 for 1 hour), DM @fitinconnection_official on Instagram and we''ll send you the account and how to pay. You can cancel on the PT Booking page until 24 hours before.',
             coalesce(v_info ->> 'place_en', 'IGC gym'), coalesce(v_info ->> 'bring_en', 'workout clothes, water')),
      'booking.html');
  elsif new.cancelled_at is not null and old.cancelled_at is null and new.cancelled_by = 'admin' then
    perform public.add_member_notification(new.user_id, 'booking_cancelled', new.id::text,
      'PT 예약이 취소됐어요 · ' || public.kst_label(v_start, 'ko'),
      'Your PT session was cancelled · ' || public.kst_label(v_start, 'en'),
      '사유: ' || coalesce(new.cancel_reason, '-') || '. PT 이용료를 입금하셨다면 환불해 드려요.',
      'Reason: ' || coalesce(new.cancel_reason, '-') || '. If you paid the session fee, we''ll refund it.',
      'booking.html');
  end if;
  return null;
end;
$$;
revoke all on function public.member_notify_booking() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
