insert into public.permissions (key, resource, action, description)
values
  ('users.read', 'users', 'read', 'Read the sanitized user access directory.'),
  ('users.manage', 'users', 'manage', 'Connect users and manage non-forbidden access assignments.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.key in ('super_admin', 'hr_admin')
  and permission.key in ('users.read', 'users.manage')
on conflict do nothing;

-- Internal authorization helpers. These are SECURITY DEFINER so the public
-- RPCs can inspect protected identity tables, but they are never executable
-- directly by browser roles. Effective permissions still enforce profile
-- status and the configured MFA policy through public.has_permission().
create or replace function public.admin_actor_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.profiles profile
    join public.user_roles assignment on assignment.profile_id = profile.id
    join public.roles role on role.id = assignment.role_id
    where profile.id = auth.uid()
      and profile.status = 'active'
      and role.key = 'super_admin'
  ), false)
$$;

create or replace function public.admin_assert_permission(permission_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not public.has_permission(permission_key) then
    raise exception using
      errcode = '42501',
      message = permission_key || ' permission is required';
  end if;

  return actor_id;
end;
$$;

create or replace function public.admin_require_reason(reason_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_reason text := btrim(coalesce(reason_text, ''));
begin
  if length(normalized_reason) not between 3 and 500 then
    raise exception using
      errcode = '23514',
      message = 'reason must contain between 3 and 500 characters';
  end if;

  return normalized_reason;
end;
$$;

create or replace function public.admin_validate_role_keys(requested_role_keys text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_role_keys text[];
  valid_role_count integer;
begin
  select array_agg(role_key order by role_key)
  into normalized_role_keys
  from (
    select distinct btrim(role_key) as role_key
    from unnest(coalesce(requested_role_keys, array[]::text[])) role_key
    where btrim(role_key) <> ''
  ) normalized;

  if coalesce(cardinality(normalized_role_keys), 0) = 0 then
    raise exception using
      errcode = '23514',
      message = 'at least one role is required';
  end if;

  select count(*)
  into valid_role_count
  from public.roles role
  where role.key = any(normalized_role_keys);

  if valid_role_count <> cardinality(normalized_role_keys) then
    raise exception using
      errcode = '23514',
      message = 'one or more role keys are invalid';
  end if;

  if not public.admin_actor_is_super_admin()
    and 'super_admin' = any(normalized_role_keys) then
    raise exception using
      errcode = '42501',
      message = 'HR administrators cannot assign or manage super_admin';
  end if;

  return normalized_role_keys;
end;
$$;

create or replace function public.admin_assert_target_manageable(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_super_admin boolean;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = target_profile_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'user profile does not exist';
  end if;

  select exists (
    select 1
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.profile_id = target_profile_id
      and role.key = 'super_admin'
  )
  into target_is_super_admin;

  if target_is_super_admin and not public.admin_actor_is_super_admin() then
    raise exception using
      errcode = '42501',
      message = 'HR administrators cannot assign or manage super_admin';
  end if;
end;
$$;

-- Preserve owner continuity under concurrent changes. The advisory lock makes
-- simultaneous demotion/deactivation attempts evaluate the same invariant in
-- sequence, so two requests cannot remove the final active super administrator.
create or replace function public.admin_assert_super_admin_continuity(
  target_profile_id uuid,
  requested_status text,
  requested_role_keys text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_super_admin boolean;
begin
  select exists (
    select 1
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.profile_id = target_profile_id
      and role.key = 'super_admin'
  )
  into target_is_super_admin;

  if not target_is_super_admin
    or (
      requested_status = 'active'
      and 'super_admin' = any(coalesce(requested_role_keys, array[]::text[]))
    ) then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('onehub.active-super-admin', 0)
  );

  if not exists (
    select 1
    from public.profiles profile
    join public.user_roles assignment on assignment.profile_id = profile.id
    join public.roles role on role.id = assignment.role_id
    where profile.id <> target_profile_id
      and profile.status = 'active'
      and role.key = 'super_admin'
  ) then
    raise exception using
      errcode = '23514',
      message = 'at least one active super_admin account must remain';
  end if;
end;
$$;

-- Build the smallest before/after representation needed by the append-only
-- audit trail. Auth email is intentionally excluded from stored audit payloads.
create or replace function public.admin_user_access_state(target_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile_id', profile.id,
    'display_name', profile.display_name,
    'status', profile.status,
    'employee_id', employee.id,
    'role_keys', coalesce(roles.role_keys, '[]'::jsonb)
  )
  from public.profiles profile
  left join public.employees employee on employee.profile_id = profile.id
  left join lateral (
    select jsonb_agg(role.key order by role.key) as role_keys
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.profile_id = profile.id
  ) roles on true
  where profile.id = target_profile_id
$$;

-- Read RPCs return deliberately sanitized administration projections rather
-- than exposing auth.users or broad profile/employee rows to the browser.
create or replace function public.admin_list_user_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_is_super_admin boolean;
  result jsonb;
begin
  actor_id := public.admin_assert_permission('users.read');
  actor_is_super_admin := public.admin_actor_is_super_admin();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile_id', profile.id,
        'display_name', profile.display_name,
        'email', lower(auth_user.email),
        'status', profile.status,
        'deactivated_at', profile.deactivated_at,
        'created_at', profile.created_at,
        'role_keys', coalesce(assigned_roles.role_keys, '[]'::jsonb),
        'employee', case
          when employee.id is null then null
          else jsonb_build_object(
            'id', employee.id,
            'employee_number', employee.employee_number,
            'legal_name', employee.legal_name
          )
        end,
        'last_access_change_at', last_change.occurred_at,
        'can_manage', actor_is_super_admin or not coalesce(assigned_roles.is_super_admin, false),
        'is_self', profile.id = actor_id
      )
      order by lower(profile.display_name), lower(auth_user.email)
    ),
    '[]'::jsonb
  )
  into result
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  left join public.employees employee on employee.profile_id = profile.id
  left join lateral (
    select
      jsonb_agg(role.key order by role.key) as role_keys,
      bool_or(role.key = 'super_admin') as is_super_admin
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.profile_id = profile.id
  ) assigned_roles on true
  left join lateral (
    select max(event.occurred_at) as occurred_at
    from public.audit_events event
    where event.entity_type = 'user_account'
      and event.entity_id = profile.id::text
  ) last_change on true;

  return result;
end;
$$;

create or replace function public.admin_list_assignable_roles()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_is_super_admin boolean;
  result jsonb;
begin
  perform public.admin_assert_permission('users.read');
  actor_is_super_admin := public.admin_actor_is_super_admin();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', role.id,
        'key', role.key,
        'name', role.name,
        'description', role.description
      )
      order by role.name
    ),
    '[]'::jsonb
  )
  into result
  from public.roles role
  where actor_is_super_admin or role.key <> 'super_admin';

  return result;
