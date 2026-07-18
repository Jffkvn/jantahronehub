begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

insert into auth.users (id, email) values
  ('93000000-0000-4000-8000-000000000001', 'advance-payroll-hr@example.invalid'),
  ('93000000-0000-4000-8000-000000000002', 'advance-payroll-employee@example.invalid');

insert into public.profiles (id, display_name) values
  ('93000000-0000-4000-8000-000000000001', 'Advance Payroll HR'),
  ('93000000-0000-4000-8000-000000000002', 'Advance Payroll Employee');

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('93000000-0000-4000-8000-000000000001'::uuid, 'hr_admin'::text),
  ('93000000-0000-4000-8000-000000000002'::uuid, 'employee'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key;

insert into public.employees (id, profile_id, employee_number, legal_name) values
  ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000002', 'ADV-PAY-001', 'Advance Payroll Employee');

insert into public.employee_confidential_profiles (
  employee_id, gross_salary, employee_tax_type, pct_month_worked, wht_rate, nssf_applicable
) values (
  '94000000-0000-4000-8000-000000000001', 3000000, 'local', 100, 6, true
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table advance_payroll_ids (key text primary key, id uuid not null) on commit drop;

insert into advance_payroll_ids values (
  'advance',
  public.rpc_log_staff_advance(
    '94000000-0000-4000-8000-000000000001', 600000, 'Emergency support', '2098-07-18',
    3, '2098-08-01', 'Approved after offline discussion'
  )
);

insert into advance_payroll_ids values (
  'run',
  public.create_payroll_draft(
    '2098-08-01', 'regular', null, null,
    jsonb_build_array(jsonb_build_object(
      'employee_id', '94000000-0000-4000-8000-000000000001',
      'line_items', '[]'::jsonb
    ))
  )
);

select is(
  (select count(*)::integer from public.payroll_line_items line
   join public.payroll_items item on item.id = line.payroll_item_id
   where item.run_id = (select id from advance_payroll_ids where key = 'run')
     and line.code = 'STAFF_ADVANCE'),
  1,
  'regular payroll automatically adds one staff advance line'
);
select is(
  (select line.amount from public.payroll_line_items line
   join public.payroll_items item on item.id = line.payroll_item_id
   where item.run_id = (select id from advance_payroll_ids where key = 'run')
     and line.code = 'STAFF_ADVANCE'),
  200000::numeric,
  'automatic line uses the scheduled monthly deduction'
);
select is(
  (select line.staff_advance_id from public.payroll_line_items line
   join public.payroll_items item on item.id = line.payroll_item_id
   where item.run_id = (select id from advance_payroll_ids where key = 'run')
     and line.code = 'STAFF_ADVANCE'),
  (select id from advance_payroll_ids where key = 'advance'),
  'payroll line is linked to the canonical advance'
);
select is(
  (select salary_advance_deduction from public.payroll_items
   where run_id = (select id from advance_payroll_ids where key = 'run')),
  200000::numeric,
  'payroll totals include the automatic advance deduction'
);

select lives_ok(
  $$ select public.approve_payroll_run((select id from advance_payroll_ids where key = 'run'), 'Final payroll approval') $$,
  'payroll approval records the linked repayment'
);
reset role;
select is(
  (select amount from public.advance_repayments
   where payroll_run_id = (select id from advance_payroll_ids where key = 'run')),
  200000::numeric,
  'approved payroll creates the advance repayment record'
);
select is(
  (select balance_remaining from public.staff_advances
   where id = (select id from advance_payroll_ids where key = 'advance')),
  400000::numeric,
  'approved payroll reduces the outstanding advance balance'
);

select * from finish();
rollback;
