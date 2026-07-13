-- The initial reports migration referenced a non-existent
-- `hr_administrator` role. Grant the intended report permissions to the
-- canonical `hr_admin` role without changing any other role's access.

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.key = 'hr_admin'
  and permission.key in ('reports.view', 'reports.export')
on conflict do nothing;
