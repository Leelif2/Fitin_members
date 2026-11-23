-- 0048: Apply upload limits on the server, including requests that bypass the website.
-- Both website upload flows decode the source image and upload a new JPEG.
-- Run after 0023_student_id_verification.sql and 0042_site_photos.sql.
begin;

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg']
where id = 'student-ids';

update storage.buckets
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg']
where id = 'site-photos';

drop policy if exists "student_ids_member_upload" on storage.objects;
create policy "student_ids_member_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-ids'
    and name ~ ('^' || auth.uid()::text || '/[0-9]{13}\.jpg$')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.verify_status in ('none', 'rejected')
    )
  );

drop policy if exists "site_photos_admin_upload" on storage.objects;
create policy "site_photos_admin_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-photos'
    and name ~ '^(hero|gallery[1-3])-[0-9]{13}\.jpg$'
    and public.is_admin()
  );

drop policy if exists "site_photos_admin_replace" on storage.objects;
create policy "site_photos_admin_replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-photos' and public.is_admin())
  with check (
    bucket_id = 'site-photos'
    and name ~ '^(hero|gallery[1-3])-[0-9]{13}\.jpg$'
    and public.is_admin()
  );

commit;

notify pgrst, 'reload schema';
