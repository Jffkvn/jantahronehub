-- Legacy-compatible training records with private certificate evidence and expiry alerts.
insert into public.permissions(key,resource,action,description) values
 ('training.read_self','training','read_self','Read personal training and certification history.'),
 ('training.manage','training','manage','Log, edit and monitor employee training and certifications.'),
 ('training.report','training','report','Read training and certification summaries.')
on conflict(key) do update set description=excluded.description;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where p.key='training.read_self' and r.key in ('employee','coordinator','project_manager','warehouse_manager','cfo','managing_director','hr_admin','super_admin') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where p.key='training.manage' and r.key in ('hr_admin','super_admin') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where p.key='training.report' and r.key in ('hr_admin','super_admin','managing_director') on conflict do nothing;

create table public.training_records(
 id uuid primary key default extensions.gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete restrict,
 topic text not null check(length(btrim(topic)) between 2 and 200), provider text check(provider is null or length(btrim(provider))<=200), completion_date date not null,
 duration_hours numeric(8,2) check(duration_hours is null or duration_hours between 0 and 10000), cost_ugx numeric(14,2) check(cost_ugx is null or cost_ugx between 0 and 1000000000),
 status text not null check(status in ('scheduled','attended','passed','failed')), expiry_date date check(expiry_date is null or expiry_date>=completion_date), certificate_reference text check(certificate_reference is null or length(btrim(certificate_reference))<=160),
 created_by uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(), updated_by uuid not null references public.profiles(id) on delete restrict, updated_at timestamptz not null default now()
);
create index training_records_employee_idx on public.training_records(employee_id,completion_date desc);
create index training_records_expiry_idx on public.training_records(expiry_date) where expiry_date is not null;
create table public.training_documents(
 id uuid primary key default extensions.gen_random_uuid(), training_record_id uuid not null references public.training_records(id) on delete restrict,
 storage_path text not null unique, original_file_name text not null check(length(btrim(original_file_name)) between 1 and 255),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760), uploaded_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), removed_at timestamptz, removed_by uuid references public.profiles(id) on delete restrict,
 constraint training_document_path_valid check(public.is_valid_private_file_path(storage_path))
);
create index training_documents_record_idx on public.training_documents(training_record_id,created_at) where removed_at is null;
alter table public.training_records enable row level security; alter table public.training_documents enable row level security;
revoke all on public.training_records,public.training_documents from anon,authenticated;

alter table public.notifications drop constraint if exists notifications_action_path_check;
alter table public.notifications add constraint notifications_action_path_check check(action_path is null or (action_path ~ '^/[A-Za-z0-9_/-]+(\?(request|advance|review|training)=[0-9a-f-]{36})?$' and action_path !~ '//' and action_path !~ '\.\.'));

