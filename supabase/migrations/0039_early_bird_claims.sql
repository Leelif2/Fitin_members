-- 0039 — 얼리버드 가격 49,900 / 79,900 / 109,900원 + 얼리버드 신청 기록·관리 (2026-11-13 사용자 결정)
--   * 할인액 30,000 → 30,100원 (site_settings 'early_bird' 한 곳). 정가(80,000/110,000/140,000)는 그대로.
--   * 얼리버드 정원 10명은 설정값(site_settings 'early_bird'.seats). 구독권과 관계없이 함께 쓴다.
--   * 신청 기록 표(early_bird_claims): 신청 1건 = 1자리. 남은 자리 = 정원 - 유효(active) 신청 수 (숫자를 따로 저장하지 않음).
--   * 사이트에서 얼리버드로 멤버십을 신청하면 자동으로 기록. 입금 전 취소되면 기록도 취소 → 자리 반납.
--   * 관리자는 사이트 회원(이미 결제한 학생 등)이나 오프라인 신청을 직접 추가·수정·취소 (관리자 확인은 DB가 한다).
--   * 동시에 신청해도 정원을 넘지 않게 advisory lock('early_bird')으로 한 번에 한 건씩 처리.
--   * 공개 화면에는 정원·남은 자리·할인액만 (신청자·구독권별 숫자는 관리자만).
-- 0015, 0029를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 가격: 할인액 30,100원
-- =====================================================================
insert into public.site_settings (key, value) values ('early_bird', '{"seats": 10, "discount": 30100}'::jsonb)
on conflict (key) do update set value = public.site_settings.value || '{"discount": 30100}'::jsonb;

