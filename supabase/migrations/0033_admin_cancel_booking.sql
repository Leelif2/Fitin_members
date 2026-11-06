-- 0033 — 7단계 관리자 예약 취소 (2026-11-06 사용자 결정: 선착순 즉시 확정 유지 + 관리자 취소)
--   * 예약은 지금처럼 선착순으로 바로 확정. 같은 시간 중복 예약은 0014의 부분 유니크 인덱스(취소 안 된 예약 1개)가 DB에서 막는다.
--   * 관리자는 사유를 적고 예약을 취소할 수 있다 → 그 시간이 다시 열린다(취소된 예약은 유니크 대상이 아님).
--   * 누가 취소했는지(회원/관리자)와 사유를 남긴다. 회원에게 가는 알림은 8단계(0034).
-- 0014를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

alter table public.bookings add column if not exists cancelled_by text;
alter table public.bookings add column if not exists cancel_reason text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_cancelled_by_check') then
    alter table public.bookings add constraint bookings_cancelled_by_check check (cancelled_by is null or cancelled_by in ('member', 'admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_cancel_reason_len') then
    alter table public.bookings add constraint bookings_cancel_reason_len check (cancel_reason is null or char_length(cancel_reason) <= 200);
  end if;
end;
$$;

-- 취소될 때 누가 취소했는지 자동으로 (회원이 cancel_booking으로 취소하면 'member')
create or replace function public.bookings_mark_canceller()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cancelled_at is not null and old.cancelled_at is null and new.cancelled_by is null then
    new.cancelled_by := case when public.is_admin() then 'admin' else 'member' end;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_mark_canceller on public.bookings;
create trigger bookings_mark_canceller
  before update of cancelled_at on public.bookings
  for each row execute function public.bookings_mark_canceller();
revoke all on function public.bookings_mark_canceller() from public, anon, authenticated;

-- 관리자 취소 (사유 필수). 시작 시간과 관계없이 가능
create or replace function public.admin_cancel_booking(p_booking_id bigint, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_at timestamptz;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if v_reason is null then raise exception 'reason_required'; end if;
  if char_length(v_reason) > 200 then raise exception 'reason_too_long'; end if;
  update public.bookings
  set cancelled_at = now(), cancelled_by = 'admin', cancel_reason = v_reason
  where id = p_booking_id and cancelled_at is null
  returning cancelled_at into v_at;
  if v_at is null then raise exception 'not_found_or_cancelled'; end if;
  return v_at;
end;
$$;
revoke all on function public.admin_cancel_booking(bigint, text) from public, anon;
grant execute on function public.admin_cancel_booking(bigint, text) to authenticated;

commit;

notify pgrst, 'reload schema';
