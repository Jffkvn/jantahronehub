begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select has_column('public','payroll_items','account_number','payroll items snapshot bank account');
select has_column('public','payroll_items','mobile_money_number','payroll items snapshot mobile money');
select has_trigger('public','payroll_items','payroll_item_snapshot_payment_details','payroll snapshot trigger exists');
select function_privs_are('public','snapshot_payroll_payment_details',array[]::text[],'authenticated',array[]::text[],'snapshot trigger is not client callable');
select function_privs_are('public','get_my_payslips',array[]::text[],'authenticated',array['EXECUTE']::text[],'employees may call the protected personal payslip function');
select function_privs_are('public','record_payroll_export',array['uuid','uuid','text']::text[],'authenticated',array['EXECUTE']::text[],'authenticated users call audited export function with internal permission checks');

select * from finish();
rollback;
