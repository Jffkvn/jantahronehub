-- Qualify training record columns that overlap with RPC output column names.
create or replace function public.rpc_list_training_documents(p_training_record_id uuid)
returns table(id uuid,storage_path text,original_file_name text,mime_type text,size_bytes bigint,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare v_employee uuid;
begin
  select record.employee_id into v_employee
  from public.training_records record
  where record.id=p_training_record_id;
  if v_employee is null then raise exception 'Training record not found.' using errcode='P0002';end if;
  if not public.has_permission('training.manage') and v_employee<>public._training_employee_for_profile(public.current_profile_id()) then
    raise exception 'Training record access is required.' using errcode='42501';
  end if;
  return query
  select document.id,document.storage_path,document.original_file_name,document.mime_type,document.size_bytes,document.created_at
  from public.training_documents document
  where document.training_record_id=p_training_record_id and document.removed_at is null
  order by document.created_at;
end $$;

revoke all on function public.rpc_list_training_documents(uuid) from public,anon;
grant execute on function public.rpc_list_training_documents(uuid) to authenticated;