create or replace function public._training_employee_for_profile(p_profile_id uuid) returns uuid language sql stable security definer set search_path='' as $$ select e.id from public.employees e where e.profile_id=p_profile_id and e.archived_at is null limit 1 $$;
create or replace function public._training_rows(p_self_only boolean)
returns table(id uuid,employee_id uuid,employee_number text,employee_name text,topic text,provider text,completion_date date,duration_hours numeric,cost_ugx numeric,status text,expiry_date date,certificate_reference text,certificate_count bigint,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select r.id,r.employee_id,e.employee_number,e.legal_name,r.topic,r.provider,r.completion_date,r.duration_hours,r.cost_ugx,r.status,r.expiry_date,r.certificate_reference,count(d.id),r.created_at
 from public.training_records r join public.employees e on e.id=r.employee_id left join public.training_documents d on d.training_record_id=r.id and d.removed_at is null
 where (not p_self_only and public.has_permission('training.manage')) or (p_self_only and r.employee_id=public._training_employee_for_profile(public.current_profile_id()))
 group by r.id,e.id order by r.completion_date desc,r.created_at desc $$;
revoke all on function public._training_employee_for_profile(uuid),public._training_rows(boolean) from public,anon,authenticated;

create or replace function public.rpc_list_training_records() returns table(id uuid,employee_id uuid,employee_number text,employee_name text,topic text,provider text,completion_date date,duration_hours numeric,cost_ugx numeric,status text,expiry_date date,certificate_reference text,certificate_count bigint,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin if not public.has_permission('training.manage') then raise exception 'training.manage permission is required' using errcode='42501'; end if; return query select * from public._training_rows(false); end $$;
create or replace function public.rpc_list_my_training_records() returns table(id uuid,employee_id uuid,employee_number text,employee_name text,topic text,provider text,completion_date date,duration_hours numeric,cost_ugx numeric,status text,expiry_date date,certificate_reference text,certificate_count bigint,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$ begin if not public.has_permission('training.read_self') then raise exception 'training.read_self permission is required' using errcode='42501'; end if; return query select * from public._training_rows(true); end $$;

create or replace function public.rpc_log_training_records(p_employee_ids uuid[],p_topic text,p_provider text,p_completion_date date,p_duration_hours numeric,p_cost_ugx numeric,p_status text,p_expiry_date date,p_certificate_reference text) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id();v_employee uuid;v_ids uuid[]:='{}';v_id uuid;v_profile uuid;v_name text;
begin if not public.has_permission('training.manage') then raise exception 'training.manage permission is required' using errcode='42501'; end if;
 if coalesce(array_length(p_employee_ids,1),0)=0 or length(btrim(coalesce(p_topic,'')))<2 or p_status not in ('scheduled','attended','passed','failed') or (p_expiry_date is not null and p_expiry_date<p_completion_date) then raise exception 'Enter valid training details and at least one employee.' using errcode='22023'; end if;
 foreach v_employee in array p_employee_ids loop select profile_id,legal_name into v_profile,v_name from public.employees where id=v_employee and archived_at is null; if v_name is null then raise exception 'Employee not found.' using errcode='P0002'; end if;
  insert into public.training_records(employee_id,topic,provider,completion_date,duration_hours,cost_ugx,status,expiry_date,certificate_reference,created_by,updated_by) values(v_employee,btrim(p_topic),nullif(btrim(p_provider),''),p_completion_date,p_duration_hours,p_cost_ugx,p_status,p_expiry_date,nullif(btrim(p_certificate_reference),''),v_actor,v_actor) returning id into v_id;v_ids:=array_append(v_ids,v_id);
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values) values(v_actor,'training_record.created','training_record',v_id::text,jsonb_build_object('employee_id',v_employee,'topic',btrim(p_topic),'status',p_status,'expiry_date',p_expiry_date));
  if v_profile is not null then insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path) values(v_profile,'Training Record Added',btrim(p_topic)||' was added to your training history.','hr','training_added_'||v_id,'/my/training?training='||v_id) on conflict(event_key) do nothing;end if;
 end loop;return v_ids;end $$;

create or replace function public.rpc_update_training_record(p_record_id uuid,p_topic text,p_provider text,p_completion_date date,p_duration_hours numeric,p_cost_ugx numeric,p_status text,p_expiry_date date,p_certificate_reference text) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id();v_old public.training_records%rowtype;
begin if not public.has_permission('training.manage') then raise exception 'training.manage permission is required' using errcode='42501';end if;select * into v_old from public.training_records where id=p_record_id for update;if v_old.id is null then raise exception 'Training record not found.' using errcode='P0002';end if;
 if length(btrim(coalesce(p_topic,'')))<2 or p_status not in ('scheduled','attended','passed','failed') or (p_expiry_date is not null and p_expiry_date<p_completion_date) then raise exception 'Enter valid training details.' using errcode='22023';end if;
 update public.training_records set topic=btrim(p_topic),provider=nullif(btrim(p_provider),''),completion_date=p_completion_date,duration_hours=p_duration_hours,cost_ugx=p_cost_ugx,status=p_status,expiry_date=p_expiry_date,certificate_reference=nullif(btrim(p_certificate_reference),''),updated_by=v_actor,updated_at=now() where id=p_record_id;
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values) values(v_actor,'training_record.updated','training_record',p_record_id::text,to_jsonb(v_old)-'created_by'-'updated_by',jsonb_build_object('topic',btrim(p_topic),'status',p_status,'expiry_date',p_expiry_date));end $$;

