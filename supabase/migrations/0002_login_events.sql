-- 3단계: 로그인 활동 기록 테이블.
-- Supabase 대시보드 -> SQL Editor -> New query -> 이 파일 전체를 붙여넣고 Run.
-- 재실행해도 안전합니다 (idempotent).

create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  attempted_email text, -- 로그인 실패 등 신원이 확인 안 될 때만 채워짐
  event_type text not null check (event_type in ('login', 'logout', 'login_failed', 'signup')),
  ip_address text,
  user_agent text,
  device text, -- 'mobile' | 'desktop'
  created_at timestamptz not null default now()
);

alter table public.login_events enable row level security;

drop policy if exists "login_events_select_own" on public.login_events;
create policy "login_events_select_own" on public.login_events
  for select using (auth.uid() = user_id);

drop policy if exists "login_events_select_admin" on public.login_events;
create policy "login_events_select_admin" on public.login_events
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- insert/update/delete 정책은 일부러 없음: 일반 회원은 이 테이블에 아무것도
-- 쓸 수 없다. 모든 기록은 /api/log-event.js가 service_role 키로 (RLS를
-- 우회해서) 남긴다 — 클라이언트가 로그를 조작할 수 없게 하기 위함.

create index if not exists login_events_user_id_created_at_idx
  on public.login_events (user_id, created_at desc);
