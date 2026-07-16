begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- 1. Setup checks
select has_function('public', 'record_report_export', array['text', 'text'], 'record_report_export function exists');
select has_function('public', 'get_governance_report_snapshot', array[]::text[], 'governance snapshot function exists');
select ok(
  not has_function_privilege('anon', 'public.get_governance_report_snapshot()', 'execute'),
  'anonymous users cannot execute the governance snapshot'
);
select ok(
  has_function_privilege('authenticated', 'public.get_governance_report_snapshot()', 'execute'),
  'authenticated users can call the permission-checked governance snapshot'
);

-- 2. Setup test roles and dummy profiles
insert into auth.users (id, email)
values
  ('90000000-0000-0000-0000-000000000001', 'cfo@example.invalid'),
  ('90000000-0000-0000-0000-000000000002', 'md@example.invalid'),
  ('90000000-0000-0000-0000-000000000003', 'coord@example.invalid'),
  ('90000000-0000-0000-0000-000000000004', 'hr@example.invalid')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('90000000-0000-0000-0000-000000000001', 'Reports CFO'),
  ('90000000-0000-0000-0000-000000000002', 'Reports MD'),
  ('90000000-0000-0000-0000-000000000003', 'Reports Coord'),
  ('90000000-0000-0000-0000-000000000004', 'Reports HR')
on conflict (id) do nothing;

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('90000000-0000-0000-0000-000000000001'::uuid, 'cfo'::text),
  ('90000000-0000-0000-0000-000000000002'::uuid, 'managing_director'::text),
  ('90000000-0000-0000-0000-000000000003'::uuid, 'coordinator'::text),
  ('90000000-0000-0000-0000-000000000004'::uuid, 'hr_admin'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key
on conflict do nothing;

insert into public.departments (id, code, name)
values ('90000000-0000-0000-0000-000000000010', 'RPT_AGG', 'Reports Aggregate Test')
on conflict (id) do nothing;

insert into public.employees (id, employee_number, legal_name)
values
  ('90000000-0000-0000-0000-000000000011', 'RPT-AGG-1', 'Reports Active Employee'),
  ('90000000-0000-0000-0000-000000000012', 'RPT-AGG-2', 'Reports Ended Employee')
on conflict (id) do nothing;

insert into public.employment_periods (
  id, employee_id, department_id, start_date, end_date, employment_type, contract_type
)
values
  (
    '90000000-0000-0000-0000-000000000013',
    '90000000-0000-0000-0000-000000000011',
    '90000000-0000-0000-0000-000000000010',
    date '2026-01-01', null, 'full_time', 'permanent'
  ),
  (
    '90000000-0000-0000-0000-000000000014',
    '90000000-0000-0000-0000-000000000012',
    '90000000-0000-0000-0000-000000000010',
    date '2025-01-01', date '2025-12-31', 'full_time', 'permanent'
  )
on conflict (id) do nothing;

insert into public.payroll_periods (id, period_start, period_end, label, created_by)
values
  (
    '90000000-0000-0000-0000-000000000020',
    date '2099-01-01', date '2099-01-31', 'Reports Draft Test',
    '90000000-0000-0000-0000-000000000001'
  ),
  (
    '90000000-0000-0000-0000-000000000022',
    date '2099-02-01', date '2099-02-28', 'Reports Approved Test',
    '90000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;

insert into public.payroll_runs (
  id, period_id, run_number, run_type, status, calculation_settings,
  created_by, updated_by, approved_by, approved_at
)
values
  (
    '90000000-0000-0000-0000-000000000021',
    '90000000-0000-0000-0000-000000000020',
    1, 'regular', 'draft', '{}'::jsonb,
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    null, null
  ),
  (
    '90000000-0000-0000-0000-000000000023',
    '90000000-0000-0000-0000-000000000022',
    1, 'regular', 'approved', '{}'::jsonb,
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000001', now()
  )
on conflict (id) do nothing;

-- 3. Execution Checks

-- Test: Coordinator lacks reports.export, should fail
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$ select public.record_report_export('workforce', 'excel') $$,
  '42501',
  'reports export permission is required',
  'Coordinator cannot record report exports'
);

select throws_ok(
  $$ select public.get_governance_report_snapshot() $$,
  '42501',
  'reports.view permission is required',
  'Coordinator cannot read the governance snapshot'
);

-- Test: CFO has permission, should succeed
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.record_report_export('payroll-period', 'excel') $$,
  'CFO can record report exports'
);

-- Test: MD has permission, should succeed
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select public.record_report_export('inventory-balances', 'csv') $$,
  'MD can record report exports'
);

-- Test: Invalid export format throws check_violation
select throws_ok(
  $$ select public.record_report_export('workforce', 'xml') $$,
  '23514',
  'invalid export format',
  'Invalid format is rejected'
);

-- Test: Verify audit entry created for CFO export
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.record_report_export('cash-reconciliation', 'excel') $$,
  'Insert audit event'
);

-- Reset role to check audit log entries
reset role;

-- Test: Verify audit entry count created for CFO exports
select is(
  (
    select count(*)::integer
    from public.audit_events
    where actor_profile_id = '90000000-0000-0000-0000-000000000001'::uuid
      and event_type = 'report.exported'
  ),
  2,
  'Audit log contains CFO export events'
);

-- Verify permissions assigned to roles correctly
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(
  public.has_permission('reports.view'),
  'CFO has reports.view permission'
);

select is(
  (
    select (department_count ->> 'count')::integer
    from jsonb_array_elements(
      public.get_governance_report_snapshot() #> '{workforce,departmentCounts}'
    ) department_count
    where department_count ->> 'departmentName' = 'Reports Aggregate Test'
  ),
  1,
  'CFO receives company-wide active workforce aggregates'
);

select ok(
  not public.has_permission('employees.create')
  and not public.has_permission('employees.update')
  and not public.has_permission('employees.archive'),
  'CFO aggregate reporting does not grant employee mutation permissions'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(
  public.has_permission('reports.export'),
  'MD has reports.export permission'
);

select is(
  (
    select (department_count ->> 'count')::integer
    from jsonb_array_elements(
      public.get_governance_report_snapshot() #> '{workforce,departmentCounts}'
    ) department_count
    where department_count ->> 'departmentName' = 'Reports Aggregate Test'
  ),
  1,
  'MD receives company-wide active workforce aggregates'
);

select ok(
  not public.has_permission('employees.create')
  and not public.has_permission('employees.update')
  and not public.has_permission('employees.archive'),
  'MD aggregate reporting does not grant employee mutation permissions'
);

select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      public.get_governance_report_snapshot() -> 'payrollSummaries'
    ) payroll_summary
    where payroll_summary ->> 'id' = '90000000-0000-0000-0000-000000000021'
  ),
  'MD governance reporting excludes draft payroll totals'
);

select ok(
  exists (
    select 1
    from jsonb_array_elements(
      public.get_governance_report_snapshot() -> 'payrollSummaries'
    ) payroll_summary
    where payroll_summary ->> 'id' = '90000000-0000-0000-0000-000000000023'
  ),
  'MD governance reporting retains approved payroll totals'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select ok(
  NOT public.has_permission('reports.view'),
  'Coordinator does not have reports.view permission'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select ok(
  public.has_permission('reports.view'),
  'HR administrator has reports.view permission'
);

select ok(
  public.has_permission('reports.export'),
  'HR administrator has reports.export permission'
);

do $$
declare
  diagnostic text;
begin
  for diagnostic in select * from finish() loop
    raise exception using message = 'pgTAP failure: ' || diagnostic;
  end loop;
end
$$;

rollback;
