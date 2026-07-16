-- Projects operational foundation: canonical project identity, assignment
-- history, granular authority, and guarded project/daily-update mutations.

alter table public.projects
  add column project_code text,
  add column client_name text,
  add column planned_start_date date,
  add column expected_end_date date,
  add column actual_completion_date date,
  add column contract_reference text,
  add column budget_reference text,
  add column operational_notes text,
  add column updated_by uuid references public.profiles(id) on delete restrict;

update public.projects
set project_code = 'PRJ-' || upper(left(replace(id::text, '-', ''), 12)),
    updated_by = created_by
where project_code is null or updated_by is null;

alter table public.projects
  alter column project_code set not null,
  alter column updated_by set not null;

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check
    check (status in ('planned', 'active', 'on_hold', 'completed', 'cancelled', 'archived')),
  add constraint projects_project_code_check
    check (project_code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,49}$'),
  add constraint projects_date_order_check
    check (planned_start_date is null or expected_end_date is null or expected_end_date >= planned_start_date),
  add constraint projects_completion_date_check
    check (actual_completion_date is null or planned_start_date is null or actual_completion_date >= planned_start_date);

create unique index projects_project_code_ci_unique
  on public.projects (upper(project_code));
create index projects_status_health_idx
  on public.projects (status, health_status, updated_at desc);
create index projects_dates_idx
  on public.projects (planned_start_date, expected_end_date);

alter table public.project_assignments
  add column assigned_by uuid references public.profiles(id) on delete restrict,
  add column assignment_reason text,
  add column unassigned_by uuid references public.profiles(id) on delete restrict,
  add column unassignment_reason text;

update public.project_assignments assignment
set assigned_by = project.created_by,
    assignment_reason = 'Legacy assignment migrated',
    unassigned_by = case when assignment.unassigned_at is not null then project.created_by end,
    unassignment_reason = case when assignment.unassigned_at is not null then 'Legacy assignment migrated' end
from public.projects project
where project.id = assignment.project_id
  and (assignment.assigned_by is null or assignment.assignment_reason is null);

alter table public.project_assignments
  alter column assigned_by set not null,
  alter column assignment_reason set not null,
  add constraint project_assignments_reason_check
    check (length(btrim(assignment_reason)) between 3 and 500),
  add constraint project_assignments_end_metadata_check
    check (
      (unassigned_at is null and unassigned_by is null and unassignment_reason is null)
      or (
        unassigned_at is not null
        and unassigned_by is not null
        and length(btrim(unassignment_reason)) between 3 and 500
      )
    );

do $$
declare duplicate_project uuid;
begin
  select project_id into duplicate_project
  from public.project_assignments
  where role_on_project = 'pm' and unassigned_at is null
  group by project_id
  having count(*) > 1
  limit 1;

  if duplicate_project is not null then
    raise exception using
      errcode = '23505',
      message = format(
        'project %s has multiple active PM assignments; end duplicates before applying migration 0070',
        duplicate_project
      );
  end if;
end
$$;

create unique index project_assignments_one_active_pm
  on public.project_assignments (project_id)
  where role_on_project = 'pm' and unassigned_at is null;

insert into public.permissions (key, resource, action, description)
values
  ('projects.create', 'projects', 'create', 'Create a project through the guarded workflow.'),
  ('projects.assign_all', 'projects', 'assign_all', 'Appoint or replace primary project managers and coordinators.'),
  ('projects.update_all', 'projects', 'update_all', 'Update any project through guarded workflows.'),
  ('projects.read_operational', 'projects', 'read_operational', 'Read limited project identity for warehouse operations.')
on conflict (key) do update
set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where
  (role.key = 'super_admin' and permission.key in (
    'projects.create', 'projects.assign_all', 'projects.update_all', 'projects.read_operational'
  ))
  or (role.key = 'cfo' and permission.key in ('projects.create', 'projects.assign_all'))
  or (role.key = 'project_manager' and permission.key = 'projects.create')
  or (role.key = 'warehouse_manager' and permission.key = 'projects.read_operational')
on conflict do nothing;

