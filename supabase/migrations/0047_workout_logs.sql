-- 0047 — 운동 기록 (2026-11-22 사용자 결정)
--   * 초보자 근성장 루틴 화면(beginner-routine.html)의 각 운동 옆 "기록하기"로 날짜·세트별 무게·횟수(플랭크는 초)·메모를 남긴다.
--   * 본인 기록만 보고·쓰고·지울 수 있다. 관리자는 전체를 볼 수 있다(지도용). 수정은 없음(지우고 다시 기록).
--   * 기록 날짜는 오늘부터 60일 전까지만, 한 사람이 하루에 남길 수 있는 기록은 60건까지(실수·장난 방지).
--   * 3대 운동 챌린지(lift_records)와는 별개. 탈퇴하면 함께 삭제(auth.users on delete cascade).
-- Supabase → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

create table if not exists public.workout_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  performed_on date not null,
  exercise text not null check (exercise ~ '^[a-z][a-z0-9_]{1,39}$'),   -- 화면의 운동 이름 키 (예: back_squat)
  weights numeric(5, 1)[] not null,                                      -- 세트별 무게(kg), 맨몸은 0
  reps int[] not null,                                                   -- 세트별 반복 수 (unit='sec'이면 초)
  unit text not null default 'reps' check (unit in ('reps', 'sec')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint workout_logs_sets check (
    cardinality(reps) between 1 and 10 and cardinality(weights) = cardinality(reps)
    and array_position(weights, null) is null and array_position(reps, null) is null),
  constraint workout_logs_ranges check (0 <= all (weights) and 500 >= all (weights) and 1 <= all (reps) and 300 >= all (reps))
);
create index if not exists workout_logs_user_idx on public.workout_logs (user_id, performed_on desc, id desc);
create index if not exists workout_logs_user_ex_idx on public.workout_logs (user_id, exercise, performed_on desc);

-- 날짜 범위 · 하루 건수 확인 (한국 날짜 기준)
create or replace function public.workout_logs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if new.performed_on > public.kst_today() or new.performed_on < public.kst_today() - 60 then
    raise exception 'invalid_date';
  end if;
  perform pg_advisory_xact_lock(hashtext('workout:' || new.user_id::text));
  if (select count(*) from public.workout_logs where user_id = new.user_id and created_at > now() - interval '1 day') >= 60 then
    raise exception 'too_many_logs';
  end if;
  return new;
end;
$$;
drop trigger if exists workout_logs_guard on public.workout_logs;
create trigger workout_logs_guard before insert on public.workout_logs
  for each row execute function public.workout_logs_guard();
revoke all on function public.workout_logs_guard() from public, anon, authenticated;

alter table public.workout_logs enable row level security;
drop policy if exists "workout_logs_read_own" on public.workout_logs;
create policy "workout_logs_read_own" on public.workout_logs
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "workout_logs_insert_own" on public.workout_logs;
create policy "workout_logs_insert_own" on public.workout_logs
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "workout_logs_delete_own" on public.workout_logs;
create policy "workout_logs_delete_own" on public.workout_logs
  for delete to authenticated using (auth.uid() = user_id);
-- 수정 정책 없음 → 고칠 땐 지우고 다시 기록

revoke all on table public.workout_logs from anon;
revoke update on table public.workout_logs from authenticated;
grant select, insert, delete on table public.workout_logs to authenticated;

commit;

notify pgrst, 'reload schema';
