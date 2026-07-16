-- Private project documents, role-safe history and guarded lifecycle changes.

create table public.project_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict
);
create index project_documents_project_idx on public.project_documents (project_id, created_at desc) where archived_at is null;
alter table public.project_documents enable row level security;

create policy project_documents_read on public.project_documents for select to authenticated using (
  archived_at is null and (
    public.has_permission('projects.read_all')
    or public.is_member_on_project(project_id, public.current_profile_id())
  )
);
revoke all on table public.project_documents from public, anon, authenticated;
grant select on table public.project_documents to authenticated;

create or replace function public.rpc_register_project_document(
  p_project_id uuid, p_document_id uuid, p_display_name text,
  p_storage_path text, p_mime_type text, p_size_bytes bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id();
begin
  if actor is null or not (
    public.has_permission('projects.assign_all')
    or public.has_permission('projects.update_all')
    or public.is_pm_on_project(p_project_id, actor)
  ) then raise insufficient_privilege using message = 'project document upload authority is required'; end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
     or p_size_bytes not between 1 and 10485760 then
    raise invalid_parameter_value using message = 'project document type or size is not allowed';
  end if;
  if p_storage_path !~ ('^' || actor::text || '/projects/' || p_project_id::text || '/' || p_document_id::text || '[.](pdf|jpe?g|png|webp)$')
     or not public.is_valid_private_file_path(p_storage_path) then
    raise invalid_parameter_value using message = 'project document path is invalid';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'private-files' and object.name = p_storage_path
  ) then raise invalid_parameter_value using message = 'project document upload was not found'; end if;
  insert into public.project_documents (id, project_id, uploaded_by, display_name, storage_path, mime_type, size_bytes)
  values (p_document_id, p_project_id, actor, btrim(p_display_name), p_storage_path, p_mime_type, p_size_bytes);
  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values)
  values (actor, 'projects.document_added', 'project_document', p_document_id::text, jsonb_build_object('project_id', p_project_id, 'display_name', btrim(p_display_name)));
  return p_document_id;
end $$;

drop policy if exists private_files_read on storage.objects;
create policy private_files_read on storage.objects for select to authenticated using (
  bucket_id = 'private-files' and public.is_valid_private_file_path(name) and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('files.read')
    or exists (
      select 1 from public.project_documents document
      where document.storage_path = storage.objects.name and document.archived_at is null
        and (public.has_permission('projects.read_all') or public.is_member_on_project(document.project_id, auth.uid()))
    )
    or exists (
      select 1 from public.employee_documents document join public.employees employee on employee.id = document.employee_id
      where document.storage_path = storage.objects.name and document.employee_visible and document.archived_at is null
        and employee.profile_id = auth.uid() and employee.archived_at is null
    )
  )
);

create or replace function public.rpc_get_project_history(p_project_id uuid)
returns table (event_type text, occurred_at timestamptz, actor_name text, reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('projects.read_all') or public.has_permission('projects.read_operational') or public.is_member_on_project(p_project_id, public.current_profile_id())) then
    raise insufficient_privilege using message = 'project history access is required';
  end if;
  return query
  select event.event_type, event.occurred_at, profile.display_name, event.reason
  from public.audit_events event
  left join public.profiles profile on profile.id = event.actor_profile_id
  where (event.entity_type = 'project' and event.entity_id = p_project_id::text)
     or (event.new_values ->> 'project_id')::uuid = p_project_id
  order by event.occurred_at desc;
end $$;

