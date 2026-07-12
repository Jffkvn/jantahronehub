alter table public.employee_confidential_profiles
  add column payment_method text;

update public.employee_confidential_profiles set payment_method = case
  when nullif(btrim(bank_name), '') is not null and nullif(btrim(account_number), '') is not null then 'bank'
  when nullif(btrim(mobile_money_number), '') is not null then 'mobile_money'
  else 'cash'
end;

alter table public.employee_confidential_profiles
  alter column payment_method set default 'cash',
  alter column payment_method set not null,
  add constraint employee_confidential_payment_method_check
    check (payment_method in ('bank', 'mobile_money', 'cash')),
  add constraint employee_confidential_payment_details_check check (
    (payment_method <> 'bank' or (nullif(btrim(bank_name), '') is not null and nullif(btrim(account_number), '') is not null))
    and (payment_method <> 'mobile_money' or nullif(btrim(mobile_money_number), '') is not null)
  );

create or replace function public.create_employee_with_period(employee_data jsonb, period_data jsonb)
returns uuid language plpgsql set search_path='' as $$
declare actor uuid:=public.current_profile_id(); employee_id uuid;
begin
  if not public.has_permission('employees.create') then raise insufficient_privilege using message='employees.create permission is required'; end if;
  insert into public.employees(employee_number,legal_name,company_email,personal_email,work_phone,gender,date_of_birth,created_by,updated_by)
  values(employee_data->>'employee_number',employee_data->>'legal_name',nullif(employee_data->>'company_email',''),nullif(employee_data->>'personal_email',''),nullif(employee_data->>'work_phone',''),nullif(employee_data->>'gender',''),nullif(employee_data->>'date_of_birth','')::date,actor,actor) returning id into employee_id;
  insert into public.employee_confidential_profiles(employee_id,national_id,gross_salary,currency_code,custom_overtime_rate,payment_method,mobile_money_number,bank_name,account_number,sort_code,tin_number,nssf_number,employee_tax_type,pct_month_worked,wht_rate,created_by,updated_by)
  values(employee_id,nullif(employee_data->>'national_id',''),nullif(employee_data->>'gross_salary','')::numeric,coalesce(nullif(employee_data->>'currency_code',''),'UGX'),nullif(employee_data->>'custom_overtime_rate','')::numeric,coalesce(nullif(employee_data->>'payment_method',''),'cash'),nullif(employee_data->>'mobile_money_number',''),nullif(employee_data->>'bank_name',''),nullif(employee_data->>'account_number',''),nullif(employee_data->>'sort_code',''),nullif(employee_data->>'tin_number',''),nullif(employee_data->>'nssf_number',''),coalesce(nullif(employee_data->>'employee_tax_type',''),'local'),coalesce(nullif(employee_data->>'pct_month_worked','')::numeric,100),coalesce(nullif(employee_data->>'wht_rate','')::numeric,6),actor,actor);
  insert into public.employment_periods(employee_id,department_id,job_title_id,start_date,end_date,employment_type,contract_type,probation_end_date,probation_status,created_by,updated_by)
  values(employee_id,nullif(period_data->>'department_id','')::uuid,nullif(period_data->>'job_title_id','')::uuid,(period_data->>'start_date')::date,nullif(period_data->>'end_date','')::date,period_data->>'employment_type',period_data->>'contract_type',nullif(period_data->>'probation_end_date','')::date,coalesce(nullif(period_data->>'probation_status',''),'not_applicable'),actor,actor);
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values) values(actor,'employee.created','employee',employee_id::text,jsonb_build_object('employee_number',employee_data->>'employee_number'));
  return employee_id;
end $$;

create or replace function public.update_employee_profile(target_employee_id uuid,employee_data jsonb,period_data jsonb)
returns void language plpgsql set search_path='' as $$
declare actor uuid:=public.current_profile_id(); previous_employee jsonb; current_period_id uuid;
begin
  if not public.has_permission('employees.update') then raise insufficient_privilege using message='employees.update permission is required'; end if;
  select to_jsonb(employee) into previous_employee from public.employees employee where id=target_employee_id for update;
  if previous_employee is null then raise exception using errcode='P0002',message='employee not found'; end if;
  update public.employees set employee_number=employee_data->>'employee_number',legal_name=employee_data->>'legal_name',company_email=nullif(employee_data->>'company_email',''),personal_email=nullif(employee_data->>'personal_email',''),work_phone=nullif(employee_data->>'work_phone',''),gender=nullif(employee_data->>'gender',''),date_of_birth=nullif(employee_data->>'date_of_birth','')::date,updated_by=actor,updated_at=now() where id=target_employee_id;
  update public.employee_confidential_profiles set national_id=nullif(employee_data->>'national_id',''),gross_salary=nullif(employee_data->>'gross_salary','')::numeric,currency_code=coalesce(nullif(employee_data->>'currency_code',''),'UGX'),custom_overtime_rate=nullif(employee_data->>'custom_overtime_rate','')::numeric,payment_method=coalesce(nullif(employee_data->>'payment_method',''),'cash'),mobile_money_number=nullif(employee_data->>'mobile_money_number',''),bank_name=nullif(employee_data->>'bank_name',''),account_number=nullif(employee_data->>'account_number',''),sort_code=nullif(employee_data->>'sort_code',''),tin_number=nullif(employee_data->>'tin_number',''),nssf_number=nullif(employee_data->>'nssf_number',''),employee_tax_type=employee_data->>'employee_tax_type',pct_month_worked=(employee_data->>'pct_month_worked')::numeric,wht_rate=(employee_data->>'wht_rate')::numeric,updated_by=actor,updated_at=now() where employee_id=target_employee_id;
  select id into current_period_id from public.employment_periods where employee_id=target_employee_id order by start_date desc limit 1 for update;
  update public.employment_periods set department_id=nullif(period_data->>'department_id','')::uuid,job_title_id=nullif(period_data->>'job_title_id','')::uuid,start_date=(period_data->>'start_date')::date,end_date=nullif(period_data->>'end_date','')::date,employment_type=period_data->>'employment_type',contract_type=period_data->>'contract_type',probation_end_date=nullif(period_data->>'probation_end_date','')::date,probation_status=period_data->>'probation_status',updated_by=actor,updated_at=now() where id=current_period_id;
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values) values(actor,'employee.updated','employee',target_employee_id::text,previous_employee,jsonb_build_object('employee_number',employee_data->>'employee_number','legal_name',employee_data->>'legal_name'));
end $$;

create or replace function public.snapshot_payroll_payment_details()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select confidential.tin_number, confidential.nssf_number, confidential.payment_method,
    confidential.bank_name, confidential.account_number, confidential.sort_code,
    confidential.mobile_money_number
  into new.tin_number, new.nssf_number, new.payment_method,
    new.bank_name, new.account_number, new.sort_code, new.mobile_money_number
  from public.employee_confidential_profiles confidential
  where confidential.employee_id = new.employee_id;
  return new;
end
$$;

comment on column public.employee_confidential_profiles.payment_method is 'HR-selected payment route snapshotted into each payroll item.';

revoke all on function public.create_employee_with_period(jsonb,jsonb), public.update_employee_profile(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_employee_with_period(jsonb,jsonb), public.update_employee_profile(uuid,jsonb,jsonb) to authenticated;
revoke all on function public.snapshot_payroll_payment_details() from public, anon, authenticated;
