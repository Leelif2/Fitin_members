-- Repairs the profiles table and signup trigger when earlier migrations were
-- run out of order. Run this whole file in Supabase SQL Editor, then retry
-- signup with a new email address.
begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists university text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists experience_level text;
alter table public.profiles add column if not exists fitness_goal text;
alter table public.profiles add column if not exists gender text;
alter table public.profiles drop column if exists full_name;

update public.profiles set role = 'member' where role is null;
alter table public.profiles alter column role set default 'member';
alter table public.profiles alter column role set not null;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('member', 'admin'));

alter table public.profiles drop constraint if exists profiles_experience_check;
alter table public.profiles add constraint profiles_experience_check
  check (experience_level is null or experience_level in ('beginner', 'intermediate', 'advanced'));

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female', 'undisclosed'));

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, first_name, last_name, university, date_of_birth,
    phone, experience_level, fitness_goal, gender
  ) values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'university',
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'experience_level',
    new.raw_user_meta_data ->> 'fitness_goal',
    new.raw_user_meta_data ->> 'gender'
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
