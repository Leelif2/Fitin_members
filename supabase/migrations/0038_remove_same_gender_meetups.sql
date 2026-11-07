-- 0038 — "같은 성별" 모임 기능 삭제 (2026-11-07 사용자 결정)
--   * 새 모임은 항상 같은 성별 제한 없음 (예전 화면이 보내도 DB가 false로 저장).
--   * 이미 열려 있는 "같은 성별" 모임도 제한을 풀어서 모든 회원에게 보이고 참여할 수 있게 한다.
--   * 성별 칸(profiles.gender)은 회원 성비 통계용으로 그대로 둔다 (선택 항목).
-- 0012를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

update public.meetups set same_gender = false where same_gender;
alter table public.meetups alter column same_gender set default false;

-- 이름이 'meetups_a…'라서 기존 meetups_before_insert보다 먼저 실행된다 (트리거는 이름순).
create or replace function public.meetups_no_same_gender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.same_gender := false;
  return new;
end;
$$;
drop trigger if exists meetups_a_no_same_gender on public.meetups;
create trigger meetups_a_no_same_gender
  before insert on public.meetups
  for each row execute function public.meetups_no_same_gender();
revoke all on function public.meetups_no_same_gender() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
