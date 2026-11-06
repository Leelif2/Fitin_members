-- 0031 — 4단계 회원정보 트래킹: 관리자 회원 목록·상세·메모 + 회원 탈퇴 (2026-11-06)
--   * 관리자 회원 목록: 이름·닉네임·이메일·학교·가입일·학생증 상태·마지막 로그인·PT 예약 수·멤버십 상태·인스타(식단 상담에 남긴 것)
--   * 회원 상세: 가입 정보 + 최근 로그인 기록 + PT 예약 + 멤버십·결제 + 식단 상담 + 시간표 + 관리자 메모를 한 번에
--   * 관리자 메모(member_notes): 관리자만 읽기·쓰기
--   * 회원 탈퇴는 서버(api/delete-account.js)가 계정을 지운다 → 연결된 데이터는 DB 규칙대로 함께 삭제
--     (결제 기록만 0021 규칙으로 이름 없이 5년 보관). 이용 중 멤버십이 있어도 탈퇴 가능(환불 없음 안내, 사용자 결정)
-- 0015, 0023, 0025, 0026, 0030을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run.
-- "Potential issue detected" 창이 뜨면 "Run and enable RLS". 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 관리자 메모
-- =====================================================================
create table if not exists public.member_notes (
  id bigint generated always as identity primary key,
  member_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists member_notes_member_idx on public.member_notes (member_id, created_at desc);

alter table public.member_notes enable row level security;
drop policy if exists "member_notes_admin" on public.member_notes;
create policy "member_notes_admin" on public.member_notes
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.member_notes from anon;

-- 메모 쓴 사람은 항상 지금 로그인한 관리자로
create or replace function public.member_notes_set_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_id := auth.uid();
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists member_notes_set_author on public.member_notes;
create trigger member_notes_set_author
  before insert on public.member_notes
  for each row execute function public.member_notes_set_author();
revoke all on function public.member_notes_set_author() from public, anon, authenticated;

-- =====================================================================
-- 2. 관리자: 회원 목록
-- =====================================================================
create or replace function public.admin_member_list()
returns table (
  id uuid, email text, first_name text, last_name text, nickname text, university text, gender text,
  student_no text, verify_status text, role text, created_at timestamptz,
  last_login timestamptz, booking_count int, membership_status text, membership_plan text, instagram text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
  select p.id, u.email::text, p.first_name, p.last_name, p.nickname, p.university, p.gender,
         p.student_no, p.verify_status, p.role, p.created_at,
         (select max(l.created_at) from public.login_events l where l.user_id = p.id and l.event_type = 'login'),
         (select count(*)::int from public.bookings b where b.user_id = p.id and b.cancelled_at is null),
         m.status, m.plan_code,
         (select d.instagram from public.diet_consults d where d.user_id = p.id order by d.created_at desc limit 1)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select ms.status, ms.plan_code from public.memberships ms
    where ms.user_id = p.id and ms.status <> 'cancelled'
    order by ms.created_at desc limit 1
  ) m on true
  order by p.created_at desc
  limit 2000;
end;
$$;

-- =====================================================================
-- 3. 관리자: 회원 상세 (한 번에)
-- =====================================================================
create or replace function public.admin_member_detail(p_user uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out json;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_found'; end if;
  select json_build_object(
    'profile', (select json_build_object(
        'id', p.id, 'email', u.email, 'first_name', p.first_name, 'last_name', p.last_name, 'nickname', p.nickname,
        'university', p.university, 'gender', p.gender, 'student_no', p.student_no, 'verify_status', p.verify_status,
        'verified_at', p.verified_at, 'role', p.role, 'created_at', p.created_at, 'show_presence', p.show_presence,
        'last_sign_in_at', u.last_sign_in_at)
      from public.profiles p join auth.users u on u.id = p.id where p.id = p_user),
    'logins', coalesce((select json_agg(x order by x.created_at desc) from (
        select l.event_type, l.device, l.ip_address, l.created_at
        from public.login_events l where l.user_id = p_user
        order by l.created_at desc limit 30) x), '[]'::json),
    'bookings', coalesce((select json_agg(x order by x.starts_at desc) from (
        select b.id, s.starts_at, b.created_at, b.cancelled_at, b.deposit_status, b.attendance_status
        from public.bookings b join public.pt_slots s on s.id = b.slot_id
        where b.user_id = p_user
        order by s.starts_at desc limit 50) x), '[]'::json),
    'memberships', coalesce((select json_agg(x order by x.created_at desc) from (
        select ms.id, ms.plan_code, ms.status, ms.starts_on, ms.weeks, ms.created_at, ms.early_bird,
               c.name_ko as class_ko, c.name_en as class_en,
               (select coalesce(json_agg(json_build_object('no', mp.installment_no, 'amount', mp.amount, 'status', mp.status) order by mp.installment_no), '[]'::json)
                  from public.membership_payments mp where mp.membership_id = ms.id) as payments
        from public.memberships ms left join public.pt_classes c on c.id = ms.class_id
        where ms.user_id = p_user
        order by ms.created_at desc limit 20) x), '[]'::json),
    'diet', coalesce((select json_agg(x order by x.created_at desc) from (
        select d.goal, d.instagram, d.status, d.created_at from public.diet_consults d
        where d.user_id = p_user order by d.created_at desc limit 10) x), '[]'::json),
    'timetable_uploaded_at', (select max(r.created_at) from public.routine_plans r where r.user_id = p_user),
    'notes', coalesce((select json_agg(x order by x.created_at desc) from (
        select n.id, n.body, n.created_at,
               coalesce(nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), ''), a.nickname, '관리자') as author
        from public.member_notes n left join public.profiles a on a.id = n.author_id
        where n.member_id = p_user order by n.created_at desc limit 100) x), '[]'::json)
  ) into v_out;
  return v_out;
end;
$$;

-- =====================================================================
-- 4. 회원: 탈퇴 전에 보여줄 정보 (이용 중 멤버십이 있는지)
-- =====================================================================
create or replace function public.my_withdrawal_info()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'is_admin', public.is_admin(),
    'active_membership', exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.status = 'active'
        and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today()),
    'pending_membership', exists (
      select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'pending'),
    'upcoming_bookings', (select count(*)::int from public.bookings b join public.pt_slots s on s.id = b.slot_id
                          where b.user_id = auth.uid() and b.cancelled_at is null and s.starts_at > now())
  );
$$;

revoke all on function public.admin_member_list() from public, anon;
revoke all on function public.admin_member_detail(uuid) from public, anon;
revoke all on function public.my_withdrawal_info() from public, anon;
grant execute on function public.admin_member_list() to authenticated;
grant execute on function public.admin_member_detail(uuid) to authenticated;
grant execute on function public.my_withdrawal_info() to authenticated;

commit;

notify pgrst, 'reload schema';
