-- 0045 — 서버 API 요청 횟수 제한 (2026-11-21 사용자 결정)
--   * 시간표 AI 읽기(api/read-timetable): 회원 1명당 1시간 5회 · 하루 10회 (넘으면 AI를 부르지 않고 거절)
--   * 로그인 실패 기록(api/log-event): IP당 15분 30건 · 이메일당 15분 10건까지만 저장
-- Vercel 서버 함수는 요청마다 새로 떠서 메모리에 횟수를 기억할 수 없으므로 DB 표에 센다.
-- 이 표와 함수는 서버 전용 키(service_role)로만 쓸 수 있다. 회원·비로그인은 읽기·쓰기·호출 모두 불가.
-- Supabase → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

create table if not exists public.api_rate_limits (
  bucket text not null check (char_length(bucket) between 1 and 200),  -- 예: 'timetable:<회원ID>:hour'
  window_start timestamptz not null,                                   -- 구간 시작 시각 (한국 시간 기준으로 맞춤)
  hits int not null default 0,
  primary key (bucket, window_start)
);
create index if not exists api_rate_limits_window_idx on public.api_rate_limits (window_start);

alter table public.api_rate_limits enable row level security;
-- 정책을 하나도 만들지 않음 → anon·authenticated는 RLS에 막힌다. 표 권한도 회수.
revoke all on table public.api_rate_limits from anon, authenticated;

-- 한 번 부를 때마다 1을 더하고, 이번 구간 안에서 p_limit 이하이면 true(허용), 넘으면 false(거절).
-- 구간은 한국 시간 0시 기준으로 자른다 (하루 = 한국 날짜, 1시간 = 정각부터, 15분 = 00·15·30·45분부터).
-- 동시에 여러 요청이 와도 insert ... on conflict 한 문장으로 세므로 숫자가 꼬이지 않는다.
create or replace function public.hit_rate_limit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offset constant bigint := 9 * 3600;  -- 한국 시간(UTC+9)
  v_epoch bigint := floor(extract(epoch from now()))::bigint;
  v_start timestamptz;
  v_hits int;
begin
  if p_bucket is null or char_length(p_bucket) not between 1 and 200
     or p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds not between 60 and 86400 then
    raise exception 'bad_rate_limit';
  end if;
  v_start := to_timestamp(((v_epoch + v_offset) / p_window_seconds) * p_window_seconds - v_offset);

  insert into public.api_rate_limits (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = public.api_rate_limits.hits + 1
  returning hits into v_hits;

  -- 지난 기록 정리 (가끔 한 번, 2일 지난 구간)
  if random() < 0.02 then
    delete from public.api_rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

commit;

notify pgrst, 'reload schema';
