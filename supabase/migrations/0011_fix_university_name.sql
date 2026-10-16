begin;

update public.profiles
set university = 'University of Utah'
where lower(trim(university)) = 'university of utha';

commit;

notify pgrst, 'reload schema';
