create or replace function public.update_employee_profile(target_employee_id uuid, employee_data jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  previous_employee jsonb;
begin
  if not public.has_permission('employees.update') then
    raise insufficient_privilege using message = 'employees.update permission is required';
  end if;

  select to_jsonb(employee) into previous_employee
  from public.employees employee where id = target_employee_id for update;
  if previous_employee is null then raise exception using errcode = 'P0002', message = 'employee not found'; end if;

  update public.employees set
    employee_number = employee_data->>'employee_number',
    legal_name = employee_data->>'legal_name',
    preferred_name = nullif(employee_data->>'preferred_name', ''),
    company_email = nullif(employee_data->>'company_email', ''),
    work_phone = nullif(employee_data->>'work_phone', ''),
    updated_by = actor,
    updated_at = now()
  where id = target_employee_id;

  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, previous_values, new_values)
  values (actor, 'employee.updated', 'employee', target_employee_id::text, previous_employee,
    jsonb_build_object('employee_number', employee_data->>'employee_number', 'legal_name', employee_data->>'legal_name'));
end
$$;

revoke all on function public.update_employee_profile(uuid, jsonb) from public, anon;
grant execute on function public.update_employee_profile(uuid, jsonb) to authenticated;

comment on function public.update_employee_profile(uuid, jsonb) is
  'Updates employee identity/contact fields atomically and appends an audit event.';
