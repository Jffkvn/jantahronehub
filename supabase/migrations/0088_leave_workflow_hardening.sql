begin;

-- Unpaid leave reduces gross earnings through payroll proration. Keep the
-- explanatory line separate from statutory/other deductions so it cannot be
-- applied a second time or make deduction totals disagree with net pay.
alter table public.payroll_line_items
  drop constraint if exists payroll_line_items_kind_check;
alter table public.payroll_line_items
  add constraint payroll_line_items_kind_check
  check (kind in ('allowance', 'salary_advance', 'deduction', 'proration'));

create or replace function public._insert_payroll_items(target_run_id uuid, item_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.current_profile_id();
  period_start date;
  run_type text;
  item jsonb;
  adjusted_payload jsonb := '[]'::jsonb;
  target_employee_id uuid;
  base_percentage numeric;
  adjusted_percentage numeric;
  payroll_item public.payroll_items%rowtype;
  leave_amount numeric;
begin
  select period.period_start, run.run_type into period_start, run_type
  from public.payroll_runs run
  join public.payroll_periods period on period.id = run.period_id
  where run.id = target_run_id;
  if period_start is null then raise no_data_found using message = 'payroll run not found'; end if;

  if run_type = 'historical' then
    perform public._insert_payroll_items_before_leave(target_run_id, item_payload);
    return;
  end if;

  for item in select value from jsonb_array_elements(item_payload) loop
    target_employee_id := (item ->> 'employee_id')::uuid;
    select coalesce(nullif(item ->> 'percent_of_month_worked', '')::numeric, confidential.pct_month_worked)
      into base_percentage
    from public.employee_confidential_profiles confidential
    where confidential.employee_id = target_employee_id;
    if base_percentage is null then
      raise check_violation using message = 'each payroll employee requires an active compensation profile';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(item -> 'line_items', '[]'::jsonb)) line
      where upper(btrim(line ->> 'code')) = 'UNPAID_LEAVE'
    ) then
      raise check_violation using message = 'UNPAID_LEAVE is reserved for the automatic leave calculation';
    end if;
    adjusted_percentage := public._payroll_leave_percentage(target_employee_id, period_start, base_percentage);
    adjusted_payload := adjusted_payload || jsonb_build_array(
      jsonb_set(item, '{percent_of_month_worked}', to_jsonb(adjusted_percentage), true)
    );
  end loop;

  perform public._insert_payroll_items_before_leave(target_run_id, adjusted_payload);

  for item in select value from jsonb_array_elements(item_payload) loop
    target_employee_id := (item ->> 'employee_id')::uuid;
    select coalesce(nullif(item ->> 'percent_of_month_worked', '')::numeric, confidential.pct_month_worked)
      into base_percentage
    from public.employee_confidential_profiles confidential
    where confidential.employee_id = target_employee_id;
    adjusted_percentage := public._payroll_leave_percentage(target_employee_id, period_start, base_percentage);
    if adjusted_percentage < base_percentage then
      select * into payroll_item from public.payroll_items
      where run_id = target_run_id and employee_id = target_employee_id;
      leave_amount := round(payroll_item.contractual_gross * (base_percentage - adjusted_percentage) / 100);
      if leave_amount > 0 then
        insert into public.payroll_line_items
          (payroll_item_id, kind, code, description, amount, created_by)
        values
          (payroll_item.id, 'proration', 'UNPAID_LEAVE',
           'Gross earnings reduction for approved unpaid leave', leave_amount, actor);
      end if;
    end if;
  end loop;
end
$$;
revoke all on function public._insert_payroll_items(uuid, jsonb) from public, anon, authenticated;

-- HR records leave after the offline conversation has already happened. This
-- is a single authoritative action, while employee self-service remains the
-- separate pending-request workflow handled by rpc_submit_leave_request.
create or replace function public.rpc_log_leave_for_employee(
  p_employee_id uuid, p_leave_type_id uuid, p_start_date date, p_end_date date, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.leave_assert_hr(); day_count integer; request_id uuid; employee_profile uuid;
begin
  if not exists(select 1 from public.employees employee where employee.id = p_employee_id and employee.archived_at is null) then
    raise invalid_parameter_value using message = 'Select an active employee.';
  end if;
  if not exists(select 1 from public.leave_types type_row where type_row.id = p_leave_type_id and type_row.archived_at is null) then
    raise invalid_parameter_value using message = 'Select an active leave type.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise invalid_parameter_value using message = 'A leave reason of at least 3 characters is required.'; end if;
  day_count := public.rpc_calculate_leave_working_days(p_start_date, p_end_date);
  if day_count < 1 then raise invalid_parameter_value using message = 'The selected dates contain no working days.'; end if;
  if exists(select 1 from public.leave_requests request_row where request_row.employee_id = p_employee_id
    and request_row.status in ('pending', 'approved')
    and daterange(request_row.start_date, request_row.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')) then
    raise unique_violation using message = 'This leave overlaps an existing pending or approved request.';
  end if;
  insert into public.leave_requests
    (employee_id, leave_type_id, start_date, end_date, working_days, reason, status, source,
     submitted_by, decided_by, decided_at, decision_reason)
  values (p_employee_id, p_leave_type_id, p_start_date, p_end_date, day_count, btrim(p_reason), 'approved',
    'hr_on_behalf', actor, actor, now(), 'Logged directly by HR after offline discussion')
  returning id into request_id;
  insert into public.leave_request_events
    (leave_request_id, event_type, from_status, to_status, actor_profile_id, reason)
  values (request_id, 'logged_on_behalf', null, 'approved', actor, btrim(p_reason));
  select employee.profile_id into employee_profile from public.employees employee where employee.id = p_employee_id;
  if employee_profile is not null then
    insert into public.notifications (recipient_profile_id, title, message, category, event_key, action_path)
    values (employee_profile, 'Leave Logged by HR', 'HR recorded approved leave on your behalf.', 'hr',
      'leave_on_behalf_' || request_id, '/my/leave?request=' || request_id)
    on conflict (event_key) do nothing;
  end if;
  return request_id;
end
$$;
revoke all on function public.rpc_log_leave_for_employee(uuid, uuid, date, date, text) from public, anon;
grant execute on function public.rpc_log_leave_for_employee(uuid, uuid, date, date, text) to authenticated;

drop function if exists public.rpc_discard_hr_logged_leave(uuid);

commit;
