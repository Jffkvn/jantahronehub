-- Drop recursive policies
drop policy if exists projects_select_policy on public.projects;
drop policy if exists projects_update_policy on public.projects;
drop policy if exists project_assignments_select_policy on public.project_assignments;
drop policy if exists project_assignments_insert_policy on public.project_assignments;
drop policy if exists project_assignments_update_policy on public.project_assignments;
drop policy if exists daily_updates_select_policy on public.daily_updates;
drop policy if exists daily_updates_insert_policy on public.daily_updates;
drop policy if exists daily_updates_update_policy on public.daily_updates;
drop policy if exists daily_update_revisions_select_policy on public.daily_update_revisions;

-- Create helper functions to bypass RLS recursion
create or replace function public.is_pm_on_project(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_assignments
    where project_id = p_project_id
      and user_id = p_user_id
      and role_on_project = 'pm'
      and unassigned_at is null
  );
$$;

create or replace function public.is_member_on_project(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_assignments
    where project_id = p_project_id
      and user_id = p_user_id
      and unassigned_at is null
  );
$$;

-- Projects RLS Policies
create policy projects_select_policy on public.projects
  for select using (
    public.has_permission('projects.manage') or
    public.has_permission('projects.read_all') or
    public.is_member_on_project(id, auth.uid())
  );

create policy projects_update_policy on public.projects
  for update using (
    public.has_permission('projects.manage') or
    public.is_pm_on_project(id, auth.uid())
  ) with check (
    public.has_permission('projects.manage') or
    public.is_pm_on_project(id, auth.uid())
  );

-- Project Assignments RLS Policies
create policy project_assignments_select_policy on public.project_assignments
  for select using (
    public.has_permission('projects.read_all') or
    user_id = auth.uid() or
    public.is_pm_on_project(project_id, auth.uid())
  );

create policy project_assignments_insert_policy on public.project_assignments
  for insert with check (
    public.has_permission('projects.manage') or
    (
      public.is_pm_on_project(project_id, auth.uid())
      and role_on_project = 'coordinator'
    )
  );

create policy project_assignments_update_policy on public.project_assignments
  for update using (
    public.has_permission('projects.manage') or
    public.is_pm_on_project(project_id, auth.uid())
  ) with check (
    public.has_permission('projects.manage') or
    public.is_pm_on_project(project_id, auth.uid())
  );

-- Daily Updates RLS Policies
create policy daily_updates_select_policy on public.daily_updates
  for select using (
    public.has_permission('daily_updates.read_all') or
    submitted_by = auth.uid() or
    public.is_member_on_project(project_id, auth.uid())
  );

create policy daily_updates_insert_policy on public.daily_updates
  for insert with check (
    public.has_permission('daily_updates.create') and
    submitted_by = auth.uid() and
    public.is_member_on_project(project_id, auth.uid())
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
      public.is_pm_on_project(project_id, auth.uid())
    )
  ) with check (
    public.has_permission('projects.manage') or
    (
      submitted_by = auth.uid() and
      status in ('draft', 'submitted')
    ) or
    (
      public.has_permission('daily_updates.endorse') and
      public.is_pm_on_project(project_id, auth.uid())
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
          public.is_member_on_project(du.project_id, auth.uid())
        )
    )
  );
