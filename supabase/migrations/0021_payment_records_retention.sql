-- 0021 — 결제·입금 기록 5년 보관 (2026-11-01, 개인정보처리방침 "대금 결제·입금 및 환불 기록 5년"과 맞춤)
-- 근거: 「전자상거래 등에서의 소비자보호에 관한 법률」 — 대금 결제 및 재화 등의 공급에 관한 기록 5년
--   * 예전에는 회원 계정을 지우면 결제 기록(멤버십 회비 membership_payments, 1:1 PT 예약금 bookings)도 함께 지워졌다.
--   * 이제 계정을 지워도 결제 기록은 "누구인지(회원 연결)"만 지우고 날짜·금액·입금 상태·구매 항목은 남긴다.
--   * 탈퇴 시 아직 지나지 않은 1:1 PT 예약은 자동 취소해서 그 시간을 다시 연다.
--   * 회원 연결이 끊긴 결제 기록은 5년이 지나면 자동 삭제 (새 결제 기록이 생길 때 함께 정리, 별도 예약 작업 없음)
--   * 회원인 동안의 결제 기록은 지금처럼 계속 보관한다.
-- 0015·0020을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 멤버십 회비 (membership_payments)
-- =====================================================================
-- 무엇을 샀는지(요금제) 기록을 결제 행에 따로 남긴다 — 멤버십 행이 지워져도 남도록
alter table public.membership_payments add column if not exists plan_code text;
update public.membership_payments p
set plan_code = m.plan_code
from public.memberships m
where m.id = p.membership_id and p.plan_code is null;

create or replace function public.membership_payments_fill_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_code is null and new.membership_id is not null then
    select plan_code into new.plan_code from public.memberships where id = new.membership_id;
  end if;
  return new;
end;
$$;

drop trigger if exists membership_payments_fill_plan on public.membership_payments;
create trigger membership_payments_fill_plan
  before insert on public.membership_payments
  for each row execute function public.membership_payments_fill_plan();

-- 계정·멤버십이 지워져도 결제 행은 남기고 연결만 끊는다
alter table public.membership_payments alter column user_id drop not null;
alter table public.membership_payments alter column membership_id drop not null;
alter table public.membership_payments drop constraint if exists membership_payments_user_id_fkey;
alter table public.membership_payments
  add constraint membership_payments_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
alter table public.membership_payments drop constraint if exists membership_payments_membership_id_fkey;
alter table public.membership_payments
  add constraint membership_payments_membership_id_fkey
  foreign key (membership_id) references public.memberships (id) on delete set null;

-- =====================================================================
-- 2. 1:1 PT 예약금 (bookings)
-- =====================================================================
alter table public.bookings alter column user_id drop not null;
alter table public.bookings drop constraint if exists bookings_user_id_fkey;
alter table public.bookings
  add constraint bookings_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- 탈퇴로 회원 연결이 끊길 때, 아직 시작 전인 예약은 취소 처리 → 그 시간이 다시 열린다
create or replace function public.bookings_on_member_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is not null and new.user_id is null and new.cancelled_at is null
     and exists (select 1 from public.pt_slots s where s.id = new.slot_id and s.starts_at > now()) then
    new.cancelled_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_member_removed on public.bookings;
create trigger bookings_member_removed
  before update of user_id on public.bookings
  for each row execute function public.bookings_on_member_removed();

-- =====================================================================
-- 3. 회원 연결이 끊긴 결제 기록은 5년 뒤 자동 삭제
-- =====================================================================
create or replace function public.purge_old_payment_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.membership_payments
  where user_id is null and coalesce(paid_at, due_on::timestamptz) < now() - interval '5 years';
  delete from public.bookings
  where user_id is null and created_at < now() - interval '5 years';
  return null;
end;
$$;

drop trigger if exists membership_payments_purge_old on public.membership_payments;
create trigger membership_payments_purge_old
  after insert on public.membership_payments
  for each statement execute function public.purge_old_payment_records();

drop trigger if exists bookings_purge_old on public.bookings;
create trigger bookings_purge_old
  after insert on public.bookings
  for each statement execute function public.purge_old_payment_records();

do $$
declare f text;
begin
  foreach f in array array['public.membership_payments_fill_plan()', 'public.bookings_on_member_removed()', 'public.purge_old_payment_records()']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
