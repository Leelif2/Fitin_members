-- 0046 — 식단 상담: 신체 정보·운동량 설문 + 관리자가 매크로를 정해 회원에게 보내기 (2026-11-22 사용자 결정)
--   * 설문에 나이·키·체중(목표 체중은 선택)을 [필수] 동의와 함께 받는다. 운동 빈도·평소 활동량·주로 먹는 곳도 받는다.
--   * 인스타그램 아이디는 선택. 식단은 사이트("내 식단") + 알림함 + 이메일로 보낸다.
--   * 관리자는 칼로리·단백질·탄수화물·지방 + 끼니별 가이드 + 물·보충제 + 학식·편의점 팁을 적어 보낸다.
--     다시 보내면 같은 상담의 식단을 고치고(최신본), 회원에게 다시 알린다.
--   * 식단은 본인과 관리자만 볼 수 있고, 쓰기는 관리자 함수(admin_send_diet_plan)로만 된다.
--   * 탈퇴하면 상담·식단 모두 삭제(auth.users on delete cascade).
-- 0030, 0034, 0036을 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 설문 칸 추가 (예전 신청은 비어 있음)
-- =====================================================================
alter table public.diet_consults add column if not exists age int;
alter table public.diet_consults add column if not exists height_cm numeric(5, 1);
alter table public.diet_consults add column if not exists weight_kg numeric(5, 1);
alter table public.diet_consults add column if not exists target_weight_kg numeric(5, 1);
alter table public.diet_consults add column if not exists body_consent boolean not null default false;
alter table public.diet_consults add column if not exists training text;
alter table public.diet_consults add column if not exists daily_activity text;
alter table public.diet_consults add column if not exists eat_places text[] not null default '{}';
alter table public.diet_consults alter column instagram drop not null;   -- 인스타그램은 선택 (형식 검사는 그대로)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'diet_consults_body_ranges') then
    alter table public.diet_consults add constraint diet_consults_body_ranges check (
      (age is null or age between 14 and 80)
      and (height_cm is null or height_cm between 120 and 230)
      and (weight_kg is null or weight_kg between 30 and 250)
      and (target_weight_kg is null or target_weight_kg between 30 and 250));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'diet_consults_body_consent') then
    -- 신체 정보가 하나라도 있으면 동의가 있어야 한다
    alter table public.diet_consults add constraint diet_consults_body_consent check (
      (age is null and height_cm is null and weight_kg is null and target_weight_kg is null) or body_consent);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'diet_consults_habits') then
    alter table public.diet_consults add constraint diet_consults_habits check (
      (training is null or training in ('0_1', '2_3', '4_5', '6_plus'))
      and (daily_activity is null or daily_activity in ('sedentary', 'moderate', 'active'))
      and eat_places <@ array['cafeteria', 'convenience', 'delivery', 'cook', 'eat_out']::text[]);
  end if;
end;
$$;

