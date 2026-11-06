-- 0035 — 입금 안내를 인스타그램 DM으로 (2026-11-06 사용자 결정)
--   * 계좌번호를 사이트·DB에서 없앤다. 예약금·회비는 회원이 인스타그램 @fitinconnection_official 로 DM을 보내면
--     운영자가 계좌와 입금 방법을 직접 알려준다.
--   * site_settings의 bank_account를 지운다 → my_membership()이 돌려주던 계좌도 비어서 더는 회원 화면으로 나가지 않는다.
--   * PT 예약 확정 알림(알림함·메일)에 DM 안내를 넣는다 (0034와 같고 문구만 추가).
-- 0034를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

delete from public.site_settings where key = 'bank_account';

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
      format('장소: %s · 준비물: %s. 5분 전에 와 주세요. 예약금 10,000원은 인스타그램 @fitinconnection_official 로 DM 주시면 계좌와 입금 방법을 알려드려요. 시작 24시간 전까지 PT 예약 화면에서 취소할 수 있어요.',
             coalesce(v_info ->> 'place_ko', 'IGC 체육관'), coalesce(v_info ->> 'bring_ko', '운동복, 물')),
      format('Place: %s · Bring: %s. Please arrive 5 minutes early. For the KRW 10,000 deposit, DM @fitinconnection_official on Instagram and we''ll send you the account and how to pay. You can cancel on the PT Booking page until 24 hours before.',
             coalesce(v_info ->> 'place_en', 'IGC gym'), coalesce(v_info ->> 'bring_en', 'workout clothes, water')),
      'booking.html');
  elsif new.cancelled_at is not null and old.cancelled_at is null and new.cancelled_by = 'admin' then
    perform public.add_member_notification(new.user_id, 'booking_cancelled', new.id::text,
      'PT 예약이 취소됐어요 · ' || public.kst_label(v_start, 'ko'),
      'Your PT session was cancelled · ' || public.kst_label(v_start, 'en'),
      '사유: ' || coalesce(new.cancel_reason, '-') || '. 예약금을 입금하셨다면 환불해 드려요.',
      'Reason: ' || coalesce(new.cancel_reason, '-') || '. If you paid the deposit, we''ll refund it.',
      'booking.html');
  end if;
  return null;
end;
$$;
revoke all on function public.member_notify_booking() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
