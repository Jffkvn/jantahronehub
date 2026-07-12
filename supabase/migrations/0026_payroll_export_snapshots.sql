alter table public.payroll_items
  add column tin_number text,
  add column nssf_number text,
  add column bank_name text,
  add column account_number text,
  add column sort_code text,
  add column mobile_money_number text;

update public.payroll_items item set
  tin_number = confidential.tin_number,
  nssf_number = confidential.nssf_number,
  bank_name = confidential.bank_name,
  account_number = confidential.account_number,
  sort_code = confidential.sort_code,
  mobile_money_number = confidential.mobile_money_number
from public.employee_confidential_profiles confidential
where confidential.employee_id = item.employee_id;

create or replace function public.snapshot_payroll_payment_details()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select confidential.tin_number, confidential.nssf_number, confidential.bank_name,
    confidential.account_number, confidential.sort_code, confidential.mobile_money_number
  into new.tin_number, new.nssf_number, new.bank_name,
    new.account_number, new.sort_code, new.mobile_money_number
  from public.employee_confidential_profiles confidential
  where confidential.employee_id = new.employee_id;
  return new;
end
$$;

create trigger payroll_item_snapshot_payment_details
before insert on public.payroll_items for each row execute function public.snapshot_payroll_payment_details();

comment on column public.payroll_items.account_number is 'Immutable payroll-run snapshot used for approved payment exports.';
comment on function public.snapshot_payroll_payment_details() is 'Snapshots statutory and payment details when a payroll item is calculated, so later employee edits cannot alter approved outputs.';

revoke all on function public.snapshot_payroll_payment_details() from public, anon, authenticated;
