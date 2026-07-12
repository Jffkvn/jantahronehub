begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_table('public', 'historical_payroll_import_batches', 'historical import batches exist');
select has_table('public', 'historical_payroll_import_periods', 'historical import periods exist');
select has_table('public', 'historical_payroll_import_rows', 'historical import rows exist');
select has_function('public', 'commit_historical_payroll_import', array['text','text','jsonb'], 'historical payroll import RPC exists');

insert into auth.users (id, email)
values
  ('50000000-0000-0000-0000-000000000001', 'task15-admin@example.invalid'),
  ('50000000-0000-0000-0000-000000000002', 'task15-hr@example.invalid');

insert into public.profiles (id, display_name)
values
  ('50000000-0000-0000-0000-000000000001', 'Task 15 Super Admin'),
  ('50000000-0000-0000-0000-000000000002', 'Task 15 HR');

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('50000000-0000-0000-0000-000000000001'::uuid, 'super_admin'::text),
  ('50000000-0000-0000-0000-000000000002'::uuid, 'hr_admin'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key;

insert into public.employees (id, profile_id, employee_number, legal_name)
values ('51000000-0000-0000-0000-000000000001', null, 'HIST-001', 'Historical Employee');

insert into public.employee_confidential_profiles (
  employee_id, gross_salary, employee_tax_type, pct_month_worked, wht_rate, nssf_applicable,
  payment_method, bank_name, account_number
)
values (
  '51000000-0000-0000-0000-000000000001', 1000000, 'local', 100, 6, true,
  'bank', 'Current Bank', 'CURRENT-001'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$ select public.commit_historical_payroll_import('history.xlsx', repeat('a', 64), '[]'::jsonb) $$,
  '42501',
  'payroll.migrate_history permission is required',
  'HR cannot commit protected historical payroll migration'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);

create temporary table task15_result (payload jsonb) on commit drop;

insert into task15_result
select public.commit_historical_payroll_import(
  'history.xlsx',
  repeat('b', 64),
  jsonb_build_array(
    jsonb_build_object(
      'sheet_name', 'June 2026',
      'period_start', '2026-06-01',
      'period_end', '2026-06-30',
      'label', 'June 2026',
      'totals', jsonb_build_object('gross', 1075000, 'paye', 100000, 'nssf_employee', 53750, 'nssf_employer', 107500, 'wht', 0, 'deductions', 173750, 'net', 901250),
      'rows', jsonb_build_array(
        jsonb_build_object(
          'row_number', 3,
          'row_hash', 'task15-row-1',
          'employee_id', '51000000-0000-0000-0000-000000000001',
          'employee_number', 'HIST-001',
          'employee_name', 'Historical Employee',
          'tax_treatment', 'local',
          'nssf_applicable', true,
          'percent_of_month_worked', 100,
          'contractual_gross', 1000000,
          'prorated_gross', 1000000,
          'overtime_hours', 0,
          'overtime_rate', 0,
          'overtime_pay', 0,
          'allowances', 75000,
          'taxable_gross', 1075000,
          'paye', 100000,
          'nssf_employee', 53750,
          'nssf_employer', 107500,
          'wht', 0,
          'salary_advance_deduction', 20000,
          'other_deductions', 0,
          'total_deductions', 173750,
          'net_pay', 901250,
          'tin_number', 'TIN-HIST',
          'nssf_number', 'NSSF-HIST',
          'payment_method', 'bank',
          'bank_name', 'Historical Bank',
          'account_number', 'HIST-001',
          'sort_code', 'HIST-SORT'
        )
      )
    )
  )
);

select is((payload ->> 'periods')::integer, 1, 'one historical period committed') from task15_result;
select is((payload ->> 'rows')::integer, 1, 'one historical payroll row committed') from task15_result;
select is((select status from public.payroll_runs where run_type = 'historical'), 'approved', 'historical run is committed as approved history');
select is((select total_net from public.payroll_runs where run_type = 'historical'), 901250::numeric, 'historical run totals reconcile');
select is((select account_number from public.payroll_items where employee_number = 'HIST-001'), 'HIST-001', 'historical payment snapshot comes from workbook payload');
select is((select count(*) from public.historical_payroll_import_rows where row_hash = 'task15-row-1'), 1::bigint, 'row hash is stored for idempotency');
select ok((select count(*) from public.audit_events where event_type = 'payroll.history_imported') = 1, 'historical import writes an audit event');

select throws_ok(
  $$ select public.commit_historical_payroll_import('history.xlsx', repeat('b', 64), jsonb_build_array(
    jsonb_build_object(
      'sheet_name', 'June 2026',
      'period_start', '2026-06-01',
      'period_end', '2026-06-30',
      'label', 'June 2026',
      'totals', jsonb_build_object('gross', 1075000, 'paye', 100000, 'nssf_employee', 53750, 'nssf_employer', 107500, 'wht', 0, 'deductions', 173750, 'net', 901250),
      'rows', jsonb_build_array(
        jsonb_build_object(
          'row_number', 3,
          'row_hash', 'task15-row-1',
          'employee_id', '51000000-0000-0000-0000-000000000001',
          'employee_number', 'HIST-001',
          'employee_name', 'Historical Employee',
          'tax_treatment', 'local',
          'nssf_applicable', true,
          'percent_of_month_worked', 100,
          'contractual_gross', 1000000,
          'prorated_gross', 1000000,
          'overtime_hours', 0,
          'overtime_rate', 0,
          'overtime_pay', 0,
          'allowances', 75000,
          'taxable_gross', 1075000,
          'paye', 100000,
          'nssf_employee', 53750,
          'nssf_employer', 107500,
          'wht', 0,
          'salary_advance_deduction', 20000,
          'other_deductions', 0,
          'total_deductions', 173750,
          'net_pay', 901250,
          'tin_number', 'TIN-HIST',
          'nssf_number', 'NSSF-HIST',
          'payment_method', 'bank',
          'bank_name', 'Historical Bank',
          'account_number', 'HIST-001',
          'sort_code', 'HIST-SORT'
        )
      )
    )
  )) $$,
  '23505',
  'This historical payroll workbook has already been imported.',
  'duplicate file hash is rejected'
);

reset role;
select throws_ok(
  $$ update public.payroll_items set net_pay = 1 where employee_number = 'HIST-001' $$,
  '55000',
  'approved payroll items are immutable',
  'historical payroll items remain immutable after approval'
);

do $$
declare diagnostic text;
begin
  for diagnostic in select * from finish() loop
    raise exception using message = 'pgTAP failure: ' || diagnostic;
  end loop;
end
$$;

rollback;
