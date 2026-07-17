begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(71);

-- Deterministic role fixtures. Every assertion below scopes its data by these IDs/codes.
insert into auth.users (id, email)
values
  ('80000000-0000-0000-0000-000000000001', 'projects-pm1@example.invalid'),
  ('80000000-0000-0000-0000-000000000002', 'projects-coord1@example.invalid'),
  ('80000000-0000-0000-0000-000000000003', 'projects-md@example.invalid'),
  ('80000000-0000-0000-0000-000000000004', 'projects-cfo@example.invalid'),
  ('80000000-0000-0000-0000-000000000005', 'projects-employee@example.invalid'),
  ('80000000-0000-0000-0000-000000000006', 'projects-pm2@example.invalid'),
  ('80000000-0000-0000-0000-000000000007', 'projects-coord2@example.invalid'),
  ('80000000-0000-0000-0000-000000000008', 'projects-super@example.invalid'),
  ('80000000-0000-0000-0000-000000000009', 'projects-hr@example.invalid'),
  ('80000000-0000-0000-0000-000000000010', 'projects-coord3@example.invalid'),
  ('82000000-0000-4000-8000-000000000002', 'projects-photo-coord@example.invalid')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('80000000-0000-0000-0000-000000000001', 'Projects PM One'),
  ('80000000-0000-0000-0000-000000000002', 'Projects Coordinator One'),
  ('80000000-0000-0000-0000-000000000003', 'Projects Managing Director'),
  ('80000000-0000-0000-0000-000000000004', 'Projects CFO'),
  ('80000000-0000-0000-0000-000000000005', 'Projects Employee'),
  ('80000000-0000-0000-0000-000000000006', 'Projects PM Two'),
  ('80000000-0000-0000-0000-000000000007', 'Projects Coordinator Two'),
  ('80000000-0000-0000-0000-000000000008', 'Projects Super Admin'),
  ('80000000-0000-0000-0000-000000000009', 'Projects HR'),
  ('80000000-0000-0000-0000-000000000010', 'Projects Coordinator Three'),
  ('82000000-0000-4000-8000-000000000002', 'Projects Photo Coordinator')
on conflict (id) do nothing;

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('80000000-0000-0000-0000-000000000001'::uuid, 'project_manager'::text),
  ('80000000-0000-0000-0000-000000000002'::uuid, 'coordinator'::text),
  ('80000000-0000-0000-0000-000000000003'::uuid, 'managing_director'::text),
  ('80000000-0000-0000-0000-000000000004'::uuid, 'cfo'::text),
  ('80000000-0000-0000-0000-000000000005'::uuid, 'employee'::text),
  ('80000000-0000-0000-0000-000000000006'::uuid, 'project_manager'::text),
  ('80000000-0000-0000-0000-000000000007'::uuid, 'coordinator'::text),
  ('80000000-0000-0000-0000-000000000008'::uuid, 'super_admin'::text),
  ('80000000-0000-0000-0000-000000000009'::uuid, 'hr_admin'::text),
  ('80000000-0000-0000-0000-000000000010'::uuid, 'coordinator'::text),
  ('82000000-0000-4000-8000-000000000002'::uuid, 'coordinator'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key
on conflict do nothing;

-- Foundation contract.
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'project_assignments', 'project assignments table exists');
select has_table('public', 'daily_updates', 'daily updates table exists');
select has_table('public', 'daily_update_revisions', 'daily update revisions table exists');

select has_column('public', 'projects', 'project_code', 'projects have a canonical code');
select has_column('public', 'projects', 'client_name', 'projects have a client');
select has_column('public', 'projects', 'planned_start_date', 'projects have a planned start date');
select has_column('public', 'projects', 'expected_end_date', 'projects have an expected end date');
select has_column('public', 'projects', 'actual_completion_date', 'projects retain actual completion date');
select has_column('public', 'projects', 'contract_reference', 'projects retain contract reference');
select has_column('public', 'projects', 'budget_reference', 'projects retain budget reference');
select has_column('public', 'projects', 'operational_notes', 'projects retain operational notes');
select has_column('public', 'projects', 'updated_by', 'projects retain last updater');
select has_column('public', 'project_assignments', 'assigned_by', 'assignments retain assigning actor');
select has_column('public', 'project_assignments', 'assignment_reason', 'assignments retain assignment reason');
select has_column('public', 'project_assignments', 'unassigned_by', 'assignments retain ending actor');
select has_column('public', 'project_assignments', 'unassignment_reason', 'assignments retain ending reason');

