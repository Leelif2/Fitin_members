begin;

create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  attempted_email text,
  event_type text not null check (event_type in ('login', 'logout', 'login_failed', 'signup')),
  ip_address text,
  user_agent text,
  device text,
  created_at timestamptz not null default now()
);

alter table public.login_events enable row level security;

drop policy if exists "login_events_select_own" on public.login_events;
create policy "login_events_select_own" on public.login_events
  for select using (auth.uid() = user_id);

drop policy if exists "login_events_select_admin" on public.login_events;
create policy "login_events_select_admin" on public.login_events
  for select using (public.is_admin());

create index if not exists login_events_user_id_created_at_idx
  on public.login_events (user_id, created_at desc);

commit;

notify pgrst, 'reload schema';
