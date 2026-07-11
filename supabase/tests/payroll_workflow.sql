begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

select has_table('public', 'payroll_periods', 'payroll periods exist');
select has_table('public', 'payroll_runs', 'payroll runs exist');
select has_table('public', 'payroll_items', 'payroll items exist');
select has_table('public', 'payroll_line_items', 'payroll line items exist');
select has_table('public', 'payroll_payments', 'payroll payments exist');
select has_table('public', 'payroll_settings', 'payroll settings exist');
select has_function('public', 'create_payroll_draft', array['date','text','uuid','text','jsonb'], 'atomic draft function exists');
select has_function('public', 'replace_payroll_draft_items', array['uuid','jsonb','text'], 'atomic draft replacement exists');
select has_function('public', 'approve_payroll_run', array['uuid','text'], 'HR approval function exists');
select has_function('public', 'create_payroll_amendment', array['uuid','text','text','jsonb'], 'amendment function exists');
select has_function('public', 'record_payroll_payment', array['uuid','date','text','text','text','text'], 'CFO payment function exists');

insert into auth.users (id, email)
values
  ('40000000-0000-0000-0000-000000000001', 'task13-hr@example.invalid'),
  ('40000000-0000-0000-0000-000000000002', 'task13-cfo@example.invalid'),
  ('40000000-0000-0000-0000-000000000003', 'task13-employee@example.invalid'),
  ('40000000-0000-0000-0000-000000000004', 'task13-other@example.invalid');

insert into public.profiles (id, display_name)
values
  ('40000000-0000-0000-0000-000000000001', 'Task 13 HR'),
  ('40000000-0000-0000-0000-000000000002', 'Task 13 CFO'),
  ('40000000-0000-0000-0000-000000000003', 'Task 13 Employee'),
  ('40000000-0000-0000-0000-000000000004', 'Task 13 Other Employee');

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('40000000-0000-0000-0000-000000000001'::uuid, 'hr_admin'::text),
  ('40000000-0000-0000-0000-000000000002'::uuid, 'cfo'::text),
  ('40000000-0000-0000-0000-000000000003'::uuid, 'employee'::text),
  ('40000000-0000-0000-0000-000000000004'::uuid, 'employee'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key;

insert into public.employees (id, profile_id, employee_number, legal_name)
values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'PAY-001', 'Payroll Employee One'),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', 'PAY-002', 'Payroll Employee Two');