-- =====================================================================
-- 2. 관리자가 보낸 식단 (상담 1건에 식단 1개, 다시 보내면 고침)
-- =====================================================================
create table if not exists public.diet_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  consult_id bigint unique references public.diet_consults (id) on delete set null,
  calories int not null check (calories between 800 and 6000),
  protein_g int not null check (protein_g between 0 and 500),
  carbs_g int not null check (carbs_g between 0 and 1000),
  fat_g int not null check (fat_g between 0 and 400),
  breakfast text check (breakfast is null or char_length(breakfast) <= 600),
  lunch text check (lunch is null or char_length(lunch) <= 600),
  dinner text check (dinner is null or char_length(dinner) <= 600),
  snack text check (snack is null or char_length(snack) <= 600),
  water_supplements text check (water_supplements is null or char_length(water_supplements) <= 600),
  cafeteria_tips text check (cafeteria_tips is null or char_length(cafeteria_tips) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists diet_plans_user_idx on public.diet_plans (user_id, sent_at desc);

alter table public.diet_plans enable row level security;
drop policy if exists "diet_plans_read_own" on public.diet_plans;
create policy "diet_plans_read_own" on public.diet_plans
  for select using (auth.uid() = user_id or public.is_admin());
-- 쓰기 정책 없음 → 회원·비로그인은 직접 쓰기 불가. 관리자도 아래 함수로만 보낸다.

-- =====================================================================
-- 3. 회원: 새 설문 보내기
-- =====================================================================
create or replace function public.submit_diet_request(
  p_goal text, p_age int, p_height numeric, p_weight numeric, p_target_weight numeric, p_body_consent boolean,
  p_training text, p_activity text, p_meals int, p_cafeteria text, p_eat_places text[],
  p_budget int, p_avoid text, p_health_consent boolean, p_instagram text, p_message text
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
  v_places text[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_eat_places, '{}')) x where x is not null), '{}');
  v_access text;
  v_id bigint;
  v_name text;
  v_ko text;
  v_en text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not public.is_live_member() then raise exception 'verification_required'; end if;
  v_access := public.diet_access();
  if v_access <> 'ok' then raise exception '%', v_access; end if;

  if p_goal is null or p_meals is null or p_cafeteria is null or p_training is null or p_activity is null then
    raise exception 'missing';
  end if;
  if p_age is null or p_height is null or p_weight is null then raise exception 'body_missing'; end if;
  if not coalesce(p_body_consent, false) then raise exception 'body_consent_required'; end if;
  if p_age not between 14 and 80 or p_height not between 120 and 230 or p_weight not between 30 and 250
     or (p_target_weight is not null and p_target_weight not between 30 and 250) then
    raise exception 'body_invalid';
  end if;
  if v_ig is not null and v_ig !~ '^[A-Za-z0-9._]{1,30}$' then raise exception 'instagram_invalid'; end if;
  if v_avoid is not null and not coalesce(p_health_consent, false) then raise exception 'consent_required'; end if;
  if v_msg is not null and char_length(v_msg) > 500 then raise exception 'message_too_long'; end if;

  perform pg_advisory_xact_lock(hashtext('diet:' || v_uid::text));
  -- 답을 기다리는 신청이 있으면 그 신청을 고친다 (새로 쌓지 않음, 알림도 1건)
  select id into v_id from public.diet_consults where user_id = v_uid and status = 'new' order by id desc limit 1;
  if v_id is null then
    insert into public.diet_consults (user_id, goal, meals_per_day, cafeteria, budget, avoid_foods, health_consent, instagram, message,
                                      age, height_cm, weight_kg, target_weight_kg, body_consent, training, daily_activity, eat_places)
    values (v_uid, p_goal, p_meals, p_cafeteria, p_budget, v_avoid, coalesce(p_health_consent, false) and v_avoid is not null, v_ig, v_msg,
            p_age, round(p_height, 1), round(p_weight, 1), round(p_target_weight, 1), true, p_training, p_activity, v_places)
    returning id into v_id;
  else
    update public.diet_consults
    set goal = p_goal, meals_per_day = p_meals, cafeteria = p_cafeteria, budget = p_budget,
        avoid_foods = v_avoid, health_consent = coalesce(p_health_consent, false) and v_avoid is not null,
        instagram = v_ig, message = v_msg,
        age = p_age, height_cm = round(p_height, 1), weight_kg = round(p_weight, 1), target_weight_kg = round(p_target_weight, 1),
        body_consent = true, training = p_training, daily_activity = p_activity, eat_places = v_places,
        updated_at = now()
    where id = v_id;
  end if;

  select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), nickname, '회원') into v_name
  from public.profiles where id = v_uid;
  v_ko := format('%s님이 식단 상담을 신청했어요.', coalesce(v_name, '회원'));
  v_en := format('%s asked for a diet consultation.', coalesce(v_name, 'A member'));
  update public.admin_alerts set created_at = now(), message_ko = v_ko, message_en = v_en
  where kind = 'diet' and member_user_id = v_uid and resolved_at is null;
  if not found then
    insert into public.admin_alerts (kind, member_user_id, message_ko, message_en) values ('diet', v_uid, v_ko, v_en);
  end if;
  return v_id;
end;
$$;

