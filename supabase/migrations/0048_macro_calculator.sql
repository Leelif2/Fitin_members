-- 0048 — 매크로 계산기 저장 (2026-11-26 사용자 확인, 브랜치 feature/macro-calculator)
--   * macro_profiles: 회원의 마지막 입력값(성별·나이·키·체중·체지방·둘레·활동·목표·계수) 1행 + 실측 보정 적용 여부.
--     신체 정보라 [필수] "계정에 저장" 동의(consent = true)가 있어야만 저장된다. 동의하지 않으면 브라우저에만 저장(화면).
--   * macro_logs: 2주 보정용 기록 — 날짜·아침 체중(kg)·하루 섭취(kcal). 날짜당 1행. 프로필 동의가 있을 때만 쓸 수 있다.
--   * 본인 데이터만 읽기·쓰기·지우기 (관리자·트레이너 열람은 이번 범위 아님). 탈퇴하면 함께 삭제.
-- Supabase → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

create table if not exists public.macro_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) < 2000),
  calibration_applied boolean not null default false,
  consent boolean not null check (consent),
  updated_at timestamptz not null default now()
);

create table if not exists public.macro_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5, 1) check (weight_kg is null or weight_kg between 35 and 250),
  intake_kcal int check (intake_kcal is null or intake_kcal between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);
create index if not exists macro_logs_user_idx on public.macro_logs (user_id, log_date);

-- 본인 확인 · 날짜 범위 · 기록 수 제한 (실수·장난 방지)
create or replace function public.macro_logs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if new.log_date < public.kst_today() - 400 or new.log_date > public.kst_today() + 31 then raise exception 'invalid_date'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.macro_logs where user_id = new.user_id) >= 400 then raise exception 'too_many_logs'; end if;
  return new;
end;
$$;
drop trigger if exists macro_logs_guard on public.macro_logs;
create trigger macro_logs_guard before insert or update on public.macro_logs
  for each row execute function public.macro_logs_guard();
revoke all on function public.macro_logs_guard() from public, anon, authenticated;

create or replace function public.macro_profiles_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists macro_profiles_touch on public.macro_profiles;
create trigger macro_profiles_touch before insert or update on public.macro_profiles
  for each row execute function public.macro_profiles_touch();
revoke all on function public.macro_profiles_touch() from public, anon, authenticated;

alter table public.macro_profiles enable row level security;
alter table public.macro_logs enable row level security;

drop policy if exists "macro_profiles_own" on public.macro_profiles;
create policy "macro_profiles_own" on public.macro_profiles for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "macro_logs_read_own" on public.macro_logs;
create policy "macro_logs_read_own" on public.macro_logs for select to authenticated using (auth.uid() = user_id);
drop policy if exists "macro_logs_delete_own" on public.macro_logs;
create policy "macro_logs_delete_own" on public.macro_logs for delete to authenticated using (auth.uid() = user_id);
-- 쓰기는 "계정에 저장" 동의가 있을 때만
drop policy if exists "macro_logs_write_own" on public.macro_logs;
create policy "macro_logs_write_own" on public.macro_logs for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.macro_profiles p where p.user_id = auth.uid() and p.consent));
drop policy if exists "macro_logs_update_own" on public.macro_logs;
create policy "macro_logs_update_own" on public.macro_logs for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.macro_profiles p where p.user_id = auth.uid() and p.consent));

revoke all on table public.macro_profiles from anon;
revoke all on table public.macro_logs from anon;
grant select, insert, update, delete on table public.macro_profiles to authenticated;
grant select, insert, update, delete on table public.macro_logs to authenticated;

commit;

notify pgrst, 'reload schema';
