-- 0042 — 메인 페이지 사진을 관리자가 직접 올리고 바꾸기 (2026-11-16 사용자 요청)
--   * 사진 칸 4개: hero(메인 맨 위 큰 사진) · gallery1(큰 칸) · gallery2(오른쪽 위) · gallery3(오른쪽 아래)
--   * 사진 파일은 저장소 'site-photos'(공개 읽기)에, 어느 칸에 어떤 파일인지는 site_photos 표에 둔다.
--   * 보기: 누구나 (메인 페이지에 보이는 사진이라 비로그인 방문자도 읽는다 — 개인정보 없음, 파일 이름만)
--   * 올리기·바꾸기·지우기: 관리자만 (표와 저장소 모두 DB 규칙으로 막는다. 화면에서 숨기는 것만이 아님)
--   * 사진을 바꿀 때마다 파일 이름이 달라져서(칸-시각.jpg) 브라우저에 예전 사진이 남지 않는다.
-- 0005(is_admin)를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

-- =====================================================================
-- 1. 어느 칸에 어떤 사진인지
-- =====================================================================
create table if not exists public.site_photos (
  slot text primary key check (slot in ('hero', 'gallery1', 'gallery2', 'gallery3')),
  path text not null check (path ~ '^[a-z0-9-]{1,80}\.(jpg|jpeg|png|webp)$'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function public.site_photos_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists site_photos_stamp on public.site_photos;
create trigger site_photos_stamp
  before insert or update on public.site_photos
  for each row execute function public.site_photos_stamp();
revoke all on function public.site_photos_stamp() from public, anon, authenticated;

alter table public.site_photos enable row level security;

drop policy if exists "site_photos_read" on public.site_photos;
create policy "site_photos_read" on public.site_photos
  for select to anon, authenticated using (true);

drop policy if exists "site_photos_admin_insert" on public.site_photos;
create policy "site_photos_admin_insert" on public.site_photos
  for insert to authenticated with check (public.is_admin());

drop policy if exists "site_photos_admin_update" on public.site_photos;
create policy "site_photos_admin_update" on public.site_photos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "site_photos_admin_delete" on public.site_photos;
create policy "site_photos_admin_delete" on public.site_photos
  for delete to authenticated using (public.is_admin());

revoke all on public.site_photos from anon, authenticated;
grant select on public.site_photos to anon, authenticated;
grant insert, update, delete on public.site_photos to authenticated;

-- =====================================================================
-- 2. 사진 저장소 (공개 읽기 · 5MB · jpg/png/webp). 쓰기는 관리자만
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 공개 저장소라 사진 주소로 보는 데는 규칙이 필요 없다. 아래는 관리자의 목록 보기·올리기·지우기용.
drop policy if exists "site_photos_admin_read" on storage.objects;
create policy "site_photos_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'site-photos' and public.is_admin());

drop policy if exists "site_photos_admin_upload" on storage.objects;
create policy "site_photos_admin_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-photos' and public.is_admin());

drop policy if exists "site_photos_admin_replace" on storage.objects;
create policy "site_photos_admin_replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-photos' and public.is_admin())
  with check (bucket_id = 'site-photos' and public.is_admin());

drop policy if exists "site_photos_admin_remove" on storage.objects;
create policy "site_photos_admin_remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-photos' and public.is_admin());

commit;

notify pgrst, 'reload schema';
