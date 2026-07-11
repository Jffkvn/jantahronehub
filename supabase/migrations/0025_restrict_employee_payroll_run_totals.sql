drop policy payroll_runs_read on public.payroll_runs;

create policy payroll_runs_read on public.payroll_runs
for select to authenticated
using (public.has_permission('payroll.read'));

comment on policy payroll_runs_read on public.payroll_runs is
  'Run-level company totals are restricted to payroll readers. Employees access only their own approved item and safe period metadata.';
