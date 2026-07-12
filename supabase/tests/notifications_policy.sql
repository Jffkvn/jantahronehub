begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

-- 1. Check table existence and properties
select has_table('public', 'notifications', 'notifications table should exist');
select has_column('public', 'notifications', 'id', 'id should exist');
select has_column('public', 'notifications', 'recipient_profile_id', 'recipient_profile_id should exist');
select has_column('public', 'notifications', 'title', 'title should exist');
select has_column('public', 'notifications', 'message', 'message should exist');
select has_column('public', 'notifications', 'is_read', 'is_read should exist');
select has_column('public', 'notifications', 'category', 'category should exist');

-- 2. Check security definer helper functions
select has_function('public', 'create_notification', ARRAY['uuid', 'text', 'text', 'text'], 'create_notification helper should exist');
select has_function('public', 'mark_notification_as_read', ARRAY['uuid'], 'mark_notification_as_read helper should exist');
select has_function('public', 'mark_all_notifications_as_read', ARRAY[]::text[], 'mark_all_notifications_as_read helper should exist');

-- 3. Setup test data
-- Create auth users
insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-000000000010', 'admin@example.invalid'),
  ('90000000-0000-0000-0000-000000000011', 'cfo@example.invalid'),
  ('90000000-0000-0000-0000-000000000012', 'coord@example.invalid'),
  ('90000000-0000-0000-0000-000000000013', 'pm@example.invalid')
on conflict (id) do nothing;

-- Create dummy profiles
insert into public.profiles (id, display_name, status) values
  ('90000000-0000-0000-0000-000000000010', 'Super Admin User', 'active'),
  ('90000000-0000-0000-0000-000000000011', 'CFO User', 'active'),
  ('90000000-0000-0000-0000-000000000012', 'Coordinator User', 'active'),
  ('90000000-0000-0000-0000-000000000013', 'PM User', 'active')
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

-- Insert a test project
insert into public.projects (id, name, site_location, health_status, created_by) values
  ('90000000-0000-0000-0000-000000000020', 'Test Alerts Project', 'Kampala', 'on_track', '90000000-0000-0000-0000-000000000010')
on conflict (id) do nothing;

-- Link project assignments
insert into public.project_assignments (project_id, user_id, role_on_project) values
  ('90000000-0000-0000-0000-000000000020', '90000000-0000-0000-0000-000000000013', 'pm'),
  ('90000000-0000-0000-0000-000000000020', '90000000-0000-0000-0000-000000000012', 'coordinator')
on conflict do nothing;

-- 4. Test RLS select policy
-- Act as Coordinator
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000012"}', true);

-- Call create_notification to add one notification for Coordinator, and one for CFO
select public.create_notification(
  '90000000-0000-0000-0000-000000000012',
  'Notification for Coord',
  'This is a private message',
  'general'
);

select public.create_notification(
  '90000000-0000-0000-0000-000000000011',
  'Notification for CFO',
  'This is a CFO message',
  'general'
);

-- Assert coordinator only sees 1 notification
select results_eq(
  $$ select title from public.notifications $$,
  $$ select 'Notification for Coord'::text $$,
  'Coordinator should only select their own notifications'
);

-- 5. Test RPC helpers
-- Coordinator marks notification as read
do $$
declare
  v_notif_id uuid;
begin
  select id into v_notif_id from public.notifications where title = 'Notification for Coord' limit 1;
  perform public.mark_notification_as_read(v_notif_id);
end;
$$;

select results_eq(
  $$ select is_read from public.notifications where title = 'Notification for Coord' $$,
  $$ select true $$,
  'mark_notification_as_read should set is_read to true'
);

-- Reset claim to cfo to test triggers
select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000011"}', true);

-- Delete test notifications to keep assertions clean
delete from public.notifications;

-- 6. Test cash advance trigger flow
insert into public.cash_advance_requests (
  id,
  project_id,
  user_id,
  purpose,
  amount_requested,
  status
) values (
  '90000000-0000-0000-0000-000000000030',
  '90000000-0000-0000-0000-000000000020',
  '90000000-0000-0000-0000-000000000012',
  'Site concrete purchase',
  500000,
  'pending_approval'
);

-- Asserts that CFO & Super Admin received a notification
select results_eq(
  $$ select recipient_profile_id from public.notifications where category = 'cash' order by recipient_profile_id $$,
  $$ select id from public.profiles where id in ('90000000-0000-0000-0000-000000000010', '90000000-0000-0000-0000-000000000011') order by id $$,
  'CFO and Super Admin should receive notifications when a cash advance is requested'
);

-- CFO approves request
update public.cash_advance_requests
set status = 'approved'
where id = '90000000-0000-0000-0000-000000000030';

-- Asserts coordinator received notification
select results_eq(
  $$ select title from public.notifications where recipient_profile_id = '90000000-0000-0000-0000-000000000012' and title = 'Cash Advance Approved' $$,
  $$ select 'Cash Advance Approved'::text $$,
  'Coordinator should be notified when their cash advance request is approved'
);

-- 7. Test daily update triggers
-- Reset notifications
delete from public.notifications;

-- Coordinator submits daily update
insert into public.daily_updates (
  project_id,
  submitted_by,
  update_date,
  summary,
  status
) values (
  '90000000-0000-0000-0000-000000000020',
  '90000000-0000-0000-0000-000000000012',
  '2026-07-12',
  'Completed first phase concrete pour',
  'submitted'
);

-- Asserts PM received notification
select results_eq(
  $$ select title from public.notifications where recipient_profile_id = '90000000-0000-0000-0000-000000000013' $$,
  $$ select 'New Daily Update Submitted'::text $$,
  'Project Manager should receive a notification when coordinator submits a daily update'
);

select * from finish();
rollback;
