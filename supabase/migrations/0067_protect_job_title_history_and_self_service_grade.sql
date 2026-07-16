-- Preserve the meaning of employment history when HR Setup records change, and
-- expose only the signed-in employee's grade name to self-service. Pay ranges
-- and other employees' classifications remain behind HR permissions.

create or replace function public.prevent_referenced_job_title_department_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.department_id is distinct from old.department_id
    and exists (
      select 1
      from public.employment_periods period
      where period.job_title_id = old.id
    )
  then
    raise foreign_key_violation using
      message = 'job title department cannot change while employee history references it';
  end if;

  return new;
end
$$;

revoke all on function public.prevent_referenced_job_title_department_change()
from public, anon, authenticated;

drop trigger if exists job_titles_preserve_referenced_department
on public.job_titles;

create trigger job_titles_preserve_referenced_department
before update of department_id
on public.job_titles
for each row
execute function public.prevent_referenced_job_title_department_change();

comment on function public.prevent_referenced_job_title_department_change() is
  'Prevents department changes from silently rewriting current or historical employee job-title meaning.';

create or replace function public.get_my_pay_grade_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select grade.name
  from public.employees employee
  join public.employment_periods period
    on period.employee_id = employee.id
  join public.pay_grades grade
    on grade.id = period.pay_grade_id
  where employee.profile_id = public.current_profile_id()
    and employee.archived_at is null
  order by
    case
      when period.start_date <= current_date
        and (period.end_date is null or period.end_date >= current_date)
      then 0
      when period.start_date <= current_date then 1
      else 2
    end,
    period.start_date desc
  limit 1
$$;

revoke all on function public.get_my_pay_grade_name()
from public, anon, authenticated;
grant execute on function public.get_my_pay_grade_name() to authenticated;

comment on function public.get_my_pay_grade_name() is
  'Returns only the signed-in active employee own current or latest pay-grade name, without exposing grade ranges.';