select has_function('public', 'rpc_list_project_assignment_candidates', array[]::text[], 'candidate lookup exists');
select has_function('public', 'rpc_list_project_assignments', array['uuid', 'boolean'], 'guarded assignment-name lookup exists');
select has_function('public', 'rpc_create_project', array['jsonb', 'uuid', 'uuid[]', 'text'], 'project creation RPC exists');
select has_function('public', 'rpc_update_project', array['uuid', 'jsonb', 'text'], 'project update RPC exists');
select has_function('public', 'rpc_assign_project_member', array['uuid', 'uuid', 'text', 'text'], 'project assignment RPC exists');
select has_function('public', 'rpc_unassign_project_member', array['uuid', 'text'], 'project unassignment RPC exists');
select has_function('public', 'rpc_save_daily_update', array['uuid', 'uuid', 'date', 'text', 'text[]', 'boolean'], 'daily update save RPC exists');
select has_function('public', 'rpc_review_daily_update', array['uuid', 'text', 'text'], 'daily update review RPC exists');

select ok(not has_table_privilege('authenticated', 'public.projects', 'insert'), 'authenticated cannot insert projects directly');
select ok(not has_table_privilege('authenticated', 'public.projects', 'update'), 'authenticated cannot update projects directly');
select ok(not has_table_privilege('authenticated', 'public.project_assignments', 'insert'), 'authenticated cannot insert assignments directly');
select ok(not has_table_privilege('authenticated', 'public.project_assignments', 'update'), 'authenticated cannot update assignments directly');
select ok(not has_table_privilege('authenticated', 'public.daily_updates', 'insert'), 'authenticated cannot insert daily updates directly');
select ok(not has_table_privilege('authenticated', 'public.daily_updates', 'update'), 'authenticated cannot update daily updates directly');

-- Exact role grants.
select ok(
  exists (
    select 1 from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.key = 'project_manager' and permission.key = 'projects.create'
  ),
  'Project Manager receives projects.create'
);
select ok(
  exists (
    select 1 from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.key = 'cfo' and permission.key = 'projects.assign_all'
  ),
  'CFO receives projects.assign_all'
);
select ok(
  not exists (
    select 1 from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.key = 'project_manager' and permission.key in ('projects.manage', 'projects.assign_all', 'projects.update_all')
  ),
  'Project Manager never receives broad project authority'
);
select ok(
  not exists (
    select 1 from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.key = 'cfo' and permission.key in ('projects.manage', 'daily_updates.endorse')
  ),
  'stale CFO project management and PM review grants are removed'
);
select ok(
  not exists (
    select 1 from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.key = 'hr_admin' and permission.key in ('projects.read', 'projects.read_all', 'daily_updates.read', 'daily_updates.read_all')
  ),
  'stale HR project-wide access is removed'
);
select ok(
  exists (
    select 1 from public.role_permissions role_permission
    join public.roles role on role.id = role_permission.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.key = 'warehouse_manager' and permission.key = 'projects.read_operational'
  ),
  'Warehouse Manager receives limited operational project read authority'
);

-- Direct writes are denied even to historically broad roles.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.projects (project_code, name, status, created_by, updated_by) values ('DIRECT-1', 'Direct write', 'planned', auth.uid(), auth.uid()) $$,
  '42501',
  'permission denied for table projects',
  'CFO cannot bypass the creation RPC'
);

-- PM-created projects atomically assign the caller as primary PM.
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.rpc_create_project(
      '{"project_code":"PM-OWN-001","name":"PM Created Project","client_name":"Client A","site_location":"Kampala","planned_start_date":"2026-08-01","expected_end_date":"2026-12-31","status":"planned","health_status":"on_track","contract_reference":"CT-001","budget_reference":"BD-001","operational_notes":"Initial mobilisation"}'::jsonb,
      null,
      array['80000000-0000-0000-0000-000000000002'::uuid],
      'PM creating assigned project'
    )
  $$,
  'Project Manager can create a project through the RPC'
);
select results_eq(
  $$
    select assignment.user_id
    from public.project_assignments assignment
    join public.projects project on project.id = assignment.project_id
    where project.project_code = 'PM-OWN-001'
      and assignment.role_on_project = 'pm'
      and assignment.unassigned_at is null
  $$,
  $$ select '80000000-0000-0000-0000-000000000001'::uuid $$,
  'PM creation atomically assigns the caller as primary PM'
);
select results_eq(
  $$
    select assignment.display_name
    from public.rpc_list_project_assignments(
      (select id from public.projects where project_code = 'PM-OWN-001'),
      false
    ) assignment
    where assignment.role_on_project = 'coordinator'
  $$,
  $$ select 'Projects Coordinator One'::text $$,
  'assigned project readers receive the coordinator display name through the guarded lookup'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.notifications notification
    where notification.recipient_profile_id = '80000000-0000-0000-0000-000000000002'
      and notification.event_key like 'project_assignment_%'
  ),
  1,
  'project creation notifies the initially assigned coordinator once'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- PM can manage coordinators but cannot appoint a PM.
