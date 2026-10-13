-- Run after schema.sql and 0001_profiles_role_and_trigger.sql.
-- Gender is also retained in Auth user metadata before this migration runs.
begin;

alter table public.profiles add column if not exists gender text;
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female', 'undisclosed'));

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

update public.profiles p
set gender = u.raw_user_meta_data ->> 'gender'
from auth.users u
where p.id = u.id and p.gender is null
  and u.raw_user_meta_data ->> 'gender' in ('male', 'female', 'undisclosed');

commit;
