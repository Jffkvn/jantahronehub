-- HR Setup is deliberately exposed through guarded RPCs instead of direct table
-- writes. This keeps authorization, dependency checks and audit records in the
-- same transaction for every department, job-title and pay-grade change.

create or replace function public.hr_setup_assert_access(change_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
begin
  if not public.has_permission('employees.manage_setup') then
    raise insufficient_privilege using
      message = 'employees.manage_setup permission is required';
  end if;

  if actor is null then
    raise insufficient_privilege using
      message = 'an active profile is required';
  end if;

  if length(btrim(coalesce(change_reason, ''))) not between 3 and 500 then
    raise check_violation using
      message = 'change reason must contain between 3 and 500 characters';
  end if;

  return actor;
end
$$;

comment on function public.hr_setup_assert_access(text) is
  'Private helper that verifies HR Setup permission and a meaningful audit reason.';

create or replace function public.hr_list_setup_records()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('employees.manage_setup') then
    raise insufficient_privilege using
      message = 'employees.manage_setup permission is required';
  end if;

  return jsonb_build_object(
    'departments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', department.id,
          'code', department.code,
          'name', department.name,
          'description', department.description,
          'archived_at', department.archived_at,
          'current_employee_count', (
            select count(*)
            from public.employment_periods period
            join public.employees employee on employee.id = period.employee_id
            where period.department_id = department.id
              and employee.archived_at is null
              and period.start_date <= current_date
              and (period.end_date is null or period.end_date >= current_date)
          ),
          'active_job_title_count', (
            select count(*)
            from public.job_titles title
            where title.department_id = department.id
              and title.archived_at is null
          )
        ) order by (department.archived_at is not null), department.name
      )
      from public.departments department
    ), '[]'::jsonb),
    'job_titles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', title.id,
          'department_id', title.department_id,
          'department_name', department.name,
          'code', title.code,
          'name', title.name,
          'description', title.description,
          'archived_at', title.archived_at,
          'current_employee_count', (
            select count(*)
            from public.employment_periods period
            join public.employees employee on employee.id = period.employee_id
            where period.job_title_id = title.id
              and employee.archived_at is null
              and period.start_date <= current_date
              and (period.end_date is null or period.end_date >= current_date)
          )
        ) order by (title.archived_at is not null), title.name
      )
      from public.job_titles title
      left join public.departments department on department.id = title.department_id
    ), '[]'::jsonb),
    'pay_grades', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', grade.id,
          'code', grade.code,
          'name', grade.name,
          'currency_code', grade.currency_code,
          'minimum_gross', grade.minimum_gross,
          'maximum_gross', grade.maximum_gross,
          'description', grade.description,
          'archived_at', grade.archived_at,
          'current_employee_count', (
            select count(*)
            from public.employment_periods period
            join public.employees employee on employee.id = period.employee_id
            where period.pay_grade_id = grade.id
              and employee.archived_at is null
              and period.start_date <= current_date
              and (period.end_date is null or period.end_date >= current_date)
          )
        ) order by (grade.archived_at is not null), grade.name
      )
      from public.pay_grades grade
    ), '[]'::jsonb)
  );
end
$$;

comment on function public.hr_list_setup_records() is
  'Returns canonical HR Setup records and current dependency counts to authorized HR users.';

create or replace function public.hr_save_department(
  target_id uuid,
  setup_code text,
  setup_name text,
  setup_description text,
  change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.hr_setup_assert_access(change_reason);
  saved public.departments%rowtype;
  previous_values jsonb;
begin
  if target_id is null then
    insert into public.departments (code, name, description)
    values (
      upper(btrim(setup_code)),
      btrim(setup_name),
      btrim(coalesce(setup_description, ''))
    )
    returning * into saved;
  else
    -- Lock the selected row so two administrators cannot overwrite each other.
    select to_jsonb(department)
    into previous_values
    from public.departments department
    where department.id = target_id
    for update;

    if previous_values is null then
      raise no_data_found using message = 'department not found';
    end if;

    update public.departments
    set code = upper(btrim(setup_code)),
        name = btrim(setup_name),
        description = btrim(coalesce(setup_description, '')),
        updated_at = now()
    where id = target_id
    returning * into saved;
  end if;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    actor,
    case when target_id is null then 'hr_setup.department_created' else 'hr_setup.department_updated' end,
    'department',
    saved.id::text,
    previous_values,
    to_jsonb(saved),
    btrim(change_reason)
  );

  return to_jsonb(saved);
