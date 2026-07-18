begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(39);

insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'advance-employee@example.invalid'),
  ('91000000-0000-4000-8000-000000000002', 'advance-other@example.invalid'),
  ('91000000-0000-4000-8000-000000000003', 'advance-hr@example.invalid'),
  ('91000000-0000-4000-8000-000000000004', 'advance-cfo@example.invalid')
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('91000000-0000-4000-8000-000000000001', 'Advance Employee'),
  ('91000000-0000-4000-8000-000000000002', 'Advance Other'),
  ('91000000-0000-4000-8000-000000000003', 'Advance HR'),
  ('91000000-0000-4000-8000-000000000004', 'Advance CFO')
on conflict (id) do nothing;

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('91000000-0000-4000-8000-000000000001'::uuid, 'employee'::text),
  ('91000000-0000-4000-8000-000000000002'::uuid, 'employee'::text),
  ('91000000-0000-4000-8000-000000000003'::uuid, 'hr_admin'::text),
  ('91000000-0000-4000-8000-000000000004'::uuid, 'cfo'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key
on conflict do nothing;

insert into public.employees (id, profile_id, employee_number, legal_name, created_by, updated_by) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'ADV-001', 'Advance Employee', '91000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003'),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'ADV-002', 'Advance Other', '91000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

select has_table('public', 'staff_advances', 'staff advances table exists');
select has_table('public', 'advance_repayments', 'advance repayments table exists');
select has_table('public', 'staff_advance_events', 'append-only advance events table exists');
select has_function('public', 'rpc_submit_staff_advance', array['numeric', 'text', 'integer', 'date'], 'employee submission exists');
select has_function('public', 'rpc_list_my_staff_advances', array[]::text[], 'employee lookup exists');
select has_function('public', 'rpc_list_hr_staff_advances', array[]::text[], 'HR lookup exists');
select has_function('public', 'rpc_log_staff_advance', array['uuid', 'numeric', 'text', 'date', 'integer', 'date', 'text'], 'HR direct logging exists');
select has_function('public', 'rpc_decide_staff_advance', array['uuid', 'text', 'text'], 'HR decision exists');
select has_function('public', 'rpc_record_advance_repayment', array['uuid', 'date', 'numeric', 'text', 'text'], 'repayment action exists');
select has_function('public', 'rpc_transition_staff_advance', array['uuid', 'text', 'text'], 'controlled correction and closure action exists');
select has_function('public', 'rpc_list_staff_advance_events', array['uuid'], 'advance history lookup exists');
select has_function('public', 'rpc_staff_advance_payroll_deduction', array['uuid', 'date'], 'payroll deduction lookup exists');

select ok(not has_table_privilege('authenticated', 'public.staff_advances', 'insert'), 'browser roles cannot insert advances directly');
select ok(not has_table_privilege('authenticated', 'public.staff_advances', 'update'), 'browser roles cannot update advances directly');
select ok(not has_table_privilege('authenticated', 'public.advance_repayments', 'insert'), 'browser roles cannot insert repayments directly');
select ok(not has_table_privilege('authenticated', 'public.staff_advance_events', 'insert'), 'event history is append-only through RPCs');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select set_config('test.advance_id', public.rpc_submit_staff_advance(1200000, 'School fees', 3, '2026-08-01')::text, true) $$,
  'employee can request an advance'
);
select is((select count(*)::integer from public.rpc_list_my_staff_advances()), 1, 'employee sees their own request');
select is((select status from public.rpc_list_my_staff_advances() limit 1), 'pending', 'employee request awaits HR');
select throws_ok(
  $$ select public.rpc_submit_staff_advance(500000, 'Second advance', 2, '2026-08-01') $$,
  '23505', 'You already have an open staff advance.',
  'employee cannot create a second open advance'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.rpc_list_my_staff_advances()), 0, 'another employee cannot see the request');
select throws_ok(
  $$ select * from public.rpc_list_staff_advance_events(current_setting('test.advance_id')::uuid) $$,
  '42501', 'You may only view your own staff advance history.',
  'another employee cannot inspect its history'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.rpc_list_hr_staff_advances()), 1, 'HR sees employee requests');
select lives_ok(
  $$ select public.rpc_decide_staff_advance(current_setting('test.advance_id')::uuid, 'approved', 'Approved after offline discussion') $$,
  'HR can approve a request'
);
select is((select status from public.rpc_list_hr_staff_advances() where id=current_setting('test.advance_id')::uuid), 'active', 'approval activates the advance');
select is((select monthly_deduction from public.rpc_list_hr_staff_advances() where id=current_setting('test.advance_id')::uuid), 400000::numeric, 'monthly deduction follows the legacy instalment calculation');
select is(public.rpc_staff_advance_payroll_deduction('92000000-0000-4000-8000-000000000001', '2026-08-01'), 400000::numeric, 'active schedule feeds payroll');
select lives_ok(
  $$ select public.rpc_record_advance_repayment(current_setting('test.advance_id')::uuid, '2026-08-01', 400000, 'payroll', 'August payroll') $$,
  'HR can record a repayment'
);
select is((select balance_remaining from public.rpc_list_hr_staff_advances() where id=current_setting('test.advance_id')::uuid), 800000::numeric, 'repayment reduces the outstanding balance');
select lives_ok(
  $$ select public.rpc_transition_staff_advance(current_setting('test.advance_id')::uuid, 'flagged', 'Employee is leaving') $$,
  'HR can flag a leaving employee'
);
select lives_ok(
  $$ select set_config('test.direct_advance_id', public.rpc_log_staff_advance('92000000-0000-4000-8000-000000000002', 600000, 'Emergency support', '2026-07-18', 2, '2026-09-01', 'Walk-in request')::text, true) $$,
  'HR can log an advance directly after an offline discussion'
);
select is((select status from public.rpc_list_hr_staff_advances() where employee_id = '92000000-0000-4000-8000-000000000002'), 'active', 'HR direct entry is active immediately');
select ok((select count(*) from public.rpc_list_staff_advance_events(current_setting('test.advance_id')::uuid)) >= 4, 'workflow actions create append-only history');
reset role;

select is((select count(*)::integer from public.notifications where recipient_profile_id = '91000000-0000-4000-8000-000000000003' and event_key like 'staff_advance_submitted_%'), 1, 'employee submission notifies HR');
select is(
  (select action_path from public.notifications where recipient_profile_id = '91000000-0000-4000-8000-000000000003' and event_key like 'staff_advance_submitted_%' limit 1),
  '/hr/staff-advances?advance=' || current_setting('test.advance_id'),
  'HR notification opens the implemented advance route'
);
select is(
  (select action_path from public.notifications where recipient_profile_id = '91000000-0000-4000-8000-000000000001' and event_key like 'staff_advance_decision_%' limit 1),
  '/my/advances?advance=' || current_setting('test.advance_id'),
  'employee decision notification opens the implemented advance route'
);
select ok((select count(*) from public.audit_events where entity_type = 'staff_advance') >= 4, 'financial transitions are audited');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.rpc_list_hr_staff_advances() $$,
  '42501', 'staff_advances.manage permission is required',
  'CFO cannot read sensitive HR advance details'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select notes from public.rpc_list_my_staff_advances() where id = current_setting('test.direct_advance_id')::uuid),
  null::text,
  'HR internal advance notes are not exposed to the employee'
);
reset role;

select * from finish();
rollback;
