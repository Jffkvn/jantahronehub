begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

select has_function(
  'public',
  'admin_list_user_accounts',
  array[]::text[],
  'authorized administrators can list sanitized user accounts'
);
select has_function(
  'public',
  'admin_list_assignable_roles',
  array[]::text[],
  'authorized administrators can list their assignable roles'
);
select has_function(
  'public',
  'admin_list_employee_candidates',
  array[]::text[],
  'authorized administrators can list employee link candidates'
);
select has_function(
  'public',
  'admin_connect_existing_user',
  array['text', 'text', 'text[]', 'uuid', 'text'],
  'an existing Auth user can be connected atomically'
);
select has_function(
  'public',
  'admin_update_user_access',
  array['uuid', 'text', 'text[]', 'uuid', 'text'],
  'user access can be updated atomically'
);
select has_function(
  'public',
  'admin_set_user_status',
  array['uuid', 'text', 'text'],
  'user activation state can be changed atomically'
);
select has_function(
  'public',
  'admin_list_access_audit',
  array['integer'],
  'authorized administrators can list access audit events'
);

select results_eq(
  $$
    select key
    from public.permissions
    where key in ('users.read', 'users.manage')
    order by key
  $$,
  $$ values ('users.manage'::text), ('users.read'::text) $$,
  'dedicated user administration permissions exist'
);

select results_eq(
  $$
    select role.key
    from public.roles role
    join public.role_permissions grant_row on grant_row.role_id = role.id
    join public.permissions permission on permission.id = grant_row.permission_id
    where permission.key = 'users.manage'
    order by role.key
  $$,
  $$ values ('hr_admin'::text), ('super_admin'::text) $$,
  'only HR and super administrators receive users.manage'
);

select function_privs_are(
  'public',
  'admin_connect_existing_user',
  array['text', 'text', 'text[]', 'uuid', 'text']::text[],
  'authenticated',
  array['EXECUTE']::text[],
  'authenticated callers reach the guarded connect RPC'
);
select function_privs_are(
  'public',
  'admin_connect_existing_user',
  array['text', 'text', 'text[]', 'uuid', 'text']::text[],
  'anon',
  array[]::text[],
  'anonymous callers cannot execute the connect RPC'
);

select is(
  (
    select routine.provolatile::text
    from pg_catalog.pg_proc routine
    where routine.oid = 'public.admin_assert_permission(text)'::regprocedure
  ),
  's',
  'the read-only permission guard is declared stable for read RPCs'
);

insert into auth.users (id, email)
values
  ('91000000-0000-0000-0000-000000000001', 'admin-super@example.invalid'),
  ('91000000-0000-0000-0000-000000000002', 'admin-hr@example.invalid'),
  ('91000000-0000-0000-0000-000000000003', 'admin-employee@example.invalid'),
  ('91000000-0000-0000-0000-000000000004', 'admin-backup-super@example.invalid'),
  ('91000000-0000-0000-0000-000000000010', 'connect-hr@example.invalid'),
  ('91000000-0000-0000-0000-000000000011', 'connect-employee@example.invalid'),
  ('91000000-0000-0000-0000-000000000012', 'connect-forbidden-super@example.invalid'),
  ('91000000-0000-0000-0000-000000000013', 'connect-duplicate-link@example.invalid'),
  ('91000000-0000-0000-0000-000000000014', 'connect-invalid-role@example.invalid'),
  ('91000000-0000-0000-0000-000000000015', 'connect-empty-role@example.invalid');

insert into public.profiles (id, display_name, status, deactivated_at)
values
  ('91000000-0000-0000-0000-000000000001', 'Administration Super', 'active', null),
  ('91000000-0000-0000-0000-000000000002', 'Administration HR', 'active', null),
  ('91000000-0000-0000-0000-000000000003', 'Administration Employee', 'active', null),
  (
    '91000000-0000-0000-0000-000000000004',
    'Backup Super',
    'deactivated',
    now()
  );

insert into public.user_roles (profile_id, role_id)
select assignment.profile_id, role.id
from (
  values
    ('91000000-0000-0000-0000-000000000001'::uuid, 'super_admin'::text),
    ('91000000-0000-0000-0000-000000000002'::uuid, 'hr_admin'::text),
    ('91000000-0000-0000-0000-000000000003'::uuid, 'employee'::text),
    ('91000000-0000-0000-0000-000000000004'::uuid, 'super_admin'::text)
) assignment(profile_id, role_key)
join public.roles role on role.key = assignment.role_key;

insert into public.employees (id, employee_number, legal_name)
values
  ('91000000-0000-0000-0000-000000000101', 'ADMIN-LINK-001', 'Link Candidate One'),
  ('91000000-0000-0000-0000-000000000102', 'ADMIN-LINK-002', 'Link Candidate Two');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);

select lives_ok(
  $$
    select public.admin_connect_existing_user(
      '  CONNECT-HR@example.invalid  ',
      'Connected HR',
      array['hr_admin'],
      null,
      'Create the HR acceptance-test account'
    )
  $$,
  'super administrator can connect the first HR administrator'
);

select ok(
  exists (
    select 1
    from public.profiles profile
    join public.user_roles assignment on assignment.profile_id = profile.id
    join public.roles role on role.id = assignment.role_id
    where profile.id = '91000000-0000-0000-0000-000000000010'
      and role.key = 'hr_admin'
  ),
  'the connected HR profile and role are committed together'
);

select ok(
  exists (
    select 1
    from public.audit_events event
    where event.event_type = 'user.connected'
      and event.entity_id = '91000000-0000-0000-0000-000000000010'
      and event.actor_profile_id = '91000000-0000-0000-0000-000000000001'
  ),
  'connecting an Auth user appends an audit event'
);

