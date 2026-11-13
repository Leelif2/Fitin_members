-- Apply after schema.sql and 0001. A signed-in member may recreate a missing
-- profile row for themselves, but may never choose the admin role on INSERT.
-- Existing UPDATE role protection remains in profiles_protect_role.
begin;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id and role = 'member');

commit;
notify pgrst, 'reload schema';
