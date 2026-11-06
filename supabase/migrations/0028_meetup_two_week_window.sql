-- 0028 — 모임 날짜를 "이번 주 + 다음 주"까지 열기 (2026-11-06 사용자 요청)
-- 전: 지금부터 7일 이내만 → 다음 주 후반 모임은 열 수 없었다.
-- 후: 지금부터 다음 주 일요일 23:59(한국 시간)까지. 나머지 규칙(같은 성별, 최대 5개)은 0012와 같다.
-- 0012를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- 다음 주 일요일이 끝나는 시각 (= 다다음 주 월요일 00:00, 한국 시간)
create or replace function public.meetup_window_end()
returns timestamptz
language sql
stable
as $$
  select (date_trunc('week', now() at time zone 'Asia/Seoul') + interval '14 days') at time zone 'Asia/Seoul';
$$;

create or replace function public.meetups_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_count int;
begin
  new.host_id := auth.uid();
  if new.host_id is null then
    raise exception 'not_signed_in';
  end if;
  if new.starts_at <= now() or new.starts_at >= public.meetup_window_end() then
    raise exception 'bad_time';
  end if;

  new.host_gender := (select nullif(gender, 'undisclosed') from public.profiles where id = new.host_id);
  if new.same_gender and new.host_gender is null then
    raise exception 'gender_required';
  end if;

  select count(*) into open_count
  from public.meetups
  where host_id = new.host_id and status = 'open' and starts_at > now();
  if open_count >= 5 then
    raise exception 'too_many';
  end if;

  new.title := btrim(new.title);
  new.place := btrim(new.place);
  new.status := 'open';
  new.created_at := now();
  return new;
end;
$$;

grant execute on function public.meetup_window_end() to authenticated;

commit;

notify pgrst, 'reload schema';
