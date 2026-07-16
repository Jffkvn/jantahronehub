begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

select has_table('public', 'company_profile', 'company_profile exists');
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'roles', 'roles exists');
select has_table('public', 'permissions', 'permissions exists');
select has_table('public', 'user_roles', 'user_roles exists');
select has_table('public', 'role_permissions', 'role_permissions exists');
select has_table('public', 'feature_settings', 'feature_settings exists');
select has_table('public', 'audit_events', 'audit_events exists');

select results_eq(
  $$ select key from public.roles order by key $$,
  $$ values
    ('cfo'::text),
    ('coordinator'::text),
    ('employee'::text),
    ('hr_admin'::text),
    ('managing_director'::text),
    ('project_manager'::text),
    ('super_admin'::text),
    ('warehouse_manager'::text) $$,
  'the approved role keys are seeded deterministically'
);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'hr-test@example.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'employee-test@example.invalid');

insert into public.profiles (id, display_name)
values
  ('10000000-0000-0000-0000-000000000001', 'HR Test'),
  ('10000000-0000-0000-0000-000000000002', 'Employee Test');

insert into public.company_profile (name, slug)
values ('Test Company', 'test-company');

insert into public.permissions (key, resource, action, description)
values
  ('identity_test.read', 'identity_test', 'read', 'Read identity test records'),
  ('identity_test.update', 'identity_test', 'update', 'Update identity test records');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'identity_test.read'
where r.key = 'coordinator';

insert into public.user_roles (profile_id, role_id)
select '10000000-0000-0000-0000-000000000001', id
from public.roles
where key = 'coordinator';

set local role anon;
select throws_ok(
  $$ select * from public.company_profile $$,
  '42501',
  'permission denied for table company_profile',
  'anonymous users cannot read company profile'
);
select throws_ok(
  $$ select * from public.roles $$,
  '42501',
  'permission denied for table roles',
  'anonymous users cannot read roles'
);
select throws_ok(
  $$ select * from public.permissions $$,
  '42501',
  'permission denied for table permissions',
  'anonymous users cannot read permissions'
);
select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  'permission denied for table profiles',
  'anonymous users cannot read profiles'
);
select throws_ok(
  $$ select * from public.feature_settings $$,
  '42501',
  'permission denied for table feature_settings',
  'anonymous users cannot read feature settings'
);
select throws_ok(
  $$ select * from public.audit_events $$,
  '42501',
  'permission denied for table audit_events',
  'anonymous users cannot read audit events'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  public.current_profile_id(),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'current_profile_id returns the active authenticated profile'
);
select ok(public.has_permission('identity_test.read'), 'an assigned permission is granted');
select ok(not public.has_permission('identity_test.update'), 'an unassigned permission is denied');
select is(
  public.get_my_access_context() ->> 'profile_id',
  '10000000-0000-0000-0000-000000000001',
  'access context is derived from auth.uid'
);
select is(
  public.get_my_access_context() -> 'role_keys',
  '["coordinator"]'::jsonb,
  'access context returns all assigned role keys'
);
select ok(
  public.get_my_access_context() -> 'permission_keys' @> '["identity_test.read"]'::jsonb
    and not (public.get_my_access_context() -> 'permission_keys' @> '["identity_test.update"]'::jsonb),
  'access context includes assigned permissions and excludes unassigned permissions'
);
select is(
  public.get_my_access_context() -> 'enabled_modules',
  '["home","my_workspace","hr","inventory","cash","tracker","reports","admin","projects"]'::jsonb,
  'access context returns the shell canonical module keys in configured order'
);
select is(
  public.get_my_access_context() -> 'mfa_policy' -> 'enforced_roles',
  '["super_admin"]'::jsonb,
  'access context returns the configured MFA-enforced roles'
);
select ok(
  not (public.get_my_access_context() ->> 'mfa_required')::boolean,
  'MFA is not initially required for coordinator'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select ok(not public.has_permission('identity_test.read'), 'a user without an assigned role is denied');

reset role;
insert into public.user_roles (profile_id, role_id)
select '10000000-0000-0000-0000-000000000002', id
from public.roles
where key = 'super_admin';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select ok(
  (public.get_my_access_context() ->> 'mfa_required')::boolean,
  'MFA is initially required for super_admin'
);
select ok(
  not public.has_permission('company.manage'),
  'super_admin permissions are withheld at aal1'
);
select is(
  public.get_my_access_context() -> 'permission_keys',
  '[]'::jsonb,
  'access context exposes no effective super_admin permissions at aal1'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',
  true
);
select ok(
  public.has_permission('company.manage'),
  'super_admin permissions become effective at aal2'
);
select ok(
  public.get_my_access_context() -> 'permission_keys' @> '["company.manage"]'::jsonb,
  'access context exposes effective super_admin permissions at aal2'
);

reset role;
update public.profiles
set status = 'deactivated', deactivated_at = now()
where id = '10000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select ok(
  not (public.get_my_access_context() ->> 'is_active')::boolean,
  'access context exposes a deactivated profile state'
);
select ok(
  not public.has_permission('company.manage'),
  'deactivated profiles have no effective permissions'
);

reset role;
insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, metadata)
values (
  '10000000-0000-0000-0000-000000000001',
  'test.created',
  'test_record',
  'record-1',
  '{"source":"pgtap"}'::jsonb
);

select throws_ok(
  $$ update public.audit_events set event_type = 'test.changed' where entity_id = 'record-1' $$,
  'P0001',
  'audit events are append-only',
  'audit events cannot be updated'
);
select throws_ok(
  $$ delete from public.audit_events where entity_id = 'record-1' $$,
  'P0001',
  'audit events are append-only',
  'audit events cannot be deleted'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$ insert into public.audit_events (event_type, entity_type) values ('unauthorized', 'test') $$,
  '42501',
  'new row violates row-level security policy for table "audit_events"',
  'users without audit.create cannot append audit events directly'
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
