begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

-- 1. Table & Column checks
select has_table('public', 'notifications', 'notifications table should exist');
select has_column('public', 'notifications', 'id', 'id should exist');
select has_column('public', 'notifications', 'recipient_profile_id', 'recipient_profile_id should exist');
select has_column('public', 'notifications', 'title', 'title should exist');
select has_column('public', 'notifications', 'message', 'message should exist');
select has_column('public', 'notifications', 'is_read', 'is_read should exist');
select has_column('public', 'notifications', 'category', 'category should exist');
select has_column('public', 'notifications', 'event_key', 'event_key should exist');

select has_function('public', 'create_notification', ARRAY['uuid', 'text', 'text', 'text', 'text'], 'create_notification helper should exist');
select has_function('public', 'mark_notification_as_read', ARRAY['uuid'], 'mark_notification_as_read helper should exist');
select has_function('public', 'mark_all_notifications_as_read', ARRAY[]::text[], 'mark_all_notifications_as_read helper should exist');
select has_table('public', 'notification_deliveries', 'notification_deliveries table should exist');

-- 2. Setup test data as admin
-- Create auth users
insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-000000000010', 'admin@example.invalid'),
  ('90000000-0000-0000-0000-000000000011', 'cfo@example.invalid'),
  ('90000000-0000-0000-0000-000000000012', 'coord@example.invalid'),
  ('90000000-0000-0000-0000-000000000013', 'pm@example.invalid'),
  ('90000000-0000-0000-0000-000000000014', 'wm@example.invalid')
on conflict (id) do nothing;

-- Create dummy profiles
insert into public.profiles (id, display_name, status) values
  ('90000000-0000-0000-0000-000000000010', 'Super Admin User', 'active'),
  ('90000000-0000-0000-0000-000000000011', 'CFO User', 'active'),
  ('90000000-0000-0000-0000-000000000012', 'Coordinator User', 'active'),
  ('90000000-0000-0000-0000-000000000013', 'PM User', 'active'),
  ('90000000-0000-0000-0000-000000000014', 'WM User', 'active')
on conflict (id) do update set status = excluded.status;

-- Link roles
insert into public.user_roles (profile_id, role_id)
select '90000000-0000-0000-0000-000000000010', id from public.roles where key = 'super_admin' on conflict do nothing;
insert into public.user_roles (profile_id, role_id)
select '90000000-0000-0000-0000-000000000011', id from public.roles where key = 'cfo' on conflict do nothing;
insert into public.user_roles (profile_id, role_id)
select '90000000-0000-0000-0000-000000000012', id from public.roles where key = 'coordinator' on conflict do nothing;
insert into public.user_roles (profile_id, role_id)
select '90000000-0000-0000-0000-000000000013', id from public.roles where key = 'project_manager' on conflict do nothing;
insert into public.user_roles (profile_id, role_id)
select '90000000-0000-0000-0000-000000000014', id from public.roles where key = 'warehouse_manager' on conflict do nothing;

-- Insert projects
insert into public.projects (id, name, site_location, health_status, created_by) values
  ('90000000-0000-0000-0000-000000000020', 'Test Alerts Project', 'Kampala', 'on_track', '90000000-0000-0000-0000-000000000010')
on conflict (id) do nothing;

-- Link project assignments
insert into public.project_assignments (project_id, user_id, role_on_project) values
  ('90000000-0000-0000-0000-000000000020', '90000000-0000-0000-0000-000000000013', 'pm'),
  ('90000000-0000-0000-0000-000000000020', '90000000-0000-0000-0000-000000000012', 'coordinator')
on conflict do nothing;

-- Clean notifications and outbox for clean assertions
delete from public.notification_deliveries;
delete from public.notifications;

-- Create notifications via service_role context or as superuser before role testing
select public.create_notification(
  '90000000-0000-0000-0000-000000000012',
  'Notification for Coord',
  'This is a private message',
  'general',
  'test_notif_1'
);

select public.create_notification(
  '90000000-0000-0000-0000-000000000011',
  'Notification for CFO',
  'This is a CFO message',
  'general',
  'test_notif_2'
);

-- 3. RLS Policy tests (Switching roles)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000012", "role":"authenticated"}', true);

-- Coordinator selects their own
select results_eq(
  $$ select title from public.notifications $$,
  $$ select 'Notification for Coord'::text $$,
  'Coordinator selects their own notifications'
);

-- Coordinator cannot read CFO notifications
select results_ne(
  $$ select title from public.notifications $$,
  $$ select 'Notification for CFO'::text $$,
  'Coordinator cannot read CFO notifications'
);

-- Authenticated user cannot call create_notification
select throws_ok(
  $$ select public.create_notification('90000000-0000-0000-0000-000000000012', 'Hacked', 'Hacked message', 'general', 'hack_key') $$,
  'permission denied for function create_notification',
  'Authenticated user cannot call create_notification'
);

