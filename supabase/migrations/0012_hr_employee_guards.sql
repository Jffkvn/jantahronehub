alter table public.employee_documents
drop constraint employee_documents_storage_path_check;

alter table public.employee_documents
add constraint employee_documents_storage_path_layout check (
  storage_path = btrim(storage_path)
  and storage_path !~ '(^|/)\.\.(/|$)'
  and storage_path ~ '^[0-9a-f-]+/employees/[0-9a-f-]+/[0-9a-f-]+[.](pdf|jpg|jpeg|png|webp)$'
  and split_part(storage_path, '/', 1) = uploaded_by::text
  and split_part(storage_path, '/', 3) = employee_id::text
);

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.key in ('files.read', 'files.manage')
where role.key = 'hr_admin'
on conflict do nothing;

create or replace function public.guard_employee_archive_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    old.archived_at is distinct from new.archived_at
    or old.archived_by is distinct from new.archived_by
    or old.archive_reason is distinct from new.archive_reason
  ) and not public.has_permission('employees.archive') then
    raise insufficient_privilege
      using message = 'employees.archive permission is required to change archive state';
  end if;

  return new;
end
$$;

create trigger guard_employee_archive_change
before update of archived_at, archived_by, archive_reason on public.employees
for each row execute function public.guard_employee_archive_change();

revoke all on function public.guard_employee_archive_change() from public, anon, authenticated;

drop policy private_files_read on storage.objects;
create policy private_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'private-files'
  and public.is_valid_private_file_path(name)
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('files.read')
    or exists (
      select 1
      from public.employee_documents document
      join public.employees employee on employee.id = document.employee_id
      where document.storage_path = storage.objects.name
        and document.employee_visible
        and document.archived_at is null
        and employee.profile_id = auth.uid()
        and employee.archived_at is null
    )
  )
);

comment on function public.guard_employee_archive_change() is
  'Requires the dedicated archive permission when employee archive state changes.';
