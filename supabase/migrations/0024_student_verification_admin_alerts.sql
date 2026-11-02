-- 0024 - 학생증 제출 관리자 알림 (2026-11-02)
-- 0023_student_id_verification.sql와 0015_membership.sql을 실행한 뒤 실행한다.
-- 학생증 제출 시 모든 관리자에게 보이는 운영 알림을 만들고, 관리자 한 명이
-- 승인 또는 거절하면 같은 신청의 알림을 자동으로 종료한다.
begin;

do $$
begin
  if to_regclass('public.admin_alerts') is null then
    raise exception 'admin_alerts_missing: run 0015_membership.sql first';
  end if;
end;
$$;

alter table public.admin_alerts
  add column if not exists verification_user_id uuid references auth.users (id) on delete cascade;

-- 같은 신청이 미확인 알림으로 여러 번 쌓이지 않도록 한다.
create unique index if not exists admin_alerts_one_open_student_verification
  on public.admin_alerts (verification_user_id)
  where kind = 'student_verification' and resolved_at is null;

-- 학번 + 사진 제출 -> 확인 대기 + 관리자 알림 생성
create or replace function public.submit_student_id(p_university text, p_student_no text, p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_no text := public.normalize_student_no(p_student_no);
  v_name text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select verify_status into v_status from public.profiles where id = v_uid for update;
  if v_status is null then raise exception 'not_signed_in'; end if;
  if v_status = 'approved' then raise exception 'already_approved'; end if;
  if v_status = 'pending' then raise exception 'already_submitted'; end if;
  if coalesce(btrim(p_university), '') = '' then raise exception 'school_required'; end if;
  if v_no is null or length(v_no) < 4 or length(v_no) > 20 then raise exception 'invalid_student_no'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> v_uid::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'student-ids' and o.name = p_path) then
    raise exception 'photo_required';
  end if;

  perform set_config('fitin.verify_rpc', 'on', true);
  begin
    update public.profiles
    set university = btrim(p_university),
        student_no = v_no,
        verify_status = 'pending',
        verify_note = null,
        verify_submitted_at = now(),
        id_card_path = p_path
    where id = v_uid;
  exception when unique_violation then
    perform set_config('fitin.verify_rpc', '', true);
    raise exception 'student_no_taken';
  end;
  perform set_config('fitin.verify_rpc', '', true);

  select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), '새 회원')
    into v_name
  from public.profiles
  where id = v_uid;

  insert into public.admin_alerts (kind, verification_user_id, message_ko, message_en)
  values (
    'student_verification',
    v_uid,
    format('%s님의 학생증 확인 신청이 도착했습니다. 가입 승인에서 확인해 주세요.', v_name),
    format('Student ID submitted by %s. Review it in Sign-up approval.', v_name)
  );

  return 'pending';
end;
$$;

-- 사진을 지운 뒤 한 명의 관리자가 승인 또는 거절하면, 모든 관리자가 공유하던
-- 해당 신청 알림도 끝낸다. 행 잠금으로 동시에 처리해도 하나만 성공한다.
create or replace function public.admin_review_verification(p_user uuid, p_approve boolean, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select verify_status into v_status from public.profiles where id = p_user for update;
  if v_status is null then raise exception 'not_found'; end if;
  if v_status <> 'pending' then raise exception 'not_pending'; end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'student-ids' and split_part(o.name, '/', 1) = p_user::text) then
    raise exception 'photo_not_deleted';
  end if;

  update public.profiles
  set verify_status = case when p_approve then 'approved' else 'rejected' end,
      verify_note = case when p_approve then null else nullif(btrim(coalesce(p_note, '')), '') end,
      verified_at = now(),
      verified_by = auth.uid(),
      id_card_path = null
  where id = p_user;

  update public.admin_alerts
  set resolved_at = now()
  where kind = 'student_verification'
    and verification_user_id = p_user
    and resolved_at is null;

  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

revoke all on function public.submit_student_id(text, text, text) from public, anon;
revoke all on function public.admin_review_verification(uuid, boolean, text) from public, anon;
grant execute on function public.submit_student_id(text, text, text) to authenticated;
grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;

commit;

notify pgrst, 'reload schema';