-- Authenticated user cannot update notifications directly
select throws_ok(
  $$ update public.notifications set title = 'Hacked' $$,
  'permission denied for table notifications',
  'Authenticated user cannot update notifications directly'
);

-- Coordinator marks their own read
select lives_ok(
  $$ select public.mark_notification_as_read(id) from public.notifications where title = 'Notification for Coord' $$,
  'Coordinator can mark their own notification as read'
);

-- Verify mark_notification_as_read affected only own notification
select results_eq(
  $$ select is_read from public.notifications where title = 'Notification for Coord' $$,
  $$ select true $$,
  'mark_notification_as_read should mark own notification read'
);

-- Reset role to admin to test trigger scenarios
reset role;
select set_config('request.jwt.claims', null, true);

-- Verify coordinator cannot mark CFO's notification read (even if they know the ID)
do $$
declare
  v_cfo_notif_id uuid;
begin
  select id into v_cfo_notif_id from public.notifications where title = 'Notification for CFO' limit 1;
  -- Try to update it using mark_notification_as_read as Coordinator
  perform set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000012", "role":"authenticated"}', true);
  set local role authenticated;
  perform public.mark_notification_as_read(v_cfo_notif_id);
end;
$$;

reset role;
select set_config('request.jwt.claims', null, true);

select results_eq(
  $$ select is_read from public.notifications where title = 'Notification for CFO' $$,
  $$ select false $$,
  'Coordinator marking CFO notification read does nothing'
);

-- Clean notifications and outbox for trigger checks
delete from public.notification_deliveries;
delete from public.notifications;

-- 4. Trigger test: Cash Request Submitted
insert into public.cash_advance_requests (
  id,
  project_id,
  user_id,
  amount_requested,
  purpose,
  status,
  entered_by
) values (
  '90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020',
  '90000000-0000-0000-0000-000000000012',
  500000,
  'Concrete block purchase',
  'pending_approval',
  '90000000-0000-0000-0000-000000000012'
);

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'New Cash Advance Request' and recipient_profile_id in ('90000000-0000-0000-0000-000000000010', '90000000-0000-0000-0000-000000000011') $$,
  $$ select 2 $$,
  'Cash request pending_approval notifies CFO and Admin'
);

-- 5. Trigger test: Cash Request Approved
update public.cash_advance_requests
set status = 'approved', approved_by = '90000000-0000-0000-0000-000000000011', approved_at = now()
where id = '90000000-0000-0000-0000-000000000030';

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'Cash Advance Approved' and recipient_profile_id = '90000000-0000-0000-0000-000000000012' $$,
  $$ select 1 $$,
  'Cash request approved notifies Coordinator'
);

-- 6. Trigger test: Cash Request Rejected
update public.cash_advance_requests
set status = 'rejected'
where id = '90000000-0000-0000-0000-000000000030';

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'Cash Advance Rejected' and recipient_profile_id = '90000000-0000-0000-0000-000000000012' $$,
  $$ select 1 $$,
  'Cash request rejected notifies Coordinator'
);

-- 7. Trigger test: Cash Request Disbursed
update public.cash_advance_requests
set status = 'disbursed', disbursed_by = '90000000-0000-0000-0000-000000000011', disbursed_at = now(), amount_disbursed = 500000
where id = '90000000-0000-0000-0000-000000000030';

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'Cash Advance Disbursed' and recipient_profile_id = '90000000-0000-0000-0000-000000000012' $$,
  $$ select 1 $$,
  'Cash request disbursed notifies Coordinator'
);

-- 8. Trigger test: Cash Expense Submitted (Non-sensitive text)
insert into public.cash_advance_expenses (
  id,
  cash_advance_id,
  expense_date,
  category,
  amount,
  vendor,
  explanation,
  status
) values (
  '90000000-0000-0000-0000-000000000040',
  '90000000-0000-0000-0000-000000000030',
  '2026-07-12',
  'Materials',
  150000.00,
  'Local Hardware',
  'Concrete block receipt',
  'pending_review'
);

select results_eq(
  $$ select message from public.notifications where title = 'New Cash Expense Submitted' limit 1 $$,
  $$ select 'A cash advance expense was submitted for review.'::text $$,
  'Cash expense pending_review notifies CFO and Admin with non-sensitive message'
);

-- 9. Trigger test: Stock Request Submitted
insert into public.stock_requests (
  id,
  requested_by,
  project_name,
  status,
  total_estimated_value
) values (
  '90000000-0000-0000-0000-000000000050',
  '90000000-0000-0000-0000-000000000012',
  'Test Alerts Project',
  'pending_approval',
  250000.00
);

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'New Stock Request' and recipient_profile_id in ('90000000-0000-0000-0000-000000000010', '90000000-0000-0000-0000-000000000011', '90000000-0000-0000-0000-000000000014') $$,
  $$ select 3 $$,
  'Stock request pending_approval notifies Warehouse Manager, CFO, and Admin'
);

