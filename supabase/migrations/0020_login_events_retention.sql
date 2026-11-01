-- 0020 — 로그인 기록 보관 규칙 (2026-11-01 사용자 결정 "A안", 개인정보처리방침 "보유 기간"과 맞춤)
--   * 회원의 로그인 기록: 회원인 동안 계속 보관, 회원 탈퇴(계정 삭제) 시 함께 삭제
--     → 예전에는 계정을 지워도 기록이 "누구 것인지만 비운 채" 남았다(on delete set null). 이제 같이 지운다(on delete cascade).
--   * 회원 계정과 연결되지 않은 기록(가입되지 않은 이메일의 로그인 실패, 예전에 탈퇴한 회원의 남은 기록):
--     보안 목적상 1년 보관 후 자동 삭제 (새 기록이 쌓일 때 함께 정리, 별도 예약 작업 없음)
-- Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- 1. 계정 삭제 시 로그인 기록도 함께 삭제
alter table public.login_events drop constraint if exists login_events_user_id_fkey;
alter table public.login_events
  add constraint login_events_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- 2. 계정과 연결되지 않은 기록은 1년 뒤 삭제
create index if not exists login_events_created_at_idx on public.login_events (created_at);

create or replace function public.purge_old_login_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.login_events
  where user_id is null and created_at < now() - interval '1 year';
  return null;
end;
$$;

revoke all on function public.purge_old_login_events() from public, anon, authenticated;

drop trigger if exists login_events_purge_old on public.login_events;
create trigger login_events_purge_old
  after insert on public.login_events
  for each statement execute function public.purge_old_login_events();

-- 지금 이미 1년이 지난 "계정 없는" 기록 정리 (회원 기록은 건드리지 않음)
delete from public.login_events where user_id is null and created_at < now() - interval '1 year';

commit;
