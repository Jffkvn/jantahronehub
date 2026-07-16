-- Migration 0068 introduced the curated governance snapshot. Preserve that
-- deployed implementation as an internal helper and narrow the public contract
-- so executive reporting never exposes draft payroll totals.

alter function public.get_governance_report_snapshot()
rename to _get_governance_report_snapshot_unfiltered_0068;

revoke all on function public._get_governance_report_snapshot_unfiltered_0068()
from public, anon, authenticated;

comment on function public._get_governance_report_snapshot_unfiltered_0068() is
  'Internal migration helper. Direct execution is revoked; use get_governance_report_snapshot().';

create function public.get_governance_report_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  approved_payroll_summaries jsonb;
begin
  if not public.has_permission('reports.view') then
    raise insufficient_privilege using message = 'reports.view permission is required';
  end if;

  snapshot := public._get_governance_report_snapshot_unfiltered_0068();

  select coalesce(
    jsonb_agg(summary.value order by summary.ordinality),
    '[]'::jsonb
  )
  into approved_payroll_summaries
  from jsonb_array_elements(snapshot -> 'payrollSummaries')
    with ordinality as summary(value, ordinality)
  where summary.value ->> 'status' = 'approved';

  return jsonb_set(
    snapshot,
    '{payrollSummaries}',
    approved_payroll_summaries,
    true
  );
end
$$;

revoke all on function public.get_governance_report_snapshot()
from public, anon, authenticated;
grant execute on function public.get_governance_report_snapshot() to authenticated;

comment on function public.get_governance_report_snapshot() is
  'Returns curated company-wide governance data and approved payroll totals to reports.view users.';