exception
  when unique_violation then
    raise unique_violation using message = 'department code or name already exists';
end
$$;

comment on function public.hr_save_department(uuid, text, text, text, text) is
  'Creates or updates a department atomically and records the reason in the audit ledger.';

create or replace function public.hr_save_job_title(
  target_id uuid,
  target_department_id uuid,
  setup_code text,
  setup_name text,
  setup_description text,
  change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.hr_setup_assert_access(change_reason);
  saved public.job_titles%rowtype;
  previous_values jsonb;
begin
  if target_department_id is not null and not exists (
    select 1 from public.departments department
    where department.id = target_department_id and department.archived_at is null
  ) then
    raise foreign_key_violation using message = 'active department not found';
  end if;

  if target_id is null then
    insert into public.job_titles (department_id, code, name, description)
    values (
      target_department_id,
      upper(btrim(setup_code)),
      btrim(setup_name),
      btrim(coalesce(setup_description, ''))
    )
    returning * into saved;
  else
    select to_jsonb(title)
    into previous_values
    from public.job_titles title
    where title.id = target_id
    for update;

    if previous_values is null then
      raise no_data_found using message = 'job title not found';
    end if;

    update public.job_titles
    set department_id = target_department_id,
        code = upper(btrim(setup_code)),
        name = btrim(setup_name),
        description = btrim(coalesce(setup_description, '')),
        updated_at = now()
    where id = target_id
    returning * into saved;
  end if;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    actor,
    case when target_id is null then 'hr_setup.job_title_created' else 'hr_setup.job_title_updated' end,
    'job_title',
    saved.id::text,
    previous_values,
    to_jsonb(saved),
    btrim(change_reason)
  );

  return to_jsonb(saved);
exception
  when unique_violation then
    raise unique_violation using message = 'job title code or name already exists';
end
$$;

comment on function public.hr_save_job_title(uuid, uuid, text, text, text, text) is
  'Creates or updates a department-linked job title and writes an audit event in the same transaction.';

create or replace function public.hr_save_pay_grade(
  target_id uuid,
  setup_code text,
  setup_name text,
  setup_currency_code text,
  minimum_gross numeric,
  maximum_gross numeric,
  setup_description text,
  change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.hr_setup_assert_access(change_reason);
  saved public.pay_grades%rowtype;
  previous_values jsonb;
begin
  if minimum_gross is not null and minimum_gross < 0 then
    raise check_violation using message = 'minimum gross cannot be negative';
  end if;
  if maximum_gross is not null and maximum_gross < 0 then
    raise check_violation using message = 'maximum gross cannot be negative';
  end if;
  if minimum_gross is not null and maximum_gross is not null and maximum_gross < minimum_gross then
    raise check_violation using message = 'maximum gross cannot be less than minimum gross';
  end if;

  if target_id is null then
    insert into public.pay_grades (
      code, name, currency_code, minimum_gross, maximum_gross, description
    ) values (
      upper(btrim(setup_code)),
      btrim(setup_name),
      upper(btrim(setup_currency_code)),
      minimum_gross,
      maximum_gross,
      btrim(coalesce(setup_description, ''))
    )
    returning * into saved;
  else
    select to_jsonb(grade)
    into previous_values
    from public.pay_grades grade
    where grade.id = target_id
    for update;

    if previous_values is null then
      raise no_data_found using message = 'pay grade not found';
    end if;

    update public.pay_grades
    set code = upper(btrim(setup_code)),
        name = btrim(setup_name),
        currency_code = upper(btrim(setup_currency_code)),
        minimum_gross = hr_save_pay_grade.minimum_gross,
        maximum_gross = hr_save_pay_grade.maximum_gross,
        description = btrim(coalesce(setup_description, '')),
        updated_at = now()
    where id = target_id
    returning * into saved;
  end if;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    actor,
    case when target_id is null then 'hr_setup.pay_grade_created' else 'hr_setup.pay_grade_updated' end,
    'pay_grade',
    saved.id::text,
    previous_values,
    to_jsonb(saved),
    btrim(change_reason)
  );

  return to_jsonb(saved);
exception
  when unique_violation then
    raise unique_violation using message = 'pay grade code or name already exists';
end
$$;

comment on function public.hr_save_pay_grade(uuid, text, text, text, numeric, numeric, text, text) is
  'Creates or updates a pay grade after range validation and records a reasoned audit event.';

