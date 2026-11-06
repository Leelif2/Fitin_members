-- 0027 — 비속어·부적절한 닉네임 막기 (2026-11-06)
-- 목적: 욕설·성적 표현·혐오 표현·운영자 사칭 닉네임을 쓸 수 없게 한다.
--   * 금지어 목록은 표(banned_nickname_words)에 있다. 운영자가 SQL로 단어를 더하거나 뺄 수 있다(맨 아래 예시).
--   * 닉네임에 금지어가 "들어 있으면" 막는다. 대소문자, 밑줄(_), 숫자 끼워 넣기(시1발), 흔한 바꿔 쓰기(sh1t, fvck)도 잡는다.
--   * 가입·메인·마이페이지 어디서 바꾸든 DB가 막는다 (화면을 거치지 않아도).
--   * 이미 쓰이고 있는 금지어 닉네임은 비운다 → 그 회원은 메인에서 닉네임을 다시 정하게 된다.
-- 0025를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run.
-- "Potential issue detected" 창이 뜨면 "Run and enable RLS". 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 금지어 표 (관리자만 보기·고치기)
-- =====================================================================
create table if not exists public.banned_nickname_words (
  word text primary key check (word = lower(word) and word !~ '[\s_]' and char_length(word) between 1 and 20),
  note text,
  created_at timestamptz not null default now()
);
alter table public.banned_nickname_words enable row level security;
drop policy if exists "banned_words_admin" on public.banned_nickname_words;
create policy "banned_words_admin" on public.banned_nickname_words
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.banned_nickname_words from anon;

insert into public.banned_nickname_words (word, note) values
  -- 한국어 욕설
  ('씨발', '욕설'), ('시발', '욕설'), ('씨팔', '욕설'), ('시팔', '욕설'), ('씨바', '욕설'), ('씨빨', '욕설'),
  ('십새', '욕설'), ('씹', '욕설'), ('썅', '욕설'), ('병신', '욕설'), ('븅신', '욕설'), ('빙신', '욕설'),
  ('좆', '욕설'), ('존나', '욕설'), ('개새', '욕설'), ('개색', '욕설'), ('개세끼', '욕설'),
  ('개쉐', '욕설'), ('새끼', '욕설'), ('쌔끼', '욕설'), ('지랄', '욕설'), ('염병', '욕설'), ('니미', '욕설'),
  ('느금', '욕설'), ('엠창', '욕설'), ('애미', '욕설'), ('애비', '욕설'), ('미친놈', '욕설'), ('미친년', '욕설'),
  ('또라이', '욕설'), ('닥쳐', '욕설'), ('꺼져', '욕설'), ('엿먹', '욕설'), ('등신', '욕설'),
  ('쌍년', '욕설'), ('쌍놈', '욕설'), ('개년', '욕설'), ('걸레', '욕설'),
  -- 한국어 성적 표현
  ('섹스', '성적'), ('보지', '성적'), ('자지', '성적'), ('딸딸이', '성적'), ('자위', '성적'), ('야동', '성적'),
  ('강간', '성적'), ('창녀', '성적'), ('매춘', '성적'), ('젖꼭지', '성적'), ('꼴림', '성적'),
  -- 한국어 혐오 표현
  ('한남', '혐오'), ('김치녀', '혐오'), ('된장녀', '혐오'), ('틀딱', '혐오'), ('급식충', '혐오'), ('맘충', '혐오'),
  ('짱깨', '혐오'), ('쪽바리', '혐오'), ('깜둥', '혐오'), ('일베', '혐오'), ('메갈', '혐오'), ('장애인새', '혐오'),
  -- 영어 욕설·성적·혐오
  ('fuck', 'english'), ('fuk', 'english'), ('shit', 'english'), ('bitch', 'english'), ('cunt', 'english'),
  ('dick', 'english'), ('cock', 'english'), ('pussy', 'english'), ('asshole', 'english'), ('bastard', 'english'),
  ('whore', 'english'), ('slut', 'english'), ('porn', 'english'), ('sex', 'english'), ('penis', 'english'),
  ('vagina', 'english'), ('boob', 'english'), ('jizz', 'english'), ('milf', 'english'), ('rapist', 'english'),
  ('nigg', 'english'), ('fag', 'english'), ('retard', 'english'), ('nazi', 'english'), ('hitler', 'english'),
  ('motherf', 'english'), ('wtf', 'english'), ('stfu', 'english'),
  -- 운영자 사칭
  ('admin', '사칭'), ('관리자', '사칭'), ('운영자', '사칭'), ('운영진', '사칭'), ('fitin', '사칭'), ('핏인', '사칭'),
  ('official', '사칭'), ('공식', '사칭'), ('staff', '사칭'), ('moderator', '사칭')