create or replace function public.rpc_check_project_completion(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare cash record; inventory record; warnings jsonb := '[]'::jsonb;
begin
  if not (public.has_permission('projects.read_all') or public.is_member_on_project(p_project_id, public.current_profile_id())) then
    raise insufficient_privilege using message = 'project completion access is required';
  end if;
  select * into cash from public.rpc_get_project_cash_summary(p_project_id);
  select * into inventory from public.rpc_get_project_inventory_summary(p_project_id);
  if cash.outstanding_balance > 0 or cash.pending_accountability_count > 0 then warnings := warnings || jsonb_build_array(jsonb_build_object('domain','cash','message', cash.pending_accountability_count || ' pending accountability item(s); outstanding ' || cash.outstanding_balance)); end if;
  if inventory.active_equipment_custody_count > 0 or inventory.overdue_return_count > 0 then warnings := warnings || jsonb_build_array(jsonb_build_object('domain','inventory','message', inventory.active_equipment_custody_count || ' active custody item(s); ' || inventory.overdue_return_count || ' overdue')); end if;
  return jsonb_build_object('can_complete', jsonb_array_length(warnings) = 0, 'warnings', warnings);
end $$;

create or replace function public.rpc_transition_project_status(
  p_project_id uuid, p_target_status text, p_reason text,
  p_override_domain text default null, p_override_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id(); existing public.projects%rowtype; check_result jsonb; warning_domains text[];
begin
  if actor is null or not (public.has_permission('projects.update_all') or public.has_permission('projects.assign_all') or public.is_pm_on_project(p_project_id, actor)) then raise insufficient_privilege using message = 'project status authority is required'; end if;
  if p_target_status not in ('planned','active','on_hold','completed','cancelled','archived') then raise invalid_parameter_value using message = 'unsupported project status'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise check_violation using message = 'status reason must contain between 3 and 500 characters'; end if;
  select * into existing from public.projects where id = p_project_id for update;
  if not found then raise no_data_found using message = 'project not found'; end if;
  if existing.status = p_target_status then raise invalid_parameter_value using message = 'project already has that status'; end if;
  if p_target_status = 'completed' then
    check_result := public.rpc_check_project_completion(p_project_id);
    select array_agg(value->>'domain') into warning_domains from jsonb_array_elements(check_result->'warnings') value;
    if coalesce(array_length(warning_domains,1),0) > 0 then
      if p_override_domain is null or not (p_override_domain = any(warning_domains)) or length(btrim(coalesce(p_override_reason,''))) < 3 then raise check_violation using message = 'project completion warnings must be resolved or explicitly overridden'; end if;
      if p_override_domain = 'cash' and not (public.profile_has_role(actor,'cfo') or public.profile_has_role(actor,'super_admin')) then raise insufficient_privilege using message = 'cash completion override requires CFO authority'; end if;
      if p_override_domain = 'inventory' and not (public.profile_has_role(actor,'warehouse_manager') or public.profile_has_role(actor,'super_admin')) then raise insufficient_privilege using message = 'inventory completion override requires Warehouse authority'; end if;
      if array_length(warning_domains,1) > 1 then raise check_violation using message = 'all completion warning domains must be resolved before completion'; end if;
    end if;
  end if;
  update public.projects set status = p_target_status, actual_completion_date = case when p_target_status='completed' then current_date else actual_completion_date end, updated_by = actor, updated_at = now() where id = p_project_id;
  insert into public.audit_events (actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values,reason)
  values (actor,'projects.status_changed','project',p_project_id::text,jsonb_build_object('status',existing.status),jsonb_build_object('status',p_target_status,'override_domain',p_override_domain,'override_reason',p_override_reason),btrim(p_reason));
end $$;

revoke all on function public.rpc_register_project_document(uuid,uuid,text,text,text,bigint) from public,anon;
revoke all on function public.rpc_get_project_history(uuid) from public,anon;
revoke all on function public.rpc_check_project_completion(uuid) from public,anon;
revoke all on function public.rpc_transition_project_status(uuid,text,text,text,text) from public,anon;
grant execute on function public.rpc_register_project_document(uuid,uuid,text,text,text,bigint) to authenticated;
grant execute on function public.rpc_get_project_history(uuid) to authenticated;
grant execute on function public.rpc_check_project_completion(uuid) to authenticated;
grant execute on function public.rpc_transition_project_status(uuid,text,text,text,text) to authenticated;
