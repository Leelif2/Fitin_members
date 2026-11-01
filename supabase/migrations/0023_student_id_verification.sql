-- 0023 — 학생증 확인 후 가입 승인 (2026-11-01)
-- 목적: IGC 학생만 이용하도록, 그리고 다른 이메일로 같은 사람이 여러 계정을 만드는 것을 막기 위해
--   * 회원가입 때 학번 + 학생증 사진을 받는다. 관리자가 사진을 보고 승인하면 서비스를 쓸 수 있다.
--   * 같은 학교 + 같은 학번으로는 두 계정이 동시에 있을 수 없다 (거절된 계정은 제외).
--   * 학생증 사진은 비공개 저장소(student-ids)에 두고, 관리자가 승인·거절하는 즉시 삭제한다.
--     (사진이 남아 있으면 승인·거절 함수가 실행되지 않음 → 삭제를 잊을 수 없다)
--   * 이 SQL을 실행하기 전에 가입한 회원은 모두 "승인됨"으로 처리 (사용자 결정)
--   * 승인 전 회원은 PT 예약·멤버십·모임·이벤트·루틴 저장 등 모든 신청이 DB에서 막힌다.
-- 0005(is_admin)를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run.
-- "Potential issue detected" 창이 뜨면 "Run and enable RLS". 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 회원 프로필에 확인 상태 추가
--    none(사진 아직 안 냄) / pending(확인 대기) / approved(승인) / rejected(거절)
-- =====================================================================
alter table public.profiles add column if not exists student_no text;
alter table public.profiles add column if not exists verify_status text;
alter table public.profiles add column if not exists verify_note text;          -- 거절 사유
alter table public.profiles add column if not exists verify_submitted_at timestamptz;
alter table public.profiles add column if not exists verified_at timestamptz;
alter table public.profiles add column if not exists verified_by uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists id_card_path text;          -- 확인 대기 중일 때만 값이 있음

-- 기존 회원 자동 승인 (처음 실행할 때만 해당 — 그 뒤로는 빈 값이 없다)
update public.profiles set verify_status = 'approved', verified_at = now() where verify_status is null;
alter table public.profiles alter column verify_status set default 'none';
alter table public.profiles alter column verify_status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_verify_status_check') then
    alter table public.profiles add constraint profiles_verify_status_check
      check (verify_status in ('none', 'pending', 'approved', 'rejected'));
  end if;
end;
$$;

-- 학번은 공백·하이픈 등을 빼고 대문자로 맞춰서 저장 ("2023 1234" = "2023-1234" = "20231234")
create or replace function public.normalize_student_no(raw text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(raw, ''), '[^0-9A-Za-z]', '', 'g')), '');
$$;

-- 같은 학교 + 같은 학번은 한 계정만 (거절된 계정은 빼고 센다)
create unique index if not exists profiles_school_student_no_unique
  on public.profiles (lower(btrim(university)), student_no)
  where student_no is not null and verify_status <> 'rejected';

-- =====================================================================
-- 2. 가입 시 프로필 자동 생성 (0012와 같고 학번만 추가)
--    같은 학번이 이미 있으면 가입 자체가 실패한다 (화면에서 안내)
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, first_name, last_name, university, date_of_birth,
    phone, experience_level, fitness_goal, gender, student_no
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'university',
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'experience_level',
    new.raw_user_meta_data ->> 'fitness_goal',
    case when new.raw_user_meta_data ->> 'gender' in ('male', 'female')
         then new.raw_user_meta_data ->> 'gender' end,
    public.normalize_student_no(new.raw_user_meta_data ->> 'student_no')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =====================================================================
