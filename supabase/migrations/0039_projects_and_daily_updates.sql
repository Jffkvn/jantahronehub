-- Migration 0039_projects_and_daily_updates.sql
-- Implement Projects, Project Assignments, Daily Updates, Revisions, and RLS policies.

-- 1. Create Tables
create table public.projects (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 250),
  site_location text check (length(btrim(site_location)) > 0),
  status text not null default 'active' check (status in ('active', 'completed', 'on_hold')),
  estimated_budget_ugx numeric check (estimated_budget_ugx >= 0),
  budget_notes text check (length(btrim(budget_notes)) > 0),
  health_status text not null default 'on_track' check (health_status in ('on_track', 'needs_attention', 'at_risk')),
  budget_set_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_on_project text not null check (role_on_project in ('coordinator', 'pm')),
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  check (unassigned_at is null or unassigned_at > assigned_at)
);

create unique index unique_active_project_assignment
on public.project_assignments (project_id, user_id, role_on_project)
where (unassigned_at is null);

create table public.daily_updates (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  update_date date not null,
  summary text not null check (length(btrim(summary)) > 0),
  photo_urls text[] not null default '{}',
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'endorsed', 'revision_requested')),
  pm_feedback text check (length(btrim(pm_feedback)) > 0),
  endorsed_by uuid references public.profiles(id) on delete set null,
  endorsed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_project_user_date unique (project_id, submitted_by, update_date)
);

create table public.daily_update_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  daily_update_id uuid not null references public.daily_updates(id) on delete cascade,
  summary text not null,
  photo_urls text[] not null default '{}',
  status text not null,
  pm_feedback text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 2. Seed Permissions
insert into public.permissions (key, resource, action, description)
values
  ('projects.manage', 'projects', 'manage', 'Create/edit projects and manage all assignments.'),
  ('projects.read_all', 'projects', 'read_all', 'Read all projects globally (CFO, MD, HR).'),
  ('projects.read', 'projects', 'read', 'Read assigned projects.'),
  ('daily_updates.read_all', 'daily_updates', 'read_all', 'Read all daily updates globally.'),
  ('daily_updates.read', 'daily_updates', 'read', 'Read assigned daily updates.'),
  ('daily_updates.create', 'daily_updates', 'create', 'Submit project daily field updates.'),
  ('daily_updates.endorse', 'daily_updates', 'endorse', 'Endorse or request revisions on daily updates.')
on conflict (key) do nothing;

-- Assign permissions to roles
-- CFO and super_admin get all projects & daily updates permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('super_admin', 'cfo')
  and p.key in ('projects.manage', 'projects.read_all', 'projects.read', 'daily_updates.read_all', 'daily_updates.read', 'daily_updates.endorse')
on conflict do nothing;

-- MD gets read_all and read permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'managing_director'
  and p.key in ('projects.read_all', 'projects.read', 'daily_updates.read_all', 'daily_updates.read')
on conflict do nothing;

-- HR Admin gets read_all and read permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'hr_admin'
  and p.key in ('projects.read_all', 'projects.read', 'daily_updates.read_all', 'daily_updates.read')
on conflict do nothing;

-- Project Manager gets projects.read, daily_updates.read, and daily_updates.endorse
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'project_manager'
  and p.key in ('projects.read', 'daily_updates.read', 'daily_updates.endorse')
on conflict do nothing;

-- Coordinator gets projects.read, daily_updates.read, and daily_updates.create
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'coordinator'
  and p.key in ('projects.read', 'daily_updates.read', 'daily_updates.create')
on conflict do nothing;

-- 3. RLS configurations
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.daily_updates enable row level security;
alter table public.daily_update_revisions enable row level security;

-- Projects RLS Policies
create policy projects_select_policy on public.projects
  for select using (
    public.has_permission('projects.manage') or
    public.has_permission('projects.read_all') or
    exists (
      select 1 from public.project_assignments pa
      where pa.project_id = id
        and pa.user_id = auth.uid()
        and pa.unassigned_at is null
    )
  );

create policy projects_insert_policy on public.projects
  for insert with check (
    public.has_permission('projects.manage')
  );

create policy projects_update_policy on public.projects
  for update using (
    public.has_permission('projects.manage') or
    exists (
      select 1 from public.project_assignments pa
      where pa.project_id = id
        and pa.user_id = auth.uid()
        and pa.role_on_project = 'pm'
        and pa.unassigned_at is null
    )
  ) with check (
    public.has_permission('projects.manage') or
    exists (
      select 1 from public.project_assignments pa
      where pa.project_id = id
        and pa.user_id = auth.uid()
        and pa.role_on_project = 'pm'
        and pa.unassigned_at is null
    )
  );

-- Project Assignments RLS Policies
create policy project_assignments_select_policy on public.project_assignments
  for select using (
    public.has_permission('projects.read_all') or
    user_id = auth.uid() or
    exists (
      select 1 from public.project_assignments pa
      where pa.project_id = project_id
        and pa.user_id = auth.uid()
        and pa.role_on_project = 'pm'
        and pa.unassigned_at is null
    )
  );

create policy project_assignments_insert_policy on public.project_assignments
  for insert with check (
    public.has_permission('projects.manage') or
    (
      exists (
        select 1 from public.project_assignments pa
        where pa.project_id = project_assignments.project_id
          and pa.user_id = auth.uid()
          and pa.role_on_project = 'pm'
          and pa.unassigned_at is null
      )
      and role_on_project = 'coordinator'
    )
  );

