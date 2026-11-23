-- Read-only production RLS check. Paste the whole file into Supabase SQL Editor.
-- Selects two existing approved, non-admin members (A and B) without printing
-- their IDs or personal information. No account or table data is changed.
-- Expected: PASS with at least 2 profile checks. SKIP means the other member
-- has no row in that table, so that table remains untested.
begin read only;

do $$
declare
  members uuid[];
  item record;
  n bigint;
begin
  select array_agg(id order by id) into members
  from (
    select p.id from public.profiles p
    where p.role = 'member' and p.verify_status = 'approved'
      and exists (select 1 from auth.users u where u.id = p.id)
    order by p.id limit 2
  ) chosen;
  if coalesce(array_length(members, 1), 0) <> 2 then
    raise exception 'Two approved non-admin members are required';
  end if;
  perform set_config('fitin.test_a', members[1]::text, true);
  perform set_config('fitin.test_b', members[2]::text, true);

  -- Counts are calculated before switching to the authenticated role. They
  -- prove whether the other member actually has data in each table.
  for item in select * from (values
    ('profiles', 'id'),
    ('bookings', 'user_id'),
    ('memberships', 'user_id'),
    ('membership_payments', 'user_id'),
    ('class_attendance', 'user_id'),
    ('makeup_bookings', 'user_id'),
    ('class_waitlist', 'user_id'),
    ('event_registrations', 'user_id'),
    ('lift_entries', 'user_id'),
    ('lift_participants', 'user_id'),
    ('workout_logs', 'user_id'),
    ('routine_plans', 'user_id'),
    ('diet_consults', 'user_id'),
    ('diet_plans', 'user_id'),
    ('login_events', 'user_id'),
    ('notifications', 'user_id'),
    ('member_notes', 'member_id')
  ) as tables(name, owner_column) loop
    if to_regclass(format('public.%I', item.name)) is null then
      continue;
    end if;
    execute format('select count(1) from public.%I where %I = $1', item.name, item.owner_column)
      into n using members[1];
    perform set_config('fitin.baseline_a_' || item.name, n::text, true);
    execute format('select count(1) from public.%I where %I = $1', item.name, item.owner_column)
      into n using members[2];
    perform set_config('fitin.baseline_b_' || item.name, n::text, true);
  end loop;
end $$;

-- This is the same role and JWT subject combination used by a signed-in
-- Supabase request. The following reads are therefore subject to RLS.
set local role authenticated;

do $$
declare
  pair record;
  item record;
  viewer uuid;
  other_member uuid;
  other_label text;
  baseline bigint;
  visible bigint;
  own_profile_count bigint;
  passed int := 0;
  skipped int := 0;
begin
  for pair in select * from (values
    (current_setting('fitin.test_a')::uuid, current_setting('fitin.test_b')::uuid, 'b'),
    (current_setting('fitin.test_b')::uuid, current_setting('fitin.test_a')::uuid, 'a')
  ) as pairs(viewer_id, other_id, label) loop
    viewer := pair.viewer_id;
    other_member := pair.other_id;
    other_label := pair.label;
    perform set_config('request.jwt.claim.sub', viewer::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', viewer::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
    if auth.uid() is distinct from viewer then
      raise exception 'JWT subject was not set for test member';
    end if;

    select count(1) into own_profile_count from public.profiles where id = viewer;
    if own_profile_count <> 1 then
      raise exception 'Test member cannot read own profile';
    end if;

    -- Security-definer administrator RPCs bypass table RLS internally, so
    -- verify that they reject an ordinary member as well.
    if to_regprocedure('public.admin_member_detail(uuid)') is not null then
      begin
        perform public.admin_member_detail(other_member);
        visible := 1;
      exception when insufficient_privilege then
        visible := 0;
      when others then
        if sqlerrm = 'admin_only' then visible := 0; else raise; end if;
      end;
      if visible <> 0 then raise exception 'FAIL: admin_member_detail returned another member'; end if;
      passed := passed + 1;
    else
      skipped := skipped + 1;
    end if;

    if to_regprocedure('public.admin_member_list()') is not null then
      begin
        perform public.admin_member_list();
        visible := 1;
      exception when insufficient_privilege then
        visible := 0;
      when others then
        if sqlerrm = 'admin_only' then visible := 0; else raise; end if;
      end;
      if visible <> 0 then raise exception 'FAIL: admin_member_list returned data'; end if;
      passed := passed + 1;
    else
      skipped := skipped + 1;
    end if;

    for item in select * from (values
      ('profiles', 'id'),
      ('bookings', 'user_id'),
      ('memberships', 'user_id'),
      ('membership_payments', 'user_id'),
      ('class_attendance', 'user_id'),
      ('makeup_bookings', 'user_id'),
      ('class_waitlist', 'user_id'),
      ('event_registrations', 'user_id'),
      ('lift_entries', 'user_id'),
      ('lift_participants', 'user_id'),
      ('workout_logs', 'user_id'),
      ('routine_plans', 'user_id'),
      ('diet_consults', 'user_id'),
      ('diet_plans', 'user_id'),
      ('login_events', 'user_id'),
      ('notifications', 'user_id'),
      ('member_notes', 'member_id')
    ) as tables(name, owner_column) loop
      if to_regclass(format('public.%I', item.name)) is null then
        skipped := skipped + 1;
        continue;
      end if;
      baseline := current_setting('fitin.baseline_' || other_label || '_' || item.name, true)::bigint;
      if baseline = 0 then
        skipped := skipped + 1;
        continue;
      end if;
      begin
        execute format('select count(1) from public.%I where %I = $1', item.name, item.owner_column)
          into visible using other_member;
      exception when insufficient_privilege then
        visible := 0; -- Table-level denial is also a secure result.
      end;
      if visible <> 0 then
        raise exception 'FAIL: member can read % other member row(s) in %', visible, item.name;
      end if;
      passed := passed + 1;
    end loop;
  end loop;
  perform set_config('fitin.test_passed', passed::text, true);
  perform set_config('fitin.test_skipped', skipped::text, true);
end $$;

set local role none;
select 'PASS: no cross-member rows visible' as result,
       current_setting('fitin.test_passed')::int as checked_cases,
       current_setting('fitin.test_skipped')::int as skipped_empty_or_missing_cases;
rollback;