-- =====================================================================
-- 4. 관리자: 목록 (새 답변 + 보낸 식단 포함)
-- =====================================================================
drop function if exists public.admin_diet_consults();
create function public.admin_diet_consults()
returns table (
  id bigint, user_id uuid, first_name text, last_name text, nickname text, university text, gender text,
  goal text, meals_per_day int, cafeteria text, budget int, avoid_foods text, instagram text, message text,
  status text, admin_note text, created_at timestamptz, updated_at timestamptz,
  age int, height_cm numeric, weight_kg numeric, target_weight_kg numeric, training text, daily_activity text, eat_places text[],
  plan jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query
  select d.id, d.user_id, p.first_name, p.last_name, p.nickname, p.university, p.gender,
         d.goal, d.meals_per_day, d.cafeteria, d.budget, d.avoid_foods, d.instagram, d.message,
         d.status, d.admin_note, d.created_at, d.updated_at,
         d.age, d.height_cm, d.weight_kg, d.target_weight_kg, d.training, d.daily_activity, d.eat_places,
         (select to_jsonb(x) - 'user_id' - 'created_by' from public.diet_plans x where x.consult_id = d.id)
  from public.diet_consults d
  join public.profiles p on p.id = d.user_id
  order by (d.status = 'new') desc, d.updated_at desc
  limit 300;
end;
$$;

-- =====================================================================
-- 5. 관리자: 식단 보내기 (처음 보내기 / 고쳐서 다시 보내기)
-- =====================================================================
create or replace function public.admin_send_diet_plan(
  p_consult_id bigint, p_calories int, p_protein int, p_carbs int, p_fat int,
  p_breakfast text, p_lunch text, p_dinner text, p_snack text, p_water text, p_tips text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.diet_consults;
  v_id bigint;
  v_resend boolean;
  t text[] := array[p_breakfast, p_lunch, p_dinner, p_snack, p_water, p_tips];
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into d from public.diet_consults where id = p_consult_id for update;
  if d.id is null then raise exception 'not_found'; end if;
  if p_calories is null or p_protein is null or p_carbs is null or p_fat is null then raise exception 'macros_missing'; end if;
  select exists (select 1 from public.diet_plans where consult_id = d.id) into v_resend;

  insert into public.diet_plans (user_id, consult_id, calories, protein_g, carbs_g, fat_g,
                                 breakfast, lunch, dinner, snack, water_supplements, cafeteria_tips, created_by)
  values (d.user_id, d.id, p_calories, p_protein, p_carbs, p_fat,
          nullif(btrim(coalesce(t[1], '')), ''), nullif(btrim(coalesce(t[2], '')), ''), nullif(btrim(coalesce(t[3], '')), ''),
          nullif(btrim(coalesce(t[4], '')), ''), nullif(btrim(coalesce(t[5], '')), ''), nullif(btrim(coalesce(t[6], '')), ''), auth.uid())
  on conflict (consult_id) do update set
    calories = excluded.calories, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
    breakfast = excluded.breakfast, lunch = excluded.lunch, dinner = excluded.dinner, snack = excluded.snack,
    water_supplements = excluded.water_supplements, cafeteria_tips = excluded.cafeteria_tips,
    created_by = excluded.created_by, sent_at = now(), updated_at = now()
  returning id into v_id;

  update public.diet_consults set status = 'done', handled_at = coalesce(handled_at, now()) where id = d.id;
  if not exists (select 1 from public.diet_consults where user_id = d.user_id and status = 'new') then
    update public.admin_alerts set resolved_at = now()
    where kind = 'diet' and member_user_id = d.user_id and resolved_at is null;
  end if;

  perform public.add_member_notification(d.user_id, 'diet_plan',
    v_id::text || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text,
    case when v_resend then '식단이 업데이트됐어요' else '맞춤 식단이 도착했어요' end,
    case when v_resend then 'Your meal plan was updated' else 'Your meal plan is ready' end,
    format('하루 %s kcal · 단백질 %sg · 탄수화물 %sg · 지방 %sg. 끼니별 가이드는 사이트에서 확인해 주세요.', p_calories, p_protein, p_carbs, p_fat),
    format('%s kcal a day · protein %sg · carbs %sg · fat %sg. See the meal guide on the site.', p_calories, p_protein, p_carbs, p_fat),
    'diet.html');
  return v_id;
end;
$$;

-- =====================================================================
-- 6. 관리자 메모(admin_note)는 회원이 읽을 수 없게 (예전에는 본인 행 전체가 보였음)
--    회원·비로그인은 메모를 뺀 칸만 읽는다. 관리자 화면은 admin_diet_consults 함수로 읽어서 영향 없음.
-- =====================================================================
revoke select on public.diet_consults from anon, authenticated;
grant select (id, user_id, goal, meals_per_day, cafeteria, budget, avoid_foods, health_consent, instagram, message,
              status, created_at, updated_at, handled_at, age, height_cm, weight_kg, target_weight_kg, body_consent,
              training, daily_activity, eat_places) on public.diet_consults to authenticated;

-- =====================================================================
-- 7. 실행 권한
-- =====================================================================
revoke all on function public.submit_diet_request(text, int, numeric, numeric, numeric, boolean, text, text, int, text, text[], int, text, boolean, text, text) from public, anon;
grant execute on function public.submit_diet_request(text, int, numeric, numeric, numeric, boolean, text, text, int, text, text[], int, text, boolean, text, text) to authenticated;
revoke all on function public.admin_diet_consults() from public, anon;
grant execute on function public.admin_diet_consults() to authenticated;
revoke all on function public.admin_send_diet_plan(bigint, int, int, int, int, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_send_diet_plan(bigint, int, int, int, int, text, text, text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