delete from public.role_permissions role_permission
using public.roles role, public.permissions permission
where role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and (
    (role.key = 'cfo' and permission.key in ('projects.manage', 'daily_updates.endorse'))
    or (
      role.key = 'hr_admin'
      and permission.key in ('projects.read', 'projects.read_all', 'daily_updates.read', 'daily_updates.read_all')
    )
    or (
      role.key = 'project_manager'
      and permission.key in ('projects.manage', 'projects.assign_all', 'projects.update_all')
    )
  );

create or replace function public.profile_has_role(p_profile_id uuid, p_role_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.profiles profile
    join public.user_roles user_role on user_role.profile_id = profile.id
    join public.roles role on role.id = user_role.role_id
    where profile.id = p_profile_id
      and profile.status = 'active'
      and role.key = p_role_key
  ), false)
$$;

create or replace function public.is_pm_on_project(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.project_assignments assignment
    where assignment.project_id = p_project_id
      and assignment.user_id = p_user_id
      and assignment.role_on_project = 'pm'
      and assignment.unassigned_at is null
  ), false)
$$;

create or replace function public.is_coordinator_on_project(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.project_assignments assignment
    where assignment.project_id = p_project_id
      and assignment.user_id = p_user_id
      and assignment.role_on_project = 'coordinator'
      and assignment.unassigned_at is null
  ), false)
$$;