-- 10. Trigger test: Stock Request Approved & Fulfilled
update public.stock_requests
set status = 'approved', approved_by = '90000000-0000-0000-0000-000000000011', approved_at = now()
where id = '90000000-0000-0000-0000-000000000050';

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'Stock Request Approved' and recipient_profile_id = '90000000-0000-0000-0000-000000000012' $$,
  $$ select 1 $$,
  'Stock request approved notifies requester'
);

update public.stock_requests
set status = 'fulfilled'
where id = '90000000-0000-0000-0000-000000000050';

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'Stock Request Fulfilled' and recipient_profile_id = '90000000-0000-0000-0000-000000000012' $$,
  $$ select 1 $$,
  'Stock request fulfilled notifies requester'
);

-- 11. Trigger test: Daily Update Submitted
insert into public.daily_updates (
  id,
  project_id,
  submitted_by,
  update_date,
  summary,
  status
) values (
  '90000000-0000-0000-0000-000000000060',
  '90000000-0000-0000-0000-000000000020',
  '90000000-0000-0000-0000-000000000012',
  '2026-07-12',
  'First phase columns cast',
  'submitted'
);

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'New Daily Update Submitted' and recipient_profile_id = '90000000-0000-0000-0000-000000000013' $$,
  $$ select 1 $$,
  'Daily update submitted notifies PM'
);

-- 12. Trigger test: Daily Update Endorsed & Revision
update public.daily_updates
set status = 'endorsed'
where id = '90000000-0000-0000-0000-000000000060';

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'Daily Update Endorsed' and recipient_profile_id = '90000000-0000-0000-0000-000000000012' $$,
  $$ select 1 $$,
  'Daily update endorsed notifies coordinator'
);

update public.daily_updates
set status = 'revision_requested', pm_feedback = 'Check concrete cubes density'
where id = '90000000-0000-0000-0000-000000000060';

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'Revision Requested on Daily Update' and recipient_profile_id = '90000000-0000-0000-0000-000000000012' $$,
  $$ select 1 $$,
  'Daily update revision requested notifies coordinator'
);

-- 13. Trigger test: Payroll Approved / Published
-- Create a test payroll period and employees
insert into public.payroll_periods (id, period_start, period_end, label, created_by) values
  ('90000000-0000-0000-0000-000000000070', '2026-07-01', '2026-07-31', 'July 2026', '90000000-0000-0000-0000-000000000010')
on conflict (id) do nothing;

insert into public.employees (id, profile_id, employee_number, legal_name, created_by) values
  ('90000000-0000-0000-0000-000000000080', '90000000-0000-0000-0000-000000000012', 'EMP-001', 'Test Coord Employee', '90000000-0000-0000-0000-000000000010')
on conflict (id) do nothing;

insert into public.payroll_runs (
  id,
  period_id,
  run_number,
  run_type,
  status,
  calculation_settings,
  total_gross,
  total_paye,
  total_net,
  created_by,
  updated_by
) values (
  '90000000-0000-0000-0000-000000000090',
  '90000000-0000-0000-0000-000000000070',
  1,
  'regular',
  'draft',
  '{}'::jsonb,
  1000000.00,
  100000.00,
  900000.00,
  '90000000-0000-0000-0000-000000000010',
  '90000000-0000-0000-0000-000000000010'
);

-- Approve payroll
update public.payroll_runs
set status = 'approved', approved_by = '90000000-0000-0000-0000-000000000011', approved_at = now()
where id = '90000000-0000-0000-0000-000000000090';

select results_eq(
  $$ select count(*)::integer from public.notifications where title = 'Payslip Published' and recipient_profile_id = '90000000-0000-0000-0000-000000000012' $$,
  $$ select 1 $$,
  'Payroll approved notifies active employees'
);

-- Verify payslip message has correct template and no net-pay details
select results_eq(
  $$ select message from public.notifications where title = 'Payslip Published' and recipient_profile_id = '90000000-0000-0000-0000-000000000012' $$,
  $$ select 'Your payslip for the period July 2026 is now available in the portal.'::text $$,
  'Payroll notification contains no salary/net-pay values'
);

-- 14. Verify Outbox table triggers on notification insert
select results_eq(
  $$ select count(*)::integer from public.notification_deliveries where channel = 'email' $$,
  $$ select count(*)::integer from public.notifications $$,
  'Webhook triggers insert a notification delivery outbox record for email'
);

select * from finish();
rollback;