-- 3. 회원이 자기 확인 상태를 직접 바꾸지 못하게 (승인은 관리자만)
--    학번·사진 제출은 아래 submit_student_id 함수로만 가능
-- =====================================================================
create or replace function public.protect_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin()
     or coalesce(current_setting('fitin.verify_rpc', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verify_status := 'none';
    new.verify_note := null;
    new.verify_submitted_at := null;
    new.verified_at := null;
    new.verified_by := null;
    new.id_card_path := null;
    new.student_no := public.normalize_student_no(new.student_no);
  else
    new.verify_status := old.verify_status;
    new.verify_note := old.verify_note;
    new.verify_submitted_at := old.verify_submitted_at;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.id_card_path := old.id_card_path;
    new.student_no := old.student_no;
    -- 승인 뒤에는 학교도 본인이 못 바꾼다 (학번과 짝)
    if old.verify_status in ('pending', 'approved') then
      new.university := old.university;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_verification on public.profiles;
create trigger profiles_protect_verification
  before insert or update on public.profiles
  for each row execute function public.protect_profile_verification();

-- =====================================================================
-- 4. 학생증 사진 저장소 (비공개). 경로: <회원 id>/<시각>.jpg
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-ids', 'student-ids', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 회원: 사진을 아직 안 냈거나 거절됐을 때만 자기 폴더에 올리기 (보기·지우기 불가)
drop policy if exists "student_ids_member_upload" on storage.objects;
create policy "student_ids_member_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-ids'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.verify_status in ('none', 'rejected'))
  );

-- 회원: 제출 전(또는 거절 후)에만 자기 사진 지우기 — 사진은 올라갔는데 제출이 실패한 경우 정리용
-- (저장소 삭제 API는 지울 파일을 읽을 수 있어야 해서 같은 조건으로 읽기도 허용)
drop policy if exists "student_ids_member_cleanup_read" on storage.objects;
create policy "student_ids_member_cleanup_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-ids'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.verify_status in ('none', 'rejected'))
  );

drop policy if exists "student_ids_member_cleanup_delete" on storage.objects;
create policy "student_ids_member_cleanup_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-ids'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.verify_status in ('none', 'rejected'))
  );

-- 관리자: 보기(임시 링크)와 지우기
drop policy if exists "student_ids_admin_read" on storage.objects;
create policy "student_ids_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'student-ids' and public.is_admin());

drop policy if exists "student_ids_admin_delete" on storage.objects;
create policy "student_ids_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-ids' and public.is_admin());

-- =====================================================================
-- 5. 회원용 함수
-- =====================================================================
-- 내 확인 상태 (관리자는 항상 approved로 본다)
create or replace function public.my_verification()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'status', case when p.role = 'admin' then 'approved' else p.verify_status end,
    'note', p.verify_note,
    'university', p.university,
    'student_no', p.student_no,
    'submitted_at', p.verify_submitted_at
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

-- 학번 + 사진 제출 → 확인 대기
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
  return 'pending';
end;
$$;

-- =====================================================================
-- 6. 관리자용 함수
-- =====================================================================
-- 확인 대기 목록 (이메일 포함, 같은 학교·같은 이름의 기존 승인 회원 수 = 중복 의심 표시용)
create or replace function public.admin_pending_verifications()
returns table (
  id uuid, email text, first_name text, last_name text, university text, student_no text,
  gender text, created_at timestamptz, submitted_at timestamptz, id_card_path text, same_name_approved int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
  select p.id, u.email::text, p.first_name, p.last_name, p.university, p.student_no,
         p.gender, p.created_at, p.verify_submitted_at, p.id_card_path,
         (select count(*)::int from public.profiles q
           where q.id <> p.id and q.verify_status = 'approved'
             and lower(btrim(q.first_name)) = lower(btrim(p.first_name))
             and lower(btrim(coalesce(q.university, ''))) = lower(btrim(coalesce(p.university, ''))))
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.verify_status = 'pending'
  order by p.verify_submitted_at nulls last;
end;
$$;

-- 승인 / 거절. 그 회원의 학생증 사진을 저장소에서 먼저 지운 뒤에만 실행된다.
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
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

-- =====================================================================
-- 7. 승인 전에는 신청·예약을 못 하게 (화면을 거치지 않아도 DB가 막는다)
-- =====================================================================
create or replace function public.require_verified_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and verify_status = 'approved') then
    raise exception 'verification_required';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['bookings', 'memberships', 'meetups', 'meetup_members', 'event_registrations',
                           'makeup_bookings', 'class_waitlist', 'routine_plans']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_require_verified', t);
      execute format('create trigger %I before insert on public.%I for each row execute function public.require_verified_member()', t || '_require_verified', t);
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- 8. 함수 권한
-- =====================================================================
revoke all on function public.protect_profile_verification() from public, anon, authenticated;
revoke all on function public.require_verified_member() from public, anon, authenticated;
revoke all on function public.my_verification() from public, anon;
revoke all on function public.submit_student_id(text, text, text) from public, anon;
revoke all on function public.admin_pending_verifications() from public, anon;
revoke all on function public.admin_review_verification(uuid, boolean, text) from public, anon;
grant execute on function public.my_verification() to authenticated;
grant execute on function public.submit_student_id(text, text, text) to authenticated;
grant execute on function public.admin_pending_verifications() to authenticated;
grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;

commit;

notify pgrst, 'reload schema';
