-- 2단계: profiles 확장 + 가입 자동화 + role 보호.
-- Supabase 대시보드 -> SQL Editor -> New query -> 이 파일 전체를 붙여넣고 Run.
-- 이 파일은 재실행해도 안전하게 만들어져 있습니다 (idempotent).

-- 0. 혹시 supabase/schema.sql을 아직 실행 안 했을 경우를 대비한 안전장치.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 1. 새 컬럼: 연락처, 권한(role), 운동 경험 수준, 운동 목표.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists role text not null default 'member';
alter table public.profiles add column if not exists experience_level text;
alter table public.profiles add column if not exists fitness_goal text;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('member', 'admin'));

alter table public.profiles drop constraint if exists profiles_experience_check;
alter table public.profiles add constraint profiles_experience_check
  check (experience_level is null or experience_level in ('beginner', 'intermediate', 'advanced'));

-- 2. 가입 시 profiles 행 자동 생성. 프론트에서 signUp(options.data)로 넘긴
-- 값을 auth.users.raw_user_meta_data에서 읽어와 그대로 옮겨 심는다. 이제
-- 프론트 코드가 따로 profiles에 insert하지 않아도 항상 생성된다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, first_name, last_name, university, date_of_birth,
    phone, experience_level, fitness_goal
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'university',
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'experience_level',
    new.raw_user_meta_data ->> 'fitness_goal'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. role은 본인이 직접 못 바꾸게 차단. 다른 사람 role을 바꾸는 관리자
-- 동작은 막지 않는다 (old.id <> 자신의 uid일 때는 통과).
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() = old.id then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- 4. 관리자는 모든 프로필을 조회할 수 있도록 (4단계 회원 관리 페이지에서 사용).
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 5. 본인 계정을 관리자로 지정하려면, 이메일만 바꿔서 아래를 따로 실행하세요.
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'YOUR-EMAIL@EXAMPLE.COM');
