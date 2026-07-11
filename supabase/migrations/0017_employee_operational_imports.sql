insert into public.permissions(key,resource,action,description) values
  ('employee_imports.manage','employee_imports','manage','Import and export operational employee records.');
insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id from public.roles role cross join public.permissions permission
where role.key in ('super_admin','hr_admin') and permission.key='employee_imports.manage' on conflict do nothing;

create table public.employee_import_batches(
  id uuid primary key default extensions.gen_random_uuid(), source_file_name text not null check(length(btrim(source_file_name)) between 1 and 255),
  source_file_hash text not null unique check(source_file_hash ~ '^[0-9a-f]{64}$'), status text not null default 'committed' check(status in ('committed','rolled_back')),
  created_count integer not null default 0 check(created_count>=0), updated_count integer not null default 0 check(updated_count>=0),
  imported_by uuid not null references public.profiles(id) on delete restrict, imported_at timestamptz not null default now()
);
create table public.employee_import_results(
  id uuid primary key default extensions.gen_random_uuid(), batch_id uuid not null references public.employee_import_batches(id) on delete restrict,
  row_number integer not null check(row_number>=2), action text not null check(action in ('create','update')), employee_id uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(), unique(batch_id,row_number)
);
alter table public.employee_import_batches enable row level security; alter table public.employee_import_results enable row level security;
create policy employee_import_batches_read on public.employee_import_batches for select to authenticated using(public.has_permission('employee_imports.manage'));
create policy employee_import_results_read on public.employee_import_results for select to authenticated using(public.has_permission('employee_imports.manage'));
revoke all on public.employee_import_batches,public.employee_import_results from anon,authenticated;
grant select on public.employee_import_batches,public.employee_import_results to authenticated;

create function public.commit_employee_import(source_file_name text,source_file_hash text,import_rows jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare actor uuid:=public.current_profile_id(); batch_id uuid; item jsonb; affected_id uuid; created_total integer:=0; updated_total integer:=0;
begin
  if not public.has_permission('employee_imports.manage') then raise insufficient_privilege using message='employee_imports.manage permission is required'; end if;
  if jsonb_typeof(import_rows)<>'array' or jsonb_array_length(import_rows)=0 or jsonb_array_length(import_rows)>1000 then raise check_violation using message='import must contain between 1 and 1000 rows'; end if;
  if exists(select 1 from public.employee_import_batches where employee_import_batches.source_file_hash=lower(commit_employee_import.source_file_hash)) then
    raise exception using errcode='23505',message='This employee workbook has already been imported.';
  end if;
  insert into public.employee_import_batches(source_file_name,source_file_hash,imported_by) values(btrim(source_file_name),lower(source_file_hash),actor) returning id into batch_id;
  for item in select value from jsonb_array_elements(import_rows) loop
    if item->>'action'='create' then
      affected_id:=public.create_employee_with_period(item->'employee_data',item->'period_data'); created_total:=created_total+1;
    elsif item->>'action'='update' and nullif(item->>'employee_id','') is not null then
      affected_id:=(item->>'employee_id')::uuid; perform public.update_employee_profile(affected_id,item->'employee_data',item->'period_data'); updated_total:=updated_total+1;
    else raise check_violation using message='invalid employee import action'; end if;
    insert into public.employee_import_results(batch_id,row_number,action,employee_id) values(batch_id,(item->>'row_number')::integer,item->>'action',affected_id);
  end loop;
  update public.employee_import_batches set created_count=created_total,updated_count=updated_total where id=batch_id;
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values) values(actor,'employee.imported','employee_import',batch_id::text,jsonb_build_object('created',created_total,'updated',updated_total,'file_hash',source_file_hash));
  return jsonb_build_object('batchId',batch_id,'created',created_total,'updated',updated_total);
end $$;

create function public.record_employee_export(exported_count integer)
returns void language plpgsql set search_path='' as $$
declare actor uuid:=public.current_profile_id();
begin
  if not public.has_permission('employee_imports.manage') then raise insufficient_privilege using message='employee_imports.manage permission is required'; end if;
  insert into public.audit_events(actor_profile_id,event_type,entity_type,new_values) values(actor,'employee.exported','employee_export',jsonb_build_object('count',exported_count));
end $$;
revoke all on function public.commit_employee_import(text,text,jsonb),public.record_employee_export(integer) from public,anon;
grant execute on function public.commit_employee_import(text,text,jsonb),public.record_employee_export(integer) to authenticated;
comment on function public.commit_employee_import(text,text,jsonb) is 'Commits a validated employee workbook atomically and rejects duplicate file hashes.';