on conflict (word) do nothing;

-- =====================================================================
-- 2. 금지어가 들어 있는지 (밑줄 빼고, 숫자 빼고, 흔한 바꿔 쓰기를 되돌려서도 확인)
-- =====================================================================
create or replace function public.nickname_is_banned(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select lower(replace(coalesce(p_nickname, ''), '_', '')) as base
  ), forms as (
    select base as f from v
    union all select regexp_replace(base, '[0-9]', '', 'g') from v                  -- 시1발 → 시발
    union all select translate(base, '013457$@v', 'oieastsau') from v              -- sh1t → shit, fvck → fuck
  )
  select exists (
    select 1 from forms, public.banned_nickname_words w
    where forms.f <> '' and position(w.word in forms.f) > 0
  );
$$;

-- 가입 화면용: 'ok' | 'invalid' | 'banned' | 'taken'
create or replace function public.nickname_check(p_nickname text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.clean_nickname(p_nickname) is null then 'invalid'
    when public.nickname_is_banned(public.clean_nickname(p_nickname)) then 'banned'
    when exists (select 1 from public.profiles
                 where lower(nickname) = lower(public.clean_nickname(p_nickname))
                   and id is distinct from auth.uid()) then 'taken'
    else 'ok'
  end;
$$;

-- 예전 함수도 금지어를 "쓸 수 없음"으로 답하게
create or replace function public.nickname_available(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.nickname_check(p_nickname) = 'ok';
$$;

-- =====================================================================
-- 3. DB가 막기: 어떤 경로로 바꾸든 금지어 닉네임은 저장 안 됨
-- =====================================================================
create or replace function public.protect_profile_nickname()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nickname is not null
     and (tg_op = 'INSERT' or new.nickname is distinct from old.nickname)
     and public.nickname_is_banned(new.nickname) then
    raise exception 'nickname_banned';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_nickname on public.profiles;
create trigger profiles_protect_nickname
  before insert or update of nickname on public.profiles
  for each row execute function public.protect_profile_nickname();

-- 닉네임 바꾸기 함수: 금지어면 알기 쉬운 오류로
create or replace function public.set_my_live_profile(p_nickname text default null, p_show boolean default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nick text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_nickname is not null then
    v_nick := public.clean_nickname(p_nickname);
    if v_nick is null then raise exception 'nickname_invalid'; end if;
    if public.nickname_is_banned(v_nick) then raise exception 'nickname_banned'; end if;
    if exists (select 1 from public.profiles where lower(nickname) = lower(v_nick) and id <> v_uid) then
      raise exception 'nickname_taken';
    end if;
  end if;
  begin
    update public.profiles
    set nickname = coalesce(v_nick, nickname),
        show_presence = coalesce(p_show, show_presence)
    where id = v_uid;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;
  return public.my_live_profile();
end;
$$;

-- 가입 시 프로필 자동 생성 (0025와 같고, 금지어 닉네임이면 비워 두고 가입은 진행)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := public.clean_nickname(new.raw_user_meta_data ->> 'nickname');
begin
  if v_nick is not null and (
       public.nickname_is_banned(v_nick)
       or exists (select 1 from public.profiles where lower(nickname) = lower(v_nick))) then
    v_nick := null;
  end if;
  insert into public.profiles (
    id, first_name, last_name, university, date_of_birth,
    phone, experience_level, fitness_goal, gender, student_no, nickname
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
    public.normalize_student_no(new.raw_user_meta_data ->> 'student_no'),
    v_nick
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =====================================================================
-- 4. 이미 쓰이고 있는 금지어 닉네임은 비운다 (메인에서 다시 정하게 됨)
-- =====================================================================
update public.profiles set nickname = null
where nickname is not null and public.nickname_is_banned(nickname);

-- =====================================================================
-- 5. 권한
-- =====================================================================
revoke all on function public.protect_profile_nickname() from public, anon, authenticated;
revoke all on function public.nickname_is_banned(text) from public, anon, authenticated;
grant execute on function public.nickname_check(text) to anon, authenticated;
grant execute on function public.nickname_available(text) to anon, authenticated;
revoke all on function public.set_my_live_profile(text, boolean) from public, anon;
grant execute on function public.set_my_live_profile(text, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 금지어를 더하거나 뺄 때 (SQL Editor에서 한 줄만 실행)
--   더하기:  insert into public.banned_nickname_words (word, note) values ('단어', '메모');
--   빼기:    delete from public.banned_nickname_words where word = '단어';
--   목록:    select * from public.banned_nickname_words order by created_at;
--   (단어는 소문자로, 띄어쓰기·밑줄 없이. 이미 쓰이고 있는 닉네임은 바뀌지 않으니 필요하면 4번을 다시 실행)
-- ---------------------------------------------------------------------
