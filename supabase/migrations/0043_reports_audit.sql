-- 1. Create permissions
insert into public.permissions (key, resource, action, description)
values
  ('reports.view', 'reports', 'view', 'Can view operational reports and dashboards'),
  ('reports.export', 'reports', 'export', 'Can export operational reports to external formats')
on conflict (key) do nothing;

-- 2. Assign permissions to roles
-- super_admin, cfo, managing_director, and hr_administrator get both report view and export
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('super_admin', 'cfo', 'managing_director', 'hr_administrator')
  and p.key in ('reports.view', 'reports.export')
on conflict do nothing;

-- 3. Create audit record function
create or replace function public.record_report_export(p_report_name text, p_format text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id();
begin
  if not public.has_permission('reports.export') then
    raise insufficient_privilege using message='reports export permission is required';
  end if;

  if p_format not in ('excel', 'csv', 'pdf') then
    raise check_violation using message='invalid export format';
  end if;

  insert into public.audit_events(actor_profile_id, event_type, entity_type, new_values)
  values(actor, 'report.exported', 'report', jsonb_build_object('report_name', p_report_name, 'format', p_format));
end
$$;

revoke all on function public.record_report_export(text, text) from public, anon;
grant execute on function public.record_report_export(text, text) to authenticated;
comment on function public.record_report_export(text, text) is 'Audits privileged report exports and logs details to the audit ledger.';
