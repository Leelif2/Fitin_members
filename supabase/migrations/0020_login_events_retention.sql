-- 0020 — 로그인 기록 3개월 보관 후 자동 삭제 (2026-10-31, 개인정보처리방침 "보유 기간"과 맞춤)
--   * 개인정보처리방침: 로그인 기록(IP·브라우저·기기·시각)은 3개월 보관 (통신비밀보호법)
--   * 별도 예약 작업(cron) 없이, 새 로그인 기록이 쌓일 때마다 3개월 지난 기록을 함께 지운다.
--   * 실행하는 순간에도 이미 3개월이 지난 기록을 한 번 지운다.
-- Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

create index if not exists login_events_created_at_idx on public.login_events (created_at);

create or replace function public.purge_old_login_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.login_events where created_at < now() - interval '3 months';
  return null;
end;
$$;

revoke all on function public.purge_old_login_events() from public, anon, authenticated;

drop trigger if exists login_events_purge_old on public.login_events;
create trigger login_events_purge_old
  after insert on public.login_events
  for each statement execute function public.purge_old_login_events();

-- 지금 이미 3개월이 지난 기록 정리
delete from public.login_events where created_at < now() - interval '3 months';

commit;
