create or replace function public.update_employee_profile(target_employee_id uuid,employee_data jsonb,period_data jsonb)
returns void language plpgsql set search_path='' as $$
declare
  actor uuid:=public.current_profile_id();
  previous_employee jsonb;
  previous_payment jsonb;
  current_period_id uuid;
  new_payment_last4 text;
begin
  if not public.has_permission('employees.update') then raise insufficient_privilege using message='employees.update permission is required'; end if;
  select to_jsonb(employee) into previous_employee from public.employees employee where id=target_employee_id for update;
  if previous_employee is null then raise exception using errcode='P0002',message='employee not found'; end if;

  select jsonb_build_object(
    'payment_method', confidential.payment_method,
    'payment_identifier_last4', case confidential.payment_method
      when 'bank' then right(confidential.account_number, 4)
      when 'mobile_money' then right(confidential.mobile_money_number, 4)
      else null
    end
  ) into previous_payment
  from public.employee_confidential_profiles confidential
  where confidential.employee_id=target_employee_id
  for update;

  update public.employees set employee_number=employee_data->>'employee_number',legal_name=employee_data->>'legal_name',company_email=nullif(employee_data->>'company_email',''),personal_email=nullif(employee_data->>'personal_email',''),work_phone=nullif(employee_data->>'work_phone',''),gender=nullif(employee_data->>'gender',''),date_of_birth=nullif(employee_data->>'date_of_birth','')::date,updated_by=actor,updated_at=now() where id=target_employee_id;
  update public.employee_confidential_profiles set national_id=nullif(employee_data->>'national_id',''),gross_salary=nullif(employee_data->>'gross_salary','')::numeric,currency_code=coalesce(nullif(employee_data->>'currency_code',''),'UGX'),custom_overtime_rate=nullif(employee_data->>'custom_overtime_rate','')::numeric,payment_method=coalesce(nullif(employee_data->>'payment_method',''),'cash'),mobile_money_number=nullif(employee_data->>'mobile_money_number',''),bank_name=nullif(employee_data->>'bank_name',''),account_number=nullif(employee_data->>'account_number',''),sort_code=nullif(employee_data->>'sort_code',''),tin_number=nullif(employee_data->>'tin_number',''),nssf_number=nullif(employee_data->>'nssf_number',''),employee_tax_type=employee_data->>'employee_tax_type',pct_month_worked=(employee_data->>'pct_month_worked')::numeric,wht_rate=(employee_data->>'wht_rate')::numeric,updated_by=actor,updated_at=now() where employee_id=target_employee_id;
  select id into current_period_id from public.employment_periods where employee_id=target_employee_id order by start_date desc limit 1 for update;
  update public.employment_periods set department_id=nullif(period_data->>'department_id','')::uuid,job_title_id=nullif(period_data->>'job_title_id','')::uuid,start_date=(period_data->>'start_date')::date,end_date=nullif(period_data->>'end_date','')::date,employment_type=period_data->>'employment_type',contract_type=period_data->>'contract_type',probation_end_date=nullif(period_data->>'probation_end_date','')::date,probation_status=period_data->>'probation_status',updated_by=actor,updated_at=now() where id=current_period_id;

  new_payment_last4 := case employee_data->>'payment_method'
    when 'bank' then right(employee_data->>'account_number', 4)
    when 'mobile_money' then right(employee_data->>'mobile_money_number', 4)
    else null
  end;
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values)
  values(
    actor,
    'employee.updated',
    'employee',
    target_employee_id::text,
    previous_employee || coalesce(previous_payment, '{}'::jsonb),
    jsonb_build_object(
      'employee_number',employee_data->>'employee_number',
      'legal_name',employee_data->>'legal_name',
      'payment_method',employee_data->>'payment_method',
      'payment_identifier_last4',new_payment_last4
    )
  );
end $$;

comment on function public.update_employee_profile(uuid,jsonb,jsonb) is 'Atomically updates employee, employment and confidential payment details while auditing only masked payment identifiers.';
revoke all on function public.update_employee_profile(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.update_employee_profile(uuid,jsonb,jsonb) to authenticated;
