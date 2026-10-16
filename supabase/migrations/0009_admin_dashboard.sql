-- Gives administrators an operational PT dashboard without widening what
-- ordinary members can read or change.
begin;

alter table public.bookings add column if not exists attendance_status text not null default 'scheduled';
alter table public.bookings add column if not exists attended_at timestamptz;

alter table public.bookings drop constraint if exists bookings_attendance_status_check;
alter table public.bookings add constraint bookings_attendance_status_check
  check (attendance_status in ('scheduled', 'attended', 'no_show'));

drop policy if exists "bookings_select_admin" on public.bookings;
create policy "bookings_select_admin" on public.bookings
  for select using (public.is_admin());

drop policy if exists "bookings_update_admin" on public.bookings;
create policy "bookings_update_admin" on public.bookings
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pt_slots_select_admin" on public.pt_slots;
create policy "pt_slots_select_admin" on public.pt_slots
  for select using (public.is_admin());

commit;

-- Makes the new columns and policies available to Supabase's API immediately.
notify pgrst, 'reload schema';
