insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.key = 'audit.create'
where role.key = 'hr_admin'
on conflict do nothing;

comment on function public.create_employee_with_period(jsonb, jsonb) is
  'Atomically creates an employee, initial employment period and audit event. Requires employees.create and audit.create.';
