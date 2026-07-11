create or replace function public.create_payroll_amendment(
  source_run_id uuid,
  amendment_type text,
  amendment_reason text,
  item_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare period_start date;
begin
  if not public.has_permission('payroll.prepare') then raise insufficient_privilege using message = 'payroll.prepare permission is required'; end if;
  if amendment_type not in ('supplemental', 'correction') then raise check_violation using message = 'invalid payroll amendment type'; end if;
  select period.period_start into period_start
  from public.payroll_runs run join public.payroll_periods period on period.id = run.period_id
  where run.id = create_payroll_amendment.source_run_id and run.status = 'approved';
  if period_start is null then raise check_violation using message = 'payroll amendment requires an approved source run'; end if;
  return public.create_payroll_draft(
    period_start,
    create_payroll_amendment.amendment_type,
    create_payroll_amendment.source_run_id,
    create_payroll_amendment.amendment_reason,
    create_payroll_amendment.item_payload
  );
end
$$;

revoke all on function public.create_payroll_amendment(uuid,text,text,jsonb) from public, anon;
grant execute on function public.create_payroll_amendment(uuid,text,text,jsonb) to authenticated;
