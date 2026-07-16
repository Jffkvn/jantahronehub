begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

insert into auth.users (id, email)
values ('93000000-0000-0000-0000-000000000001', 'employee-setup-hr@example.invalid');

insert into public.profiles (id, display_name)
values ('93000000-0000-0000-0000-000000000001', 'Employee Setup HR');

insert into public.user_roles (profile_id, role_id)
select '93000000-0000-0000-0000-000000000001', role.id
from public.roles role
where role.key = 'hr_admin';

insert into public.pay_grades (id, code, name, currency_code, minimum_gross, maximum_gross)
values
  ('93000000-0000-0000-0000-000000000101', 'T65G1', 'Task 65 Grade One', 'UGX', 1000000, 2000000),
  ('93000000-0000-0000-0000-000000000102', 'T65G2', 'Task 65 Grade Two', 'UGX', 2000001, 3000000),
  ('93000000-0000-0000-0000-000000000103', 'T65GX', 'Task 65 Archived Grade', 'UGX', 3000001, 4000000);

update public.pay_grades
set archived_at = now()
where id = '93000000-0000-0000-0000-000000000103';

insert into public.departments (id, code, name)
values
  ('93000000-0000-0000-0000-000000000201', 'T65HR', 'Task 65 Human Resources'),
  ('93000000-0000-0000-0000-000000000202', 'T65FN', 'Task 65 Finance'),
  ('93000000-0000-0000-0000-000000000203', 'T65XX', 'Task 65 Archived Department');

update public.departments
set archived_at = now()
where id = '93000000-0000-0000-0000-000000000203';

insert into public.job_titles (id, department_id, code, name)
values
  (
    '93000000-0000-0000-0000-000000000301',
    '93000000-0000-0000-0000-000000000201',
    'T65HRM',
    'Task 65 HR Manager'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

select public.create_employee_with_period(
  jsonb_build_object(
    'employee_number', 'T65-EMP',
    'legal_name', 'Task 65 Employee',
    'payment_method', 'cash',
    'employee_tax_type', 'local',
    'pct_month_worked', '100',
    'wht_rate', '6'
  ),
  jsonb_build_object(
    'start_date', current_date::text,
    'employment_type', 'full_time',
    'contract_type', 'permanent',
    'probation_status', 'not_applicable',
    'pay_grade_id', '93000000-0000-0000-0000-000000000101'
  )
);

select is(
  (
    select period.pay_grade_id
    from public.employment_periods period
    join public.employees employee on employee.id = period.employee_id
    where employee.employee_number = 'T65-EMP'
  ),
  '93000000-0000-0000-0000-000000000101'::uuid,
  'employee creation persists the selected pay grade'
);

select public.update_employee_profile(
  (select id from public.employees where employee_number = 'T65-EMP'),
  jsonb_build_object(
    'employee_number', 'T65-EMP',
    'legal_name', 'Task 65 Employee',
    'payment_method', 'cash',
    'employee_tax_type', 'local',
    'pct_month_worked', '100',
    'wht_rate', '6'
  ),
  jsonb_build_object(
    'start_date', current_date::text,
    'employment_type', 'full_time',
    'contract_type', 'permanent',
    'probation_status', 'not_applicable',
    'pay_grade_id', '93000000-0000-0000-0000-000000000102'
  )
);

select is(
  (
    select period.pay_grade_id
    from public.employment_periods period
    join public.employees employee on employee.id = period.employee_id
    where employee.employee_number = 'T65-EMP'
  ),
  '93000000-0000-0000-0000-000000000102'::uuid,
  'employee updates persist a changed pay grade without replacing the period'
);

select throws_ok(
  $$
    select public.create_employee_with_period(
      '{"employee_number":"T65-BAD-TITLE","legal_name":"Invalid Title Pair","payment_method":"cash","employee_tax_type":"local","pct_month_worked":"100","wht_rate":"6"}'::jsonb,
      '{"start_date":"2026-01-01","employment_type":"full_time","contract_type":"permanent","probation_status":"not_applicable","department_id":"93000000-0000-0000-0000-000000000202","job_title_id":"93000000-0000-0000-0000-000000000301"}'::jsonb
    )
  $$,
  '23514',
  'job title is not available for the selected department',
  'employee creation rejects a department-specific title from another department'
);

select throws_ok(
  $$
    select public.create_employee_with_period(
      '{"employee_number":"T65-BAD-DEPT","legal_name":"Archived Department","payment_method":"cash","employee_tax_type":"local","pct_month_worked":"100","wht_rate":"6"}'::jsonb,
      '{"start_date":"2026-01-01","employment_type":"full_time","contract_type":"permanent","probation_status":"not_applicable","department_id":"93000000-0000-0000-0000-000000000203"}'::jsonb
    )
  $$,
  '23514',
  'department is unavailable',
  'employee creation rejects an archived department'
);

select throws_ok(
  $$
    select public.create_employee_with_period(
      '{"employee_number":"T65-BAD-GRADE","legal_name":"Archived Pay Grade","payment_method":"cash","employee_tax_type":"local","pct_month_worked":"100","wht_rate":"6"}'::jsonb,
      '{"start_date":"2026-01-01","employment_type":"full_time","contract_type":"permanent","probation_status":"not_applicable","pay_grade_id":"93000000-0000-0000-0000-000000000103"}'::jsonb
    )
  $$,
  '23514',
  'pay grade is unavailable',
  'employee creation rejects an archived pay grade'
);

select throws_ok(
  format(
    $sql$
      select public.update_employee_profile(
        %L::uuid,
        '{"employee_number":"T65-EMP","legal_name":"Task 65 Employee","payment_method":"cash","employee_tax_type":"local","pct_month_worked":"100","wht_rate":"6"}'::jsonb,
        '{"start_date":"2026-01-01","employment_type":"full_time","contract_type":"permanent","probation_status":"not_applicable","department_id":"93000000-0000-0000-0000-000000000202","job_title_id":"93000000-0000-0000-0000-000000000301"}'::jsonb
      )
    $sql$,
    (select id from public.employees where employee_number = 'T65-EMP')
  ),
  '23514',
  'job title is not available for the selected department',
  'employee update rejects an incompatible department and job title'
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
