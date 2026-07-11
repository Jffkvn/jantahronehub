create or replace function public._current_payroll_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'currencyCode', settings.currency_code,
    'payeBands', settings.paye_bands,
    'surchargeThreshold', settings.surcharge_threshold,
    'surchargeRatePercent', settings.surcharge_rate_percent,
    'nssfEmployeeRatePercent', settings.nssf_employee_rate_percent,
    'nssfEmployerRatePercent', settings.nssf_employer_rate_percent,
    'overtimeMultiplier', settings.overtime_multiplier,
    'standardMonthlyHours', settings.standard_monthly_hours,
    'defaultWhtRatePercent', settings.default_wht_rate_percent
  )
  from public.payroll_settings settings
  where settings.singleton
$$;

create or replace function public._validate_payroll_settings(settings jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  bands jsonb := settings -> 'payeBands';
  band jsonb;
  band_index integer := 0;
  band_min numeric;
  band_max numeric;
  previous_max numeric;
  rate numeric;
begin
  if jsonb_typeof(settings) <> 'object' then
    raise check_violation using message = 'payroll settings must be an object';
  end if;
  if jsonb_typeof(bands) <> 'array' or jsonb_array_length(bands) = 0 then
    raise check_violation using message = 'at least one PAYE band is required';
  end if;

  for band in select value from jsonb_array_elements(bands) loop
    band_index := band_index + 1;
    band_min := (band ->> 'min')::numeric;
    band_max := nullif(band ->> 'max', '')::numeric;
    rate := (band ->> 'ratePercent')::numeric;
    if band_min < 0 or rate < 0 or rate > 100 or (band_max is not null and band_max <= band_min) then
      raise check_violation using message = 'invalid PAYE band';
    end if;
    if band_index = 1 and band_min <> 0 then
      raise check_violation using message = 'PAYE bands must begin at zero';
    end if;
    if band_index > 1 and previous_max is distinct from band_min then
      raise check_violation using message = 'PAYE bands must be ordered and contiguous';
    end if;
    if band_index < jsonb_array_length(bands) and band_max is null then
      raise check_violation using message = 'only the final PAYE band may be open-ended';
    end if;
    previous_max := band_max;
  end loop;

  if previous_max is not null then
    raise check_violation using message = 'the final PAYE band must be open-ended';
  end if;
  if (settings ->> 'surchargeRatePercent')::numeric not between 0 and 100
    or (settings ->> 'nssfEmployeeRatePercent')::numeric not between 0 and 100
    or (settings ->> 'nssfEmployerRatePercent')::numeric not between 0 and 100
    or (settings ->> 'defaultWhtRatePercent')::numeric not between 0 and 100
    or (settings ->> 'overtimeMultiplier')::numeric < 0
    or (settings ->> 'standardMonthlyHours')::numeric <= 0
    or (nullif(settings ->> 'surchargeThreshold', '') is not null and (settings ->> 'surchargeThreshold')::numeric < 0)
  then
    raise check_violation using message = 'invalid payroll setting value';
  end if;
end
$$;

create or replace function public._calculate_payroll_paye(taxable_gross numeric, settings jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  band jsonb;
  band_min numeric;
  band_max numeric;
  upper_bound numeric;
  tax numeric := 0;
  surcharge_threshold numeric;
begin
  perform public._validate_payroll_settings(settings);
  if taxable_gross < 0 then raise check_violation using message = 'taxable gross cannot be negative'; end if;

  for band in select value from jsonb_array_elements(settings -> 'payeBands') loop
    band_min := (band ->> 'min')::numeric;
    band_max := nullif(band ->> 'max', '')::numeric;
    if taxable_gross > band_min then
      upper_bound := case when band_max is null then taxable_gross else least(taxable_gross, band_max) end;
      tax := tax + (upper_bound - band_min) * ((band ->> 'ratePercent')::numeric / 100);
    end if;
  end loop;

  surcharge_threshold := nullif(settings ->> 'surchargeThreshold', '')::numeric;
  if surcharge_threshold is not null and taxable_gross > surcharge_threshold then
    tax := tax + (taxable_gross - surcharge_threshold) * ((settings ->> 'surchargeRatePercent')::numeric / 100);
  end if;
  return round(tax);
end
$$;

create or replace function public._refresh_payroll_run_totals(target_run_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.payroll_runs run
  set
    total_gross = totals.total_gross,
    total_paye = totals.total_paye,
    total_nssf_employee = totals.total_nssf_employee,
    total_nssf_employer = totals.total_nssf_employer,
    total_wht = totals.total_wht,
    total_deductions = totals.total_deductions,
    total_net = totals.total_net,
    updated_at = now()
  from (
    select
      coalesce(sum(item.taxable_gross), 0) as total_gross,
      coalesce(sum(item.paye), 0) as total_paye,
      coalesce(sum(item.nssf_employee), 0) as total_nssf_employee,
      coalesce(sum(item.nssf_employer), 0) as total_nssf_employer,
      coalesce(sum(item.wht), 0) as total_wht,
      coalesce(sum(item.total_deductions), 0) as total_deductions,
      coalesce(sum(item.net_pay), 0) as total_net
    from public.payroll_items item
    where item.run_id = target_run_id
  ) totals
  where run.id = target_run_id
$$;

create or replace function public._insert_payroll_items(target_run_id uuid, item_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  run_record record;
  employee_record record;
  item jsonb;
  line jsonb;
  lines jsonb;
  payroll_item_id uuid;
  target_employee_id_value uuid;
  line_kind text;
  line_code text;
  line_description text;
  line_amount numeric;
  percent_worked numeric;
  overtime_hours numeric;
  overtime_rate numeric;
  overtime_pay numeric;
  hourly_rate numeric;
  prorated_gross numeric;
  allowances numeric;
  advance_deduction numeric;
  other_deductions numeric;
  taxable_gross numeric;
  paye numeric;
  nssf_employee numeric;
  nssf_employer numeric;
  wht numeric;
  total_deductions numeric;
  net_pay numeric;
begin
  select status, run_type, calculation_settings into run_record
  from public.payroll_runs where id = target_run_id for update;
  if run_record is null then raise no_data_found using message = 'payroll run not found'; end if;
  if run_record.status <> 'draft' then raise exception using errcode = '55000', message = 'only draft payroll runs can receive items'; end if;
  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 or jsonb_array_length(item_payload) > 1000 then
    raise check_violation using message = 'payroll draft must contain between 1 and 1000 employees';
  end if;
  perform public._validate_payroll_settings(run_record.calculation_settings);

  for item in select value from jsonb_array_elements(item_payload) loop
    target_employee_id_value := (item ->> 'employee_id')::uuid;
    select employee.employee_number, employee.legal_name, confidential.gross_salary,
      confidential.custom_overtime_rate, confidential.employee_tax_type,
      confidential.pct_month_worked, confidential.wht_rate, confidential.nssf_applicable
    into employee_record
    from public.employees employee
    join public.employee_confidential_profiles confidential on confidential.employee_id = employee.id
    where employee.id = target_employee_id_value and employee.archived_at is null;
    if employee_record is null or employee_record.gross_salary is null then
      raise check_violation using message = 'each payroll employee requires an active compensation profile';
    end if;

    percent_worked := coalesce(nullif(item ->> 'percent_of_month_worked', '')::numeric, employee_record.pct_month_worked);
    overtime_hours := coalesce(nullif(item ->> 'overtime_hours', '')::numeric, 0);
    if percent_worked < 0 or percent_worked > 100 or overtime_hours < 0 then
      raise check_violation using message = 'invalid percentage worked or overtime hours';
    end if;

    lines := coalesce(item -> 'line_items', '[]'::jsonb);
    if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) > 100 then
      raise check_violation using message = 'line items must be an array containing at most 100 entries';
    end if;
    allowances := 0;
    advance_deduction := 0;
    other_deductions := 0;
    for line in select value from jsonb_array_elements(lines) loop
      line_kind := line ->> 'kind';
      line_code := upper(btrim(line ->> 'code'));
      line_description := btrim(line ->> 'description');
      line_amount := (line ->> 'amount')::numeric;
      if line_kind not in ('allowance', 'salary_advance', 'deduction')
        or line_code !~ '^[A-Z][A-Z0-9_]{1,30}$'
        or length(line_description) not between 2 and 160
        or line_amount <= 0
      then
        raise check_violation using message = 'invalid payroll line item';
      end if;
      if line_kind = 'allowance' then allowances := allowances + line_amount;
      elsif line_kind = 'salary_advance' then advance_deduction := advance_deduction + line_amount;
      else other_deductions := other_deductions + line_amount;
      end if;
    end loop;

    prorated_gross := round(employee_record.gross_salary * percent_worked / 100);
    if overtime_hours = 0 then
      overtime_rate := 0;
      overtime_pay := 0;
    elsif employee_record.custom_overtime_rate is not null then
      overtime_rate := round(employee_record.custom_overtime_rate);
      overtime_pay := round(overtime_rate * overtime_hours);
    else
      hourly_rate := round(prorated_gross / (run_record.calculation_settings ->> 'standardMonthlyHours')::numeric);
      overtime_rate := round(hourly_rate * (run_record.calculation_settings ->> 'overtimeMultiplier')::numeric);
      overtime_pay := round(overtime_rate * overtime_hours);
    end if;

    taxable_gross := prorated_gross + overtime_pay + allowances;
    paye := 0; nssf_employee := 0; nssf_employer := 0; wht := 0;
    if employee_record.employee_tax_type = 'contractor' then
      wht := round(prorated_gross * coalesce(employee_record.wht_rate, (run_record.calculation_settings ->> 'defaultWhtRatePercent')::numeric) / 100);
    elsif employee_record.employee_tax_type in ('local', 'global') then
      paye := public._calculate_payroll_paye(taxable_gross, run_record.calculation_settings);
      if employee_record.nssf_applicable then
        nssf_employee := round(taxable_gross * (run_record.calculation_settings ->> 'nssfEmployeeRatePercent')::numeric / 100);
        nssf_employer := round(taxable_gross * (run_record.calculation_settings ->> 'nssfEmployerRatePercent')::numeric / 100);
      end if;
    end if;

    total_deductions := paye + nssf_employee + wht + advance_deduction + other_deductions;
    net_pay := taxable_gross - total_deductions;
    if net_pay < 0 then raise check_violation using message = 'payroll deductions cannot exceed taxable gross'; end if;

    insert into public.payroll_items (
      run_id, employee_id, employee_number, employee_name, tax_treatment, nssf_applicable,
      percent_of_month_worked, contractual_gross, prorated_gross, overtime_hours,
      overtime_rate, overtime_pay, allowances, taxable_gross, paye, nssf_employee,
      nssf_employer, wht, salary_advance_deduction, other_deductions,
      total_deductions, net_pay
    ) values (
      target_run_id, target_employee_id_value, employee_record.employee_number, employee_record.legal_name,
      employee_record.employee_tax_type, employee_record.nssf_applicable, percent_worked,
      round(employee_record.gross_salary), prorated_gross, overtime_hours, overtime_rate,
      overtime_pay, allowances, taxable_gross, paye, nssf_employee, nssf_employer, wht,
      advance_deduction, other_deductions, total_deductions, net_pay
    ) returning id into payroll_item_id;

    for line in select value from jsonb_array_elements(lines) loop
      insert into public.payroll_line_items (payroll_item_id, kind, code, description, amount, created_by)
      values (
        payroll_item_id, line ->> 'kind', upper(btrim(line ->> 'code')),
        btrim(line ->> 'description'), (line ->> 'amount')::numeric, actor
      );
    end loop;
  end loop;
end
$$;

create or replace function public.create_payroll_draft(
  target_period_start date,
  target_run_type text,
  target_source_run_id uuid,
  run_reason text,
  item_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  target_period_id_value uuid;
  run_id uuid;
  next_run_number integer;
  settings_snapshot jsonb;
  source_record record;
begin
  if not public.has_permission('payroll.prepare') then raise insufficient_privilege using message = 'payroll.prepare permission is required'; end if;
  if target_period_start <> date_trunc('month', target_period_start)::date then raise check_violation using message = 'payroll period must start on the first day of a month'; end if;
  if target_run_type not in ('regular', 'supplemental', 'correction') then raise check_violation using message = 'invalid operational payroll run type'; end if;
  if target_run_type = 'regular' and target_source_run_id is not null then raise check_violation using message = 'regular payroll cannot have a source run'; end if;
  if target_run_type in ('supplemental', 'correction') and (target_source_run_id is null or length(btrim(run_reason)) < 3) then
    raise check_violation using message = 'amendment payroll requires an approved source and reason';
  end if;

  insert into public.payroll_periods (period_start, period_end, label, created_by)
  values (target_period_start, (target_period_start + interval '1 month - 1 day')::date, to_char(target_period_start, 'FMMonth YYYY'), actor)
  on conflict (period_start) do nothing;
  select id into target_period_id_value from public.payroll_periods where period_start = target_period_start for update;

  if target_source_run_id is not null then
    select source.period_id, source.status into source_record from public.payroll_runs source where source.id = target_source_run_id for update;
    if source_record is null or source_record.status <> 'approved' or source_record.period_id <> target_period_id_value then
      raise check_violation using message = 'amendment source must be an approved run in the same period';
    end if;
  end if;

  select coalesce(max(run.run_number), 0) + 1 into next_run_number from public.payroll_runs run where run.period_id = target_period_id_value;
  settings_snapshot := public._current_payroll_settings();
  perform public._validate_payroll_settings(settings_snapshot);

  insert into public.payroll_runs (
    period_id, run_number, run_type, source_run_id, reason, calculation_settings, created_by, updated_by
  ) values (
    target_period_id_value, next_run_number, target_run_type, target_source_run_id, nullif(btrim(run_reason), ''),
    settings_snapshot, actor, actor
  ) returning id into run_id;

  perform public._insert_payroll_items(run_id, item_payload);
  perform public._refresh_payroll_run_totals(run_id);
  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values, reason)
  values (
    actor,
    case when target_run_type = 'regular' then 'payroll.draft_created' else 'payroll.amendment_created' end,
    'payroll_run', run_id::text,
    jsonb_build_object('period_start', target_period_start, 'run_type', target_run_type, 'source_run_id', target_source_run_id),
    nullif(btrim(run_reason), '')
  );
  return run_id;
end
$$;

create or replace function public.replace_payroll_draft_items(target_run_id uuid, item_payload jsonb, change_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := public.current_profile_id(); run_status text;
begin
  if not public.has_permission('payroll.prepare') then raise insufficient_privilege using message = 'payroll.prepare permission is required'; end if;
  if length(btrim(change_reason)) < 3 then raise check_violation using message = 'draft change reason is required'; end if;
  select status into run_status from public.payroll_runs where id = target_run_id for update;
  if run_status is null then raise no_data_found using message = 'payroll run not found'; end if;
  if run_status <> 'draft' then raise exception using errcode = '55000', message = 'only draft payroll runs can be replaced'; end if;
  delete from public.payroll_items where run_id = target_run_id;
  perform public._insert_payroll_items(target_run_id, item_payload);
  perform public._refresh_payroll_run_totals(target_run_id);
  update public.payroll_runs set updated_by = actor, updated_at = now() where id = target_run_id;
  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, reason)
  values (actor, 'payroll.draft_replaced', 'payroll_run', target_run_id::text, btrim(change_reason));
end
$$;

create or replace function public.approve_payroll_run(target_run_id uuid, approval_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := public.current_profile_id(); run_status text;
begin
  if not public.has_permission('payroll.approve') then raise insufficient_privilege using message = 'payroll.approve permission is required'; end if;
  if length(btrim(approval_reason)) < 3 then raise check_violation using message = 'approval reason is required'; end if;
  select status into run_status from public.payroll_runs where id = target_run_id for update;
  if run_status is null then raise no_data_found using message = 'payroll run not found'; end if;
  if run_status <> 'draft' then raise exception using errcode = '55000', message = 'only draft payroll runs can be approved'; end if;
  if not exists (select 1 from public.payroll_items where run_id = target_run_id) then raise check_violation using message = 'payroll run has no employees'; end if;
  perform public._refresh_payroll_run_totals(target_run_id);
  update public.payroll_runs set
    status = 'approved', approved_by = actor, approved_at = now(),
    updated_by = actor, updated_at = now()
  where id = target_run_id;
  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values, reason)
  values (actor, 'payroll.approved', 'payroll_run', target_run_id::text, jsonb_build_object('status','approved'), btrim(approval_reason));
end
$$;

create or replace function public.create_payroll_amendment(
  source_run_id uuid,
  amendment_type text,
  amendment_reason text,
  item_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare period_start date;
begin
  if not public.has_permission('payroll.prepare') then raise insufficient_privilege using message = 'payroll.prepare permission is required'; end if;
  if amendment_type not in ('supplemental', 'correction') then raise check_violation using message = 'invalid payroll amendment type'; end if;
  select period.period_start into period_start
  from public.payroll_runs run join public.payroll_periods period on period.id = run.period_id
  where run.id = create_payroll_amendment.source_run_id and run.status = 'approved';
  if period_start is null then raise check_violation using message = 'payroll amendment requires an approved source run'; end if;
  return public.create_payroll_draft(
    period_start,
    create_payroll_amendment.amendment_type,
    create_payroll_amendment.source_run_id,
    create_payroll_amendment.amendment_reason,
    create_payroll_amendment.item_payload
  );
end
$$;

create or replace function public.record_payroll_payment(
  target_run_id uuid,
  payment_date date,
  reference text,
  method text,
  payment_proof_path text,
  payment_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := public.current_profile_id(); run_record record; payment_id uuid;
begin
  if not public.has_permission('payroll.record_payment') then raise insufficient_privilege using message = 'payroll.record_payment permission is required'; end if;
  select status, total_net into run_record from public.payroll_runs where id = target_run_id for update;
  if run_record is null then raise no_data_found using message = 'payroll run not found'; end if;
  if run_record.status <> 'approved' then raise check_violation using message = 'only approved payroll can be recorded as paid'; end if;
  if payment_date is null or payment_date > current_date then raise check_violation using message = 'payment date cannot be in the future'; end if;
  if length(btrim(reference)) < 3 or method not in ('bank','mobile_money','cash','other') then raise check_violation using message = 'valid payment reference and method are required'; end if;
  if payment_proof_path is not null and (length(payment_proof_path) > 500 or payment_proof_path like '%..%') then raise check_violation using message = 'invalid payment proof path'; end if;
  insert into public.payroll_payments (run_id, paid_on, amount, payment_reference, payment_method, proof_path, notes, recorded_by)
  values (target_run_id, payment_date, run_record.total_net, btrim(reference), method, nullif(btrim(payment_proof_path), ''), nullif(btrim(payment_notes), ''), actor)
  returning id into payment_id;
  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values)
  values (actor, 'payroll.payment_recorded', 'payroll_payment', payment_id::text,
    jsonb_build_object('run_id', target_run_id, 'amount', run_record.total_net, 'paid_on', payment_date, 'reference', btrim(reference)));
  return payment_id;
end
$$;

create or replace function public.update_payroll_settings(new_settings jsonb, change_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := public.current_profile_id(); previous_settings jsonb;
begin
  if not public.has_permission('payroll.manage_settings') then raise insufficient_privilege using message = 'payroll.manage_settings permission is required'; end if;
  if length(btrim(change_reason)) < 3 then raise check_violation using message = 'settings change reason is required'; end if;
  perform public._validate_payroll_settings(new_settings);
  previous_settings := public._current_payroll_settings();
  update public.payroll_settings set
    currency_code = new_settings ->> 'currencyCode',
    paye_bands = new_settings -> 'payeBands',
    surcharge_threshold = nullif(new_settings ->> 'surchargeThreshold', '')::numeric,
    surcharge_rate_percent = (new_settings ->> 'surchargeRatePercent')::numeric,
    nssf_employee_rate_percent = (new_settings ->> 'nssfEmployeeRatePercent')::numeric,
    nssf_employer_rate_percent = (new_settings ->> 'nssfEmployerRatePercent')::numeric,
    overtime_multiplier = (new_settings ->> 'overtimeMultiplier')::numeric,
    standard_monthly_hours = (new_settings ->> 'standardMonthlyHours')::numeric,
    default_wht_rate_percent = (new_settings ->> 'defaultWhtRatePercent')::numeric,
    updated_by = actor, updated_at = now()
  where singleton;
  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, previous_values, new_values, reason)
  values (actor, 'payroll.settings_updated', 'payroll_settings', 'default', previous_settings, new_settings, btrim(change_reason));
end
$$;

revoke all on function public._current_payroll_settings(), public._validate_payroll_settings(jsonb),
  public._calculate_payroll_paye(numeric,jsonb), public._refresh_payroll_run_totals(uuid),
  public._insert_payroll_items(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.create_payroll_draft(date,text,uuid,text,jsonb),
  public.replace_payroll_draft_items(uuid,jsonb,text), public.approve_payroll_run(uuid,text),
  public.create_payroll_amendment(uuid,text,text,jsonb),
  public.record_payroll_payment(uuid,date,text,text,text,text), public.update_payroll_settings(jsonb,text)
from public, anon;

grant execute on function public.create_payroll_draft(date,text,uuid,text,jsonb),
  public.replace_payroll_draft_items(uuid,jsonb,text), public.approve_payroll_run(uuid,text),
  public.create_payroll_amendment(uuid,text,text,jsonb),
  public.record_payroll_payment(uuid,date,text,text,text,text), public.update_payroll_settings(jsonb,text)
to authenticated;

comment on function public.create_payroll_draft(date,text,uuid,text,jsonb) is 'Atomically creates a calculated payroll draft and audit event from employee inputs and adjustment lines.';
comment on function public.approve_payroll_run(uuid,text) is 'Final HR approval. Locks the run and all employee and line-item records.';
comment on function public.create_payroll_amendment(uuid,text,text,jsonb) is 'Creates a linked supplemental or correction draft without mutating approved payroll.';
comment on function public.record_payroll_payment(uuid,date,text,text,text,text) is 'Records append-only CFO payment execution for an approved run.';