select ok(
  public.admin_list_assignable_roles() @> '[{"key":"super_admin"}]'::jsonb,
  'super administrator receives super_admin as an assignable role'
);

reset role;

-- Hosted acceptance databases can already contain a real active super
-- administrator. Make the synthetic account the only active super
-- administrator inside this rollback-only transaction so the continuity
-- guard is tested deterministically without persisting any account changes.
update public.profiles profile
set status = 'deactivated',
    deactivated_at = coalesce(profile.deactivated_at, now())
where profile.id <> '91000000-0000-0000-0000-000000000001'
  and profile.status = 'active'
  and exists (
    select 1
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.profile_id = profile.id
      and role.key = 'super_admin'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);

select lives_ok(
  $$
    select public.admin_connect_existing_user(
      'connect-employee@example.invalid',
      'Connected Employee',
      array['employee'],
      '91000000-0000-0000-0000-000000000101',
      'Connect an employee account for acceptance testing'
    )
  $$,
  'HR can connect a non-super-admin Auth user'
);

select ok(
  exists (
    select 1
    from public.employees employee
    where employee.id = '91000000-0000-0000-0000-000000000101'
      and employee.profile_id = '91000000-0000-0000-0000-000000000011'
  ),
  'employee linking is committed with the new profile'
);

select ok(
  not (
    public.admin_list_assignable_roles() @> '[{"key":"super_admin"}]'::jsonb
  )
  and public.admin_list_assignable_roles() @> '[{"key":"hr_admin"}]'::jsonb,
  'HR can assign every approved role except super_admin'
);

select throws_ok(
  $$
    select public.admin_connect_existing_user(
      'connect-forbidden-super@example.invalid',
      'Forbidden Super',
      array['super_admin'],
      null,
      'Attempt a forbidden super-admin assignment'
    )
  $$,
  '42501',
  'HR administrators cannot assign or manage super_admin',
  'HR cannot assign super_admin'
);

select ok(
  not exists (
    select 1
    from public.profiles
    where id = '91000000-0000-0000-0000-000000000012'
  ),
  'a rejected HR escalation leaves no partial profile'
);

select throws_ok(
  $$
    select public.admin_update_user_access(
      '91000000-0000-0000-0000-000000000001',
      'Changed Super',
      array['super_admin'],
      null,
      'Attempt to edit a protected super administrator'
    )
  $$,
  '42501',
  'HR administrators cannot assign or manage super_admin',
  'HR cannot edit a super-admin target'
);

select throws_ok(
  $$
    select public.admin_set_user_status(
      '91000000-0000-0000-0000-000000000001',
      'deactivated',
      'Attempt to deactivate a protected super administrator'
    )
  $$,
  '42501',
  'HR administrators cannot assign or manage super_admin',
  'HR cannot deactivate a super-admin target'
);

select throws_ok(
  $$
    select public.admin_connect_existing_user(
      'connect-invalid-role@example.invalid',
      'Invalid Role',
      array['not_a_role'],
      null,
      'Reject an unknown role key'
    )
  $$,
  '23514',
  'one or more role keys are invalid',
  'unknown roles are rejected'
);

select throws_ok(
  $$
    select public.admin_connect_existing_user(
      'connect-empty-role@example.invalid',
      'Empty Roles',
      array[]::text[],
      null,
      'Reject an account without access roles'
    )
  $$,
  '23514',
  'at least one role is required',
  'an empty role set is rejected'
);

select throws_ok(
  $$
    select public.admin_connect_existing_user(
      'connect-duplicate-link@example.invalid',
      'Duplicate Link',
      array['employee'],
      '91000000-0000-0000-0000-000000000101',
      'Reject an employee linked to another account'
    )
  $$,
  '23505',
  'employee is already linked to another account',
  'one employee cannot be linked to two user accounts'
);

select ok(
  jsonb_array_length(public.admin_list_user_accounts()) >= 5,
  'HR can list the sanitized connected-account directory'
);

select ok(
  jsonb_array_length(public.admin_list_employee_candidates()) = 2,
  'HR can list employee link candidates and their availability'
);

select ok(
  jsonb_array_length(public.admin_list_access_audit(25)) >= 2,
  'HR can review recent access administration audit events'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',
  true
);

select throws_ok(
  $$ select public.admin_list_user_accounts() $$,
  '42501',
  'users.read permission is required',
  'ordinary employees cannot list user accounts'
);

select throws_ok(
  $$
    select public.admin_set_user_status(
      '91000000-0000-0000-0000-000000000002',
      'deactivated',
      'Attempt an unauthorized access mutation'
    )
  $$,
  '42501',
  'users.manage permission is required',
  'ordinary employees cannot mutate user access'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',
  true
);

select throws_ok(
  $$
    select public.admin_set_user_status(
      '91000000-0000-0000-0000-000000000001',
      'deactivated',
      'Attempt to deactivate the last active super administrator'
    )
  $$,
  '23514',
  'at least one active super_admin account must remain',
  'the last active super administrator cannot be deactivated'
);

select throws_ok(
  $$
    select public.admin_update_user_access(
      '91000000-0000-0000-0000-000000000001',
      'Administration Super',
      array['hr_admin'],
      null,
      'Attempt to demote the last active super administrator'
    )
  $$,
  '23514',
  'at least one active super_admin account must remain',
  'the last active super administrator cannot be demoted'
);

select is(
  (
    select profile.status
    from public.profiles profile
    where profile.id = '91000000-0000-0000-0000-000000000001'
  ),
  'active',
  'a rejected last-super-admin mutation leaves the profile active'
);

do $$
declare diagnostic text;
begin
  for diagnostic in select * from finish() loop
    raise exception using message = 'pgTAP failure: ' || diagnostic;
  end loop;
end
$$;

rollback;
