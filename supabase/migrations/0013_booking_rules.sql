-- 0013 — PT 예약 규칙 변경 (2026-10-30 사용자 결정)
--   * 월~금만, 17:00~22:00 (17·18·19·20·21시 시작, 1시간)
--   * 예약 가능 기간: 이번 주 + 다음 주 (한국시간, 월요일 시작 기준)
--   * 취소: 세션 시작 24시간 전까지만 (이후에는 취소 불가)
-- 0006(pt_slots/bookings), 0008(예약금·동의), 0009(관리자)를 그대로 두고 규칙만 바꾼다.
-- Supabase 대시보드 → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- 1. 시간 칸 자동 생성: 이번 주 + 다음 주의 월~금 17~21시 칸을 (없을 때만) 만든다.
--    0006은 12월 초까지만 칸을 만들어 두었기 때문에, 예약 화면이 열릴 때마다 이 함수를 불러
--    항상 2주치 칸이 있게 한다. 정해진 시간표만 만들 수 있어서 회원이 불러도 안전하다.
create or replace function public.ensure_pt_slots()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.pt_slots (starts_at, ends_at, trainer)
  select
    (day_value + make_interval(hours => hour_value)) at time zone 'Asia/Seoul',
    (day_value + make_interval(hours => hour_value + 1)) at time zone 'Asia/Seoul',
    'Fitin Trainer'
  from (
    select (date_trunc('week', now() at time zone 'Asia/Seoul')::date + day_offset) as day_value
    from generate_series(0, 13) as day_offset
  ) as days
  cross join (values (17), (18), (19), (20), (21)) as hours(hour_value)
  where extract(isodow from day_value) between 1 and 5
  on conflict (starts_at) do nothing;
$$;

revoke all on function public.ensure_pt_slots() from public, anon;
grant execute on function public.ensure_pt_slots() to authenticated;

select public.ensure_pt_slots();

-- 2. 회원에게 보이는 칸: 월~금, 17~21시 시작만 (주말·다른 시간 칸은 남아 있어도 숨김)
create or replace view public.pt_slots_public as
select
  s.id,
  s.starts_at,
  s.ends_at,
  s.trainer,
  public.slot_is_booked(s.id) as is_booked
from public.pt_slots s
where extract(isodow from s.starts_at at time zone 'Asia/Seoul') between 1 and 5
  and extract(hour from s.starts_at at time zone 'Asia/Seoul') between 17 and 21
order by s.starts_at;

grant select on public.pt_slots_public to authenticated;

-- 3. 예약 저장 전 검사 (화면을 조작해도 DB가 막는다). 기존 주 1회 제한은 그대로 유지.
create or replace function public.enforce_weekly_booking_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_week date;
  target_start timestamptz;
  current_week date := date_trunc('week', now() at time zone 'Asia/Seoul')::date;
begin
  select
    date_trunc('week', starts_at at time zone 'Asia/Seoul')::date,
    starts_at
  into target_week, target_start
  from public.pt_slots
  where id = new.slot_id;

  if target_week is null or target_start is null then
    raise exception 'The selected PT slot does not exist.' using errcode = 'P0001';
  end if;

  if target_start <= now()
    or extract(isodow from target_start at time zone 'Asia/Seoul') not between 1 and 5
    or extract(hour from target_start at time zone 'Asia/Seoul') not between 17 and 21 then
    raise exception 'The selected PT slot is not available.' using errcode = 'P0001';
  end if;

  if target_week > current_week + 7 then
    raise exception 'Only this week and next week can be booked.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || target_week::text));

  if exists (
    select 1
    from public.bookings b
    join public.pt_slots s on s.id = b.slot_id
    where b.user_id = new.user_id
      and date_trunc('week', s.starts_at at time zone 'Asia/Seoul')::date = target_week
  ) then
    raise exception 'Only one PT booking is allowed per week.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- 4. 취소는 본인 예약 + 시작 24시간 전까지만.
--    (pt_slots는 회원이 직접 못 읽으므로 security definer 함수로 시작 시각을 확인)
create or replace function public.booking_cancellable(p_slot_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pt_slots
    where id = p_slot_id and starts_at > now() + interval '24 hours'
  );
$$;

revoke all on function public.booking_cancellable(bigint) from public, anon;
grant execute on function public.booking_cancellable(bigint) to authenticated;

drop policy if exists "bookings_delete_own" on public.bookings;
create policy "bookings_delete_own" on public.bookings
  for delete using (auth.uid() = user_id and public.booking_cancellable(slot_id));

commit;

notify pgrst, 'reload schema';
