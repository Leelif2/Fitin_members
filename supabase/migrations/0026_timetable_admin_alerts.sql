-- 0026 — 회원 시간표 관리자 보기 + 알림 (2026-11-04)
-- 목적: 회원이 루틴 페이지에서 시간표 사진을 올리고 "루틴 만들기"를 누르면(routine_plans 저장)
--   * 관리자 페이지에 알림이 생긴다 (같은 회원이 여러 번 올려도 확인 전에는 1건으로 묶임)
--   * 관리자는 회원별 최신 시간표(사진에서 읽은 수업 목록)와 공강·추천 루틴을 볼 수 있다
--   * 사진 원본은 지금처럼 저장하지 않는다 (0007)
-- 0007, 0015, 0024를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run.
-- "Potential issue detected" 창이 뜨면 "Run and enable RLS". 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 알림에 "어느 회원의 시간표인지" 칸
-- =====================================================================
alter table public.admin_alerts
  add column if not exists member_user_id uuid references auth.users (id) on delete cascade;

-- 확인 안 한 시간표 알림은 회원당 1건
create unique index if not exists admin_alerts_one_open_timetable
  on public.admin_alerts (member_user_id)
  where kind = 'timetable' and resolved_at is null;

-- =====================================================================
-- 2. 시간표가 저장되면 알림 만들기 (이미 확인 전 알림이 있으면 시각·문구만 새로)
-- =====================================================================
create or replace function public.notify_admin_timetable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_count int := coalesce(jsonb_array_length(new.classes), 0);
begin
  select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), nickname, '회원')
    into v_name
  from public.profiles where id = new.user_id;
  v_name := coalesce(v_name, '회원');

  update public.admin_alerts
  set created_at = now(),
      message_ko = format('%s님이 시간표를 올렸어요 (수업 %s개). 회원 시간표에서 확인해 주세요.', v_name, v_count),
      message_en = format('%s uploaded a timetable (%s classes). Check it in Timetables.', v_name, v_count)
  where kind = 'timetable' and member_user_id = new.user_id and resolved_at is null;

  if not found then
    insert into public.admin_alerts (kind, member_user_id, message_ko, message_en)
    values ('timetable', new.user_id,
            format('%s님이 시간표를 올렸어요 (수업 %s개). 회원 시간표에서 확인해 주세요.', v_name, v_count),
            format('%s uploaded a timetable (%s classes). Check it in Timetables.', v_name, v_count));
  end if;
  return new;
exception when others then
  return new; -- 알림이 실패해도 회원의 루틴 저장은 그대로
end;
$$;

drop trigger if exists routine_plans_notify_admin on public.routine_plans;
create trigger routine_plans_notify_admin
  after insert on public.routine_plans
  for each row execute function public.notify_admin_timetable();

revoke all on function public.notify_admin_timetable() from public, anon, authenticated;

-- =====================================================================
-- 3. 관리자용: 회원별 가장 최근 시간표 목록
-- =====================================================================
create or replace function public.admin_member_timetables()
returns table (
  user_id uuid, first_name text, last_name text, nickname text, university text, gender text,
  classes jsonb, preferences jsonb, plan jsonb, uploaded_at timestamptz, upload_count int, is_new boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
  select distinct on (r.user_id)
    r.user_id, p.first_name, p.last_name, p.nickname, p.university, p.gender,
    r.classes, r.preferences, r.plan, r.created_at,
    (select count(*)::int from public.routine_plans r2 where r2.user_id = r.user_id),
    exists (select 1 from public.admin_alerts a
            where a.kind = 'timetable' and a.member_user_id = r.user_id and a.resolved_at is null)
  from public.routine_plans r
  join public.profiles p on p.id = r.user_id
  order by r.user_id, r.created_at desc;
end;
$$;

-- 관리자용: 그 회원의 시간표 알림 확인 처리
create or replace function public.admin_resolve_timetable_alert(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.admin_alerts set resolved_at = now()
  where kind = 'timetable' and member_user_id = p_user and resolved_at is null;
end;
$$;

revoke all on function public.admin_member_timetables() from public, anon;
revoke all on function public.admin_resolve_timetable_alert(uuid) from public, anon;
grant execute on function public.admin_member_timetables() to authenticated;
grant execute on function public.admin_resolve_timetable_alert(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
