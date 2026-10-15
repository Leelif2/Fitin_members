-- 0007 — 운동 루틴 추천 결과 저장 (선호도 조사 + 시간표에서 읽은 수업 + 추천 루틴)
-- Supabase 대시보드 → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run.
-- 여러 번 실행해도 안전하게 작성됨.
--
-- 개인정보 최소화: 시간표 사진 원본은 저장하지 않는다. 사진에서 읽은
-- "요일·시작·끝·과목명"과 조사 답변, 추천 결과만 저장한다.

create table if not exists public.routine_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 선호도 조사 답변 {duration, sessionsPerWeek, level, timePref, goal}
  preferences jsonb not null,
  -- 시간표 수업 목록 [{day, start, end, title}]
  classes jsonb not null,
  -- 추천 결과 {freeBlocks, sessions, requested, shortBy}
  plan jsonb not null,
  created_at timestamptz not null default now(),
  constraint routine_plans_preferences_valid check (
    jsonb_typeof(preferences) = 'object'
    and preferences ->> 'duration' in ('30', '50')
    and preferences ->> 'sessionsPerWeek' in ('3', '4', '5')
    and preferences ->> 'level' in ('beginner', 'intermediate', 'advanced')
    and preferences ->> 'timePref' in ('morning', 'midday', 'afternoon', 'any')
    and preferences ->> 'goal' in ('strength', 'hypertrophy', 'fatloss')
  ),
  constraint routine_plans_classes_valid check (
    jsonb_typeof(classes) = 'array' and jsonb_array_length(classes) <= 80
  ),
  constraint routine_plans_plan_valid check (jsonb_typeof(plan) = 'object'),
  constraint routine_plans_size check (pg_column_size(classes) + pg_column_size(plan) < 100000)
);

create index if not exists routine_plans_user_created_idx
  on public.routine_plans (user_id, created_at desc);

-- RLS: 본인 것만 조회·저장·삭제, 관리자는 전체 조회. 수정은 없음(새로 만들면 새 행).
alter table public.routine_plans enable row level security;

drop policy if exists "routine_plans_select_own" on public.routine_plans;
create policy "routine_plans_select_own" on public.routine_plans
  for select using (auth.uid() = user_id);

drop policy if exists "routine_plans_insert_own" on public.routine_plans;
create policy "routine_plans_insert_own" on public.routine_plans
  for insert with check (auth.uid() = user_id);

drop policy if exists "routine_plans_delete_own" on public.routine_plans;
create policy "routine_plans_delete_own" on public.routine_plans
  for delete using (auth.uid() = user_id);

drop policy if exists "routine_plans_select_admin" on public.routine_plans;
create policy "routine_plans_select_admin" on public.routine_plans
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
