-- 0029 — 멤버십 가격 변경 + 얼리버드 (2026-11-06 사용자 결정)
--   * 요금제: 1개월권 80,000원 / 2개월권 110,000원(새로 추가, 8주) / 3개월권 140,000원
--   * 분할 결제 없앰 → 모든 요금제 일시불
--   * 얼리버드: 선착순 10명은 어느 요금제든 30,000원 할인 (50,000 / 80,000 / 110,000원)
--       - 신청 순서로 자리를 잡고, 입금 전에 취소되면(본인 취소·기한 지나 취소) 자리가 다음 사람에게 넘어간다
--       - 한 사람은 한 번만 (다시 신청할 때는 정가)
--       - 인원·할인액은 site_settings의 'early_bird'로 바꿀 수 있다 (맨 아래 예시)
--   * 이미 들어온 신청(입금 대기 포함)의 금액은 바꾸지 않는다.
-- 0015, 0019를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 요금제
-- =====================================================================
insert into public.membership_plans (code, name_ko, name_en, weeks, price, installment_count, installment_amount, sort) values
  ('2m', '2개월권', '2-month', 8, 110000, 1, null, 2)
on conflict (code) do nothing;

update public.membership_plans set price = 80000,  installment_count = 1, installment_amount = null, sort = 1 where code = '1m';
update public.membership_plans set price = 110000, installment_count = 1, installment_amount = null, sort = 2, weeks = 8 where code = '2m';
update public.membership_plans set price = 140000, installment_count = 1, installment_amount = null, sort = 3 where code = '3m';

-- =====================================================================
-- 2. 얼리버드 설정 + 신청에 표시
-- =====================================================================
insert into public.site_settings (key, value) values
  ('early_bird', '{"seats": 10, "discount": 30000}'::jsonb)
on conflict (key) do nothing;

alter table public.memberships add column if not exists early_bird boolean not null default false;

-- 남은 얼리버드 자리 (취소된 신청은 세지 않는다)
create or replace function public.early_bird_seats_left()
returns int
language sql stable security definer
set search_path = public
as $$
  select greatest(0,
    coalesce(((select value from public.site_settings where key = 'early_bird') ->> 'seats')::int, 0)
    - (select count(distinct user_id)::int from public.memberships where early_bird and status <> 'cancelled'));
$$;

create or replace function public.early_bird_discount()
returns int
language sql stable security definer
set search_path = public
as $$
  select coalesce(((select value from public.site_settings where key = 'early_bird') ->> 'discount')::int, 0);
$$;

-- =====================================================================
-- 3. 멤버십 신청 (0015와 같고, 얼리버드 할인만 추가)
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

  -- 얼리버드: 남은 자리를 한 번에 한 사람씩 센다 (동시에 신청해도 10명을 넘지 않게)
  perform pg_advisory_xact_lock(hashtext('early_bird'));
  if public.early_bird_seats_left() > 0
     and not exists (select 1 from public.memberships
                     where user_id = v_uid and early_bird and status <> 'cancelled') then
    v_early := true;
  end if;
  v_price := greatest(0, v_plan.price - case when v_early then public.early_bird_discount() else 0 end);

  insert into public.memberships (user_id, plan_code, class_id, payment_option, starts_on, weeks, early_bird)
  values (v_uid, v_plan.code, v_class.id, p_option, v_starts, v_plan.weeks, v_early)
  returning id into v_id;

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

-- =====================================================================
-- 4. 소개 페이지 값 (0019와 같고 early_bird만 추가)
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
        'seats', coalesce(((select value from public.site_settings where key = 'early_bird') ->> 'seats')::int, 0),
        'seats_left', public.early_bird_seats_left(),
        'discount', public.early_bird_discount(),
        'used', auth.uid() is not null and exists (
          select 1 from public.memberships m where m.user_id = auth.uid() and m.early_bird and m.status <> 'cancelled')),
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

revoke all on function public.early_bird_seats_left() from public, anon;
revoke all on function public.early_bird_discount() from public, anon;
grant execute on function public.early_bird_seats_left() to authenticated;
grant execute on function public.early_bird_discount() to authenticated;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 얼리버드 바꾸기 (SQL Editor에서 한 줄만 실행)
--   인원 20명으로:  update public.site_settings set value = jsonb_set(value, '{seats}', '20') where key = 'early_bird';
--   할인 끝내기:    update public.site_settings set value = jsonb_set(value, '{seats}', '0') where key = 'early_bird';
--   얼리버드 신청자: select m.id, p.first_name, m.plan_code, m.status, m.created_at from public.memberships m
--                    join public.profiles p on p.id = m.user_id where m.early_bird order by m.created_at;
-- ---------------------------------------------------------------------
