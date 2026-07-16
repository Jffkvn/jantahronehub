begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

select has_function(
  'public', 'hr_list_setup_records', array[]::text[],
  'authorized HR users can list canonical setup records'
);
select has_function(
  'public', 'hr_save_department', array['uuid', 'text', 'text', 'text', 'text'],
  'departments are saved through an audited workflow'
);
select has_function(
  'public', 'hr_save_job_title', array['uuid', 'uuid', 'text', 'text', 'text', 'text'],
  'job titles are saved through an audited workflow'
);
select has_function(
  'public', 'hr_save_pay_grade', array['uuid', 'text', 'text', 'text', 'numeric', 'numeric', 'text', 'text'],
  'pay grades are saved through an audited workflow'
);
select has_function(
  'public', 'hr_set_setup_archived', array['text', 'uuid', 'boolean', 'text'],
  'setup archive and restore use one guarded workflow'
);

select function_privs_are(
  'public', 'hr_save_department', array['uuid', 'text', 'text', 'text', 'text'],
  'authenticated', array['EXECUTE'],
  'authenticated callers reach the permission-guarded department workflow'
);
select function_privs_are(
  'public', 'hr_save_department', array['uuid', 'text', 'text', 'text', 'text'],
  'anon', array[]::text[],
  'anonymous callers cannot execute department setup workflows'
);
select table_privs_are(
  'public', 'departments', 'authenticated', array['SELECT'],
  'authenticated clients can read but cannot directly mutate departments'
);
select table_privs_are(
  'public', 'job_titles', 'authenticated', array['SELECT'],
  'authenticated clients can read but cannot directly mutate job titles'
);
select table_privs_are(
  'public', 'pay_grades', 'authenticated', array['SELECT'],
  'authenticated clients can read but cannot directly mutate pay grades'
);

insert into auth.users (id, email)
values
  ('92000000-0000-0000-0000-000000000001', 'hr-setup-admin@example.invalid'),
  ('92000000-0000-0000-0000-000000000002', 'hr-setup-employee@example.invalid'),
  ('92000000-0000-0000-0000-000000000003', 'hr-setup-super-admin@example.invalid');

insert into public.profiles (id, display_name)
values
  ('92000000-0000-0000-0000-000000000001', 'HR Setup Administrator'),
  ('92000000-0000-0000-0000-000000000002', 'HR Setup Employee'),
  ('92000000-0000-0000-0000-000000000003', 'HR Setup Super Administrator');

insert into public.user_roles (profile_id, role_id)
select assignment.profile_id, role.id
from (
  values
    ('92000000-0000-0000-0000-000000000001'::uuid, 'hr_admin'::text),
    ('92000000-0000-0000-0000-000000000002'::uuid, 'employee'::text),
    ('92000000-0000-0000-0000-000000000003'::uuid, 'super_admin'::text)
) assignment(profile_id, role_key)
join public.roles role on role.key = assignment.role_key;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

select lives_ok(
  $$
    select public.hr_save_department(
      null,
      '  t64dep  ',
      '  Task 64 Operations  ',
      'Field and office operations',
      'Create the department during HR setup testing'
    )
  $$,
  'HR can create a department'
);
select is(
  (select code from public.departments where code = 'T64DEP'),
  'T64DEP',
  'department codes are trimmed and uppercase-normalized'
);
select is(
  (select name from public.departments where code = 'T64DEP'),
  'Task 64 Operations',
  'department names are trimmed'
);

select lives_ok(
  $$
    select public.hr_save_job_title(
      null,
      (select id from public.departments where code = 'T64DEP'),
      't64tech',
      'Task 64 Technician',
      'Performs technical field work',
      'Create the title during HR setup testing'
    )
  $$,
  'HR can create a department-linked job title'
);

select lives_ok(
  $$
    select public.hr_save_pay_grade(
      null,
      't64g1',
      'Task 64 Grade One',
      'ugx',
      1000000,
      2000000,
      'Entry technical grade',
      'Create the pay grade during HR setup testing'
    )
  $$,
  'HR can create a pay grade'
);

select throws_ok(
  $$
    select public.hr_save_pay_grade(
      null,
      'T64BAD',
      'Task 64 Invalid Grade',
      'UGX',
      2000000,
      1000000,
      '',
      'Prove invalid pay ranges are rejected'
    )
  $$,
  '23514',
  'maximum gross cannot be less than minimum gross',
  'invalid pay-grade ranges are rejected'
);

select throws_ok(
  $$
    select public.hr_save_department(
      null,
      'T64DEP',
      'Different department name',
      '',
      'Prove duplicate setup identifiers are rejected'
    )
  $$,
  '23505',
  'department code or name already exists',
  'duplicate department identifiers are rejected safely'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2"}',
  true
);

select lives_ok(
  $$ select public.hr_list_setup_records() $$,
  'super administrator can load HR setup records'
);
select lives_ok(
  $$
    select public.hr_save_department(
      null,
      'T64SA',
      'Task 64 Super Admin Department',
      'Created by the owner-support workflow',
      'Prove super administrator setup authority'
    )
  $$,
  'super administrator can create HR setup records'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);

select throws_ok(
  $$
    select public.hr_save_department(
      null,
      'T64NO',
      'Unauthorized department',
      '',
      'An employee must not manage HR setup'
    )
  $$,
  '42501',
  'employees.manage_setup permission is required',
  'ordinary employees cannot create setup records'
);

reset role;

