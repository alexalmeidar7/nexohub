create or replace function public.current_parent_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(u.raw_user_meta_data ->> 'parent_user_id', '')::uuid
  from auth.users u
  where u.id = auth.uid()
$$;

grant execute on function public.current_parent_user_id() to authenticated, service_role;

drop policy if exists "Allow sub-users to upload to comercial bucket" on storage.objects;
create policy "Allow sub-users to upload to comercial bucket"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'comercial'
  and (
    (storage.foldername(name))[1] = (auth.uid())::text
    or (storage.foldername(name))[1] = (public.current_parent_user_id())::text
  )
);

drop policy if exists "Sub-users upload xml files" on storage.objects;
create policy "Sub-users upload xml files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'xml-files'
  and (storage.foldername(name))[1] = (public.current_parent_user_id())::text
);

drop policy if exists "Sub-users update xml files" on storage.objects;
create policy "Sub-users update xml files"
on storage.objects for update to authenticated
using (
  bucket_id = 'xml-files'
  and (storage.foldername(name))[1] = (public.current_parent_user_id())::text
)
with check (
  bucket_id = 'xml-files'
  and (storage.foldername(name))[1] = (public.current_parent_user_id())::text
);

drop policy if exists "Sub-users read xml files" on storage.objects;
create policy "Sub-users read xml files"
on storage.objects for select to authenticated
using (
  bucket_id = 'xml-files'
  and (storage.foldername(name))[1] = (public.current_parent_user_id())::text
);