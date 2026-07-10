create table public.roles (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null default '',
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  resource text not null check (resource ~ '^[a-z][a-z0-9_]*$'),
  action text not null check (action ~ '^[a-z][a-z0-9_]*$'),
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (resource, action),
  check (key = resource || '.' || action)
);

create table public.user_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, role_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index user_roles_role_id_idx on public.user_roles(role_id);
create index role_permissions_permission_id_idx on public.role_permissions(permission_id);

insert into public.roles (key, name, description)
values
  ('super_admin', 'Super administrator', 'JantaHR owner and support administration.'),
  ('hr_admin', 'HR administrator', 'Employee, leave and payroll operations.'),
  ('employee', 'Employee', 'Employee self-service access.'),
  ('coordinator', 'Coordinator', 'Project coordination and operational requests.'),
  ('project_manager', 'Project manager', 'Project oversight and approvals.'),
  ('warehouse_manager', 'Warehouse manager', 'Warehouse receipt, custody and fulfillment.'),
  ('cfo', 'Chief financial officer', 'Financial execution and oversight.'),
  ('managing_director', 'Managing director', 'Executive reporting and oversight.');

insert into public.permissions (key, resource, action, description)
values
  ('company.read', 'company', 'read', 'Read company configuration.'),
  ('company.manage', 'company', 'manage', 'Manage company configuration.'),
  ('profiles.read', 'profiles', 'read', 'Read user profiles.'),
  ('profiles.manage', 'profiles', 'manage', 'Manage user profiles and activation.'),
  ('roles.read', 'roles', 'read', 'Read roles and assignments.'),
  ('roles.manage', 'roles', 'manage', 'Manage role assignments.'),
  ('permissions.read', 'permissions', 'read', 'Read permissions and grants.'),
  ('permissions.manage', 'permissions', 'manage', 'Manage role permission grants.'),
  ('features.read', 'features', 'read', 'Read deployment feature settings.'),
  ('features.manage', 'features', 'manage', 'Manage deployment feature settings.'),
  ('audit.read', 'audit', 'read', 'Read business audit events.'),
  ('audit.create', 'audit', 'create', 'Append business audit events.');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin';

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
$$;

create or replace function public.is_mfa_requirement_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mfa_policy as (
    select coalesce(
      (
        select fs.value
        from public.feature_settings fs
        where fs.key = 'auth.mfa_policy'
      ),
      '{"enforced_roles":[]}'::jsonb
    ) as value
  )
  select
    not exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      cross join mfa_policy policy
      join lateral jsonb_array_elements_text(
        coalesce(policy.value -> 'enforced_roles', '[]'::jsonb)
      ) enforced(role_key) on enforced.role_key = r.key
      where ur.profile_id = auth.uid()
    )
    or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.profiles profile
    join public.user_roles ur on ur.profile_id = profile.id
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions permission on permission.id = rp.permission_id
    where profile.id = auth.uid()
      and profile.status = 'active'
      and permission.key = permission_key
      and public.is_mfa_requirement_satisfied()
  ), false)
$$;

create or replace function public.get_my_access_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_profile as (
    select p.id, p.display_name, p.avatar_path, p.status, p.deactivated_at
    from public.profiles p
    where p.id = auth.uid()
  ),
  role_keys as (
    select coalesce(jsonb_agg(to_jsonb(role_key) order by role_key), '[]'::jsonb) as value
    from (
      select distinct r.key as role_key
      from current_profile cp
      join public.user_roles ur on ur.profile_id = cp.id
      join public.roles r on r.id = ur.role_id
    ) assigned_roles
  ),
  permission_keys as (
    select coalesce(jsonb_agg(to_jsonb(permission_key) order by permission_key), '[]'::jsonb) as value
    from (
      select distinct permission.key as permission_key
      from current_profile cp
      join public.user_roles ur on ur.profile_id = cp.id
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions permission on permission.id = rp.permission_id
      where cp.status = 'active'
        and public.is_mfa_requirement_satisfied()
    ) effective_permissions
  ),
  settings as (
    select
      coalesce(
        (select fs.value from public.feature_settings fs where fs.key = 'modules.enabled'),
        '[]'::jsonb
      ) as enabled_modules,
      coalesce(
        (select fs.value from public.feature_settings fs where fs.key = 'auth.mfa_policy'),
        '{"method":"totp","enforced_roles":[],"optional_for_other_roles":true}'::jsonb
      ) as mfa_policy
  )
  select jsonb_build_object(
    'profile_id', cp.id,
    'profile', case when cp.id is null then null else jsonb_build_object(
      'id', cp.id,
      'display_name', cp.display_name,
      'avatar_path', cp.avatar_path,
      'status', cp.status,
      'deactivated_at', cp.deactivated_at
    ) end,
    'is_active', coalesce(cp.status = 'active', false),
    'role_keys', rk.value,
    'permission_keys', pk.value,
    'enabled_modules', settings.enabled_modules,
    'mfa_policy', settings.mfa_policy,
    'mfa_required', coalesce(
      cp.status = 'active'
      and exists (
        select 1
        from jsonb_array_elements_text(settings.mfa_policy -> 'enforced_roles') enforced(role_key)
        where rk.value @> jsonb_build_array(enforced.role_key)
      ),
      false
    )
  )
  from settings
  cross join role_keys rk
  cross join permission_keys pk
  left join current_profile cp on true
$$;

revoke all on function public.current_profile_id() from public, anon;
revoke all on function public.is_mfa_requirement_satisfied() from public, anon;
revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.get_my_access_context() from public, anon;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_mfa_requirement_satisfied() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.get_my_access_context() to authenticated;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;

create policy company_profile_read on public.company_profile
for select to authenticated
using (public.current_profile_id() is not null);

create policy company_profile_manage on public.company_profile
for all to authenticated
using (public.has_permission('company.manage'))
with check (public.has_permission('company.manage'));

create policy profiles_read on public.profiles
for select to authenticated
using (id = auth.uid() or public.has_permission('profiles.read'));

create policy profiles_manage on public.profiles
for all to authenticated
using (public.has_permission('profiles.manage'))
with check (public.has_permission('profiles.manage'));

create policy roles_read on public.roles
for select to authenticated
using (public.has_permission('roles.read'));

create policy permissions_read on public.permissions
for select to authenticated
using (public.has_permission('permissions.read'));

create policy user_roles_read on public.user_roles
for select to authenticated
using (profile_id = auth.uid() or public.has_permission('roles.read'));

create policy user_roles_manage on public.user_roles
for all to authenticated
using (public.has_permission('roles.manage'))
with check (public.has_permission('roles.manage'));

create policy role_permissions_read on public.role_permissions
for select to authenticated
using (public.has_permission('permissions.read'));

create policy role_permissions_manage on public.role_permissions
for all to authenticated
using (public.has_permission('permissions.manage'))
with check (public.has_permission('permissions.manage'));

create policy feature_settings_read on public.feature_settings
for select to authenticated
using (public.has_permission('features.read'));

create policy feature_settings_manage on public.feature_settings
for all to authenticated
using (public.has_permission('features.manage'))
with check (public.has_permission('features.manage'));

revoke all on table public.roles from anon, authenticated;
revoke all on table public.permissions from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.role_permissions from anon, authenticated;

grant select, insert, update on table public.company_profile to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.feature_settings to authenticated;
grant select on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select, insert, update, delete on table public.user_roles to authenticated;
grant select, insert, update, delete on table public.role_permissions to authenticated;