-- Dependency rows are inserted only after the create workflows have succeeded.
-- This keeps the test readable in the expected RED state before migration 0064.
do $$
declare
  department_id uuid;
  job_title_id uuid;
  pay_grade_id uuid;
begin
  select id into department_id from public.departments where code = 'T64DEP';
  select id into job_title_id from public.job_titles where code = 'T64TECH';
  select id into pay_grade_id from public.pay_grades where code = 'T64G1';

  if department_id is not null and job_title_id is not null and pay_grade_id is not null then
    insert into public.employees (id, employee_number, legal_name)
    values ('92000000-0000-0000-0000-000000000101', 'T64-EMP', 'Task 64 Employee');

    insert into public.employment_periods (
      id,
      employee_id,
      department_id,
      job_title_id,
      pay_grade_id,
      start_date,
      employment_type,
      contract_type
    )
    values (
      '92000000-0000-0000-0000-000000000201',
      '92000000-0000-0000-0000-000000000101',
      department_id,
      job_title_id,
      pay_grade_id,
      current_date - 30,
      'full_time',
      'permanent'
    );
  end if;
end
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

select throws_ok(
  $$
    select public.hr_set_setup_archived(
      'job_title',
      (select id from public.job_titles where code = 'T64TECH'),
      true,
      'Attempt to archive an assigned job title'
    )
  $$,
  '23503',
  'job title is assigned to a current employee',
  'an assigned current job title cannot be archived'
);
select throws_ok(
  $$
    select public.hr_set_setup_archived(
      'pay_grade',
      (select id from public.pay_grades where code = 'T64G1'),
      true,
      'Attempt to archive an assigned pay grade'
    )
  $$,
  '23503',
  'pay grade is assigned to a current employee',
  'an assigned current pay grade cannot be archived'
);
select throws_ok(
  $$
    select public.hr_set_setup_archived(
      'department',
      (select id from public.departments where code = 'T64DEP'),
      true,
      'Attempt to archive a department with active dependencies'
    )
  $$,
  '23503',
  'department has active job titles or current employee assignments',
  'a department with active dependencies cannot be archived'
);

reset role;
update public.employment_periods
set end_date = current_date - 1
where id = '92000000-0000-0000-0000-000000000201';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

select lives_ok(
  $$
    select public.hr_set_setup_archived(
      'job_title',
      (select id from public.job_titles where code = 'T64TECH'),
      true,
      'Archive the title after the employee period ended'
    )
  $$,
  'a historically referenced job title can be archived'
);
select lives_ok(
  $$
    select public.hr_set_setup_archived(
      'pay_grade',
      (select id from public.pay_grades where code = 'T64G1'),
      true,
      'Archive the grade after the employee period ended'
    )
  $$,
  'a historically referenced pay grade can be archived'
);
select lives_ok(
  $$
    select public.hr_set_setup_archived(
      'department',
      (select id from public.departments where code = 'T64DEP'),
      true,
      'Archive the department after active dependencies ended'
    )
  $$,
  'a historically referenced department can be archived'
);

select lives_ok(
  $$
    select public.hr_set_setup_archived(
      'department',
      (select id from public.departments where code = 'T64DEP'),
      false,
      'Restore the department for further use'
    )
  $$,
  'an archived department can be restored'
);
select lives_ok(
  $$
    select public.hr_set_setup_archived(
      'job_title',
      (select id from public.job_titles where code = 'T64TECH'),
      false,
      'Restore the job title for further use'
    )
  $$,
  'an archived job title can be restored'
);
select lives_ok(
  $$
    select public.hr_set_setup_archived(
      'pay_grade',
      (select id from public.pay_grades where code = 'T64G1'),
      false,
      'Restore the pay grade for further use'
    )
  $$,
  'an archived pay grade can be restored'
);

select lives_ok(
  $$
    select public.hr_save_department(
      (select id from public.departments where code = 'T64DEP'),
      'T64DEP',
      'Task 64 Delivery Operations',
      'Updated field and office operations',
      'Rename the department after management review'
    )
  $$,
  'HR can edit an existing department'
);
select is(
  (select name from public.departments where code = 'T64DEP'),
  'Task 64 Delivery Operations',
  'department edits are persisted'
);

select lives_ok(
  $$ select public.hr_list_setup_records() $$,
  'authorized HR can load setup records with assignment metadata'
);

-- Leave the impersonated HR session before inspecting the protected audit
-- ledger. This verifies what the workflow wrote without weakening audit RLS.
reset role;

select is(
  (
    select count(*)
    from public.audit_events event
    where event.actor_profile_id = '92000000-0000-0000-0000-000000000001'
      and event.event_type like 'hr_setup.%'
  ),
  10::bigint,
  'every successful setup mutation writes one audit event and failures write none'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

select throws_ok(
  $$
    select public.hr_save_job_title(
      (select id from public.job_titles where code = 'T64TECH'),
      (select id from public.departments where code = 'T64SA'),
      'T64TECH',
      'Task 64 Technician',
      'Attempt to rewrite the title department after it has employee history',
      'Preserve the meaning of historical employee assignments'
    )
  $$,
  '23503',
  'job title department cannot change while employee history references it',
  'a referenced job title cannot be moved to another department'
);

reset role;

do $$
declare
  diagnostic text;
begin
  for diagnostic in select * from finish() loop
    raise exception using message = 'pgTAP failure: ' || diagnostic;
  end loop;
end
$$;

rollback;
