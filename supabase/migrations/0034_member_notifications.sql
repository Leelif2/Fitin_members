-- 0034 — 8단계 회원 알림: 사이트 알림함 + 이메일 (2026-11-06 사용자 결정)
--   알림 대상: PT 예약 확정(예약 즉시) / 관리자가 예약 취소(사유) / 멤버십 입금 확인(이용 시작) / 학생증 승인·거절(사유)
--   * 알림함(notifications): DB 트리거가 바로 만든다 → 이메일이 실패해도 알림함에는 남는다. 회원은 자기 것만 보고 읽음 표시만 할 수 있다.
--   * 실시간: notifications를 Supabase Realtime에 등록 → 새 알림이 오면 화면의 숫자가 바로 바뀐다(RLS로 본인 것만 전달).
--   * 이메일: 0032와 같은 방식으로 서버(api/notify-admin.js)를 부르고, 서버가 회원 이메일로 보낸다(결과는 notification_logs).
--     회원에게 보내려면 Resend에서 fitinconnection.com 도메인 인증이 필요하다(인증 전에는 이메일만 실패로 기록).
--   * 장소·준비물 문구는 site_settings 'pt_info'에서 바꿀 수 있다 (맨 아래 예시).
-- 0023, 0032, 0033을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run.
-- "Potential issue detected" 창이 뜨면 "Run and enable RLS". 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 알림함
-- =====================================================================
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,                -- booking_confirmed | booking_cancelled | membership_active | verification_approved | verification_rejected
  ref_id text not null,
  title_ko text not null,
  title_en text not null,
  body_ko text not null default '',
  body_en text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_id)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications
  for select using (auth.uid() = user_id);
-- 쓰기는 DB 트리거만, 읽음 표시는 아래 함수로만

-- 실시간 등록 (이미 등록돼 있으면 건너뜀)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end;
$$;

create or replace function public.mark_my_notifications_read(p_ids bigint[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.mark_my_notifications_read(bigint[]) from public, anon;
grant execute on function public.mark_my_notifications_read(bigint[]) to authenticated;

-- 장소·준비물 (확정 알림에 들어감)
insert into public.site_settings (key, value) values
  ('pt_info', '{"place_ko": "IGC 체육관(헬스장)", "place_en": "IGC gym", "bring_ko": "운동복, 실내 운동화, 물, 수건", "bring_en": "workout clothes, indoor shoes, water, a towel"}'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
-- 2. 알림 만들기 (같은 일은 한 번만) + 이메일용으로 서버 부르기
-- =====================================================================
create or replace function public.add_member_notification(
  p_user uuid, p_kind text, p_ref text, p_title_ko text, p_title_en text, p_body_ko text, p_body_en text, p_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, ref_id, title_ko, title_en, body_ko, body_en, link)
  values (p_user, p_kind, p_ref, p_title_ko, p_title_en, coalesce(p_body_ko, ''), coalesce(p_body_en, ''), p_link)
  on conflict (user_id, kind, ref_id) do nothing;
  perform public.ping_admin_notify('member_' || p_kind, p_ref);
exception when others then
  null; -- 알림 때문에 예약·승인이 실패하면 안 된다
end;
$$;
revoke all on function public.add_member_notification(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;

-- 한국 시간 "11/10(화) 19:00" / "Tue, Nov 10, 19:00"
create or replace function public.kst_label(p_ts timestamptz, p_lang text)
returns text
language sql
immutable
as $$
  select case when p_lang = 'ko'
    then to_char(p_ts at time zone 'Asia/Seoul', 'FMMM/FMDD')
         || '(' || (array['월','화','수','목','금','토','일'])[extract(isodow from p_ts at time zone 'Asia/Seoul')::int] || ') '
         || to_char(p_ts at time zone 'Asia/Seoul', 'HH24:MI')
    else to_char(p_ts at time zone 'Asia/Seoul', 'Dy, Mon FMDD, HH24:MI')
  end;
$$;

-- =====================================================================
-- 3. 트리거
-- =====================================================================
-- PT 예약 확정 (예약 즉시) / 관리자 취소
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
      format('장소: %s · 준비물: %s. 5분 전에 와 주세요. 시작 24시간 전까지 PT 예약 화면에서 취소할 수 있어요.',
             coalesce(v_info ->> 'place_ko', 'IGC 체육관'), coalesce(v_info ->> 'bring_ko', '운동복, 물')),
      format('Place: %s · Bring: %s. Please arrive 5 minutes early. You can cancel on the PT Booking page until 24 hours before.',
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
drop trigger if exists bookings_notify_member on public.bookings;
create trigger bookings_notify_member
  after insert or update of cancelled_at on public.bookings
  for each row execute function public.member_notify_booking();

-- 멤버십 입금 확인 → 이용 시작
create or replace function public.member_notify_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.membership_plans;
  v_end date;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    select * into v_plan from public.membership_plans where code = new.plan_code;
    v_end := public.membership_end_on(new.starts_on, new.weeks);
    perform public.add_member_notification(new.user_id, 'membership_active', new.id::text,
      '멤버십이 시작됐어요 · ' || coalesce(v_plan.name_ko, new.plan_code),
      'Your membership is active · ' || coalesce(v_plan.name_en, new.plan_code),
      format('입금이 확인됐어요. %s부터 %s까지 이용할 수 있어요.', to_char(new.starts_on, 'FMMM/FMDD'), to_char(v_end, 'FMMM/FMDD')),
      format('Payment confirmed. Your membership runs %s – %s.', to_char(new.starts_on, 'Mon FMDD'), to_char(v_end, 'Mon FMDD')),
      'mypage.html');
  end if;
  return null;
end;
$$;
drop trigger if exists memberships_notify_member on public.memberships;
create trigger memberships_notify_member
  after update of status on public.memberships
  for each row execute function public.member_notify_membership();

-- 학생증 승인 / 거절
create or replace function public.member_notify_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := new.id::text || ':' || floor(extract(epoch from coalesce(new.verified_at, now())))::bigint::text;
begin
  if old.verify_status = 'pending' and new.verify_status = 'approved' then
    perform public.add_member_notification(new.id, 'verification_approved', v_ref,
      '학생증 확인이 끝났어요. 환영해요!', 'Your student ID is approved. Welcome!',
      '이제 PT 예약, 멤버십, 모임을 모두 이용할 수 있어요.', 'You can now book PT, join a membership and meetups.',
      'Fitin%20Main.dc.html');
  elsif old.verify_status = 'pending' and new.verify_status = 'rejected' then
    perform public.add_member_notification(new.id, 'verification_rejected', v_ref,
      '학생증을 다시 올려 주세요', 'Please upload your student ID again',
      '사유: ' || coalesce(new.verify_note, '-'), 'Reason: ' || coalesce(new.verify_note, '-'),
      'verify.html');
  end if;
  return null;
end;
$$;
drop trigger if exists profiles_notify_member on public.profiles;
create trigger profiles_notify_member
  after update of verify_status on public.profiles
  for each row execute function public.member_notify_verification();

revoke all on function public.member_notify_booking() from public, anon, authenticated;
revoke all on function public.member_notify_membership() from public, anon, authenticated;
revoke all on function public.member_notify_verification() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 장소·준비물 바꾸기 (SQL Editor에서 한 줄만 실행)
--   update public.site_settings set value = jsonb_set(value, '{place_ko}', '"IGC 체육관 2층"') where key = 'pt_info';
-- ---------------------------------------------------------------------
