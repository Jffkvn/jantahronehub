insert into public.permissions (key, resource, action, description)
values
  ('files.read', 'files', 'read', 'Read authorized private files.'),
  ('files.manage', 'files', 'manage', 'Create and remove authorized private files.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.key = 'super_admin'
  and permission.key in ('files.read', 'files.manage')
on conflict (role_id, permission_id) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'private-files',
  'private-files',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_valid_private_file_path(object_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select object_name ~* (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
    '/[a-z][a-z0-9-]{0,62}' ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
    '[.](pdf|jpe?g|png|webp)$'
  )
$$;

revoke all on function public.is_valid_private_file_path(text)
from public, anon, authenticated;
grant execute on function public.is_valid_private_file_path(text) to authenticated;

drop policy if exists private_files_read on storage.objects;
create policy private_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'private-files'
  and public.is_valid_private_file_path(name)
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('files.read')
  )
);

drop policy if exists private_files_create on storage.objects;
create policy private_files_create on storage.objects
for insert to authenticated
with check (
  bucket_id = 'private-files'
  and public.is_valid_private_file_path(name)
  and lower(storage.extension(name)) in ('pdf', 'jpg', 'jpeg', 'png', 'webp')
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('files.manage')
  )
);

drop policy if exists private_files_remove on storage.objects;
create policy private_files_remove on storage.objects
for delete to authenticated
using (
  bucket_id = 'private-files'
  and public.is_valid_private_file_path(name)
  and public.has_permission('files.manage')
);

comment on function public.is_valid_private_file_path(text) is
  'Accepts only owner/category/record/random-name paths for private OneHub files.';
