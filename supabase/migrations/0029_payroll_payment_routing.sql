alter table public.payroll_items
  add column payment_method text;

update public.payroll_items set payment_method = case
  when nullif(btrim(bank_name), '') is not null and nullif(btrim(account_number), '') is not null then 'bank'
  when nullif(btrim(mobile_money_number), '') is not null then 'mobile_money'
  else 'cash'
end;

alter table public.payroll_items
  alter column payment_method set default 'cash',
  alter column payment_method set not null,
  add constraint payroll_items_payment_method_check
    check (payment_method in ('bank', 'mobile_money', 'cash'));

create or replace function public.snapshot_payroll_payment_details()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select confidential.tin_number, confidential.nssf_number, confidential.bank_name,
    confidential.account_number, confidential.sort_code, confidential.mobile_money_number,
    case
      when nullif(btrim(confidential.bank_name), '') is not null
        and nullif(btrim(confidential.account_number), '') is not null then 'bank'
      when nullif(btrim(confidential.mobile_money_number), '') is not null then 'mobile_money'
      else 'cash'
    end
  into new.tin_number, new.nssf_number, new.bank_name,
    new.account_number, new.sort_code, new.mobile_money_number, new.payment_method
  from public.employee_confidential_profiles confidential
  where confidential.employee_id = new.employee_id;
  return new;
end
$$;

create or replace function public.validate_payroll_payment_routes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'draft' and new.status = 'approved' and exists (
    select 1 from public.payroll_items item
    where item.run_id = new.id and (
      (item.payment_method = 'bank' and
        (nullif(btrim(item.bank_name), '') is null or nullif(btrim(item.account_number), '') is null))
      or (item.payment_method = 'mobile_money' and
        nullif(btrim(item.mobile_money_number), '') is null)
    )
  ) then
    raise check_violation using message = 'payroll contains an incomplete payment route';
  end if;
  return new;
end
$$;

create trigger payroll_run_validate_payment_routes
before update of status on public.payroll_runs
for each row execute function public.validate_payroll_payment_routes();

create or replace function public.record_payroll_export(target_run_id uuid, target_item_id uuid, export_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.current_profile_id(); run_status text; owns_item boolean := false; item_belongs_to_run boolean := false;
begin
  if export_kind not in ('master','bank','mtn','nssf','paye','wht','payslip') then raise check_violation using message='invalid payroll export type'; end if;
  select run.status into run_status from public.payroll_runs run where run.id=target_run_id;
  if run_status is null then raise no_data_found using message='payroll run not found'; end if;
  if run_status <> 'approved' then raise check_violation using message='only approved payroll can be exported'; end if;
  if target_item_id is not null then
    select exists(select 1 from public.payroll_items item where item.id=target_item_id and item.run_id=target_run_id),
      exists(select 1 from public.payroll_items item join public.employees employee on employee.id=item.employee_id where item.id=target_item_id and item.run_id=target_run_id and employee.profile_id=auth.uid())
    into item_belongs_to_run, owns_item;
    if not item_belongs_to_run then raise check_violation using message='payroll item does not belong to the export run'; end if;
  end if;
  if not public.has_permission('payroll.export') and not (export_kind='payslip' and owns_item and public.has_permission('payroll.self_read')) then raise insufficient_privilege using message='payroll export permission is required'; end if;
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values)
  values(actor,'payroll.exported',case when target_item_id is null then 'payroll_run' else 'payroll_item' end,coalesce(target_item_id,target_run_id)::text,jsonb_build_object('run_id',target_run_id,'export_kind',export_kind));
end
$$;

comment on column public.payroll_items.payment_method is 'Immutable routing decision: complete bank details take priority, then mobile money, otherwise cash.';
comment on function public.validate_payroll_payment_routes() is 'Prevents payroll approval when the snapshotted payment route is incomplete.';

revoke all on function public.snapshot_payroll_payment_details(), public.validate_payroll_payment_routes() from public, anon, authenticated;
revoke all on function public.record_payroll_export(uuid,uuid,text) from public, anon;
grant execute on function public.record_payroll_export(uuid,uuid,text) to authenticated;
