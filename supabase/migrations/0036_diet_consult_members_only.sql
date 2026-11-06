-- 0036 — 식단 상담은 멤버십 회원 전용 (2026-11-07 사용자 결정)
--   * 이용 중인(입금 확인된) 멤버십이 있는 회원만 식단 상담을 보낼 수 있다. 관리자는 예외.
--   * 멤버십이 없으면 'membership_required' → 화면이 얼리버드 멤버십 안내를 보여준다.
--   * 신청만 하고 입금 전이면 'membership_pending' → "입금이 확인되면 보낼 수 있어요" 안내.
--   * 그 밖의 규칙(승인 회원, 인스타 형식, 알레르기 동의, 다시 보내면 같은 행)은 0030과 같다.
-- 0015, 0030을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- 지금 회원이 식단 상담을 받을 수 있는지: 'ok' | 'membership_pending' | 'membership_required'
create or replace function public.diet_access()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then 'ok'
    when (public.current_membership(auth.uid())).status = 'active' then 'ok'
    when (public.current_membership(auth.uid())).status = 'pending' then 'membership_pending'
    else 'membership_required'
  end;
$$;
revoke all on function public.diet_access() from public, anon;
grant execute on function public.diet_access() to authenticated;

create or replace function public.submit_diet_consult(
  p_goal text, p_meals int, p_cafeteria text, p_budget int,
  p_avoid text, p_health_consent boolean, p_instagram text, p_message text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ig text := nullif(btrim(regexp_replace(coalesce(p_instagram, ''), '^@', '')), '');
  v_avoid text := nullif(btrim(coalesce(p_avoid, '')), '');
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_access text;
  v_id bigint;
  v_name text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not public.is_live_member() then raise exception 'verification_required'; end if;
  v_access := public.diet_access();
  if v_access <> 'ok' then raise exception '%', v_access; end if;
  if v_ig is null or v_ig !~ '^[A-Za-z0-9._]{1,30}$' then raise exception 'instagram_invalid'; end if;
  if v_avoid is not null and not coalesce(p_health_consent, false) then raise exception 'consent_required'; end if;

  perform pg_advisory_xact_lock(hashtext('diet:' || v_uid::text));
  select id into v_id from public.diet_consults where user_id = v_uid and status = 'new' order by id desc limit 1;
  if v_id is null then
    insert into public.diet_consults (user_id, goal, meals_per_day, cafeteria, budget, avoid_foods, health_consent, instagram, message)
    values (v_uid, p_goal, p_meals, p_cafeteria, p_budget, v_avoid, coalesce(p_health_consent, false) and v_avoid is not null, v_ig, v_msg)
    returning id into v_id;
  else
    update public.diet_consults
    set goal = p_goal, meals_per_day = p_meals, cafeteria = p_cafeteria, budget = p_budget,
        avoid_foods = v_avoid, health_consent = coalesce(p_health_consent, false) and v_avoid is not null,
        instagram = v_ig, message = v_msg, updated_at = now()
    where id = v_id;
  end if;

  select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), nickname, '회원') into v_name
  from public.profiles where id = v_uid;
  update public.admin_alerts
  set created_at = now(),
      message_ko = format('%s님이 식단 상담을 신청했어요 (인스타 @%s).', coalesce(v_name, '회원'), v_ig),
      message_en = format('%s asked for a diet consultation (Instagram @%s).', coalesce(v_name, 'A member'), v_ig)
  where kind = 'diet' and member_user_id = v_uid and resolved_at is null;
  if not found then
    insert into public.admin_alerts (kind, member_user_id, message_ko, message_en)
    values ('diet', v_uid,
            format('%s님이 식단 상담을 신청했어요 (인스타 @%s).', coalesce(v_name, '회원'), v_ig),
            format('%s asked for a diet consultation (Instagram @%s).', coalesce(v_name, 'A member'), v_ig));
  end if;
  return v_id;
end;
$$;
revoke all on function public.submit_diet_consult(text, int, text, int, text, boolean, text, text) from public, anon;
grant execute on function public.submit_diet_consult(text, int, text, int, text, boolean, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
