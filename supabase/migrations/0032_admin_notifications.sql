-- 0032 — 6단계 관리자 알림 (2026-11-06 사용자 결정: 이메일 + 관리자 페이지)
--   알림 대상: 새 PT 예약 / PT 예약 취소 / 멤버십 신청 / 식단 상담 신청 / 학생증 제출
--   흐름: 저장이 끝난 뒤 DB 트리거 → pg_net으로 우리 서버(api/notify-admin.js)에 "무슨 일, 몇 번" 만 알림
--        → 서버가 DB에서 내용을 다시 읽고(받은 내용은 믿지 않음) 이메일(Resend) 발송 → notification_logs에 결과 기록
--   * 알림은 이벤트마다 한 번만 (notification_logs 유니크), 10분 넘은 일은 보내지 않음 → 주소를 아무나 불러도 가짜·중복 메일 없음
--   * 알림이 실패해도 예약·신청은 그대로 저장된다 (트리거는 실패를 무시, 서버는 실패를 기록)
-- Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. "Potential issue detected" 창이 뜨면 "Run and enable RLS". 여러 번 실행해도 안전.
begin;

create extension if not exists pg_net with schema extensions;

-- =====================================================================
-- 1. 알림 기록 (관리자만 읽기, 쓰기는 서버만)
-- =====================================================================
create table if not exists public.notification_logs (
  id bigint generated always as identity primary key,
  event_kind text not null,          -- booking_created | booking_cancelled | membership_created | diet_submitted | verification_submitted
  ref_id text not null,              -- 예약 번호 등
  channel text not null default 'email',
  recipient text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text,
  subject text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (event_kind, ref_id, channel)
);
create index if not exists notification_logs_created_idx on public.notification_logs (created_at desc);
alter table public.notification_logs enable row level security;
drop policy if exists "notification_logs_admin_read" on public.notification_logs;
create policy "notification_logs_admin_read" on public.notification_logs
  for select using (public.is_admin());

-- 알림을 받을 서버 주소 (바꿔야 하면 이 값만 수정)
insert into public.site_settings (key, value) values
  ('notify_url', '"https://www.fitinconnection.com/api/notify-admin"'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
-- 2. 서버에 알리기 (실패해도 저장에는 영향 없음)
-- =====================================================================
create or replace function public.ping_admin_notify(p_kind text, p_ref text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := (select value #>> '{}' from public.site_settings where key = 'notify_url');
begin
  if v_url is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('kind', p_kind, 'id', p_ref),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  null;
end;
$$;
revoke all on function public.ping_admin_notify(text, text) from public, anon, authenticated;

-- =====================================================================
-- 3. 트리거
-- =====================================================================
create or replace function public.notify_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.ping_admin_notify('booking_created', new.id::text);
  elsif new.cancelled_at is not null and old.cancelled_at is null then
    perform public.ping_admin_notify('booking_cancelled', new.id::text);
  end if;
  return null;
end;
$$;
drop trigger if exists bookings_notify_admin on public.bookings;
create trigger bookings_notify_admin
  after insert or update of cancelled_at on public.bookings
  for each row execute function public.notify_on_booking();

create or replace function public.notify_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ping_admin_notify('membership_created', new.id::text);
  return null;
end;
$$;
drop trigger if exists memberships_notify_admin on public.memberships;
create trigger memberships_notify_admin
  after insert on public.memberships
  for each row execute function public.notify_on_membership();

create or replace function public.notify_on_diet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ping_admin_notify('diet_submitted', new.id::text);
  return null;
end;
$$;
drop trigger if exists diet_consults_notify_admin on public.diet_consults;
create trigger diet_consults_notify_admin
  after insert on public.diet_consults
  for each row execute function public.notify_on_diet();

-- 학생증 제출: 상태가 확인 대기(pending)로 바뀔 때. 다시 제출하면 새 알림 (제출 시각을 번호에 붙임)
create or replace function public.notify_on_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verify_status = 'pending' and old.verify_status is distinct from 'pending' then
    perform public.ping_admin_notify('verification_submitted',
      new.id::text || ':' || floor(extract(epoch from coalesce(new.verify_submitted_at, now())))::bigint::text);
  end if;
  return null;
end;
$$;
drop trigger if exists profiles_notify_verification on public.profiles;
create trigger profiles_notify_verification
  after update of verify_status on public.profiles
  for each row execute function public.notify_on_verification();

revoke all on function public.notify_on_booking() from public, anon, authenticated;
revoke all on function public.notify_on_membership() from public, anon, authenticated;
revoke all on function public.notify_on_diet() from public, anon, authenticated;
revoke all on function public.notify_on_verification() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
