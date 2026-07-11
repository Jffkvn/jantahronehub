create or replace function public.create_employee_with_period(employee_data jsonb, period_data jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  employee_id uuid;
begin
  if not public.has_permission('employees.create') then
    raise insufficient_privilege using message = 'employees.create permission is required';
  end if;

  insert into public.employees (
    employee_number, legal_name, preferred_name, company_email, work_phone, created_by, updated_by
  ) values (
    employee_data->>'employee_number', employee_data->>'legal_name', nullif(employee_data->>'preferred_name', ''),
    nullif(employee_data->>'company_email', ''), nullif(employee_data->>'work_phone', ''), actor, actor
  ) returning id into employee_id;

  insert into public.employment_periods (
    employee_id, start_date, employment_type, contract_type, created_by, updated_by
  ) values (
    employee_id, (period_data->>'start_date')::date, period_data->>'employment_type',
    period_data->>'contract_type', actor, actor
  );

  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values)
  values (actor, 'employee.created', 'employee', employee_id::text, jsonb_build_object('employee_number', employee_data->>'employee_number'));

  return employee_id;
end
$$;

create or replace function public.offboard_employee(
  target_employee_id uuid,
  last_working_day date,
  reason text,
  notes text,
  pay_status text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  period_id uuid;
  previous_period jsonb;
begin
  if not public.has_permission('employees.update') then
    raise insufficient_privilege using message = 'employees.update permission is required';
  end if;
  if length(btrim(reason)) < 2 then raise check_violation using message = 'exit reason is required'; end if;
  if pay_status not in ('not_applicable', 'pending', 'prepared', 'paid') then raise check_violation using message = 'invalid final pay status'; end if;

  select id, to_jsonb(period) into period_id, previous_period
  from public.employment_periods period
  where employee_id = target_employee_id and end_date is null
  order by start_date desc limit 1 for update;
  if period_id is null then raise exception using errcode = 'P0002', message = 'open employment period not found'; end if;

  update public.employment_periods set
    end_date = last_working_day,
    exit_reason = btrim(reason),
    exit_notes = nullif(btrim(notes), ''),
    final_pay_status = pay_status,
    updated_by = actor,
    updated_at = now()
  where id = period_id;

  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, previous_values, new_values, reason)
  values (actor, 'employee.offboarded', 'employee', target_employee_id::text, previous_period,
    jsonb_build_object('end_date', last_working_day, 'final_pay_status', pay_status), btrim(reason));
end
$$;

create or replace function public.archive_employee(target_employee_id uuid, reason text)
returns void
language plpgsql
set search_path = ''
as $$
declare actor uuid := public.current_profile_id();
begin
  if not public.has_permission('employees.archive') then
    raise insufficient_privilege using message = 'employees.archive permission is required';
  end if;
  if length(btrim(reason)) < 3 then raise check_violation using message = 'archive reason is required'; end if;

  update public.employees set archived_at = now(), archived_by = actor, archive_reason = btrim(reason), updated_by = actor, updated_at = now()
  where id = target_employee_id and archived_at is null;
  if not found then raise exception using errcode = 'P0002', message = 'active employee not found'; end if;

  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, reason)
  values (actor, 'employee.archived', 'employee', target_employee_id::text, btrim(reason));
end
$$;

revoke all on function public.create_employee_with_period(jsonb, jsonb) from public, anon;
revoke all on function public.offboard_employee(uuid, date, text, text, text) from public, anon;
revoke all on function public.archive_employee(uuid, text) from public, anon;
grant execute on function public.create_employee_with_period(jsonb, jsonb) to authenticated;
grant execute on function public.offboard_employee(uuid, date, text, text, text) to authenticated;
grant execute on function public.archive_employee(uuid, text) to authenticated;

comment on function public.create_employee_with_period(jsonb, jsonb) is 'Atomically creates an employee and initial employment period with an audit event.';
comment on function public.offboard_employee(uuid, date, text, text, text) is 'Closes the open employment period and records the exit audit event.';
comment on function public.archive_employee(uuid, text) is 'Archives an invalid or duplicate employee record with a mandatory reason.';
