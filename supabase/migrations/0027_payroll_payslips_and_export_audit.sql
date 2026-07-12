create or replace function public.get_my_payslips()
returns table(payload jsonb)
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', run.id, 'period_id', run.period_id, 'run_number', run.run_number,
    'run_type', run.run_type, 'source_run_id', run.source_run_id, 'status', run.status,
    'reason', run.reason, 'total_gross', item.taxable_gross, 'total_paye', item.paye,
    'total_nssf_employee', item.nssf_employee, 'total_nssf_employer', item.nssf_employer,
    'total_wht', item.wht, 'total_deductions', item.total_deductions, 'total_net', item.net_pay,
    'approved_at', run.approved_at,
    'payroll_periods', jsonb_build_object('period_start', period.period_start, 'period_end', period.period_end, 'label', period.label),
    'payroll_items', jsonb_build_array(to_jsonb(item) || jsonb_build_object('payroll_line_items', coalesce(lines.payload, '[]'::jsonb))),
    'payroll_payments', '[]'::jsonb
  )
  from public.payroll_runs run
  join public.payroll_periods period on period.id = run.period_id
  join public.payroll_items item on item.run_id = run.id
  join public.employees employee on employee.id = item.employee_id and employee.profile_id = auth.uid()
  left join lateral (
    select jsonb_agg(to_jsonb(line) order by line.created_at) as payload
    from public.payroll_line_items line where line.payroll_item_id = item.id
  ) lines on true
  where run.status = 'approved' and public.has_permission('payroll.self_read')
  order by period.period_start desc, run.run_number desc
$$;

create or replace function public.record_payroll_export(target_run_id uuid, target_item_id uuid, export_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id(); run_status text; owns_item boolean := false;
begin
  if export_kind not in ('master','bank','mtn','nssf','paye','wht','payslip') then raise check_violation using message='invalid payroll export type'; end if;
  select run.status into run_status from public.payroll_runs run where run.id=target_run_id;
  if run_status is null then raise no_data_found using message='payroll run not found'; end if;
  if run_status <> 'approved' then raise check_violation using message='only approved payroll can be exported'; end if;
  if target_item_id is not null then
    select exists(select 1 from public.payroll_items item join public.employees employee on employee.id=item.employee_id where item.id=target_item_id and item.run_id=target_run_id and employee.profile_id=auth.uid()) into owns_item;
  end if;
  if not public.has_permission('payroll.export') and not (export_kind='payslip' and owns_item and public.has_permission('payroll.self_read')) then raise insufficient_privilege using message='payroll export permission is required'; end if;
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values)
  values(actor,'payroll.exported',case when target_item_id is null then 'payroll_run' else 'payroll_item' end,coalesce(target_item_id,target_run_id)::text,jsonb_build_object('run_id',target_run_id,'export_kind',export_kind));
end
$$;

revoke all on function public.get_my_payslips(), public.record_payroll_export(uuid,uuid,text) from public, anon;
grant execute on function public.get_my_payslips(), public.record_payroll_export(uuid,uuid,text) to authenticated;
comment on function public.get_my_payslips() is 'Returns only the signed-in employee own approved payslip snapshots without exposing company payroll totals.';
comment on function public.record_payroll_export(uuid,uuid,text) is 'Audits privileged payroll exports and personal payslip downloads without exposing or mutating payroll.';