create policy project_assignments_update_policy on public.project_assignments
  for update using (
    public.has_permission('projects.manage') or
    exists (
      select 1 from public.project_assignments pa
      where pa.project_id = project_assignments.project_id
        and pa.user_id = auth.uid()
        and pa.role_on_project = 'pm'
        and pa.unassigned_at is null
      )
  ) with check (
    public.has_permission('projects.manage') or
    exists (
      select 1 from public.project_assignments pa
      where pa.project_id = project_assignments.project_id
        and pa.user_id = auth.uid()
        and pa.role_on_project = 'pm'
        and pa.unassigned_at is null
      )
  );

-- Daily Updates RLS Policies
create policy daily_updates_select_policy on public.daily_updates
  for select using (
    public.has_permission('daily_updates.read_all') or
    submitted_by = auth.uid() or
    exists (
      select 1 from public.project_assignments pa
      where pa.project_id = project_id
        and pa.user_id = auth.uid()
        and pa.unassigned_at is null
    )
  );

create policy daily_updates_insert_policy on public.daily_updates
  for insert with check (
    public.has_permission('daily_updates.create') and
    submitted_by = auth.uid() and
    exists (
      select 1 from public.project_assignments pa
      where pa.project_id = daily_updates.project_id
        and pa.user_id = auth.uid()
        and pa.unassigned_at is null
    )
  );

create policy daily_updates_update_policy on public.daily_updates
  for update using (
    public.has_permission('projects.manage') or
    (
      submitted_by = auth.uid() and
      status in ('draft', 'revision_requested')
    ) or
    (
      public.has_permission('daily_updates.endorse') and
      exists (
        select 1 from public.project_assignments pa
        where pa.project_id = daily_updates.project_id
          and pa.user_id = auth.uid()
          and pa.role_on_project = 'pm'
          and pa.unassigned_at is null
      )
    )
  ) with check (
    public.has_permission('projects.manage') or
    (
      submitted_by = auth.uid() and
      status in ('draft', 'submitted')
    ) or
    (
      public.has_permission('daily_updates.endorse') and
      exists (
        select 1 from public.project_assignments pa
        where pa.project_id = daily_updates.project_id
          and pa.user_id = auth.uid()
          and pa.role_on_project = 'pm'
          and pa.unassigned_at is null
      )
      and status in ('endorsed', 'revision_requested')
    )
  );

-- Daily Update Revisions RLS Policies
create policy daily_update_revisions_select_policy on public.daily_update_revisions
  for select using (
    public.has_permission('daily_updates.read_all') or
    exists (
      select 1 from public.daily_updates du
      where du.id = daily_update_id
        and (
          du.submitted_by = auth.uid() or
          exists (
            select 1 from public.project_assignments pa
            where pa.project_id = du.project_id
              and pa.user_id = auth.uid()
              and pa.unassigned_at is null
          )
        )
    )
  );

-- Revoke all direct public rights and grant to authenticated role
revoke all on table public.projects from anon, authenticated;
revoke all on table public.project_assignments from anon, authenticated;
revoke all on table public.daily_updates from anon, authenticated;
revoke all on table public.daily_update_revisions from anon, authenticated;

grant select, insert, update on table public.projects to authenticated;
grant select, insert, update on table public.project_assignments to authenticated;
grant select, insert, update on table public.daily_updates to authenticated;
grant select on table public.daily_update_revisions to authenticated;

-- 4. Create trigger to automatically log daily update revisions
create or replace function public.trg_log_daily_update_revision()
returns trigger
language plpgsql
security definer
as $$
declare
  v_actor uuid;
begin
  -- Resolve who is making this modification
  v_actor := public.current_profile_id();
  if v_actor is null then
    v_actor := coalesce(
      case
        when new.status in ('endorsed', 'revision_requested') then new.endorsed_by
        else new.submitted_by
      end,
      new.submitted_by
    );
  end if;

  insert into public.daily_update_revisions (
    daily_update_id,
    summary,
    photo_urls,
    status,
    pm_feedback,
    created_by,
    created_at
  )
  values (
    new.id,
    new.summary,
    new.photo_urls,
    new.status,
    new.pm_feedback,
    v_actor,
    now()
  );
  return new;
end;
$$;

create trigger daily_updates_revision_trigger
after insert or update of summary, photo_urls, status, pm_feedback
on public.daily_updates
for each row
execute function public.trg_log_daily_update_revision();

-- 5. Missed daily updates helper function
create or replace function public.rpc_check_missed_daily_updates(p_date date)
returns table (
  project_id uuid,
  project_name text,
  user_id uuid,
  user_full_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('daily_updates.read_all') then
    raise exception 'Unauthorized: Insufficient permissions to view missed daily updates.' using errcode = '42501';
  end if;

  return query
  select
    p.id as project_id,
    p.name as project_name,
    pa.user_id as user_id,
    pr.display_name as user_full_name
  from public.project_assignments pa
  join public.projects p on pa.project_id = p.id
  join public.profiles pr on pa.user_id = pr.id
  where p.status = 'active'
    and pa.role_on_project = 'coordinator'
    and pa.assigned_at::date <= p_date
    and (pa.unassigned_at is null or pa.unassigned_at::date >= p_date)
    and not exists (
      select 1 from public.daily_updates du
      where du.project_id = pa.project_id
        and du.submitted_by = pa.user_id
        and du.update_date = p_date
        and du.status != 'draft'
    );
end;
$$;

grant execute on function public.rpc_check_missed_daily_updates(date) to authenticated;