create or replace function public.rpc_attach_training_document(p_training_record_id uuid,p_storage_path text,p_original_file_name text,p_mime_type text,p_size_bytes bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id();v_id uuid;
begin if not public.has_permission('training.manage') then raise exception 'training.manage permission is required' using errcode='42501';end if;if not exists(select 1 from public.training_records where id=p_training_record_id) then raise exception 'Training record not found.' using errcode='P0002';end if;
 if (select count(*) from public.training_documents d where d.training_record_id=p_training_record_id and d.removed_at is null)>=10 then raise exception 'A training record can contain up to 10 certificate files.' using errcode='23514';end if;
 if p_storage_path!~('^'||v_actor::text||'/training-certificates/'||p_training_record_id||'/[0-9a-f-]{36}\.(pdf|jpe?g|png|webp|heic|heif|avif)$')
   or not public.is_valid_private_file_path(p_storage_path)
   or lower(p_mime_type) not in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif')
   or p_size_bytes not between 1 and 10485760
   or not exists(select 1 from storage.objects o where o.bucket_id='private-files' and o.name=p_storage_path)
 then raise exception 'Invalid certificate file metadata.' using errcode='22023';end if;
 insert into public.training_documents(training_record_id,storage_path,original_file_name,mime_type,size_bytes,uploaded_by) values(p_training_record_id,p_storage_path,btrim(p_original_file_name),lower(p_mime_type),p_size_bytes,v_actor) returning id into v_id;
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values) values(v_actor,'training_document.attached','training_record',p_training_record_id::text,jsonb_build_object('document_id',v_id,'file_name',btrim(p_original_file_name)));return v_id;end $$;
create or replace function public.rpc_list_training_documents(p_training_record_id uuid) returns table(id uuid,storage_path text,original_file_name text,mime_type text,size_bytes bigint,created_at timestamptz) language plpgsql stable security definer set search_path='' as $$
declare v_employee uuid;begin select employee_id into v_employee from public.training_records where id=p_training_record_id;if v_employee is null then raise exception 'Training record not found.' using errcode='P0002';end if;if not public.has_permission('training.manage') and v_employee<>public._training_employee_for_profile(public.current_profile_id()) then raise exception 'Training record access is required.' using errcode='42501';end if;return query select d.id,d.storage_path,d.original_file_name,d.mime_type,d.size_bytes,d.created_at from public.training_documents d where d.training_record_id=p_training_record_id and d.removed_at is null order by d.created_at;end $$;

create or replace function public.rpc_remove_training_document(p_document_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=public.current_profile_id();v_document public.training_documents%rowtype;
begin if not public.has_permission('training.manage') then raise exception 'training.manage permission is required' using errcode='42501';end if;
 select * into v_document from public.training_documents where id=p_document_id for update;
 if v_document.id is null or v_document.removed_at is not null then raise exception 'Training document not found.' using errcode='P0002';end if;
 update public.training_documents set removed_at=now(),removed_by=v_actor where id=p_document_id;
 insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values)
 values(v_actor,'training_document.removed','training_record',v_document.training_record_id::text,jsonb_build_object('document_id',v_document.id,'file_name',v_document.original_file_name));
end $$;

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
    or exists (select 1 from public.training_documents document
      join public.training_records record on record.id=document.training_record_id
      join public.employees employee on employee.id=record.employee_id
      where document.storage_path=storage.objects.name and document.removed_at is null
        and (public.has_permission('training.manage') or employee.profile_id=auth.uid()))
  )
);

create or replace function public.rpc_refresh_training_expiry_alerts() returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer:=0;
begin if not public.has_permission('training.manage') then raise exception 'training.manage permission is required' using errcode='42501';end if;
 insert into public.notifications(recipient_profile_id,title,message,category,event_key,action_path)
 select distinct ur.profile_id,'Training Certificates Need Attention',alert.total||' certificate(s) are expired or expire within 60 days.','hr','training_expiry_'||current_date||'_'||ur.profile_id, '/hr/training'
 from public.user_roles ur join public.roles role on role.id=ur.role_id cross join (select count(*)::integer total from public.training_records where expiry_date<=current_date+60 having count(*)>0) alert where role.key in ('hr_admin','super_admin') on conflict(event_key) do nothing;
 get diagnostics v_count=row_count;return v_count;end $$;

grant execute on function public.rpc_list_training_records(),public.rpc_list_my_training_records(),public.rpc_log_training_records(uuid[],text,text,date,numeric,numeric,text,date,text),public.rpc_update_training_record(uuid,text,text,date,numeric,numeric,text,date,text),public.rpc_attach_training_document(uuid,text,text,text,bigint),public.rpc_list_training_documents(uuid),public.rpc_remove_training_document(uuid),public.rpc_refresh_training_expiry_alerts() to authenticated;
