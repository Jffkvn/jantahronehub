create or replace function public.commit_historical_payroll_import_reviewed(
  source_file_name text,
  source_file_hash text,
  profile_changes jsonb,
  import_periods jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  profile_change jsonb;
  action_value text;
  target_employee_id uuid;
  employee_number_value text;
  legal_name_value text;
  company_email_value text;
  start_date_value date;
  end_date_value date;
  employment_type_value text;
  contract_type_value text;
  previous_employee jsonb;
begin
  if not public.has_permission('payroll.migrate_history') then
    raise insufficient_privilege using message = 'payroll.migrate_history permission is required';
  end if;
  if jsonb_typeof(profile_changes) <> 'array'
    or jsonb_array_length(profile_changes) > 1000 then
    raise check_violation using message = 'profile changes must be an array containing at most 1000 rows';
  end if;
  if lower(source_file_hash) !~ '^[0-9a-f]{64}$' then
    raise check_violation using message = 'source file hash must be a 64-character hex digest';
  end if;
  if exists (
    select 1
    from public.historical_payroll_import_batches batch
    where batch.source_file_hash = lower(commit_historical_payroll_import_reviewed.source_file_hash)
  ) then
    raise exception using errcode = '23505', message = 'This historical payroll workbook has already been imported.';
  end if;

  for profile_change in select value from jsonb_array_elements(profile_changes) loop
    action_value := nullif(btrim(profile_change ->> 'action'), '');
    target_employee_id := nullif(profile_change ->> 'employee_id', '')::uuid;
    employee_number_value := nullif(btrim(profile_change ->> 'employee_number'), '');
    legal_name_value := nullif(btrim(profile_change ->> 'legal_name'), '');
    company_email_value := lower(nullif(btrim(profile_change ->> 'company_email'), ''));
    start_date_value := nullif(profile_change ->> 'start_date', '')::date;
    end_date_value := nullif(profile_change ->> 'end_date', '')::date;
    employment_type_value := nullif(profile_change ->> 'employment_type', '');
    contract_type_value := nullif(profile_change ->> 'contract_type', '');

    if action_value = 'create' then
      if target_employee_id is null
        or employee_number_value is null
        or legal_name_value is null
        or start_date_value is null
        or employment_type_value not in ('full_time', 'part_time', 'casual', 'intern', 'contractor')
        or contract_type_value not in ('permanent', 'fixed_term', 'casual', 'internship', 'consultancy') then
        raise check_violation using message = 'reviewed employee create data is incomplete or invalid';
      end if;
      if end_date_value is not null and end_date_value < start_date_value then
        raise check_violation using message = 'reviewed employee end date cannot precede the start date';
      end if;

      insert into public.employees(
        id, employee_number, legal_name, company_email, created_by, updated_by
      )
      values (
        target_employee_id, employee_number_value, legal_name_value,
        company_email_value, actor, actor
      );

      insert into public.employee_confidential_profiles(employee_id, created_by, updated_by)
      values (target_employee_id, actor, actor);

      insert into public.employment_periods(
        employee_id, start_date, end_date, employment_type, contract_type,
        created_by, updated_by
      )
      values (
        target_employee_id, start_date_value, end_date_value,
        employment_type_value, contract_type_value, actor, actor
      );

      insert into public.audit_events(
        actor_profile_id, event_type, entity_type, entity_id, new_values
      )
      values (
        actor, 'employee.history_import_created', 'employee', target_employee_id::text,
        jsonb_build_object(
          'employee_number', employee_number_value,
          'company_email', company_email_value,
          'source_file_hash', lower(source_file_hash)
        )
      );
    elsif action_value = 'enrich' then
      if target_employee_id is null or company_email_value is null then
        raise check_violation using message = 'reviewed employee enrichment requires an employee and company email';
      end if;

      select to_jsonb(employee)
      into previous_employee
      from public.employees employee
      where employee.id = target_employee_id
      for update;

      if previous_employee is null then
        raise exception using errcode = 'P0002', message = 'reviewed employee was not found';
      end if;
      if nullif(btrim(previous_employee ->> 'company_email'), '') is not null
        and lower(previous_employee ->> 'company_email') <> company_email_value then
        raise check_violation using message = 'reviewed enrichment cannot overwrite an existing company email';
      end if;

      if nullif(btrim(previous_employee ->> 'company_email'), '') is null then
        update public.employees
        set company_email = company_email_value,
          updated_by = actor,
          updated_at = now()
        where id = target_employee_id;

        insert into public.audit_events(
          actor_profile_id, event_type, entity_type, entity_id,
          previous_values, new_values
        )
        values (
          actor, 'employee.history_import_enriched', 'employee', target_employee_id::text,
          jsonb_build_object('company_email', previous_employee -> 'company_email'),
          jsonb_build_object(
            'company_email', company_email_value,
            'source_file_hash', lower(source_file_hash)
          )
        );
      end if;
    else
      raise check_violation using message = 'profile change action must be create or enrich';
    end if;
  end loop;

  return public.commit_historical_payroll_import(
    source_file_name,
    source_file_hash,
    import_periods
  );
end
$$;

revoke all on function public.commit_historical_payroll_import_reviewed(text, text, jsonb, jsonb)
from public, anon;
grant execute on function public.commit_historical_payroll_import_reviewed(text, text, jsonb, jsonb)
to authenticated;

comment on function public.commit_historical_payroll_import_reviewed(text, text, jsonb, jsonb) is
  'Atomically applies explicitly reviewed employee profile changes and commits immutable historical payroll.';