select lives_ok(
  $$
    select public.rpc_assign_project_member(
      (select id from public.projects where project_code = 'PM-OWN-001'),
      '80000000-0000-0000-0000-000000000007'::uuid,
      'coordinator',
      'Add second field coordinator'
    )
  $$,
  'assigned PM can add a coordinator'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.notifications notification
    where notification.recipient_profile_id = '80000000-0000-0000-0000-000000000007'
      and notification.event_key like 'project_assignment_%'
  ),
  1,
  'later coordinator assignment creates one notification'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.rpc_assign_project_member(
      (select id from public.projects where project_code = 'PM-OWN-001'),
      '80000000-0000-0000-0000-000000000007'::uuid,
      'coordinator',
      'Retry existing field coordinator assignment'
    )
  $$,
  'retrying an existing active assignment remains safe'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.notifications notification
    where notification.recipient_profile_id = '80000000-0000-0000-0000-000000000007'
      and notification.event_key like 'project_assignment_%'
  ),
  1,
  'assignment retry does not duplicate the notification'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$
    select public.rpc_assign_project_member(
      (select id from public.projects where project_code = 'PM-OWN-001'),
      '80000000-0000-0000-0000-000000000006'::uuid,
      'pm',
      'Unauthorized PM replacement'
    )
  $$,
  '42501',
  'projects.assign_all permission is required to assign the primary PM',
  'assigned PM cannot appoint or replace the primary PM'
);
select is(
  (
    select count(*)::integer
    from public.project_assignments assignment
    join public.projects project on project.id = assignment.project_id
    where project.project_code = 'PM-OWN-001'
      and assignment.role_on_project = 'coordinator'
      and assignment.unassigned_at is null
  ),
  2,
  'one project supports multiple active coordinators'
);

select lives_ok(
  $$
    select public.rpc_update_project(
      (select id from public.projects where project_code = 'PM-OWN-001'),
      '{"health_status":"at_risk","operational_notes":"Access road delayed"}'::jsonb,
      'Record operational risk'
    )
  $$,
  'assigned PM can update operational project details'
);
select throws_ok(
  $$
    select public.rpc_update_project(
      (select id from public.projects where project_code = 'PM-OWN-001'),
      '{"status":"completed"}'::jsonb,
      'Attempt completion without safeguards'
    )
  $$,
  '22023',
  'status transition requires the guarded project transition workflow',
  'ordinary update RPC cannot complete a project'
);