insert into public.employee_confidential_profiles (
  employee_id, gross_salary, employee_tax_type, pct_month_worked, wht_rate, nssf_applicable
)
values
  ('41000000-0000-0000-0000-000000000001', 2000000, 'local', 100, 6, true),
  ('41000000-0000-0000-0000-000000000002', 3000000, 'contractor', 100, 6, false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select ok(public.has_permission('payroll.prepare'), 'HR can prepare payroll');
select ok(public.has_permission('payroll.approve'), 'HR can approve payroll');
select ok(not public.has_permission('payroll.record_payment'), 'HR cannot record payment execution');

create temporary table task13_ids (key text primary key, id uuid not null) on commit drop;

insert into task13_ids values (
  'regular',
  public.create_payroll_draft(
    '2026-06-01',
    'regular',
    null,
    null,
    jsonb_build_array(
      jsonb_build_object(
        'employee_id', '41000000-0000-0000-0000-000000000001',
        'overtime_hours', 0,
        'line_items', jsonb_build_array(
          jsonb_build_object('kind','allowance','code','FIELD','description','Field allowance','amount',100000),
          jsonb_build_object('kind','salary_advance','code','ADV','description','Advance repayment','amount',50000)
        )
      ),
      jsonb_build_object(
        'employee_id', '41000000-0000-0000-0000-000000000002',
        'line_items', '[]'::jsonb
      )
    )
  )
);

select is((select status from public.payroll_runs where id=(select id from task13_ids where key='regular')), 'draft', 'regular run starts as draft');
select is((select run_type from public.payroll_runs where id=(select id from task13_ids where key='regular')), 'regular', 'regular run type is retained');
select is((select count(*) from public.payroll_items where run_id=(select id from task13_ids where key='regular')), 2::bigint, 'draft contains both employees atomically');
select is((select count(*) from public.payroll_line_items line join public.payroll_items item on item.id=line.payroll_item_id where item.run_id=(select id from task13_ids where key='regular')), 2::bigint, 'draft stores detailed adjustment lines');

select public.approve_payroll_run((select id from task13_ids where key='regular'), 'HR final payroll approval');
select is((select status from public.payroll_runs where id=(select id from task13_ids where key='regular')), 'approved', 'HR approval finalizes the run');
select is((select total_gross from public.payroll_runs where id=(select id from task13_ids where key='regular')), 5100000::numeric, 'approved gross total is reconciled');
select is((select total_deductions from public.payroll_runs where id=(select id from task13_ids where key='regular')), 867000::numeric, 'approved deductions reconcile');
select is((select total_net from public.payroll_runs where id=(select id from task13_ids where key='regular')), 4233000::numeric, 'approved net total reconciles');

select throws_ok(
  $$ select public.record_payroll_payment(
       (select id from task13_ids where key='regular'), current_date, 'HR-CANNOT-PAY', 'bank', null, null
     ) $$,
  '42501',
  'payroll.record_payment permission is required',
  'HR cannot record payroll payment execution'
);
select throws_ok(
  $$ insert into public.payroll_periods(period_start,period_end,label,created_by)
     values('2026-07-01','2026-07-31','July 2026','40000000-0000-0000-0000-000000000001') $$,
  '42501',
  'permission denied for table payroll_periods',
  'HR cannot bypass payroll RPCs with direct table writes'
);

select throws_ok(
  $$ select public.replace_payroll_draft_items(
       (select id from task13_ids where key='regular'),
       jsonb_build_array(jsonb_build_object('employee_id','41000000-0000-0000-0000-000000000001','line_items','[]'::jsonb)),
       'Attempt to rewrite approved payroll'
     ) $$,
  '55000',
  'only draft payroll runs can be replaced',
  'approved run cannot be replaced through its RPC'
);

insert into task13_ids values (
  'supplemental',
  public.create_payroll_amendment(
    (select id from task13_ids where key='regular'),
    'supplemental',
    'Deferred employee payment',
    jsonb_build_array(jsonb_build_object('employee_id','41000000-0000-0000-0000-000000000001','percent_of_month_worked',10,'line_items','[]'::jsonb))
  )
);
insert into task13_ids values (
  'correction',
  public.create_payroll_amendment(
    (select id from task13_ids where key='regular'),
    'correction',
    'Approved underpayment correction',
    jsonb_build_array(jsonb_build_object('employee_id','41000000-0000-0000-0000-000000000002','percent_of_month_worked',10,'line_items','[]'::jsonb))
  )
);

select results_eq(
  $$ select run_type from public.payroll_runs where period_id=(select period_id from public.payroll_runs where id=(select id from task13_ids where key='regular')) order by run_number $$,
  $$ values ('regular'::text),('supplemental'::text),('correction'::text) $$,
  'regular supplemental and correction runs coexist in one period'
);
select is((select source_run_id from public.payroll_runs where id=(select id from task13_ids where key='supplemental')), (select id from task13_ids where key='regular'), 'supplemental links to approved source');
select is((select source_run_id from public.payroll_runs where id=(select id from task13_ids where key='correction')), (select id from task13_ids where key='regular'), 'correction links to approved source');

select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(public.has_permission('payroll.record_payment'), 'CFO can record payment execution');
select ok(not public.has_permission('payroll.approve'), 'CFO is not a payroll approver');
select throws_ok(
  $$ select public.approve_payroll_run((select id from task13_ids where key='supplemental'), 'CFO attempted approval') $$,
  '42501',
  'payroll.approve permission is required',
  'CFO cannot approve payroll'
);

select public.record_payroll_payment(
  (select id from task13_ids where key='regular'), current_date, 'BANK-TASK13-001', 'bank', null, 'Executed by CFO'
);
select is((select amount from public.payroll_payments where run_id=(select id from task13_ids where key='regular')), 4233000::numeric, 'payment records the immutable approved net total');
select throws_ok(
  $$ select public.record_payroll_payment(
       (select id from task13_ids where key='regular'), current_date, 'BANK-TASK13-002', 'bank', null, null
     ) $$,
  '23505',
  null,
  'an approved run cannot be recorded as paid twice'
);

select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.payroll_items), 1::bigint, 'employee sees only their own approved payroll item');
select is((select count(*) from public.payroll_runs), 0::bigint, 'employee cannot read company-wide payroll run totals');
select is((select count(*) from public.payroll_periods), 1::bigint, 'employee can read the safe period label for their approved item');
select is((select count(*) from public.payroll_line_items), 2::bigint, 'employee sees only their own approved adjustment lines');
select is((select count(*) from public.payroll_payments), 0::bigint, 'employee cannot read CFO payment execution records');

reset role;
select throws_ok(
  $$ update public.payroll_runs set reason='Changed after approval' where id=(select id from task13_ids where key='regular') $$,
  '55000',
  'approved payroll runs are immutable',
  'approved run cannot be updated even by table owner'
);
select throws_ok(
  $$ delete from public.payroll_items where run_id=(select id from task13_ids where key='regular') $$,
  '55000',
  'approved payroll items are immutable',
  'approved items cannot be deleted even by table owner'
);
select throws_ok(
  $$ update public.payroll_payments set payment_reference='CHANGED' where run_id=(select id from task13_ids where key='regular') $$,
  '55000',
  'payroll payments are append-only',
  'payment execution records cannot be edited'
);
select ok((select count(*) from public.audit_events where entity_type in ('payroll_run','payroll_payment')) >= 5, 'payroll workflow writes append-only audit events');

do $$
declare diagnostic text;
begin
  for diagnostic in select * from finish() loop
    raise exception using message = 'pgTAP failure: ' || diagnostic;
  end loop;
end
$$;
rollback;
