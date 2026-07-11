begin;

insert into auth.users(id,email) values('30000000-0000-0000-0000-000000000001','task10-hr@example.invalid');
insert into public.profiles(id,display_name) values('30000000-0000-0000-0000-000000000001','Task 10 HR');
insert into public.user_roles(profile_id,role_id) select '30000000-0000-0000-0000-000000000001',id from public.roles where key='hr_admin';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',true);

do $$
declare result jsonb;
begin
  result:=public.commit_employee_import('task10.xlsx',repeat('a',64),jsonb_build_array(jsonb_build_object(
    'row_number',2,'action','create','employee_id',null,
    'employee_data',jsonb_build_object('employee_number','TASK10-001','legal_name','Task Ten Employee','employee_tax_type','local','pct_month_worked','100','wht_rate','6'),
    'period_data',jsonb_build_object('start_date',current_date::text,'employment_type','full_time','contract_type','permanent','probation_status','not_applicable')
  )));
  if result->>'created'<>'1' then raise exception 'expected one created employee'; end if;
  if not exists(select 1 from public.employee_import_batches where source_file_hash=repeat('a',64)) then raise exception 'batch missing'; end if;
  if not exists(select 1 from public.employee_confidential_profiles confidential join public.employees employee on employee.id=confidential.employee_id where employee.employee_number='TASK10-001') then raise exception 'confidential profile missing'; end if;
end $$;

do $$
begin
  perform public.commit_employee_import('task10.xlsx',repeat('a',64),'[]'::jsonb);
  raise exception 'duplicate file hash was accepted';
exception when unique_violation then null;
end $$;

do $$
begin
  begin
    perform public.commit_employee_import('atomic.xlsx',repeat('b',64),jsonb_build_array(
      jsonb_build_object('row_number',2,'action','create','employee_data',jsonb_build_object('employee_number','TASK10-DUP','legal_name','First','employee_tax_type','local','pct_month_worked','100','wht_rate','6'),'period_data',jsonb_build_object('start_date',current_date::text,'employment_type','full_time','contract_type','permanent','probation_status','not_applicable')),
      jsonb_build_object('row_number',3,'action','create','employee_data',jsonb_build_object('employee_number','TASK10-DUP','legal_name','Second','employee_tax_type','local','pct_month_worked','100','wht_rate','6'),'period_data',jsonb_build_object('start_date',current_date::text,'employment_type','full_time','contract_type','permanent','probation_status','not_applicable'))
    ));
    raise exception 'invalid import unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  if exists(select 1 from public.employee_import_batches where source_file_hash=repeat('b',64)) then raise exception 'failed import left a batch behind'; end if;
  if exists(select 1 from public.employees where employee_number='TASK10-DUP') then raise exception 'failed import left an employee behind'; end if;
end $$;

reset role;
rollback;
