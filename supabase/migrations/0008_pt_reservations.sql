-- 0008 — 선착순 PT 예약 (월~금 17:00~22:00, 1시간 세션, 학생 1명 주 1회)
-- Supabase 대시보드 → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run.
-- 여러 번 실행해도 안전하게 작성됨.
--
-- 규칙 (화면이 아니라 DB가 보장):
--   * 같은 날짜·시간에 확정(confirmed) 예약은 1개만 → 동시에 눌러도 먼저 저장된 1명만 성공
--   * 학생 1명당 한 주(월~일)에 확정 예약 1개만
--   * 월~금, 17·18·19·20·21시 시작, 1시간
--   * "이번 주"만 예약 가능 — 매주 일요일 08:00(KST)에 다음 주로 넘어감 (booking.html과 동일)
--   * 이미 지난 시간은 예약 불가, 취소는 시작 24시간 전까지
-- 예약·취소는 아래 두 함수(book_pt_session / cancel_pt_reservation)로만 가능하다.
-- 테이블에는 insert/update/delete 정책이 없어서 클라이언트가 직접 쓸 수 없다.

-- 1. 테이블 ------------------------------------------------------------------
create table if not exists public.pt_reservations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reservation_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  memo text check (memo is null or char_length(memo) <= 500),
  -- 학생별 "주 1회" 제한에 쓰는 그 주의 월요일 (자동 계산)
  week_start date generated always as ((date_trunc('week', reservation_date::timestamp))::date) stored,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  constraint pt_reservations_weekday check (extract(isodow from reservation_date) between 1 and 5),
  constraint pt_reservations_hours check (
    start_time in ('17:00', '18:00', '19:00', '20:00', '21:00')
    and end_time = start_time + interval '1 hour'
  )
);

-- 같은 시간대에 확정 예약은 하나만 (선착순 차단의 핵심)
create unique index if not exists pt_reservations_one_per_slot
  on public.pt_reservations (reservation_date, start_time)
  where status = 'confirmed';

-- 학생 1명당 주 1회
create unique index if not exists pt_reservations_one_per_week
  on public.pt_reservations (user_id, week_start)
  where status = 'confirmed';

create index if not exists pt_reservations_user_date_idx
  on public.pt_reservations (user_id, reservation_date desc);

-- 2. RLS: 본인 예약만 조회, 관리자는 전체 조회. 쓰기는 함수 전용. ------------------
alter table public.pt_reservations enable row level security;

drop policy if exists "pt_reservations_select_own" on public.pt_reservations;
create policy "pt_reservations_select_own" on public.pt_reservations
  for select using (auth.uid() = user_id);

drop policy if exists "pt_reservations_select_admin" on public.pt_reservations;
create policy "pt_reservations_select_admin" on public.pt_reservations
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 3. 지금 예약할 수 있는 주의 월요일 (일요일 08:00 KST에 다음 주로 넘어감) ------------
-- 일요일 08:00 + 16시간 = 월요일 00:00 이므로, 16시간을 더해서 그 주의 월요일을 구한다.
create or replace function public.pt_active_week_start()
returns date
language sql
stable
as $$
  select (date_trunc('week', (now() at time zone 'Asia/Seoul') + interval '16 hours'))::date;
$$;

grant execute on function public.pt_active_week_start() to anon, authenticated;

-- 4. 이번 주 마감된 시간 목록 — 누가 예약했는지는 절대 반환하지 않음 ----------------
create or replace function public.get_pt_taken_slots()
returns table (reservation_date date, start_time time)
language sql
stable
security definer
set search_path = public
as $$
  select r.reservation_date, r.start_time
  from public.pt_reservations r
  where r.status = 'confirmed'
    and r.reservation_date between public.pt_active_week_start()
                               and public.pt_active_week_start() + 4;
$$;

grant execute on function public.get_pt_taken_slots() to anon, authenticated;

-- 5. 예약하기 ------------------------------------------------------------------
-- 실패하면 아래 코드 중 하나를 에러 메시지로 돌려준다 (booking.html이 한국어/영어로 바꿔 보여줌):
--   not_signed_in / no_profile / invalid_slot / outside_week / past_slot / slot_taken / weekly_limit
create or replace function public.book_pt_session(p_date date, p_start time, p_memo text default null)
returns public.pt_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week date := public.pt_active_week_start();
  v_row public.pt_reservations;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  -- 회원가입한 학생만 (가입 트리거가 profiles 행을 만든다)
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'no_profile';
  end if;

  if p_date is null or p_start is null
     or extract(isodow from p_date) not between 1 and 5
     or p_start not in ('17:00', '18:00', '19:00', '20:00', '21:00') then
    raise exception 'invalid_slot';
  end if;

  if p_date not between v_week and v_week + 4 then
    raise exception 'outside_week';
  end if;

  if ((p_date + p_start) at time zone 'Asia/Seoul') <= now() then
    raise exception 'past_slot';
  end if;

  -- 같은 학생이 두 시간을 동시에 눌러도 순서대로 처리되도록
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if exists (
    select 1 from public.pt_reservations
    where user_id = v_uid and status = 'confirmed'
      and week_start = (date_trunc('week', p_date::timestamp))::date
  ) then
    raise exception 'weekly_limit';
  end if;

  begin
    insert into public.pt_reservations (user_id, reservation_date, start_time, end_time, status, memo, confirmed_at)
    values (v_uid, p_date, p_start, p_start + interval '1 hour', 'confirmed', nullif(trim(p_memo), ''), now())
    returning * into v_row;
  exception when unique_violation then
    -- 다른 학생이 한발 먼저 같은 시간을 예약한 경우 (유니크 인덱스가 막음)
    if exists (
      select 1 from public.pt_reservations
      where reservation_date = p_date and start_time = p_start and status = 'confirmed'
    ) then
      raise exception 'slot_taken';
    end if;
    raise exception 'weekly_limit';
  end;

  return v_row;
end;
$$;

revoke execute on function public.book_pt_session(date, time, text) from public, anon;
grant execute on function public.book_pt_session(date, time, text) to authenticated;

-- 6. 예약 취소 (본인 것만, 시작 24시간 전까지) -------------------------------------
-- 실패 코드: not_signed_in / not_found / too_late
create or replace function public.cancel_pt_reservation(p_id bigint)
returns public.pt_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.pt_reservations;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  select * into v_row from public.pt_reservations
  where id = p_id and user_id = v_uid and status = 'confirmed'
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if ((v_row.reservation_date + v_row.start_time) at time zone 'Asia/Seoul') - interval '24 hours' < now() then
    raise exception 'too_late';
  end if;

  update public.pt_reservations
  set status = 'cancelled', cancelled_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.cancel_pt_reservation(bigint) from public, anon;
grant execute on function public.cancel_pt_reservation(bigint) to authenticated;
