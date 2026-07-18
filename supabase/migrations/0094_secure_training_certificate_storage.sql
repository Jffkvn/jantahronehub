-- Let the storage policy evaluate certificate ownership without exposing training tables.
create or replace function public.can_read_training_document_path(p_storage_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.training_documents document
    join public.training_records record on record.id=document.training_record_id
    join public.employees employee on employee.id=record.employee_id
    where document.storage_path=p_storage_path
      and document.removed_at is null
      and (public.has_permission('training.manage') or employee.profile_id=auth.uid())
  )
$$;
revoke all on function public.can_read_training_document_path(text) from public,anon;
grant execute on function public.can_read_training_document_path(text) to authenticated;

drop policy if exists private_files_read on storage.objects;
create policy private_files_read on storage.objects for select to authenticated using (
  bucket_id = 'private-files' and public.is_valid_private_file_path(name) and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('files.read')
    or exists (select 1 from public.project_documents document where document.storage_path = storage.objects.name
      and document.archived_at is null and (public.has_permission('projects.read_all') or public.is_member_on_project(document.project_id, auth.uid())))
    or exists (select 1 from public.employee_documents document join public.employees employee on employee.id = document.employee_id
      where document.storage_path = storage.objects.name and document.employee_visible and document.archived_at is null
        and employee.profile_id = auth.uid() and employee.archived_at is null)
    or exists (select 1 from public.cash_advance_expenses expense join public.cash_advance_requests request on request.id = expense.cash_advance_id
      where expense.receipt_url = storage.objects.name and (request.user_id = auth.uid() or public.has_permission('cash_advances.manage')))
    or exists (select 1 from public.daily_updates update_row where storage.objects.name = any(update_row.photo_urls)
      and (public.has_permission('daily_updates.read_all') or public.is_member_on_project(update_row.project_id, auth.uid()) or update_row.submitted_by = auth.uid()))
    or exists (select 1 from public.leave_documents document
      where document.storage_path = storage.objects.name and document.removed_at is null
        and public.has_permission('leave.manage') and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
    or public.can_read_training_document_path(storage.objects.name)
  )
);
