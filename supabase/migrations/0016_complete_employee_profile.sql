create table public.employee_confidential_profiles (
  employee_id uuid primary key references public.employees(id) on delete restrict,
  national_id text check (national_id is null or length(btrim(national_id)) between 3 and 80),
  gross_salary numeric(14,2) check (gross_salary is null or gross_salary >= 0),
  currency_code text not null default 'UGX' check (currency_code ~ '^[A-Z]{3}$'),
  custom_overtime_rate numeric(14,2) check (custom_overtime_rate is null or custom_overtime_rate >= 0),
  mobile_money_number text check (mobile_money_number is null or length(btrim(mobile_money_number)) between 7 and 32),
  bank_name text check (bank_name is null or length(btrim(bank_name)) between 2 and 120),
  account_number text check (account_number is null or length(btrim(account_number)) between 3 and 80),
  sort_code text check (sort_code is null or length(btrim(sort_code)) between 2 and 40),
  tin_number text check (tin_number is null or length(btrim(tin_number)) between 3 and 40),
  nssf_number text check (nssf_number is null or length(btrim(nssf_number)) between 3 and 40),
  employee_tax_type text not null default 'local' check (employee_tax_type in ('local','global','contractor','exempt')),
  pct_month_worked numeric(5,2) not null default 100 check (pct_month_worked between 0 and 100),
  wht_rate numeric(5,2) not null default 6 check (wht_rate between 0 and 100),
  created_by uuid references public.profiles(id) on delete restrict, created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict, updated_at timestamptz not null default now()
);
create unique index employee_confidential_national_id_idx on public.employee_confidential_profiles(upper(national_id)) where national_id is not null;
alter table public.employee_confidential_profiles enable row level security;
create policy employee_confidential_read on public.employee_confidential_profiles for select to authenticated using (public.has_permission('employees.read'));
create policy employee_confidential_create on public.employee_confidential_profiles for insert to authenticated with check (public.has_permission('employees.create'));
create policy employee_confidential_update on public.employee_confidential_profiles for update to authenticated using (public.has_permission('employees.update')) with check (public.has_permission('employees.update'));
revoke all on table public.employee_confidential_profiles from anon,authenticated;
grant select,insert,update on table public.employee_confidential_profiles to authenticated;

alter table public.employment_periods add column probation_status text not null default 'not_applicable'
  check (probation_status in ('not_applicable','on_probation','passed','extended','failed'));

create or replace function public.create_employee_with_period(employee_data jsonb, period_data jsonb)
returns uuid language plpgsql set search_path='' as $$
declare actor uuid:=public.current_profile_id(); employee_id uuid;
begin
  if not public.has_permission('employees.create') then raise insufficient_privilege using message='employees.create permission is required'; end if;
  insert into public.employees(employee_number,legal_name,company_email,personal_email,work_phone,gender,date_of_birth,created_by,updated_by)
  values(employee_data->>'employee_number',employee_data->>'legal_name',nullif(employee_data->>'company_email',''),nullif(employee_data->>'personal_email',''),nullif(employee_data->>'work_phone',''),nullif(employee_data->>'gender',''),nullif(employee_data->>'date_of_birth','')::date,actor,actor) returning id into employee_id;
  insert into public.employee_confidential_profiles(employee_id,national_id,gross_salary,currency_code,custom_overtime_rate,mobile_money_number,bank_name,account_number,sort_code,tin_number,nssf_number,employee_tax_type,pct_month_worked,wht_rate,created_by,updated_by)
  values(employee_id,nullif(employee_data->>'national_id',''),nullif(employee_data->>'gross_salary','')::numeric,coalesce(nullif(employee_data->>'currency_code',''),'UGX'),nullif(employee_data->>'custom_overtime_rate','')::numeric,nullif(employee_data->>'mobile_money_number',''),nullif(employee_data->>'bank_name',''),nullif(employee_data->>'account_number',''),nullif(employee_data->>'sort_code',''),nullif(employee_data->>'tin_number',''),nullif(employee_data->>'nssf_number',''),coalesce(nullif(employee_data->>'employee_tax_type',''),'local'),coalesce(nullif(employee_data->>'pct_month_worked','')::numeric,100),coalesce(nullif(employee_data->>'wht_rate','')::numeric,6),actor,actor);
  insert into public.employment_periods(employee_id,department_id,job_title_id,start_date,end_date,employment_type,contract_type,probation_end_date,probation_status,created_by,updated_by)
  values(employee_id,nullif(period_data->>'department_id','')::uuid,nullif(period_data->>'job_title_id','')::uuid,(period_data->>'start_date')::date,nullif(period_data->>'end_date','')::date,period_data->>'employment_type',period_data->>'contract_type',nullif(period_data->>'probation_end_date','')::date,coalesce(nullif(period_data->>'probation_status',''),'not_applicable'),actor,actor);
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,new_values) values(actor,'employee.created','employee',employee_id::text,jsonb_build_object('employee_number',employee_data->>'employee_number'));
  return employee_id;
