begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

-- 1. Setup checks
select has_function('public', 'record_report_export', array['text', 'text'], 'record_report_export function exists');

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

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(
  public.has_permission('reports.export'),
  'MD has reports.export permission'
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