-- =====================================================================
-- 2. 신청 기록 표
-- =====================================================================
create table if not exists public.early_bird_claims (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,          -- 사이트 회원이면
  membership_id bigint references public.memberships (id) on delete set null,
  name text check (name is null or char_length(name) between 1 and 60),       -- 오프라인 신청자 이름
  instagram text check (instagram is null or char_length(instagram) between 1 and 30),
  plan_code text not null references public.membership_plans (code),
  source text not null default 'web' check (source in ('web', 'admin')),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  note text check (note is null or char_length(note) <= 300),
  claimed_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists early_bird_claims_one_active_per_user
  on public.early_bird_claims (user_id) where status = 'active' and user_id is not null;
create unique index if not exists early_bird_claims_membership_uniq
  on public.early_bird_claims (membership_id) where membership_id is not null;
create index if not exists early_bird_claims_status_idx on public.early_bird_claims (status, claimed_at);

alter table public.early_bird_claims enable row level security;
drop policy if exists "early_bird_claims_read" on public.early_bird_claims;
create policy "early_bird_claims_read" on public.early_bird_claims
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- 쓰기 정책 없음: 아래 함수(security definer)로만 바뀐다.

-- 기존 얼리버드 멤버십을 기록으로 옮김 (이미 있으면 건너뜀)
insert into public.early_bird_claims (user_id, membership_id, plan_code, source, claimed_at)
select m.user_id, m.id, m.plan_code, 'web', m.created_at
from public.memberships m
where m.early_bird and m.status <> 'cancelled'
  and not exists (select 1 from public.early_bird_claims c where c.membership_id = m.id)
  and not exists (select 1 from public.early_bird_claims c where c.user_id = m.user_id and c.status = 'active');

-- =====================================================================
-- 3. 남은 자리 = 정원 - 유효 신청 수
-- =====================================================================
create or replace function public.early_bird_seats()
returns int
language sql stable security definer
set search_path = public
as $$
  select coalesce(((select value from public.site_settings where key = 'early_bird') ->> 'seats')::int, 0);
$$;

create or replace function public.early_bird_seats_left()
returns int
language sql stable security definer
set search_path = public
as $$
  select greatest(0, public.early_bird_seats()
    - (select count(*)::int from public.early_bird_claims where status = 'active'));
$$;

-- =====================================================================
-- 4. 멤버십 신청 (0029와 같고, 얼리버드 판단만 신청 기록 기준으로)
--    - 관리자가 미리 넣어 둔(아직 멤버십과 연결 안 된) 기록이 있으면 그 자리로 얼리버드
--    - 아니면 남은 자리가 있고 유효 기록이 없을 때 새 기록을 만들며 얼리버드
-- =====================================================================
create or replace function public.create_membership(p_plan text, p_class text, p_option text, p_start text)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.membership_plans;
  v_class public.pt_classes;
  v_starts date;
  v_first date;
  v_id bigint;
  v_early boolean := false;
  v_claim bigint;
  v_new_claim boolean := false;
  v_price int;
  i int;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'no_profile'; end if;
  select * into v_plan from public.membership_plans where code = p_plan and is_active;
  if v_plan.code is null then raise exception 'invalid_plan'; end if;
  if p_option not in ('lump', 'installment') or (p_option = 'installment' and v_plan.installment_count < 2) then
    raise exception 'invalid_option';
  end if;
  select * into v_class from public.pt_classes where code = p_class and kind = 'regular' and is_open;
  if v_class.id is null then raise exception 'invalid_class'; end if;
  v_starts := date_trunc('week', public.kst_today())::date + case when p_start = 'next' then 7 else 0 end;
  if p_start not in ('this', 'next') then raise exception 'invalid_start'; end if;
  if p_start = 'this' then
    select min(session_date) into v_first from public.class_session_dates(v_class.id, v_starts, v_starts + 6);
    if v_first is null or public.session_starts_at(v_first, v_class.start_time) <= now() then
      raise exception 'start_passed';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('membership:' || v_uid::text));
  if (public.current_membership(v_uid)).id is not null then raise exception 'already_member'; end if;
  perform pg_advisory_xact_lock(hashtext('class:' || v_class.id::text));
  if public.class_seats_left(v_class.id) <= 0 then raise exception 'class_full'; end if;

  -- 얼리버드: 한 번에 한 건씩 (동시에 신청해도 정원을 넘지 않게)
  perform pg_advisory_xact_lock(hashtext('early_bird'));
  select id into v_claim from public.early_bird_claims
   where user_id = v_uid and status = 'active' and membership_id is null
   order by claimed_at limit 1;
  if v_claim is not null then
    v_early := true;
  elsif not exists (select 1 from public.early_bird_claims where user_id = v_uid and status = 'active')
        and public.early_bird_seats_left() > 0 then
    v_early := true;
    v_new_claim := true;
  end if;
  v_price := greatest(0, v_plan.price - case when v_early then public.early_bird_discount() else 0 end);

  insert into public.memberships (user_id, plan_code, class_id, payment_option, starts_on, weeks, early_bird)
  values (v_uid, v_plan.code, v_class.id, p_option, v_starts, v_plan.weeks, v_early)
  returning id into v_id;

  if v_claim is not null then
    update public.early_bird_claims set membership_id = v_id, plan_code = v_plan.code where id = v_claim;
  elsif v_new_claim then
    insert into public.early_bird_claims (user_id, membership_id, plan_code, source)
    values (v_uid, v_id, v_plan.code, 'web');
  end if;

  if p_option = 'lump' then
    insert into public.membership_payments (membership_id, user_id, installment_no, amount, due_on)
    values (v_id, v_uid, 1, v_price, public.kst_today());
  else
    for i in 1..v_plan.installment_count loop
      insert into public.membership_payments (membership_id, user_id, installment_no, amount, due_on)
      values (v_id, v_uid, i, v_plan.installment_amount,
              case when i = 1 then public.kst_today() else v_starts + (i - 1) * 28 end);
    end loop;
  end if;
  update public.class_waitlist set left_at = now() where user_id = v_uid and left_at is null;
  return v_id;
end;
$$;

-- 멤버십이 (입금 전) 취소되면 연결된 얼리버드 기록도 취소 → 자리 반납
create or replace function public.early_bird_release_on_cancel()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.early_bird_claims set status = 'cancelled', cancelled_at = now()
     where membership_id = new.id and status = 'active';
  end if;
  return null;
