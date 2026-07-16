-- Make project assignments readable by name through a least-privilege RPC and
-- notify each newly assigned PM/coordinator atomically.

create or replace function public.rpc_list_project_assignments(
  p_project_id uuid,
  p_include_history boolean default false
)
returns table (
  id uuid,
  project_id uuid,
  user_id uuid,
  role_on_project text,
  assigned_at timestamptz,
  assigned_by uuid,
  assignment_reason text,
  unassigned_at timestamptz,
  unassigned_by uuid,
  unassignment_reason text,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
begin
  if not exists (select 1 from public.projects project where project.id = p_project_id) then
    raise no_data_found using message = 'project not found';
  end if;
  if actor is null or not (
    public.has_permission('projects.manage')
    or public.has_permission('projects.read_all')
    or public.has_permission('projects.read_operational')
    or public.is_member_on_project(p_project_id, actor)
  ) then
    raise insufficient_privilege using message = 'project assignment read access is required';
  end if;

  return query
  select
    assignment.id,
    assignment.project_id,
    assignment.user_id,
    assignment.role_on_project,
    assignment.assigned_at,
    assignment.assigned_by,
    assignment.assignment_reason,
    assignment.unassigned_at,
    assignment.unassigned_by,
    assignment.unassignment_reason,
    profile.display_name
  from public.project_assignments assignment
  join public.profiles profile on profile.id = assignment.user_id
  where assignment.project_id = p_project_id
    and (p_include_history or assignment.unassigned_at is null)
  order by assignment.assigned_at desc, assignment.id;
end
$$;

revoke all on function public.rpc_list_project_assignments(uuid, boolean) from public, anon;
grant execute on function public.rpc_list_project_assignments(uuid, boolean) to authenticated;

create or replace function public.trigger_notify_project_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_record record;
  role_label text;
begin
  select project.project_code, project.name
  into project_record
  from public.projects project
  where project.id = new.project_id;

  role_label := case new.role_on_project
    when 'pm' then 'primary project manager'
    else 'project coordinator'
  end;

  perform public.create_notification(
    new.user_id,
    'Project assignment',
    format(
      'You were assigned as %s to project %s · %s.',
      role_label,
      project_record.project_code,
      project_record.name
    ),
    'project',
    'project_assignment_' || new.id
  );
  return new;
end
$$;

revoke all on function public.trigger_notify_project_assignment() from public, anon, authenticated;

drop trigger if exists project_assignment_notification on public.project_assignments;
create trigger project_assignment_notification
after insert on public.project_assignments
for each row execute function public.trigger_notify_project_assignment();

