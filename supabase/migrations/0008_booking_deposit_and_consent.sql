-- Stores the concise reservation deposit acknowledgement and optional media
-- consent captured before a PT booking is created.
begin;

alter table public.bookings add column if not exists deposit_amount integer not null default 10000;
alter table public.bookings add column if not exists deposit_status text not null default 'pending';
alter table public.bookings add column if not exists deposit_policy_agreed_at timestamptz;
alter table public.bookings add column if not exists photo_consent boolean not null default false;
alter table public.bookings add column if not exists photo_consent_at timestamptz;

alter table public.bookings drop constraint if exists bookings_deposit_amount_check;
alter table public.bookings add constraint bookings_deposit_amount_check
  check (deposit_amount = 10000);

alter table public.bookings drop constraint if exists bookings_deposit_status_check;
alter table public.bookings add constraint bookings_deposit_status_check
  check (deposit_status in ('pending', 'paid', 'refunded', 'forfeited'));

commit;