create or replace function public.hr_set_setup_archived(
  setup_kind text,
  target_id uuid,
  archived boolean,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.hr_setup_assert_access(change_reason);
  previous_values jsonb;
  new_values jsonb;
begin
  -- Explicit branches keep identifiers allow-listed and avoid dynamic SQL.
  if setup_kind = 'department' then
    select to_jsonb(department) into previous_values
    from public.departments department
    where department.id = target_id
    for update;

    if previous_values is null then
      raise no_data_found using message = 'department not found';
    end if;

    if archived and (
      exists (
        select 1 from public.job_titles title
        where title.department_id = target_id and title.archived_at is null
      )
      or exists (
        select 1
        from public.employment_periods period
        join public.employees employee on employee.id = period.employee_id
        where period.department_id = target_id
          and employee.archived_at is null
          and period.start_date <= current_date
          and (period.end_date is null or period.end_date >= current_date)
      )
    ) then
      raise foreign_key_violation using
        message = 'department has active job titles or current employee assignments';
    end if;

    update public.departments
    set archived_at = case when archived then now() else null end,
        updated_at = now()
    where id = target_id
    returning to_jsonb(departments.*) into new_values;

  elsif setup_kind = 'job_title' then
    select to_jsonb(title) into previous_values
    from public.job_titles title
    where title.id = target_id
    for update;

    if previous_values is null then
      raise no_data_found using message = 'job title not found';
    end if;

    if not archived and exists (
      select 1 from public.job_titles title
      join public.departments department on department.id = title.department_id
      where title.id = target_id and department.archived_at is not null
    ) then
      raise foreign_key_violation using message = 'restore the department before restoring its job title';
    end if;

    if archived and exists (
      select 1
      from public.employment_periods period
      join public.employees employee on employee.id = period.employee_id
      where period.job_title_id = target_id
        and employee.archived_at is null
        and period.start_date <= current_date
        and (period.end_date is null or period.end_date >= current_date)
    ) then
      raise foreign_key_violation using message = 'job title is assigned to a current employee';
    end if;

    update public.job_titles
    set archived_at = case when archived then now() else null end,
        updated_at = now()
    where id = target_id
    returning to_jsonb(job_titles.*) into new_values;

  elsif setup_kind = 'pay_grade' then
    select to_jsonb(grade) into previous_values
    from public.pay_grades grade
    where grade.id = target_id
    for update;

    if previous_values is null then
      raise no_data_found using message = 'pay grade not found';
    end if;

    if archived and exists (
      select 1
      from public.employment_periods period
      join public.employees employee on employee.id = period.employee_id
      where period.pay_grade_id = target_id
        and employee.archived_at is null
        and period.start_date <= current_date
        and (period.end_date is null or period.end_date >= current_date)
    ) then
      raise foreign_key_violation using message = 'pay grade is assigned to a current employee';
    end if;

    update public.pay_grades
    set archived_at = case when archived then now() else null end,
        updated_at = now()
    where id = target_id
    returning to_jsonb(pay_grades.*) into new_values;

  else
    raise check_violation using message = 'invalid HR setup record type';
  end if;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    actor,
    'hr_setup.' || setup_kind || case when archived then '_archived' else '_restored' end,
    setup_kind,
    target_id::text,
    previous_values,
    new_values,
    btrim(change_reason)
  );
end
$$;

comment on function public.hr_set_setup_archived(text, uuid, boolean, text) is
  'Archives or restores one HR Setup record while protecting current employee assignments and history.';

-- RLS remains enabled for direct reads, but clients cannot bypass the audited
-- workflows with raw INSERT or UPDATE statements.
revoke insert, update, delete on table public.departments from authenticated;
revoke insert, update, delete on table public.job_titles from authenticated;
revoke insert, update, delete on table public.pay_grades from authenticated;

revoke all on function public.hr_setup_assert_access(text) from public, anon, authenticated;
revoke all on function public.hr_list_setup_records() from public, anon, authenticated;
revoke all on function public.hr_save_department(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.hr_save_job_title(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.hr_save_pay_grade(uuid, text, text, text, numeric, numeric, text, text) from public, anon, authenticated;
revoke all on function public.hr_set_setup_archived(text, uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.hr_list_setup_records() to authenticated;
grant execute on function public.hr_save_department(uuid, text, text, text, text) to authenticated;
grant execute on function public.hr_save_job_title(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.hr_save_pay_grade(uuid, text, text, text, numeric, numeric, text, text) to authenticated;
grant execute on function public.hr_set_setup_archived(text, uuid, boolean, text) to authenticated;