end $$;

drop function public.update_employee_profile(uuid,jsonb);
create function public.update_employee_profile(target_employee_id uuid,employee_data jsonb,period_data jsonb)
returns void language plpgsql set search_path='' as $$
declare actor uuid:=public.current_profile_id(); previous_employee jsonb; current_period_id uuid;
begin
  if not public.has_permission('employees.update') then raise insufficient_privilege using message='employees.update permission is required'; end if;
  select to_jsonb(employee) into previous_employee from public.employees employee where id=target_employee_id for update;
  if previous_employee is null then raise exception using errcode='P0002',message='employee not found'; end if;
  update public.employees set employee_number=employee_data->>'employee_number',legal_name=employee_data->>'legal_name',company_email=nullif(employee_data->>'company_email',''),personal_email=nullif(employee_data->>'personal_email',''),work_phone=nullif(employee_data->>'work_phone',''),gender=nullif(employee_data->>'gender',''),date_of_birth=nullif(employee_data->>'date_of_birth','')::date,updated_by=actor,updated_at=now() where id=target_employee_id;
  update public.employee_confidential_profiles set national_id=nullif(employee_data->>'national_id',''),gross_salary=nullif(employee_data->>'gross_salary','')::numeric,currency_code=coalesce(nullif(employee_data->>'currency_code',''),'UGX'),custom_overtime_rate=nullif(employee_data->>'custom_overtime_rate','')::numeric,mobile_money_number=nullif(employee_data->>'mobile_money_number',''),bank_name=nullif(employee_data->>'bank_name',''),account_number=nullif(employee_data->>'account_number',''),sort_code=nullif(employee_data->>'sort_code',''),tin_number=nullif(employee_data->>'tin_number',''),nssf_number=nullif(employee_data->>'nssf_number',''),employee_tax_type=employee_data->>'employee_tax_type',pct_month_worked=(employee_data->>'pct_month_worked')::numeric,wht_rate=(employee_data->>'wht_rate')::numeric,updated_by=actor,updated_at=now() where employee_id=target_employee_id;
  select id into current_period_id from public.employment_periods where employee_id=target_employee_id order by start_date desc limit 1 for update;
  update public.employment_periods set department_id=nullif(period_data->>'department_id','')::uuid,job_title_id=nullif(period_data->>'job_title_id','')::uuid,start_date=(period_data->>'start_date')::date,end_date=nullif(period_data->>'end_date','')::date,employment_type=period_data->>'employment_type',contract_type=period_data->>'contract_type',probation_end_date=nullif(period_data->>'probation_end_date','')::date,probation_status=period_data->>'probation_status',updated_by=actor,updated_at=now() where id=current_period_id;
  insert into public.audit_events(actor_profile_id,event_type,entity_type,entity_id,previous_values,new_values) values(actor,'employee.updated','employee',target_employee_id::text,previous_employee,jsonb_build_object('employee_number',employee_data->>'employee_number','legal_name',employee_data->>'legal_name'));
end $$;

revoke all on function public.update_employee_profile(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.update_employee_profile(uuid,jsonb,jsonb) to authenticated;
comment on table public.employee_confidential_profiles is 'HR/payroll-only national ID, compensation, payment and statutory details.';