create or replace function public.is_member_on_project(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_pm_on_project(p_project_id, p_user_id)
      or public.is_coordinator_on_project(p_project_id, p_user_id)
$$;

revoke all on function public.profile_has_role(uuid, text) from public, anon, authenticated;
revoke all on function public.is_pm_on_project(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_coordinator_on_project(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_member_on_project(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_pm_on_project(uuid, uuid) to authenticated;
grant execute on function public.is_coordinator_on_project(uuid, uuid) to authenticated;
grant execute on function public.is_member_on_project(uuid, uuid) to authenticated;

drop policy if exists projects_select_policy on public.projects;
drop policy if exists projects_insert_policy on public.projects;
drop policy if exists projects_update_policy on public.projects;
create policy projects_select_policy on public.projects
for select to authenticated
using (
  public.has_permission('projects.manage')
  or public.has_permission('projects.read_all')
  or public.has_permission('projects.read_operational')
  or public.is_member_on_project(id, auth.uid())
);

drop policy if exists project_assignments_select_policy on public.project_assignments;
drop policy if exists project_assignments_insert_policy on public.project_assignments;
drop policy if exists project_assignments_update_policy on public.project_assignments;
create policy project_assignments_select_policy on public.project_assignments
for select to authenticated
using (
  public.has_permission('projects.read_all')
  or public.has_permission('projects.read_operational')
  or user_id = auth.uid()
  or public.is_pm_on_project(project_id, auth.uid())
);

drop policy if exists daily_updates_insert_policy on public.daily_updates;
drop policy if exists daily_updates_update_policy on public.daily_updates;

revoke insert, update, delete on table public.projects from authenticated;
revoke insert, update, delete on table public.project_assignments from authenticated;
revoke insert, update, delete on table public.daily_updates from authenticated;
grant select on table public.projects to authenticated;
grant select on table public.project_assignments to authenticated;
grant select on table public.daily_updates to authenticated;

create or replace function public.rpc_list_project_assignment_candidates()
returns table (profile_id uuid, display_name text, role_keys text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.has_permission('projects.create')
    or public.has_permission('projects.assign_all')
  ) then
    raise insufficient_privilege using
      message = 'project creation or assignment authority is required';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    array_agg(distinct role.key order by role.key)
  from public.profiles profile
  join public.user_roles user_role on user_role.profile_id = profile.id
  join public.roles role on role.id = user_role.role_id
  where profile.status = 'active'
    and role.key in ('project_manager', 'coordinator')
  group by profile.id, profile.display_name
  order by profile.display_name;
end
$$;

create or replace function public.rpc_create_project(
  p_project jsonb,
  p_primary_pm_id uuid,
  p_coordinator_ids uuid[],
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  saved_id uuid;
  primary_pm uuid := p_primary_pm_id;
  coordinator_id uuid;
  unknown_key text;
begin
  if actor is null or not public.has_permission('projects.create') then
    raise insufficient_privilege using message = 'projects.create permission is required';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise check_violation using message = 'change reason must contain between 3 and 500 characters';
  end if;
  if jsonb_typeof(coalesce(p_project, '{}'::jsonb)) <> 'object' then
    raise invalid_parameter_value using message = 'project payload must be an object';
  end if;

  select key into unknown_key
  from jsonb_object_keys(p_project) key
  where key not in (
    'project_code', 'name', 'client_name', 'site_location', 'planned_start_date',
    'expected_end_date', 'contract_reference', 'budget_reference',
    'operational_notes', 'status', 'health_status', 'estimated_budget_ugx', 'budget_notes'
  )
  limit 1;
  if unknown_key is not null then
    raise invalid_parameter_value using message = 'unsupported project field: ' || unknown_key;
  end if;
  if coalesce(nullif(p_project ->> 'status', ''), 'planned') in ('completed', 'cancelled', 'archived') then
    raise invalid_parameter_value using
      message = 'status transition requires the guarded project transition workflow';
  end if;

  if public.profile_has_role(actor, 'project_manager') and not public.has_permission('projects.assign_all') then
    if primary_pm is not null and primary_pm <> actor then
      raise insufficient_privilege using
        message = 'Project Managers must assign themselves as the primary PM';
    end if;
    primary_pm := actor;
  elsif not public.has_permission('projects.assign_all') then
    raise insufficient_privilege using message = 'projects.assign_all permission is required';
  end if;

  if primary_pm is not null and not public.profile_has_role(primary_pm, 'project_manager') then
    raise invalid_parameter_value using message = 'primary PM candidate must hold the project_manager role';
  end if;
  foreach coordinator_id in array coalesce(p_coordinator_ids, array[]::uuid[]) loop
    if not public.profile_has_role(coordinator_id, 'coordinator') then
      raise invalid_parameter_value using message = 'project coordinator candidate must hold the coordinator role';
    end if;
  end loop;

  insert into public.projects (
    project_code, name, client_name, site_location, planned_start_date,
    expected_end_date, contract_reference, budget_reference, operational_notes,
    status, health_status, estimated_budget_ugx, budget_notes,
    budget_set_by, created_by, updated_by
  ) values (
    upper(btrim(p_project ->> 'project_code')),
    btrim(p_project ->> 'name'),
    nullif(btrim(p_project ->> 'client_name'), ''),
    nullif(btrim(p_project ->> 'site_location'), ''),
    nullif(p_project ->> 'planned_start_date', '')::date,
    nullif(p_project ->> 'expected_end_date', '')::date,
    nullif(btrim(p_project ->> 'contract_reference'), ''),
    nullif(btrim(p_project ->> 'budget_reference'), ''),
    nullif(btrim(p_project ->> 'operational_notes'), ''),
    coalesce(nullif(p_project ->> 'status', ''), 'planned'),
    coalesce(nullif(p_project ->> 'health_status', ''), 'on_track'),
    nullif(p_project ->> 'estimated_budget_ugx', '')::numeric,
    nullif(btrim(p_project ->> 'budget_notes'), ''),
    case when p_project ? 'estimated_budget_ugx' then actor end,
    actor,
    actor
  )
  returning id into saved_id;

  if primary_pm is not null then
    insert into public.project_assignments (
      project_id, user_id, role_on_project, assigned_by, assignment_reason
    ) values (saved_id, primary_pm, 'pm', actor, btrim(p_reason));
  end if;

  insert into public.project_assignments (
    project_id, user_id, role_on_project, assigned_by, assignment_reason
  )
  select saved_id, selected.id, 'coordinator', actor, btrim(p_reason)
  from (select distinct unnest(coalesce(p_coordinator_ids, array[]::uuid[])) as id) selected;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id, new_values, reason
  ) values (
    actor, 'projects.created', 'project', saved_id::text,
    jsonb_build_object(
      'project_code', upper(btrim(p_project ->> 'project_code')),
      'primary_pm_id', primary_pm,
      'coordinator_count', cardinality(coalesce(p_coordinator_ids, array[]::uuid[]))
    ),
    btrim(p_reason)
  );
  return saved_id;
exception
  when unique_violation then
    raise unique_violation using message = 'project code or active assignment already exists';
end
$$;

create or replace function public.rpc_update_project(
  p_project_id uuid,
  p_changes jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  existing public.projects%rowtype;
  changed public.projects%rowtype;
  unknown_key text;
begin
  if actor is null then
    raise insufficient_privilege using message = 'an active profile is required';
  end if;
  if not (
    public.has_permission('projects.update_all')
    or public.is_pm_on_project(p_project_id, actor)
  ) then
    raise insufficient_privilege using message = 'active primary PM assignment is required to update the project';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise check_violation using message = 'change reason must contain between 3 and 500 characters';
  end if;
  if jsonb_typeof(coalesce(p_changes, '{}'::jsonb)) <> 'object' then
    raise invalid_parameter_value using message = 'project changes must be an object';
  end if;

  select key into unknown_key
  from jsonb_object_keys(p_changes) key
  where key not in (
    'project_code', 'name', 'client_name', 'site_location', 'planned_start_date',
    'expected_end_date', 'contract_reference', 'budget_reference',
    'operational_notes', 'status', 'health_status', 'estimated_budget_ugx', 'budget_notes'
  )
  limit 1;
  if unknown_key is not null then
    raise invalid_parameter_value using message = 'unsupported project field: ' || unknown_key;
  end if;
  if p_changes ? 'status' and p_changes ->> 'status' in ('completed', 'cancelled', 'archived') then
    raise invalid_parameter_value using
      message = 'status transition requires the guarded project transition workflow';
  end if;

  select * into existing from public.projects where id = p_project_id for update;
  if not found then
    raise no_data_found using message = 'project not found';
  end if;

  update public.projects
  set project_code = case when p_changes ? 'project_code' then upper(btrim(p_changes ->> 'project_code')) else project_code end,
      name = case when p_changes ? 'name' then btrim(p_changes ->> 'name') else name end,
      client_name = case when p_changes ? 'client_name' then nullif(btrim(p_changes ->> 'client_name'), '') else client_name end,
      site_location = case when p_changes ? 'site_location' then nullif(btrim(p_changes ->> 'site_location'), '') else site_location end,
      planned_start_date = case when p_changes ? 'planned_start_date' then nullif(p_changes ->> 'planned_start_date', '')::date else planned_start_date end,
      expected_end_date = case when p_changes ? 'expected_end_date' then nullif(p_changes ->> 'expected_end_date', '')::date else expected_end_date end,
      contract_reference = case when p_changes ? 'contract_reference' then nullif(btrim(p_changes ->> 'contract_reference'), '') else contract_reference end,
      budget_reference = case when p_changes ? 'budget_reference' then nullif(btrim(p_changes ->> 'budget_reference'), '') else budget_reference end,
      operational_notes = case when p_changes ? 'operational_notes' then nullif(btrim(p_changes ->> 'operational_notes'), '') else operational_notes end,
      status = case when p_changes ? 'status' then p_changes ->> 'status' else status end,
      health_status = case when p_changes ? 'health_status' then p_changes ->> 'health_status' else health_status end,
      estimated_budget_ugx = case when p_changes ? 'estimated_budget_ugx' then nullif(p_changes ->> 'estimated_budget_ugx', '')::numeric else estimated_budget_ugx end,
      budget_notes = case when p_changes ? 'budget_notes' then nullif(btrim(p_changes ->> 'budget_notes'), '') else budget_notes end,
      budget_set_by = case when p_changes ? 'estimated_budget_ugx' then actor else budget_set_by end,
      updated_by = actor,
      updated_at = now()
  where id = p_project_id
  returning * into changed;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id, previous_values, new_values, reason
  ) values (
    actor, 'projects.updated', 'project', p_project_id::text,
    jsonb_build_object('status', existing.status, 'health_status', existing.health_status),
    jsonb_build_object('status', changed.status, 'health_status', changed.health_status),
    btrim(p_reason)
  );
end
$$;

create or replace function public.rpc_assign_project_member(
  p_project_id uuid,
  p_user_id uuid,
  p_project_role text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  saved_id uuid;
begin
  if actor is null then
    raise insufficient_privilege using message = 'an active profile is required';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise check_violation using message = 'change reason must contain between 3 and 500 characters';
  end if;
  if p_project_role not in ('pm', 'coordinator') then
    raise invalid_parameter_value using message = 'project role must be pm or coordinator';
  end if;
  perform 1 from public.projects where id = p_project_id for update;
  if not found then raise no_data_found using message = 'project not found'; end if;

  if p_project_role = 'pm' then
    if not public.has_permission('projects.assign_all') then
      raise insufficient_privilege using
        message = 'projects.assign_all permission is required to assign the primary PM';
    end if;
    if not public.profile_has_role(p_user_id, 'project_manager') then
      raise invalid_parameter_value using message = 'primary PM candidate must hold the project_manager role';
    end if;

    update public.project_assignments
    set unassigned_at = greatest(clock_timestamp(), assigned_at + interval '1 microsecond'),
        unassigned_by = actor,
        unassignment_reason = btrim(p_reason)
    where project_id = p_project_id
      and role_on_project = 'pm'
      and unassigned_at is null
      and user_id <> p_user_id;
  else
    if not (
      public.has_permission('projects.assign_all')
      or public.is_pm_on_project(p_project_id, actor)
    ) then
      raise insufficient_privilege using message = 'active primary PM assignment is required to manage coordinators';
    end if;
    if not public.profile_has_role(p_user_id, 'coordinator') then
      raise invalid_parameter_value using message = 'project coordinator candidate must hold the coordinator role';
    end if;
  end if;

  select id into saved_id
  from public.project_assignments
  where project_id = p_project_id
    and user_id = p_user_id
    and role_on_project = p_project_role
    and unassigned_at is null;

  if saved_id is null then
    insert into public.project_assignments (
      project_id, user_id, role_on_project, assigned_by, assignment_reason
    ) values (
      p_project_id, p_user_id, p_project_role, actor, btrim(p_reason)
    )
    returning id into saved_id;
  end if;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id, new_values, reason
  ) values (
    actor, 'projects.member_assigned', 'project_assignment', saved_id::text,
    jsonb_build_object('project_id', p_project_id, 'user_id', p_user_id, 'project_role', p_project_role),
    btrim(p_reason)
  );
  return saved_id;
end
$$;

create or replace function public.rpc_unassign_project_member(
  p_assignment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  assignment public.project_assignments%rowtype;
begin
  if actor is null then
    raise insufficient_privilege using message = 'an active profile is required';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise check_violation using message = 'change reason must contain between 3 and 500 characters';
  end if;
  select * into assignment
  from public.project_assignments
  where id = p_assignment_id and unassigned_at is null
  for update;
  if not found then raise no_data_found using message = 'active project assignment not found'; end if;

  if assignment.role_on_project = 'pm' then
    if not public.has_permission('projects.assign_all') then
      raise insufficient_privilege using message = 'projects.assign_all permission is required to remove the primary PM';
    end if;
  elsif not (
    public.has_permission('projects.assign_all')
    or public.is_pm_on_project(assignment.project_id, actor)
  ) then
    raise insufficient_privilege using message = 'active primary PM assignment is required to manage coordinators';
  end if;

  update public.project_assignments
  set unassigned_at = greatest(clock_timestamp(), assigned_at + interval '1 microsecond'),
      unassigned_by = actor,
      unassignment_reason = btrim(p_reason)
  where id = p_assignment_id;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id, new_values, reason
  ) values (
    actor, 'projects.member_unassigned', 'project_assignment', p_assignment_id::text,
    jsonb_build_object('project_id', assignment.project_id, 'user_id', assignment.user_id, 'project_role', assignment.role_on_project),
    btrim(p_reason)
  );
end
$$;

create or replace function public.rpc_save_daily_update(
  p_update_id uuid,
  p_project_id uuid,
  p_update_date date,
  p_summary text,
  p_photo_urls text[],
  p_submit boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  saved_id uuid;
  existing public.daily_updates%rowtype;
begin
  if actor is null or not public.is_coordinator_on_project(p_project_id, actor) then
    raise insufficient_privilege using message = 'active coordinator assignment is required';
  end if;
  if length(btrim(coalesce(p_summary, ''))) < 1 then
    raise check_violation using message = 'daily update summary is required';
  end if;
  if p_update_date is null then
    raise not_null_violation using message = 'daily update date is required';
  end if;

  if p_update_id is null then
    insert into public.daily_updates (
      project_id, submitted_by, update_date, summary, photo_urls, status
    ) values (
      p_project_id, actor, p_update_date, btrim(p_summary),
      coalesce(p_photo_urls, array[]::text[]),
      case when coalesce(p_submit, false) then 'submitted' else 'draft' end
    )
    returning id into saved_id;
  else
    select * into existing from public.daily_updates where id = p_update_id for update;
    if not found then raise no_data_found using message = 'daily update not found'; end if;
    if existing.submitted_by <> actor or existing.project_id <> p_project_id
      or existing.status not in ('draft', 'revision_requested') then
      raise insufficient_privilege using message = 'only the assigned original coordinator may revise this update';
    end if;

    update public.daily_updates
    set update_date = p_update_date,
        summary = btrim(p_summary),
        photo_urls = coalesce(p_photo_urls, array[]::text[]),
        status = case when coalesce(p_submit, false) then 'submitted' else 'draft' end,
        pm_feedback = case when coalesce(p_submit, false) then null else pm_feedback end,
        endorsed_by = null,
        endorsed_at = null,
        updated_at = now()
    where id = p_update_id
    returning id into saved_id;
  end if;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id, new_values
  ) values (
    actor,
    case when p_update_id is null then 'daily_updates.created' else 'daily_updates.revised' end,
    'daily_update',
    saved_id::text,
    jsonb_build_object('project_id', p_project_id, 'update_date', p_update_date, 'submitted', coalesce(p_submit, false))
  );
  return saved_id;
end
$$;

create or replace function public.rpc_review_daily_update(
  p_update_id uuid,
  p_decision text,
  p_feedback text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  update_record public.daily_updates%rowtype;
begin
  if actor is null then
    raise insufficient_privilege using message = 'an active profile is required';
  end if;
  select * into update_record from public.daily_updates where id = p_update_id for update;
  if not found then raise no_data_found using message = 'daily update not found'; end if;
  if not (
    public.is_pm_on_project(update_record.project_id, actor)
    or public.has_permission('projects.update_all')
  ) then
    raise insufficient_privilege using message = 'active primary PM assignment is required to review the update';
  end if;
  if p_decision not in ('endorse', 'request_revision') then
    raise invalid_parameter_value using message = 'review decision must be endorse or request_revision';
  end if;
  if p_decision = 'request_revision' and length(btrim(coalesce(p_feedback, ''))) < 1 then
    raise check_violation using message = 'feedback is required when requesting a revision';
  end if;

  update public.daily_updates
  set status = case when p_decision = 'endorse' then 'endorsed' else 'revision_requested' end,
      pm_feedback = nullif(btrim(coalesce(p_feedback, '')), ''),
      endorsed_by = actor,
      endorsed_at = case when p_decision = 'endorse' then now() else null end,
      updated_at = now()
  where id = p_update_id;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id, new_values
  ) values (
    actor, 'daily_updates.reviewed', 'daily_update', p_update_id::text,
    jsonb_build_object('project_id', update_record.project_id, 'decision', p_decision)
  );
end
$$;

revoke all on function public.rpc_list_project_assignment_candidates() from public, anon;
revoke all on function public.rpc_create_project(jsonb, uuid, uuid[], text) from public, anon;
revoke all on function public.rpc_update_project(uuid, jsonb, text) from public, anon;
revoke all on function public.rpc_assign_project_member(uuid, uuid, text, text) from public, anon;
revoke all on function public.rpc_unassign_project_member(uuid, text) from public, anon;
revoke all on function public.rpc_save_daily_update(uuid, uuid, date, text, text[], boolean) from public, anon;
revoke all on function public.rpc_review_daily_update(uuid, text, text) from public, anon;

grant execute on function public.rpc_list_project_assignment_candidates() to authenticated;
grant execute on function public.rpc_create_project(jsonb, uuid, uuid[], text) to authenticated;
grant execute on function public.rpc_update_project(uuid, jsonb, text) to authenticated;
grant execute on function public.rpc_assign_project_member(uuid, uuid, text, text) to authenticated;
grant execute on function public.rpc_unassign_project_member(uuid, text) to authenticated;
grant execute on function public.rpc_save_daily_update(uuid, uuid, date, text, text[], boolean) to authenticated;
grant execute on function public.rpc_review_daily_update(uuid, text, text) to authenticated;