end;
$$;

create or replace function public.admin_list_employee_candidates()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.admin_assert_permission('users.read');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', employee.id,
        'employee_number', employee.employee_number,
        'legal_name', employee.legal_name,
        'linked_profile_id', employee.profile_id,
        'available', employee.profile_id is null
      )
      order by lower(employee.legal_name), employee.employee_number
    ),
    '[]'::jsonb
  )
  into result
  from public.employees employee
  where employee.archived_at is null;

  return result;
end;
$$;

-- Connect an Auth identity only after it already exists. Password creation and
-- password values remain exclusively inside Supabase Auth and never enter this
-- application RPC, its logs, or its audit records.
create or replace function public.admin_connect_existing_user(
  target_email text,
  target_display_name text,
  target_role_keys text[],
  target_employee_id uuid,
  change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  auth_user_id uuid;
  normalized_email text := lower(btrim(coalesce(target_email, '')));
  normalized_display_name text := btrim(coalesce(target_display_name, ''));
  normalized_role_keys text[];
  normalized_reason text;
  existing_employee_profile_id uuid;
  employee_archived_at timestamptz;
  new_state jsonb;
begin
  actor_id := public.admin_assert_permission('users.manage');
  normalized_role_keys := public.admin_validate_role_keys(target_role_keys);
  normalized_reason := public.admin_require_reason(change_reason);

  if normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '23514', message = 'a valid email address is required';
  end if;

  if length(normalized_display_name) not between 1 and 160 then
    raise exception using
      errcode = '23514',
      message = 'display name must contain between 1 and 160 characters';
  end if;

  select auth_user.id
  into auth_user_id
  from auth.users auth_user
  where lower(auth_user.email) = normalized_email
  for update;

  if auth_user_id is null then
    raise exception using
      errcode = '23503',
      message = 'no existing Auth user matches that email address';
  end if;

  if exists (select 1 from public.profiles profile where profile.id = auth_user_id) then
    raise exception using
      errcode = '23505',
      message = 'that Auth user is already connected to OneHub';
  end if;

  if target_employee_id is not null then
    select employee.profile_id, employee.archived_at
    into existing_employee_profile_id, employee_archived_at
    from public.employees employee
    where employee.id = target_employee_id
    for update;

    if not found or employee_archived_at is not null then
      raise exception using
        errcode = '23503',
        message = 'employee link candidate does not exist';
    end if;

    if existing_employee_profile_id is not null then
      raise exception using
        errcode = '23505',
        message = 'employee is already linked to another account';
    end if;
  end if;

  insert into public.profiles (id, display_name)
  values (auth_user_id, normalized_display_name);

  if target_employee_id is not null then
    update public.employees
    set profile_id = auth_user_id,
        updated_by = actor_id,
        updated_at = now()
    where id = target_employee_id;
  end if;

  insert into public.user_roles (profile_id, role_id, assigned_by)
  select auth_user_id, role.id, actor_id
  from public.roles role
  where role.key = any(normalized_role_keys);

  new_state := public.admin_user_access_state(auth_user_id);

  insert into public.audit_events (
    actor_profile_id,
    event_type,
    entity_type,
    entity_id,
    new_values,
    metadata,
    reason
  )
  values (
    actor_id,
    'user.connected',
    'user_account',
    auth_user_id::text,
    new_state,
    jsonb_build_object('source', 'user_administration'),
    normalized_reason
  );

  return new_state || jsonb_build_object('email', normalized_email);
end;
$$;

-- Apply display name, employee linkage and the complete role set in one
-- transaction. Any validation or audit failure rolls the entire change back.
create or replace function public.admin_update_user_access(
  target_profile_id uuid,
  target_display_name text,
  target_role_keys text[],
  target_employee_id uuid,
  change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  normalized_display_name text := btrim(coalesce(target_display_name, ''));
  normalized_role_keys text[];
  normalized_reason text;
  target_status text;
  previous_employee_id uuid;
  requested_employee_profile_id uuid;
  requested_employee_archived_at timestamptz;
  previous_state jsonb;
  new_state jsonb;
begin
  actor_id := public.admin_assert_permission('users.manage');
  perform public.admin_assert_target_manageable(target_profile_id);
  normalized_role_keys := public.admin_validate_role_keys(target_role_keys);
  normalized_reason := public.admin_require_reason(change_reason);

  if length(normalized_display_name) not between 1 and 160 then
    raise exception using
      errcode = '23514',
      message = 'display name must contain between 1 and 160 characters';
  end if;

  select profile.status
  into target_status
  from public.profiles profile
  where profile.id = target_profile_id
  for update;

  perform public.admin_assert_super_admin_continuity(
    target_profile_id,
    target_status,
    normalized_role_keys
  );

  previous_state := public.admin_user_access_state(target_profile_id);

  select employee.id
  into previous_employee_id
  from public.employees employee
  where employee.profile_id = target_profile_id
  for update;

  if target_employee_id is distinct from previous_employee_id
    and target_employee_id is not null then
    select employee.profile_id, employee.archived_at
    into requested_employee_profile_id, requested_employee_archived_at
    from public.employees employee
    where employee.id = target_employee_id
    for update;

    if not found or requested_employee_archived_at is not null then
      raise exception using
        errcode = '23503',
        message = 'employee link candidate does not exist';
    end if;

    if requested_employee_profile_id is not null
      and requested_employee_profile_id <> target_profile_id then
      raise exception using
        errcode = '23505',
        message = 'employee is already linked to another account';
    end if;
  end if;

  if target_employee_id is distinct from previous_employee_id then
    update public.employees
    set profile_id = null,
        updated_by = actor_id,
        updated_at = now()
    where id = previous_employee_id;

    update public.employees
    set profile_id = target_profile_id,
        updated_by = actor_id,
        updated_at = now()
    where id = target_employee_id;
  end if;

  update public.profiles
  set display_name = normalized_display_name,
      updated_at = now()
  where id = target_profile_id;

  delete from public.user_roles
  where profile_id = target_profile_id;

  insert into public.user_roles (profile_id, role_id, assigned_by)
  select target_profile_id, role.id, actor_id
  from public.roles role
  where role.key = any(normalized_role_keys);

  new_state := public.admin_user_access_state(target_profile_id);

  insert into public.audit_events (
    actor_profile_id,
    event_type,
    entity_type,
    entity_id,
    previous_values,
    new_values,
    metadata,
    reason
  )
  values (
    actor_id,
    'user.access_updated',
    'user_account',
    target_profile_id::text,
    previous_state,
    new_state,
    jsonb_build_object('source', 'user_administration'),
    normalized_reason
  );

  return new_state;
end;
$$;

-- Deactivation retains the profile, links, roles and history. Re-activation
-- restores the existing role set while recording a new append-only audit event.
create or replace function public.admin_set_user_status(
  target_profile_id uuid,
  target_status text,
  change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  current_status text;
  current_role_keys text[];
  normalized_reason text;
  previous_state jsonb;
  new_state jsonb;
begin
  actor_id := public.admin_assert_permission('users.manage');
  perform public.admin_assert_target_manageable(target_profile_id);
  normalized_reason := public.admin_require_reason(change_reason);

  if target_status not in ('active', 'deactivated') then
    raise exception using
      errcode = '23514',
      message = 'account status must be active or deactivated';
  end if;

  select profile.status
  into current_status
  from public.profiles profile
  where profile.id = target_profile_id
  for update;

  if current_status = target_status then
    raise exception using
      errcode = '23514',
      message = 'account already has the requested status';
  end if;

  select array_agg(role.key order by role.key)
  into current_role_keys
  from public.user_roles assignment
  join public.roles role on role.id = assignment.role_id
  where assignment.profile_id = target_profile_id;

  perform public.admin_assert_super_admin_continuity(
    target_profile_id,
    target_status,
    current_role_keys
  );

  previous_state := public.admin_user_access_state(target_profile_id);

  update public.profiles
  set status = target_status,
      deactivated_at = case when target_status = 'deactivated' then now() else null end,
      updated_at = now()
  where id = target_profile_id;

  new_state := public.admin_user_access_state(target_profile_id);

  insert into public.audit_events (
    actor_profile_id,
    event_type,
    entity_type,
    entity_id,
    previous_values,
    new_values,
    metadata,
    reason
  )
  values (
    actor_id,
    'user.status_changed',
    'user_account',
    target_profile_id::text,
    previous_state,
    new_state,
    jsonb_build_object('source', 'user_administration'),
    normalized_reason
  );

  return new_state;
end;
$$;

-- Audit readers receive only user-account access events with a hard maximum to
-- keep the administration screen responsive and avoid unbounded data reads.
create or replace function public.admin_list_access_audit(result_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.admin_assert_permission('users.read');

  if result_limit not between 1 and 100 then
    raise exception using
      errcode = '23514',
      message = 'audit result limit must be between 1 and 100';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(audit_row) order by audit_row.occurred_at desc),
    '[]'::jsonb
  )
  into result
  from (
    select
      event.id,
      event.occurred_at,
      event.event_type,
      event.entity_id as target_profile_id,
      actor.display_name as actor_display_name,
      target.display_name as target_display_name,
      event.previous_values,
      event.new_values,
      event.reason
    from public.audit_events event
    left join public.profiles actor on actor.id = event.actor_profile_id
    left join public.profiles target on target.id::text = event.entity_id
    where event.entity_type = 'user_account'
    order by event.occurred_at desc
    limit result_limit
  ) audit_row;

  return result;
end;
$$;

-- Keep implementation helpers private. Browser clients may call only the
-- narrow RPC surface below; every callable function rechecks permissions.
revoke all on function public.admin_actor_is_super_admin() from public, anon, authenticated;
revoke all on function public.admin_assert_permission(text) from public, anon, authenticated;
revoke all on function public.admin_require_reason(text) from public, anon, authenticated;
revoke all on function public.admin_validate_role_keys(text[]) from public, anon, authenticated;
revoke all on function public.admin_assert_target_manageable(uuid) from public, anon, authenticated;
revoke all on function public.admin_assert_super_admin_continuity(uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.admin_user_access_state(uuid) from public, anon, authenticated;

revoke all on function public.admin_list_user_accounts() from public, anon, authenticated;
revoke all on function public.admin_list_assignable_roles() from public, anon, authenticated;
revoke all on function public.admin_list_employee_candidates() from public, anon, authenticated;
revoke all on function public.admin_connect_existing_user(text, text, text[], uuid, text) from public, anon, authenticated;
revoke all on function public.admin_update_user_access(uuid, text, text[], uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_user_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_list_access_audit(integer) from public, anon, authenticated;

grant execute on function public.admin_list_user_accounts() to authenticated;
grant execute on function public.admin_list_assignable_roles() to authenticated;
grant execute on function public.admin_list_employee_candidates() to authenticated;
grant execute on function public.admin_connect_existing_user(text, text, text[], uuid, text) to authenticated;
grant execute on function public.admin_update_user_access(uuid, text, text[], uuid, text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;
grant execute on function public.admin_list_access_audit(integer) to authenticated;

comment on function public.admin_connect_existing_user(text, text, text[], uuid, text) is
  'Connects an existing Supabase Auth user to a OneHub profile and role set. Never accepts or returns passwords.';
comment on function public.admin_update_user_access(uuid, text, text[], uuid, text) is
  'Atomically updates display name, employee link and complete role set with protected super-admin invariants.';
comment on function public.admin_set_user_status(uuid, text, text) is
  'Activates or deactivates a OneHub profile while preserving at least one active super administrator.';
