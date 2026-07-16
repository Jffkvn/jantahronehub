-- Employment assignments reference configurable HR setup records. Foreign keys
-- prove that an ID exists, but they cannot prove that the record is still active
-- or that a department-specific title belongs to the selected department.

create or replace function public.enforce_employee_setup_assignment_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.department_id is not null and not exists (
    select 1
    from public.departments department
    where department.id = new.department_id
      and department.archived_at is null
  ) then
    raise check_violation using message = 'department is unavailable';
  end if;

  -- A company-wide title has no department and is valid everywhere. A title
  -- owned by a department must match the employee's selected department.
  if new.job_title_id is not null and not exists (
    select 1
    from public.job_titles title
    where title.id = new.job_title_id
      and title.archived_at is null
      and (title.department_id is null or title.department_id = new.department_id)
  ) then
    raise check_violation using message = 'job title is not available for the selected department';
  end if;

  if new.pay_grade_id is not null and not exists (
    select 1
    from public.pay_grades grade
    where grade.id = new.pay_grade_id
      and grade.archived_at is null
  ) then
    raise check_violation using message = 'pay grade is unavailable';
  end if;

  return new;
end
$$;

revoke all on function public.enforce_employee_setup_assignment_integrity() from public, anon, authenticated;

drop trigger if exists employment_periods_enforce_setup_integrity on public.employment_periods;
create trigger employment_periods_enforce_setup_integrity
before insert or update of department_id, job_title_id, pay_grade_id
on public.employment_periods
for each row
execute function public.enforce_employee_setup_assignment_integrity();

comment on function public.enforce_employee_setup_assignment_integrity() is
  'Rejects archived HR setup records and department/job-title mismatches on every employment-period write path.';