end;
$$;
drop trigger if exists early_bird_release_on_cancel on public.memberships;
create trigger early_bird_release_on_cancel
  after update of status on public.memberships
  for each row execute function public.early_bird_release_on_cancel();
revoke all on function public.early_bird_release_on_cancel() from public, anon, authenticated;

-- =====================================================================
-- 5. 소개 페이지 값 (0029와 같고 early_bird만 바뀜)
--    used: 이미 얼리버드를 쓴 회원 / reserved: 관리자가 자리를 잡아 둔 회원(마감돼도 할인가)
-- =====================================================================
create or replace function public.membership_overview()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
        'code', p.code, 'name_ko', p.name_ko, 'name_en', p.name_en, 'weeks', p.weeks, 'price', p.price,
        'installment_count', p.installment_count, 'installment_amount', p.installment_amount) order by p.sort), '[]'::jsonb)
      from public.membership_plans p where p.is_active),
    'classes', (select coalesce(jsonb_agg(jsonb_build_object(
        'code', c.code, 'name_ko', c.name_ko, 'name_en', c.name_en, 'kind', c.kind,
        'weekdays', to_jsonb(c.weekdays), 'start_time', to_char(c.start_time, 'HH24:MI'),
        'duration_min', c.duration_min, 'capacity', c.capacity, 'skip_last_friday', c.skip_last_friday,
        'seats_left', case when c.kind = 'regular' then public.class_seats_left(c.id) end,
        'waitlist', (select count(*) from public.class_waitlist w where w.class_id = c.id and w.left_at is null)) order by c.sort), '[]'::jsonb)
      from public.pt_classes c where c.is_open),
    'early_bird', jsonb_build_object(
        'seats', public.early_bird_seats(),
        'seats_left', public.early_bird_seats_left(),
        'discount', public.early_bird_discount(),
        'used', auth.uid() is not null and exists (
          select 1 from public.early_bird_claims e where e.user_id = auth.uid() and e.status = 'active' and e.membership_id is not null),
        'reserved', auth.uid() is not null and exists (
          select 1 from public.early_bird_claims e where e.user_id = auth.uid() and e.status = 'active' and e.membership_id is null)),
    'gender', case when coalesce((select value from public.site_settings where key = 'show_gender_ratio'), 'false'::jsonb) = 'true'::jsonb then (
        select jsonb_build_object(
          'male', count(*) filter (where p.gender = 'male'),
          'female', count(*) filter (where p.gender = 'female'),
          'total', count(*))
        from public.memberships m join public.profiles p on p.id = m.user_id
        where m.status = 'active' and public.membership_end_on(m.starts_on, m.weeks) >= public.kst_today())
      end
  );
$$;

-- =====================================================================
-- 6. 관리자: 목록 / 추가 / 수정·취소 (모두 DB에서 관리자 확인)
-- =====================================================================
create or replace function public.admin_early_bird()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return jsonb_build_object(
    'seats', public.early_bird_seats(),
    'active', (select count(*) from public.early_bird_claims where status = 'active'),
    'seats_left', public.early_bird_seats_left(),
    'discount', public.early_bird_discount(),
    'claims', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.user_id,
        'name', coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), c.name),
        'nickname', p.nickname, 'university', p.university, 'email', u.email,
        'instagram', c.instagram, 'plan_code', c.plan_code, 'source', c.source, 'status', c.status,
        'note', c.note, 'claimed_at', c.claimed_at, 'cancelled_at', c.cancelled_at,
        'membership_status', m.status) order by c.status, c.claimed_at), '[]'::jsonb)
      from public.early_bird_claims c
      left join public.profiles p on p.id = c.user_id
      left join auth.users u on u.id = c.user_id
      left join public.memberships m on m.id = c.membership_id)
  );
end;
$$;

