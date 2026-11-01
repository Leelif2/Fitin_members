-- 0022 — 오늘의 학식 (홈 개편 B단계, 2026-11-01)
-- IGC 카페테리아 식단(https://housing.igc.or.kr/about/cafeteria_menu.do)을 서버(api/cafeteria-sync.js)가
-- 매주 일요일 21시(한국 시간)에 읽어 와 여기에 저장한다. 메뉴 이름은 원본의 영어·한국어를 둘 다 저장.
--   * 공개 정보라 누구나 읽기 가능 (로그인 안 한 방문자도 홈에서 봄)
--   * 쓰기는 서버(service_role)만 가능 — 회원/방문자용 쓰기 정책 없음
--   * 개인정보 없음
-- Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

create table if not exists public.cafeteria_menus (
  menu_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  time_range text,                         -- 예: 07:30~08:30
  price integer,                           -- 원 단위, 예: 4000
  items jsonb not null default '[]'::jsonb, -- [{ "en": "Japchae", "ko": "잡채" }, ...]
  source_url text not null,
  fetched_at timestamptz not null default now(),
  primary key (menu_date, meal)
);

alter table public.cafeteria_menus enable row level security;

drop policy if exists "cafeteria_menus_public_read" on public.cafeteria_menus;
create policy "cafeteria_menus_public_read" on public.cafeteria_menus
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.cafeteria_menus from anon, authenticated;
grant select on public.cafeteria_menus to anon, authenticated;

-- 수집 실행 기록 (성공/실패, 날짜별 결과). 관리자만 읽기, 쓰기는 서버만.
-- 서버는 마지막 실행 후 30분 안에는 다시 수집하지 않는다 (학교 서버 보호).
create table if not exists public.cafeteria_sync_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  detail jsonb not null default '[]'::jsonb
);
create index if not exists cafeteria_sync_runs_ran_at_idx on public.cafeteria_sync_runs (ran_at desc);

alter table public.cafeteria_sync_runs enable row level security;

drop policy if exists "cafeteria_sync_runs_admin_read" on public.cafeteria_sync_runs;
create policy "cafeteria_sync_runs_admin_read" on public.cafeteria_sync_runs
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.cafeteria_sync_runs from anon, authenticated;

commit;

notify pgrst, 'reload schema';
