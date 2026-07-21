begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(69);

-- Stable identities for employee self-service, HR operations, and privacy checks.
insert into auth.users (id, email) values
  ('85000000-0000-4000-8000-000000000001', 'leave-employee@example.invalid'),
  ('85000000-0000-4000-8000-000000000002', 'leave-other@example.invalid'),
  ('85000000-0000-4000-8000-000000000003', 'leave-hr@example.invalid'),
  ('85000000-0000-4000-8000-000000000004', 'leave-cfo@example.invalid'),
  ('85000000-0000-4000-8000-000000000005', 'leave-md@example.invalid')
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('85000000-0000-4000-8000-000000000001', 'Leave Employee'),
  ('85000000-0000-4000-8000-000000000002', 'Leave Other Employee'),
  ('85000000-0000-4000-8000-000000000003', 'Leave HR'),
  ('85000000-0000-4000-8000-000000000004', 'Leave CFO'),
  ('85000000-0000-4000-8000-000000000005', 'Leave Managing Director')
on conflict (id) do nothing;

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('85000000-0000-4000-8000-000000000001'::uuid, 'employee'::text),
  ('85000000-0000-4000-8000-000000000002'::uuid, 'employee'::text),
  ('85000000-0000-4000-8000-000000000003'::uuid, 'hr_admin'::text),
  ('85000000-0000-4000-8000-000000000004'::uuid, 'cfo'::text),
  ('85000000-0000-4000-8000-000000000005'::uuid, 'managing_director'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key
on conflict do nothing;

insert into public.employees (id, profile_id, employee_number, legal_name, created_by, updated_by) values
  ('86000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', 'LEAVE-001', 'Leave Employee', '85000000-0000-4000-8000-000000000003', '85000000-0000-4000-8000-000000000003'),
  ('86000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000002', 'LEAVE-002', 'Leave Other Employee', '85000000-0000-4000-8000-000000000003', '85000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

select has_table('public', 'leave_types', 'leave types table exists');
select has_table('public', 'public_holidays', 'public holidays table exists');
select has_table('public', 'leave_entitlements', 'leave entitlements table exists');
select has_table('public', 'leave_balance_adjustments', 'leave adjustments table exists');
select has_table('public', 'leave_requests', 'leave requests table exists');
select has_table('public', 'leave_request_events', 'leave workflow events table exists');
select has_table('public', 'leave_documents', 'leave evidence metadata table exists');

select has_function('public', 'rpc_calculate_leave_working_days', array['date', 'date'], 'working-day calculator exists');
select has_function('public', 'rpc_list_leave_types', array[]::text[], 'leave-type lookup exists');
select has_function('public', 'rpc_list_my_leave_requests', array[]::text[], 'employee request lookup exists');
select has_function('public', 'rpc_list_hr_leave_requests', array[]::text[], 'HR request lookup exists');
select has_function('public', 'rpc_list_leave_balances', array['uuid', 'integer'], 'derived balance lookup exists');
select has_function('public', 'rpc_submit_leave_request', array['uuid', 'date', 'date', 'text'], 'employee submission exists');
select has_function('public', 'rpc_log_leave_for_employee', array['uuid', 'uuid', 'date', 'date', 'text'], 'HR on-behalf workflow exists');
select has_function('public', 'rpc_decide_leave_request', array['uuid', 'text', 'text'], 'HR decision workflow exists');
select has_function('public', 'rpc_withdraw_leave_request', array['uuid', 'text'], 'employee withdrawal exists');
select has_function('public', 'rpc_cancel_leave_request', array['uuid', 'text'], 'HR cancellation exists');
select has_function('public', 'rpc_adjust_leave_balance', array['uuid', 'uuid', 'integer', 'numeric', 'text'], 'HR balance adjustment exists');
select has_function('public', 'rpc_attach_leave_document', array['uuid', 'text', 'text', 'text', 'bigint'], 'leave evidence attachment exists');
select has_function('public', 'rpc_list_leave_documents', array['uuid'], 'scoped leave evidence lookup exists');
select has_function('public', 'rpc_remove_leave_document', array['uuid'], 'scoped leave evidence removal exists');
select has_function('public', 'rpc_payroll_leave_percentage', array['uuid', 'date', 'numeric'], 'payroll leave percentage lookup exists');
select has_function('public', 'rpc_list_public_holidays', array[]::text[], 'HR holiday lookup exists');
select has_function('public', 'rpc_save_leave_type', array['text', 'text', 'boolean', 'numeric', 'boolean'], 'HR leave-type setup exists');
select has_function('public', 'rpc_save_public_holiday', array['date', 'text'], 'HR holiday setup exists');
select has_function('public', 'rpc_set_leave_entitlement', array['uuid', 'uuid', 'integer', 'numeric'], 'HR entitlement setup exists');
select has_function('public', 'rpc_list_leave_request_events', array['uuid'], 'HR request history lookup exists');
select lives_ok(
  $$ insert into public.notifications (recipient_profile_id, title, message, category, event_key, action_path)
     values ('85000000-0000-4000-8000-000000000004', 'Leave test', 'Safe request link', 'hr',
       'leave_path_test_safe', '/hr/leave?request=87000000-0000-4000-8000-000000000001') $$,
  'notification safety rule accepts a scoped leave request link'
);
select throws_ok(
  $$ insert into public.notifications (recipient_profile_id, title, message, category, event_key, action_path)
     values ('85000000-0000-4000-8000-000000000004', 'Leave test', 'Unsafe request link', 'hr',
       'leave_path_test_unsafe', '/hr/leave?redirect=https://example.com') $$,
  '23514',
  null,
  'notification safety rule still rejects arbitrary query strings'
);

select is((select count(*)::integer from public.leave_types where archived_at is null), 7, 'seven legacy leave defaults are seeded');
select results_eq(
  $$ select code from public.leave_types where archived_at is null order by display_order $$,
  $$ values ('annual'::text), ('sick'), ('day_off'), ('unpaid'), ('maternity'), ('paternity'), ('compassionate') $$,
  'legacy leave defaults retain the approved order'
);
select ok(not exists(select 1 from public.leave_types where default_entitlement_days is not null and default_entitlement_days < 0), 'default entitlements are non-negative');

insert into public.public_holidays (holiday_date, name, created_by)
values ('2026-08-03', 'Acceptance Holiday', '85000000-0000-4000-8000-000000000003');

select is(public.rpc_calculate_leave_working_days('2026-07-31', '2026-08-04'), 2, 'weekends and active public holidays are excluded');
select throws_ok(
  $$ select public.rpc_calculate_leave_working_days('2026-12-31', '2027-01-02') $$,
  '22023',
  'Leave dates must fall within one calendar year.',
  'cross-year leave is rejected'
);
select throws_ok(
  $$ select public.rpc_calculate_leave_working_days('2026-08-05', '2026-08-04') $$,
  '22023',
  'Leave end date cannot be before start date.',
  'backwards ranges are rejected'
);

select ok(not has_table_privilege('authenticated', 'public.leave_requests', 'insert'), 'authenticated users cannot insert leave directly');
select ok(not has_table_privilege('authenticated', 'public.leave_requests', 'update'), 'authenticated users cannot mutate leave directly');
select ok(not has_table_privilege('authenticated', 'public.leave_request_events', 'insert'), 'workflow history is append-only through server functions');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"85000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.rpc_submit_leave_request((select id from public.leave_types where code = 'annual'), '2026-08-04', '2026-08-05', 'Family travel') $$,
  'employee can submit their own whole-day request'
);
select set_config(
  'test.leave_request_id',
  (select id::text from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000001'),
  true
);
insert into storage.objects (bucket_id, name, owner_id)
select 'private-files',
  '85000000-0000-4000-8000-000000000001/leave-evidence/' || request_row.id || '/87000000-0000-4000-8000-000000000001.jpg',
  '85000000-0000-4000-8000-000000000001'
from public.leave_requests request_row
where request_row.employee_id = '86000000-0000-4000-8000-000000000001';
select lives_ok(
  $$ select public.rpc_attach_leave_document(
    (select id from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000001'),
    '85000000-0000-4000-8000-000000000001/leave-evidence/' ||
      (select id from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000001') ||
      '/87000000-0000-4000-8000-000000000001.jpg',
    'clinic-note.jpg', 'image/jpeg', 2048
  ) $$,
  'employee can attach uploaded evidence to their own pending request'
);
select is((select count(*)::integer from public.rpc_list_leave_documents(
  (select id from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000001')
)), 1, 'employee can list evidence for their own request');
select is((select count(*)::integer from public.rpc_list_my_leave_requests()), 1, 'employee sees their own request');
select throws_ok(
  $$ select * from public.rpc_list_leave_balances('86000000-0000-4000-8000-000000000002', 2026) $$,
  '42501',
  'You may only view your own leave balances.',
  'employee cannot read another employee balance'
);
reset role;

select is(
  (select count(*)::integer from public.notifications where recipient_profile_id = '85000000-0000-4000-8000-000000000003' and event_key like 'leave_submitted_%'),
  1,
  'submission notifies HR exactly once'
);
select is(
  (select action_path from public.notifications where recipient_profile_id = '85000000-0000-4000-8000-000000000003' and event_key like 'leave_submitted_%'),
  '/hr/leave?request=' || current_setting('test.leave_request_id'),
  'HR notification opens the matching leave request'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"85000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.rpc_list_my_leave_requests()), 0, 'another employee cannot see the first employee request');
select throws_ok(
  $$ select * from public.rpc_list_leave_documents(current_setting('test.leave_request_id')::uuid) $$,
  '42501', 'You may only view evidence for your own leave request.',
  'another employee cannot list private leave evidence'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"85000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::integer
   from public.rpc_list_hr_leave_requests()
   where employee_id = '86000000-0000-4000-8000-000000000001'
     and status = 'pending'),
  1,
  'HR sees the synthetic pending request with operational detail'
);
select lives_ok(
  $$ select public.rpc_decide_leave_request((select id from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000001'), 'approved', 'Approved after offline discussion') $$,
  'HR can approve a pending request'
);
select lives_ok(
  $$ select public.rpc_log_leave_for_employee('86000000-0000-4000-8000-000000000002', (select id from public.leave_types where code = 'sick'), '2026-09-07', '2026-09-08', 'Recorded after employee called HR') $$,
  'HR can directly log leave on behalf of an employee'
);
select is(
  (select status from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000002'),
  'approved',
  'HR-recorded leave is approved immediately'
);
select is(
  (select source from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000002'),
  'hr_on_behalf',
  'direct HR records retain their source'
);
select is(
  (select decided_by from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000002'),
  '85000000-0000-4000-8000-000000000003'::uuid,
  'HR actor is recorded as the direct decision maker'
);
select lives_ok(
  $$ select public.rpc_adjust_leave_balance('86000000-0000-4000-8000-000000000001', (select id from public.leave_types where code = 'annual'), 2026, 2, 'Carry-forward correction') $$,
  'HR can append a manual balance adjustment'
);
select results_eq(
  $$ select remaining_days from public.rpc_list_leave_balances('86000000-0000-4000-8000-000000000001', 2026) where leave_type_code = 'annual' $$,
  $$ values (21::numeric) $$,
  'balance is derived from default entitlement plus adjustment minus approved leave'
);
select lives_ok(
  $$ select public.rpc_save_leave_type('study', 'Study leave', true, 5, true) $$,
  'HR can configure a leave type'
);
select lives_ok(
  $$ select public.rpc_save_public_holiday('2026-10-09', 'Independence Day') $$,
  'HR can configure a public holiday'
);
select lives_ok(
  $$ select public.rpc_set_leave_entitlement('86000000-0000-4000-8000-000000000001', (select id from public.leave_types where code = 'annual'), 2027, 24) $$,
  'HR can configure an employee entitlement'
);
select is((select count(*)::integer from public.rpc_list_public_holidays() where holiday_date = '2026-10-09'), 1, 'HR can list configured public holidays');
select ok((select count(*) from public.rpc_list_leave_request_events((select id from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000001'))) >= 2, 'HR can review request audit history');
select throws_ok(
  $$ select public.rpc_cancel_leave_request((select id from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000001'), 'x') $$,
  '22023',
  'A cancellation reason of at least 3 characters is required.',
  'HR cancellation requires a meaningful reason'
);
select lives_ok(
  $$ select public.rpc_cancel_leave_request((select id from public.leave_requests where employee_id = '86000000-0000-4000-8000-000000000001'), 'Travel was cancelled') $$,
  'HR can cancel approved leave with a reason'
);
reset role;

select ok(
  (select count(*) from public.leave_request_events) >= 4,
  'workflow actions produce append-only event history'
);
select is(
  (select count(*)::integer from public.notifications where recipient_profile_id = '85000000-0000-4000-8000-000000000001' and event_key like 'leave_decision_%'),
  1,
  'HR approval notifies the employee once'
);
select is(
  (select count(*)::integer from public.notifications where recipient_profile_id = '85000000-0000-4000-8000-000000000002' and event_key like 'leave_on_behalf_%'),
  1,
  'direct HR leave entry notifies the employee once'
);

insert into public.leave_requests (
  employee_id, leave_type_id, start_date, end_date, working_days, reason,
  status, source, submitted_by, decided_by, decided_at, decision_reason
) values (
  '86000000-0000-4000-8000-000000000001',
  (select id from public.leave_types where code = 'unpaid'),
  '2026-07-06', '2026-07-10', 5, 'Acceptance unpaid leave',
  'approved', 'hr_on_behalf', '85000000-0000-4000-8000-000000000003',
  '85000000-0000-4000-8000-000000000003', now(), 'Acceptance payroll check'
);
select is(
  public._payroll_leave_percentage('86000000-0000-4000-8000-000000000001', '2026-07-01', 100),
  78.2609::numeric,
  'approved unpaid leave automatically reduces the payroll working percentage'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"85000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.rpc_list_hr_leave_requests() $$,
  '42501',
  'leave.manage permission is required',
  'CFO cannot read sensitive leave detail'
);
select is((select count(*)::integer from public.leave_requests), 0, 'CFO direct table read reveals no sensitive requests');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"85000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::integer from public.leave_requests), 0, 'Managing Director direct table read reveals no sensitive requests');
reset role;

do $$
declare diagnostic text;
begin
  for diagnostic in select * from finish() loop
    raise exception using message = 'pgTAP failure: ' || diagnostic;
  end loop;
end
$$;

rollback;