-- p_user: 사이트 회원이면 그 회원 id (이름은 회원 정보에서), 아니면 null + p_name
create or replace function public.admin_early_bird_add(p_user uuid, p_name text, p_instagram text, p_plan text, p_claimed_at timestamptz, p_note text)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_ms bigint;
  v_id bigint;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_ig text := nullif(regexp_replace(trim(coalesce(p_instagram, '')), '^@', ''), '');
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if not exists (select 1 from public.membership_plans where code = p_plan) then raise exception 'invalid_plan'; end if;
  if p_user is null and v_name is null then raise exception 'name_required'; end if;
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user) then raise exception 'no_profile'; end if;

  perform pg_advisory_xact_lock(hashtext('early_bird'));
  if public.early_bird_seats_left() <= 0 then raise exception 'early_bird_full'; end if;
  if p_user is not null and exists (select 1 from public.early_bird_claims where user_id = p_user and status = 'active') then
    raise exception 'already_claimed';
  end if;

  -- 그 회원이 이미 신청(입금 대기·이용 중)한 멤버십이 있으면 연결하고 얼리버드로 표시 (금액은 바꾸지 않음)
  if p_user is not null then
    select m.id into v_ms from public.memberships m
     where m.user_id = p_user and m.status in ('pending', 'active')
       and not exists (select 1 from public.early_bird_claims c where c.membership_id = m.id)
     order by m.created_at desc limit 1;
    if v_ms is not null then update public.memberships set early_bird = true where id = v_ms; end if;
  end if;

  insert into public.early_bird_claims (user_id, membership_id, name, instagram, plan_code, source, note, claimed_at, created_by)
  values (p_user, v_ms, case when p_user is null then v_name end, v_ig, p_plan, 'admin',
          nullif(trim(coalesce(p_note, '')), ''), coalesce(p_claimed_at, now()), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_early_bird_update(p_id bigint, p_plan text, p_name text, p_instagram text, p_claimed_at timestamptz, p_note text, p_status text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v public.early_bird_claims;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('active', 'cancelled') then raise exception 'invalid_status'; end if;
  if not exists (select 1 from public.membership_plans where code = p_plan) then raise exception 'invalid_plan'; end if;
  perform pg_advisory_xact_lock(hashtext('early_bird'));
  select * into v from public.early_bird_claims where id = p_id for update;
  if v.id is null then raise exception 'not_found'; end if;
  if v.user_id is null and nullif(trim(coalesce(p_name, '')), '') is null and v.name is not null then raise exception 'name_required'; end if;
  -- 취소된 신청을 되살릴 때도 정원 확인
  if v.status = 'cancelled' and p_status = 'active' then
    if public.early_bird_seats_left() <= 0 then raise exception 'early_bird_full'; end if;
    if v.user_id is not null and exists (select 1 from public.early_bird_claims where user_id = v.user_id and status = 'active' and id <> v.id) then
      raise exception 'already_claimed';
    end if;
  end if;
  update public.early_bird_claims set
    plan_code = p_plan,
    name = case when v.user_id is null then coalesce(nullif(trim(coalesce(p_name, '')), ''), v.name) else null end,
    instagram = nullif(regexp_replace(trim(coalesce(p_instagram, '')), '^@', ''), ''),
    claimed_at = coalesce(p_claimed_at, v.claimed_at),
    note = nullif(trim(coalesce(p_note, '')), ''),
    status = p_status,
    cancelled_at = case when p_status = 'cancelled' then coalesce(v.cancelled_at, now()) else null end
  where id = p_id;
end;
$$;

revoke all on function public.early_bird_seats() from public, anon;
revoke all on function public.early_bird_seats_left() from public, anon;
grant execute on function public.early_bird_seats() to authenticated;
grant execute on function public.early_bird_seats_left() to authenticated;
revoke all on function public.admin_early_bird() from public, anon;
revoke all on function public.admin_early_bird_add(uuid, text, text, text, timestamptz, text) from public, anon;
revoke all on function public.admin_early_bird_update(bigint, text, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.admin_early_bird() to authenticated;
grant execute on function public.admin_early_bird_add(uuid, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.admin_early_bird_update(bigint, text, text, text, timestamptz, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- (참고) 정원 바꾸기 예: update public.site_settings set value = value || '{"seats": 12}' where key = 'early_bird';