-- CFO can create with multiple coordinators and no PM, then appoint/replace the PM later.
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.rpc_create_project(
      '{"project_code":"CFO-NOPM-001","name":"CFO Project Without PM","client_name":"Client B","site_location":"Entebbe","planned_start_date":"2026-09-01","expected_end_date":"2027-03-31","status":"planned","health_status":"needs_attention"}'::jsonb,
      null,
      array[
        '80000000-0000-0000-0000-000000000002'::uuid,
        '80000000-0000-0000-0000-000000000007'::uuid
      ],
      'Finance-led project awaiting PM'
    )
  $$,
  'CFO can create a project with coordinators and no PM'
);
select is(
  (
    select count(*)::integer
    from public.project_assignments assignment
    join public.projects project on project.id = assignment.project_id
    where project.project_code = 'CFO-NOPM-001'
      and assignment.role_on_project = 'pm'
      and assignment.unassigned_at is null
  ),
  0,
  'CFO-created project may begin without a PM'
);
select lives_ok(
  $$
    select public.rpc_assign_project_member(
      (select id from public.projects where project_code = 'CFO-NOPM-001'),
      '80000000-0000-0000-0000-000000000001'::uuid,
      'pm',
      'Appoint primary PM'
    )
  $$,
  'CFO can appoint the PM later'
);
select lives_ok(
  $$
    select public.rpc_assign_project_member(
      (select id from public.projects where project_code = 'CFO-NOPM-001'),
      '80000000-0000-0000-0000-000000000006'::uuid,
      'pm',
      'Replace primary PM after handover'
    )
  $$,
  'CFO can replace the primary PM with a reason'
);
select is(
  (
    select count(*)::integer
    from public.project_assignments assignment
    join public.projects project on project.id = assignment.project_id
    where project.project_code = 'CFO-NOPM-001'
      and assignment.role_on_project = 'pm'
      and assignment.unassigned_at is null
  ),
  1,
  'no project has more than one active primary PM'
);
select results_eq(
  $$
    select assignment.user_id, assignment.unassigned_by, assignment.unassignment_reason
    from public.project_assignments assignment
    join public.projects project on project.id = assignment.project_id
    where project.project_code = 'CFO-NOPM-001'
      and assignment.role_on_project = 'pm'
      and assignment.unassigned_at is not null
  $$,
  $$
    select
      '80000000-0000-0000-0000-000000000001'::uuid,
      '80000000-0000-0000-0000-000000000004'::uuid,
      'Replace primary PM after handover'::text
  $$,
  'PM replacement preserves the former assignment actor and reason'
);

-- Invalid multi-row creation rolls back completely.
select throws_ok(
  $$
    select public.rpc_create_project(
      '{"project_code":"ROLLBACK-001","name":"Must Roll Back","status":"planned","health_status":"on_track"}'::jsonb,
      null,
      array['80000000-0000-0000-0000-000000000005'::uuid],
      'Invalid coordinator must roll back'
    )
  $$,
  '22023',
  'project coordinator candidate must hold the coordinator role',
  'invalid coordinator rejects the complete project transaction'
);
reset role;
select is(
  (select count(*)::integer from public.projects where project_code = 'ROLLBACK-001'),
  0,
  'failed project creation leaves no partial project'
);

-- Coordinator submission and assigned-PM review use explicit RPCs.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.rpc_save_daily_update(
      null,
      (select id from public.projects where project_code = 'PM-OWN-001'),
      date '2026-08-02',
      'Mobilisation and setting out completed.',
      array[]::text[],
      true
    )
  $$,
  'assigned coordinator can submit a daily update'
);
select lives_ok(
  $$
    select public.rpc_save_daily_update(
      null,
      (select id from public.projects where project_code = 'PM-OWN-001'),
      date '2026-08-02',
      'A second field update for the same day.',
      array[]::text[],
      true
    )
  $$,
  'assigned coordinator can submit a second separate update on the same day'
);
select is(
  (
    select count(*)::integer
    from public.daily_updates update_row
    where update_row.project_id = (select id from public.projects where project_code = 'PM-OWN-001')
      and update_row.submitted_by = '80000000-0000-0000-0000-000000000002'
      and update_row.update_date = date '2026-08-02'
  ),
  2,
  'both same-day coordinator updates remain as separate records'
);
reset role;
insert into public.project_assignments (project_id, user_id, role_on_project, assigned_by, assignment_reason)
select project.id, '82000000-0000-4000-8000-000000000002', 'coordinator', '80000000-0000-0000-0000-000000000001', 'Photo evidence acceptance fixture'
from public.projects project
where project.project_code = 'PM-OWN-001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into storage.objects (bucket_id, name, owner_id)
select
  'private-files',
  '82000000-0000-4000-8000-000000000002/daily-evidence/' || project.id::text || '/82000000-0000-4000-8000-000000000099.png',
  '82000000-0000-4000-8000-000000000002'
