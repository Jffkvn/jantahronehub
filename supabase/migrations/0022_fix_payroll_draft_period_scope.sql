create or replace function public.create_payroll_draft(
  target_period_start date,
  target_run_type text,
  target_source_run_id uuid,
  run_reason text,
  item_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  target_period_id_value uuid;
  run_id uuid;
  next_run_number integer;
  settings_snapshot jsonb;
  source_record record;
begin
  if not public.has_permission('payroll.prepare') then raise insufficient_privilege using message = 'payroll.prepare permission is required'; end if;
  if target_period_start <> date_trunc('month', target_period_start)::date then raise check_violation using message = 'payroll period must start on the first day of a month'; end if;
  if target_run_type not in ('regular', 'supplemental', 'correction') then raise check_violation using message = 'invalid operational payroll run type'; end if;
  if target_run_type = 'regular' and target_source_run_id is not null then raise check_violation using message = 'regular payroll cannot have a source run'; end if;
  if target_run_type in ('supplemental', 'correction') and (target_source_run_id is null or length(btrim(run_reason)) < 3) then
    raise check_violation using message = 'amendment payroll requires an approved source and reason';
  end if;

  insert into public.payroll_periods (period_start, period_end, label, created_by)
  values (target_period_start, (target_period_start + interval '1 month - 1 day')::date, to_char(target_period_start, 'FMMonth YYYY'), actor)
  on conflict (period_start) do nothing;
  select id into target_period_id_value from public.payroll_periods where period_start = target_period_start for update;

  if target_source_run_id is not null then
    select source.period_id, source.status into source_record from public.payroll_runs source where source.id = target_source_run_id for update;
    if source_record is null or source_record.status <> 'approved' or source_record.period_id <> target_period_id_value then
      raise check_violation using message = 'amendment source must be an approved run in the same period';
    end if;
  end if;

  select coalesce(max(run.run_number), 0) + 1 into next_run_number
  from public.payroll_runs run where run.period_id = target_period_id_value;
  settings_snapshot := public._current_payroll_settings();
  perform public._validate_payroll_settings(settings_snapshot);

  insert into public.payroll_runs (
    period_id, run_number, run_type, source_run_id, reason, calculation_settings, created_by, updated_by
  ) values (
    target_period_id_value, next_run_number, target_run_type, target_source_run_id, nullif(btrim(run_reason), ''),
    settings_snapshot, actor, actor
  ) returning id into run_id;

  perform public._insert_payroll_items(run_id, item_payload);
  perform public._refresh_payroll_run_totals(run_id);
  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values, reason)
  values (
    actor,
    case when target_run_type = 'regular' then 'payroll.draft_created' else 'payroll.amendment_created' end,
    'payroll_run', run_id::text,
    jsonb_build_object('period_start', target_period_start, 'run_type', target_run_type, 'source_run_id', target_source_run_id),
    nullif(btrim(run_reason), '')
  );
  return run_id;
end
$$;

revoke all on function public.create_payroll_draft(date,text,uuid,text,jsonb) from public, anon;
grant execute on function public.create_payroll_draft(date,text,uuid,text,jsonb) to authenticated;
