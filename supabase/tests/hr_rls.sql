begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

select has_table('public', 'departments', 'departments exists');
select has_table('public', 'job_titles', 'job_titles exists');
select has_table('public', 'pay_grades', 'pay_grades exists');
select has_table('public', 'employees', 'employees exists');
select has_table('public', 'employment_periods', 'employment periods exist');
select has_table('public', 'employee_documents', 'employee documents exist');
select has_function('public', 'employee_is_active', array['uuid'], 'employee active-state function exists');

insert into auth.users (id, email)
values
  ('20000000-0000-0000-0000-000000000001', 'task8-hr@example.invalid'),
  ('20000000-0000-0000-0000-000000000002', 'task8-employee@example.invalid'),
  ('20000000-0000-0000-0000-000000000003', 'task8-other@example.invalid');

insert into public.profiles (id, display_name)
values
  ('20000000-0000-0000-0000-000000000001', 'Task 8 HR'),
  ('20000000-0000-0000-0000-000000000002', 'Task 8 Employee'),
  ('20000000-0000-0000-0000-000000000003', 'Task 8 Other');

insert into public.user_roles (profile_id, role_id)
select '20000000-0000-0000-0000-000000000001', id from public.roles where key = 'hr_admin';

insert into public.user_roles (profile_id, role_id)
select profile_id, role.id
from (values
  ('20000000-0000-0000-0000-000000000002'::uuid),
  ('20000000-0000-0000-0000-000000000003'::uuid)
) assigned(profile_id)
cross join lateral (select id from public.roles where key = 'employee') role;

insert into public.departments (id, code, name)
values ('21000000-0000-0000-0000-000000000001', 'OPS', 'Operations');

insert into public.job_titles (id, code, name, department_id)
values ('22000000-0000-0000-0000-000000000001', 'TECH', 'Technician', '21000000-0000-0000-0000-000000000001');

insert into public.pay_grades (id, code, name, currency_code)
values ('23000000-0000-0000-0000-000000000001', 'G1', 'Grade 1', 'UGX');

