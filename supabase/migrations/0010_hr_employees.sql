create extension if not exists btree_gist with schema extensions;

create table public.departments (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index departments_code_unique_idx on public.departments (upper(code));
create unique index departments_name_unique_idx on public.departments (lower(name));

create table public.job_titles (
  id uuid primary key default extensions.gen_random_uuid(),
  department_id uuid references public.departments(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index job_titles_code_unique_idx on public.job_titles (upper(code));
create unique index job_titles_name_department_unique_idx
on public.job_titles (coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index job_titles_department_id_idx on public.job_titles(department_id);

create table public.pay_grades (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  currency_code text not null default 'UGX' check (currency_code ~ '^[A-Z]{3}$'),
  minimum_gross numeric(14,2) check (minimum_gross is null or minimum_gross >= 0),
  maximum_gross numeric(14,2) check (maximum_gross is null or maximum_gross >= 0),
  description text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_gross is null or maximum_gross is null or maximum_gross >= minimum_gross)
);

create unique index pay_grades_code_unique_idx on public.pay_grades (upper(code));
create unique index pay_grades_name_unique_idx on public.pay_grades (lower(name));

create table public.employees (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  employee_number text not null check (length(btrim(employee_number)) between 1 and 40),
  legal_name text not null check (length(btrim(legal_name)) between 1 and 160),
  preferred_name text check (preferred_name is null or length(btrim(preferred_name)) between 1 and 100),
  company_email text check (company_email is null or company_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  personal_email text check (personal_email is null or personal_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  work_phone text check (work_phone is null or length(btrim(work_phone)) between 7 and 32),
  personal_phone text check (personal_phone is null or length(btrim(personal_phone)) between 7 and 32),
  date_of_birth date,
  gender text check (gender is null or gender in ('female', 'male', 'non_binary', 'prefer_not_to_say', 'other')),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  archive_reason text,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (date_of_birth is null or date_of_birth >= date '1900-01-01'),
  check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or (
      archived_at is not null
      and archived_by is not null
      and length(btrim(archive_reason)) between 3 and 500
    )
  )
);

create unique index employees_number_unique_idx on public.employees (upper(employee_number));
create unique index employees_company_email_unique_idx
on public.employees (lower(company_email)) where company_email is not null;
create index employees_legal_name_idx on public.employees (lower(legal_name));
create index employees_profile_id_idx on public.employees(profile_id) where profile_id is not null;
create index employees_unarchived_idx on public.employees(id) where archived_at is null;

create table public.employment_periods (
  id uuid primary key default extensions.gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  job_title_id uuid references public.job_titles(id) on delete restrict,
  pay_grade_id uuid references public.pay_grades(id) on delete restrict,
  start_date date not null,
  end_date date,
  employment_type text not null check (employment_type in ('full_time', 'part_time', 'casual', 'intern', 'contractor')),
  contract_type text not null check (contract_type in ('permanent', 'fixed_term', 'casual', 'internship', 'consultancy')),
  probation_end_date date,
  exit_reason text,
  exit_notes text,
  final_pay_status text not null default 'not_applicable'
    check (final_pay_status in ('not_applicable', 'pending', 'prepared', 'paid')),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (probation_end_date is null or probation_end_date >= start_date),
  check (exit_reason is null or length(btrim(exit_reason)) between 2 and 120),
  check (exit_notes is null or length(btrim(exit_notes)) <= 2000),
  constraint employment_periods_no_overlap exclude using gist (
    employee_id with =,
    daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
  )
);

alter table public.employment_periods
add constraint employment_periods_id_employee_unique unique (id, employee_id);

create index employment_periods_employee_id_idx on public.employment_periods(employee_id);
create index employment_periods_department_id_idx on public.employment_periods(department_id);
create index employment_periods_job_title_id_idx on public.employment_periods(job_title_id);
create index employment_periods_pay_grade_id_idx on public.employment_periods(pay_grade_id);
create index employment_periods_dates_idx on public.employment_periods(start_date, end_date);

create or replace function public.employee_is_active(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.employees employee
      join public.employment_periods period on period.employee_id = employee.id
      where employee.id = target_employee_id
        and employee.archived_at is null
        and period.start_date <= current_date
        and (period.end_date is null or period.end_date >= current_date)
    ),
    false
  )
$$;

insert into public.permissions (key, resource, action, description)
values
  ('employees.read', 'employees', 'read', 'Read employee records and employment history.'),
  ('employees.create', 'employees', 'create', 'Create employee and employment records.'),
  ('employees.update', 'employees', 'update', 'Update employee and employment records.'),
  ('employees.archive', 'employees', 'archive', 'Archive employee records with a reason.'),
  ('employees.manage_setup', 'employees', 'manage_setup', 'Manage departments, job titles and pay grades.'),
  ('employee_documents.read', 'employee_documents', 'read', 'Read employee document metadata.'),
  ('employee_documents.manage', 'employee_documents', 'manage', 'Create and update employee document metadata.');

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.resource in ('employees', 'employee_documents')
where role.key in ('super_admin', 'hr_admin')
on conflict do nothing;

alter table public.departments enable row level security;
alter table public.job_titles enable row level security;
alter table public.pay_grades enable row level security;
alter table public.employees enable row level security;
alter table public.employment_periods enable row level security;

create policy departments_read on public.departments
for select to authenticated
using (public.current_profile_id() is not null);
create policy departments_manage on public.departments
for all to authenticated
using (public.has_permission('employees.manage_setup'))
with check (public.has_permission('employees.manage_setup'));

create policy job_titles_read on public.job_titles
for select to authenticated
using (public.current_profile_id() is not null);
create policy job_titles_manage on public.job_titles
for all to authenticated
using (public.has_permission('employees.manage_setup'))
with check (public.has_permission('employees.manage_setup'));

create policy pay_grades_read on public.pay_grades
for select to authenticated
using (public.has_permission('employees.read'));
create policy pay_grades_manage on public.pay_grades
for all to authenticated
using (public.has_permission('employees.manage_setup'))
with check (public.has_permission('employees.manage_setup'));

create policy employees_read on public.employees
for select to authenticated
using (profile_id = auth.uid() or public.has_permission('employees.read'));
create policy employees_create on public.employees
for insert to authenticated
with check (public.has_permission('employees.create'));
create policy employees_update on public.employees
for update to authenticated
using (public.has_permission('employees.update'))
with check (public.has_permission('employees.update'));

create policy employment_periods_read on public.employment_periods
for select to authenticated
using (
  public.has_permission('employees.read')
  or exists (
    select 1 from public.employees employee
    where employee.id = employment_periods.employee_id
      and employee.profile_id = auth.uid()
  )
);
create policy employment_periods_create on public.employment_periods
for insert to authenticated
with check (public.has_permission('employees.create'));
create policy employment_periods_update on public.employment_periods
for update to authenticated
using (public.has_permission('employees.update'))
with check (public.has_permission('employees.update'));

revoke all on table public.departments from anon, authenticated;
revoke all on table public.job_titles from anon, authenticated;
revoke all on table public.pay_grades from anon, authenticated;
revoke all on table public.employees from anon, authenticated;
revoke all on table public.employment_periods from anon, authenticated;

grant select, insert, update on table public.departments to authenticated;
grant select, insert, update on table public.job_titles to authenticated;
grant select, insert, update on table public.pay_grades to authenticated;
grant select, insert, update on table public.employees to authenticated;
grant select, insert, update on table public.employment_periods to authenticated;

revoke all on function public.employee_is_active(uuid) from public, anon;
grant execute on function public.employee_is_active(uuid) to authenticated;

comment on table public.employees is
  'Canonical employee identity record. Employment state is derived from dated employment periods; records are archived, not hard deleted.';
comment on table public.employment_periods is
  'Non-overlapping employment lifecycle periods, including future-dated exits and final-pay state.';
