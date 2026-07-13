begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- 1. Setup checks
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'project_assignments', 'project_assignments table exists');
select has_table('public', 'daily_updates', 'daily_updates table exists');
select has_table('public', 'daily_update_revisions', 'daily_update_revisions table exists');
select has_function('public', 'rpc_check_missed_daily_updates', array['date'], 'rpc_check_missed_daily_updates function exists');

-- 2. Setup test roles and dummy profiles
insert into auth.users (id, email)
values
  ('80000000-0000-0000-0000-000000000001', 'pm@example.invalid'),
  ('80000000-0000-0000-0000-000000000002', 'coord@example.invalid'),
  ('80000000-0000-0000-0000-000000000003', 'md@example.invalid'),
  ('80000000-0000-0000-0000-000000000004', 'cfo@example.invalid'),
  ('80000000-0000-0000-0000-000000000005', 'emp@example.invalid')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('80000000-0000-0000-0000-000000000001', 'Test PM'),
  ('80000000-0000-0000-0000-000000000002', 'Test Coord'),
  ('80000000-0000-0000-0000-000000000003', 'Test MD'),
  ('80000000-0000-0000-0000-000000000004', 'Test CFO'),
  ('80000000-0000-0000-0000-000000000005', 'Test Emp')
on conflict (id) do nothing;

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('80000000-0000-0000-0000-000000000001'::uuid, 'project_manager'::text),
  ('80000000-0000-0000-0000-000000000002'::uuid, 'coordinator'::text),
  ('80000000-0000-0000-0000-000000000003'::uuid, 'managing_director'::text),
  ('80000000-0000-0000-0000-000000000004'::uuid, 'cfo'::text),
  ('80000000-0000-0000-0000-000000000005'::uuid, 'employee'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key
on conflict do nothing;

-- 3. RLS Project Creation Checks
reset role;

-- Test 6: PM trying to create project fails
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$
    insert into public.projects (name, site_location, status, created_by)
    values ('Project Alpha', 'Kampala Office', 'active', '80000000-0000-0000-0000-000000000001')
  $$,
  '42501',
  'new row violates row-level security policy for table "projects"',
  'PM cannot insert project directly'
);

-- Test 7: CFO creating project succeeds
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$
    insert into public.projects (id, name, site_location, status, created_by)
    values ('90000000-0000-0000-0000-000000000001', 'Project Alpha', 'Kampala Office', 'active', '80000000-0000-0000-0000-000000000004');
    insert into public.projects (id, name, site_location, status, created_by)
    values ('90000000-0000-0000-0000-000000000002', 'Project Beta', 'Entebbe Hub', 'active', '80000000-0000-0000-0000-000000000004');
  $$,
  'CFO can create projects successfully'
);

-- Test 8: CFO assigns PM to Project Alpha
select lives_ok(
  $$
    insert into public.project_assignments (project_id, user_id, role_on_project)
    values ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'pm');
  $$,
  'CFO can assign users to projects'
);

-- Test 9: PM can read assigned Project Alpha
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select name from public.projects where id = '90000000-0000-0000-0000-000000000001' $$,
  $$ select 'Project Alpha'::text $$,
  'PM can select project they are assigned to'
);

-- Test 10: PM cannot read unassigned Project Beta
select is_empty(
  $$ select name from public.projects where id = '90000000-0000-0000-0000-000000000002' $$,
  'PM cannot select project they are not assigned to'
);

-- Test 11: PM can assign coordinator to Project Alpha
select lives_ok(
  $$
    insert into public.project_assignments (project_id, user_id, role_on_project)
    values ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'coordinator');
  $$,
  'PM can assign coordinators to their managed projects'
);

-- Test 12: PM cannot assign coordinator to Project Beta
select throws_ok(
  $$
    insert into public.project_assignments (project_id, user_id, role_on_project)
    values ('90000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'coordinator');
  $$,
  '42501',
  'new row violates row-level security policy for table "project_assignments"',
  'PM cannot assign users to unmanaged projects'
);

-- Test 13: Assigned Coordinator can insert daily update (draft status)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$
    insert into public.daily_updates (id, project_id, submitted_by, update_date, summary, status)
    values ('fa000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', '2026-07-12', 'Site clearing started.', 'draft');
  $$,
  'Coordinator can create draft updates on assigned projects'
);

-- Test 14: Assigned Coordinator can update draft daily update
select lives_ok(
  $$
    update public.daily_updates
    set summary = 'Site clearing completed.', status = 'submitted'
    where id = 'fa000000-0000-0000-0000-000000000001';
  $$,
  'Coordinator can modify and submit draft updates'
);

-- Test 15: Coordinator cannot update daily update on unassigned project
select throws_ok(
  $$
    insert into public.daily_updates (project_id, submitted_by, update_date, summary, status)
    values ('90000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', '2026-07-12', 'Unassigned update attempt.', 'draft');
  $$,
  '42501',
  'new row violates row-level security policy for table "daily_updates"',
  'Coordinator cannot submit update on unassigned projects'
);

-- Test 16: PM can request revision on submitted update
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$
    update public.daily_updates
    set status = 'revision_requested', pm_feedback = 'Need photo evidence.'
    where id = 'fa000000-0000-0000-0000-000000000001';
  $$,
  'PM can request revision with feedback'
);

-- Test 17: Daily update revisions table preserves history records
reset role;
select results_eq(
  $$ select count(*)::integer from public.daily_update_revisions where daily_update_id = 'fa000000-0000-0000-0000-000000000001' $$,
  $$ select 3::integer $$, -- 1 (insert draft) + 1 (update to submitted) + 1 (revision_requested)
  'Revisions history logged all 3 intermediate updates'
);

-- Test 18: Coordinator can update daily update to submitted status again
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$
    update public.daily_updates
    set summary = 'Site clearing completed with photo attachment.', photo_urls = '{"https://evidence.test/photo.jpg"}', status = 'submitted'
    where id = 'fa000000-0000-0000-0000-000000000001';
  $$,
  'Coordinator can resubmit update after revision request'
);

-- Test 19: PM can update status to endorsed
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$
    update public.daily_updates
    set status = 'endorsed', endorsed_by = '80000000-0000-0000-0000-000000000001', endorsed_at = now()
    where id = 'fa000000-0000-0000-0000-000000000001';
  $$,
  'PM can endorse the submitted update'
);

-- Test 20: MD can read all projects
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select results_eq(
  $$ select count(*)::integer from public.projects $$,
  $$ select 2::integer $$,
  'MD can view all projects'
);

-- Test 21: MD cannot insert project (Read-Only MD check)
select throws_ok(
  $$
    insert into public.projects (name, site_location, status, created_by)
    values ('Project MD Unauthorized', 'Mbarara', 'active', '80000000-0000-0000-0000-000000000003')
  $$,
  '42501',
  'new row violates row-level security policy for table "projects"',
  'MD cannot insert projects'
);

-- Test 22: RPC Missed updates function works
select results_eq(
  $$
    select project_name, user_full_name
    from public.rpc_check_missed_daily_updates(current_date)
  $$,
  $$ select 'Project Alpha'::text, 'Test Coord'::text $$,
  'Missed updates RPC detects unsubmitted active coordinator update'
);

rollback;
