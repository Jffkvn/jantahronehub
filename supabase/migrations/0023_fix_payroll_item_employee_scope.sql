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

revoke all on function public._insert_payroll_items(uuid,jsonb) from public, anon, authenticated;