insert into public.employees (
  id, profile_id, employee_number, legal_name, company_email
)
values
  ('24000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'EGY-001', 'Own Employee', 'own@example.invalid'),
  ('24000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'EGY-002', 'Other Employee', 'other@example.invalid');

insert into public.employment_periods (
  id, employee_id, start_date, department_id, job_title_id, pay_grade_id, employment_type, contract_type
)
values
  ('25000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', current_date - 30, '21000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'full_time', 'permanent'),
  ('25000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002', current_date - 30, '21000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'full_time', 'permanent');

insert into public.employee_documents (
  id, employee_id, document_type, display_name, storage_path, mime_type, size_bytes, employee_visible, uploaded_by
)
values
  ('26000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'contract', 'Visible contract', '20000000-0000-0000-0000-000000000001/employees/24000000-0000-0000-0000-000000000001/26000000-0000-0000-0000-000000000001.pdf', 'application/pdf', 100, true, '20000000-0000-0000-0000-000000000001'),
  ('26000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', 'disciplinary', 'Confidential note', '20000000-0000-0000-0000-000000000001/employees/24000000-0000-0000-0000-000000000001/26000000-0000-0000-0000-000000000002.pdf', 'application/pdf', 100, false, '20000000-0000-0000-0000-000000000001'),
  ('26000000-0000-0000-0000-000000000003', '24000000-0000-0000-0000-000000000002', 'contract', 'Other contract', '20000000-0000-0000-0000-000000000001/employees/24000000-0000-0000-0000-000000000002/26000000-0000-0000-0000-000000000003.pdf', 'application/pdf', 100, true, '20000000-0000-0000-0000-000000000001');

select ok(public.employee_is_active('24000000-0000-0000-0000-000000000001'), 'open employment period is active');

update public.employment_periods
set end_date = current_date + 7, exit_reason = 'planned_exit'
where id = '25000000-0000-0000-0000-000000000001';
select ok(public.employee_is_active('24000000-0000-0000-0000-000000000001'), 'future-dated exit remains active');

update public.employment_periods
set end_date = current_date - 1
where id = '25000000-0000-0000-0000-000000000001';
select ok(not public.employee_is_active('24000000-0000-0000-0000-000000000001'), 'past exit is inactive');

update public.employment_periods
set end_date = null, exit_reason = null
where id = '25000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ insert into public.employment_periods (employee_id, start_date, employment_type, contract_type)
     values ('24000000-0000-0000-0000-000000000001', current_date, 'full_time', 'permanent') $$,
  '23P01',
  null,
  'overlapping employment periods are rejected'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select results_eq(
  $$ select employee_number from public.employees order by employee_number $$,
  $$ values ('EGY-001'::text) $$,
  'employee sees only their own employee record'
);
select is((select count(*) from public.employment_periods), 1::bigint, 'employee sees only their own employment history');
select results_eq(
  $$ select display_name from public.employee_documents order by display_name $$,
  $$ values ('Visible contract'::text) $$,
  'employee sees only their own employee-visible documents'
);
update public.employees set legal_name = 'Self edited' where id = '24000000-0000-0000-0000-000000000001';
select is(
  (select legal_name from public.employees where id = '24000000-0000-0000-0000-000000000001'),
  'Own Employee',
  'employee cannot update their employee record directly'
);
select throws_ok(
  $$ insert into public.employee_documents (employee_id, document_type, display_name, storage_path, mime_type, size_bytes)
     values ('24000000-0000-0000-0000-000000000001', 'other', 'Self upload', 'employees/own/self.pdf', 'application/pdf', 10) $$,
  '42501',
  'new row violates row-level security policy for table "employee_documents"',
  'employee cannot insert document metadata directly'
);

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(public.has_permission('employees.archive'), 'HR receives explicit employee archive permission');
select ok(public.has_permission('employee_documents.manage'), 'HR receives document management permission');
select is((select count(*) from public.employees), 2::bigint, 'HR sees all employee records');
select is((select count(*) from public.employment_periods), 2::bigint, 'HR sees all employment periods');
select is((select count(*) from public.employee_documents), 3::bigint, 'HR sees confidential and visible documents');

insert into public.employees (id, employee_number, legal_name)
values ('24000000-0000-0000-0000-000000000003', 'EGY-003', 'Created by HR');
select is((select legal_name from public.employees where employee_number = 'EGY-003'), 'Created by HR', 'HR can create employees');

update public.employees set preferred_name = 'Updated' where employee_number = 'EGY-003';
select is((select preferred_name from public.employees where employee_number = 'EGY-003'), 'Updated', 'HR can update employees');

update public.employees
set archived_at = now(), archived_by = '20000000-0000-0000-0000-000000000001', archive_reason = 'Duplicate record'
where employee_number = 'EGY-003';
select ok((select archived_at is not null from public.employees where employee_number = 'EGY-003'), 'HR can archive employees with a reason');

select throws_ok(
  $$ delete from public.employees where employee_number = 'EGY-003' $$,
  '42501',
  'permission denied for table employees',
  'employees cannot be hard deleted through the API'
);

insert into public.employee_documents (employee_id, document_type, display_name, storage_path, mime_type, size_bytes, uploaded_by)
values ('24000000-0000-0000-0000-000000000001', 'other', 'HR upload', '20000000-0000-0000-0000-000000000001/employees/24000000-0000-0000-0000-000000000001/26000000-0000-0000-0000-000000000004.pdf', 'application/pdf', 10, '20000000-0000-0000-0000-000000000001');
select ok(exists(select 1 from public.employee_documents where display_name = 'HR upload'), 'HR can add document metadata');

update public.employee_documents set employee_visible = true where display_name = 'HR upload';
select ok((select employee_visible from public.employee_documents where display_name = 'HR upload'), 'HR can change document visibility');

select throws_ok(
  $$ insert into public.employees (employee_number, legal_name, archived_at) values ('EGY-004', 'Invalid archive', now()) $$,
  '23514',
  null,
  'archiving requires actor and reason'
);

reset role;
select throws_ok(
  $$ insert into public.employees (employee_number, legal_name, company_email) values ('EGY-005', 'Duplicate email', 'OWN@example.invalid') $$,
  '23505',
  null,
  'company email is unique case-insensitively'
);

select throws_ok(
  $$ update public.employment_periods set end_date = start_date - 1 where id = '25000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'employment end date cannot precede start date'
);

select throws_ok(
  $$ insert into public.employee_documents (
       employee_id, document_type, display_name, storage_path, mime_type, size_bytes, uploaded_by
     ) values (
       '24000000-0000-0000-0000-000000000001', 'other', 'Mismatched path',
       '20000000-0000-0000-0000-000000000001/employees/24000000-0000-0000-0000-000000000002/26000000-0000-0000-0000-000000000005.pdf',
       'application/pdf', 10, '20000000-0000-0000-0000-000000000001'
     ) $$,
  '23514',
  null,
  'document path must identify its employee and uploader'
);

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.key = 'employees.update'
where role.key = 'employee'
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ update public.employees
     set archived_at = now(), archived_by = '20000000-0000-0000-0000-000000000003', archive_reason = 'Not authorized'
     where id = '24000000-0000-0000-0000-000000000002' $$,
  '42501',
  'employees.archive permission is required to change archive state',
  'update permission alone cannot archive an employee'
);

select * from finish();
rollback;