from public.projects project
where project.project_code = 'PM-OWN-001';
select lives_ok(
  $$
    select public.rpc_save_daily_update(
      null,
      (select id from public.projects where project_code = 'PM-OWN-001'),
      date '2026-08-04',
      'Photo-backed field update.',
      array[
        '82000000-0000-4000-8000-000000000002/daily-evidence/' ||
        (select id::text from public.projects where project_code = 'PM-OWN-001') ||
        '/82000000-0000-4000-8000-000000000099.png'
      ],
      true
    )
  $$,
  'assigned coordinator can submit an update with private photo evidence'
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    select
      'private-files',
      '82000000-0000-4000-8000-000000000002/daily-evidence/' || project.id::text || '/82000000-0000-4000-8000-000000000098.heic',
      '82000000-0000-4000-8000-000000000002'
    from public.projects project
    where project.project_code = 'PM-OWN-001'
  $$,
  'assigned coordinator can store private iPhone HEIC evidence'
);
select lives_ok(
  $$
    select public.rpc_save_daily_update(
      null,
      (select id from public.projects where project_code = 'PM-OWN-001'),
      date '2026-08-05',
      'iPhone HEIC photo-backed field update.',
      array[
        '82000000-0000-4000-8000-000000000002/daily-evidence/' ||
        (select id::text from public.projects where project_code = 'PM-OWN-001') ||
        '/82000000-0000-4000-8000-000000000098.heic'
      ],
      true
    )
  $$,
  'assigned coordinator can submit an update with iPhone HEIC evidence'
);
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000010","role":"authenticated"}', true);
select throws_ok(
  $$
    select public.rpc_save_daily_update(
      null,
      (select id from public.projects where project_code = 'CFO-NOPM-001'),
      date '2026-08-02',
      'Attempt against an unassigned project.',
      array[]::text[],
      true
    )
  $$,
  '42501',
  'an active coordinator or primary PM assignment is required',
  'coordinator cannot submit against an unassigned project'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$
    select public.rpc_save_daily_update(
      null,
      (select id from public.projects where project_code = 'PM-OWN-001'),
      date '2026-08-03',
      'Primary PM site inspection completed.',
      array[]::text[],
      true
    )
  $$,
  'assigned primary PM can submit a daily update'
);
select throws_ok(
  $$
    select public.rpc_review_daily_update(
      (
        select update.id
        from public.daily_updates update
        join public.projects project on project.id = update.project_id
        where project.project_code = 'PM-OWN-001'
          and update.submitted_by = '80000000-0000-0000-0000-000000000001'::uuid
          and update.update_date = date '2026-08-03'
      ),
      'endorse',
      null
    )
  $$,
  '42501',
  'the submitter cannot review their own daily update',
  'PM cannot review their own field update'
);
select lives_ok(
  $$
    select public.rpc_review_daily_update(
      (
        select update.id
        from public.daily_updates update
        join public.projects project on project.id = update.project_id
        where project.project_code = 'PM-OWN-001'
          and update.update_date = date '2026-08-02'
          and update.summary = 'Mobilisation and setting out completed.'
      ),
      'request_revision',
      'Add the labour count before endorsement.'
    )
  $$,
  'assigned PM can request revision'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$
    select public.rpc_review_daily_update(
      (
        select update.id
        from public.daily_updates update
        join public.projects project on project.id = update.project_id
        where project.project_code = 'PM-OWN-001'
          and update.update_date = date '2026-08-02'
          and update.summary = 'Mobilisation and setting out completed.'
      ),
      'endorse',
      null
    )
  $$,
  '42501',
  'active primary PM assignment is required to review the update',
  'CFO oversight does not imply PM review authority'
);

-- Candidate lookup is role-scoped and omits account/contact fields by contract.
select results_eq(
  $$
    select candidate.display_name
    from public.rpc_list_project_assignment_candidates() candidate
    where candidate.profile_id in (
      '80000000-0000-0000-0000-000000000001'::uuid,
      '80000000-0000-0000-0000-000000000002'::uuid,
      '80000000-0000-0000-0000-000000000006'::uuid,
      '80000000-0000-0000-0000-000000000007'::uuid
    )
    order by candidate.display_name
  $$,
  $$
    values
      ('Projects Coordinator One'::text),
      ('Projects Coordinator Two'::text),
      ('Projects PM One'::text),
      ('Projects PM Two'::text)
  $$,
  'candidate lookup returns active PM/coordinator profiles only'
);

reset role;
select ok(
  (
    select count(*) >= 6
    from public.audit_events event
    where event.entity_type in ('project', 'project_assignment', 'daily_update')
      and event.actor_profile_id in (
        '80000000-0000-0000-0000-000000000001'::uuid,
        '80000000-0000-0000-0000-000000000002'::uuid,
        '80000000-0000-0000-0000-000000000004'::uuid
      )
  ),
  'project workflow mutations append scoped audit events'
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
