create or replace function public.get_my_payslips()
returns table(payload jsonb)
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', run.id, 'period_id', run.period_id, 'run_number', run.run_number,
    'run_type', run.run_type, 'source_run_id', run.source_run_id, 'status', run.status,
    'reason', null, 'total_gross', item.taxable_gross, 'total_paye', item.paye,
    'total_nssf_employee', item.nssf_employee, 'total_nssf_employer', item.nssf_employer,
    'total_wht', item.wht, 'total_deductions', item.total_deductions, 'total_net', item.net_pay,
    'approved_at', run.approved_at,
    'payroll_periods', jsonb_build_object('period_start', period.period_start, 'period_end', period.period_end, 'label', period.label),
    'payroll_items', jsonb_build_array(jsonb_build_object(
      'id', item.id, 'employee_id', item.employee_id, 'employee_number', item.employee_number,
      'employee_name', item.employee_name, 'tax_treatment', item.tax_treatment,
      'nssf_applicable', item.nssf_applicable, 'percent_of_month_worked', item.percent_of_month_worked,
      'contractual_gross', item.contractual_gross, 'prorated_gross', item.prorated_gross,
      'overtime_hours', item.overtime_hours, 'overtime_rate', item.overtime_rate,
      'overtime_pay', item.overtime_pay, 'allowances', item.allowances,
      'taxable_gross', item.taxable_gross, 'paye', item.paye,
      'nssf_employee', item.nssf_employee, 'nssf_employer', item.nssf_employer,
      'wht', item.wht, 'salary_advance_deduction', item.salary_advance_deduction,
      'other_deductions', item.other_deductions, 'total_deductions', item.total_deductions,
      'net_pay', item.net_pay, 'payroll_line_items', coalesce(lines.payload, '[]'::jsonb)
    )),
    'payroll_payments', '[]'::jsonb
  )
  from public.payroll_runs run
  join public.payroll_periods period on period.id = run.period_id
  join public.payroll_items item on item.run_id = run.id
  join public.employees employee on employee.id = item.employee_id and employee.profile_id = auth.uid()
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', line.id, 'kind', line.kind, 'code', line.code,
      'description', line.description, 'amount', line.amount
    ) order by line.created_at) as payload
    from public.payroll_line_items line where line.payroll_item_id = item.id
  ) lines on true
  where run.status = 'approved' and public.has_permission('payroll.self_read')
  order by period.period_start desc, run.run_number desc
$$;

revoke all on function public.get_my_payslips() from public, anon;
grant execute on function public.get_my_payslips() to authenticated;
comment on function public.get_my_payslips() is 'Returns the minimum approved payslip snapshot needed by the signed-in employee, excluding payment identifiers and company totals.';
