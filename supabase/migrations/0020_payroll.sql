insert into public.permissions (key, resource, action, description)
values
  ('payroll.read', 'payroll', 'read', 'Read all payroll periods, runs and employee results.'),
  ('payroll.self_read', 'payroll', 'self_read', 'Read personal approved payroll results.'),
  ('payroll.prepare', 'payroll', 'prepare', 'Create and revise draft payroll runs.'),
  ('payroll.approve', 'payroll', 'approve', 'Give final HR approval to payroll runs.'),
  ('payroll.export', 'payroll', 'export', 'Export approved payroll and payment files.'),
  ('payroll.record_payment', 'payroll', 'record_payment', 'Record CFO payroll payment execution.'),
  ('payroll.manage_settings', 'payroll', 'manage_settings', 'Manage statutory and payroll calculation settings.');

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on (
  role.key = 'super_admin'
  or (role.key = 'hr_admin' and permission.key in (
    'payroll.read', 'payroll.prepare', 'payroll.approve', 'payroll.export', 'payroll.manage_settings'
  ))
  or (role.key = 'cfo' and permission.key in (
    'payroll.read', 'payroll.export', 'payroll.record_payment'
  ))
  or (role.key = 'employee' and permission.key = 'payroll.self_read')
)
where permission.resource = 'payroll'
on conflict do nothing;

alter table public.employee_confidential_profiles
add column nssf_applicable boolean;

update public.employee_confidential_profiles
set nssf_applicable = employee_tax_type = 'local'
where nssf_applicable is null;

alter table public.employee_confidential_profiles
alter column nssf_applicable set default true,
alter column nssf_applicable set not null;

comment on column public.employee_confidential_profiles.nssf_applicable is
  'Independent NSSF applicability flag. It is not inferred solely from local/global tax labels.';

create table public.payroll_settings (
  singleton boolean primary key default true check (singleton),
  currency_code text not null default 'UGX' check (currency_code ~ '^[A-Z]{3}$'),
  paye_bands jsonb not null check (jsonb_typeof(paye_bands) = 'array' and jsonb_array_length(paye_bands) > 0),
  surcharge_threshold numeric(16,2) check (surcharge_threshold is null or surcharge_threshold >= 0),
  surcharge_rate_percent numeric(7,4) not null check (surcharge_rate_percent between 0 and 100),
  nssf_employee_rate_percent numeric(7,4) not null check (nssf_employee_rate_percent between 0 and 100),
  nssf_employer_rate_percent numeric(7,4) not null check (nssf_employer_rate_percent between 0 and 100),
  overtime_multiplier numeric(8,4) not null check (overtime_multiplier >= 0),
  standard_monthly_hours numeric(8,2) not null check (standard_monthly_hours > 0),
  default_wht_rate_percent numeric(7,4) not null check (default_wht_rate_percent between 0 and 100),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

insert into public.payroll_settings (
  singleton, paye_bands, surcharge_threshold, surcharge_rate_percent,
  nssf_employee_rate_percent, nssf_employer_rate_percent,
  overtime_multiplier, standard_monthly_hours, default_wht_rate_percent
)
values (
  true,
  '[{"min":0,"max":235000,"ratePercent":0},{"min":235000,"max":335000,"ratePercent":10},{"min":335000,"max":410000,"ratePercent":20},{"min":410000,"max":null,"ratePercent":30}]'::jsonb,
  10000000, 10, 5, 10, 1.5, 173.33, 6
);

create table public.payroll_periods (
  id uuid primary key default extensions.gen_random_uuid(),
  period_start date not null unique,
  period_end date not null,
  label text not null check (length(btrim(label)) between 3 and 40),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (period_start = date_trunc('month', period_start)::date),
  check (period_end = (period_start + interval '1 month - 1 day')::date)
);

create table public.payroll_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  period_id uuid not null references public.payroll_periods(id) on delete restrict,
  run_number integer not null check (run_number > 0),
  run_type text not null check (run_type in ('regular', 'supplemental', 'correction', 'historical')),
  source_run_id uuid references public.payroll_runs(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  reason text,
  calculation_settings jsonb not null check (jsonb_typeof(calculation_settings) = 'object'),
  total_gross numeric(16,2) not null default 0 check (total_gross >= 0),
  total_paye numeric(16,2) not null default 0 check (total_paye >= 0),
  total_nssf_employee numeric(16,2) not null default 0 check (total_nssf_employee >= 0),
  total_nssf_employer numeric(16,2) not null default 0 check (total_nssf_employer >= 0),
  total_wht numeric(16,2) not null default 0 check (total_wht >= 0),
  total_deductions numeric(16,2) not null default 0 check (total_deductions >= 0),
  total_net numeric(16,2) not null default 0 check (total_net >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  unique (period_id, run_number),
  check ((run_type in ('regular', 'historical') and source_run_id is null) or (run_type in ('supplemental', 'correction') and source_run_id is not null)),
  check ((status = 'draft' and approved_by is null and approved_at is null) or (status = 'approved' and approved_by is not null and approved_at is not null))
);

create unique index payroll_runs_base_period_idx
on public.payroll_runs(period_id)
where run_type in ('regular', 'historical');
create index payroll_runs_period_idx on public.payroll_runs(period_id, run_number);
create index payroll_runs_source_idx on public.payroll_runs(source_run_id) where source_run_id is not null;

create table public.payroll_items (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  employee_number text not null,
  employee_name text not null,
  tax_treatment text not null check (tax_treatment in ('local', 'global', 'contractor', 'exempt')),
  nssf_applicable boolean not null,
  percent_of_month_worked numeric(7,4) not null check (percent_of_month_worked between 0 and 100),
  contractual_gross numeric(16,2) not null check (contractual_gross >= 0),
  prorated_gross numeric(16,2) not null check (prorated_gross >= 0),
  overtime_hours numeric(10,2) not null default 0 check (overtime_hours >= 0),
  overtime_rate numeric(16,2) not null default 0 check (overtime_rate >= 0),
  overtime_pay numeric(16,2) not null default 0 check (overtime_pay >= 0),
  allowances numeric(16,2) not null default 0 check (allowances >= 0),
  taxable_gross numeric(16,2) not null check (taxable_gross >= 0),
  paye numeric(16,2) not null default 0 check (paye >= 0),
  nssf_employee numeric(16,2) not null default 0 check (nssf_employee >= 0),
  nssf_employer numeric(16,2) not null default 0 check (nssf_employer >= 0),
  wht numeric(16,2) not null default 0 check (wht >= 0),
  salary_advance_deduction numeric(16,2) not null default 0 check (salary_advance_deduction >= 0),
  other_deductions numeric(16,2) not null default 0 check (other_deductions >= 0),
  total_deductions numeric(16,2) not null check (total_deductions >= 0),
  net_pay numeric(16,2) not null check (net_pay >= 0),
  created_at timestamptz not null default now(),
  unique (run_id, employee_id),
  check (taxable_gross = prorated_gross + overtime_pay + allowances),
  check (total_deductions = paye + nssf_employee + wht + salary_advance_deduction + other_deductions),
  check (net_pay = taxable_gross - total_deductions)
);

create index payroll_items_employee_idx on public.payroll_items(employee_id, run_id);

create table public.payroll_line_items (
  id uuid primary key default extensions.gen_random_uuid(),
  payroll_item_id uuid not null references public.payroll_items(id) on delete cascade,
  kind text not null check (kind in ('allowance', 'salary_advance', 'deduction')),
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{1,30}$'),
  description text not null check (length(btrim(description)) between 2 and 160),
  amount numeric(16,2) not null check (amount > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (payroll_item_id, kind, code)
);

create index payroll_line_items_item_idx on public.payroll_line_items(payroll_item_id);

create table public.payroll_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null unique references public.payroll_runs(id) on delete restrict,
  paid_on date not null,
  amount numeric(16,2) not null check (amount >= 0),
  payment_reference text not null check (length(btrim(payment_reference)) between 3 and 120),
  payment_method text not null check (payment_method in ('bank', 'mobile_money', 'cash', 'other')),
  proof_path text,
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create index payroll_payments_recorded_idx on public.payroll_payments(recorded_at desc);

create or replace function public.can_read_own_payroll_run(target_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('payroll.self_read') and exists (
    select 1
    from public.payroll_runs run
    join public.payroll_items item on item.run_id = run.id
    join public.employees employee on employee.id = item.employee_id
    where run.id = target_run_id
      and run.status = 'approved'
      and employee.profile_id = auth.uid()
  )
$$;

create or replace function public.can_read_own_payroll_period(target_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('payroll.self_read') and exists (
    select 1
    from public.payroll_runs run
    join public.payroll_items item on item.run_id = run.id
    join public.employees employee on employee.id = item.employee_id
    where run.period_id = target_period_id
      and run.status = 'approved'
      and employee.profile_id = auth.uid()
  )
$$;

alter table public.payroll_settings enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;
alter table public.payroll_line_items enable row level security;
alter table public.payroll_payments enable row level security;

create policy payroll_settings_read on public.payroll_settings
for select to authenticated using (public.has_permission('payroll.read'));
create policy payroll_periods_read on public.payroll_periods
for select to authenticated using (public.has_permission('payroll.read') or public.can_read_own_payroll_period(id));
create policy payroll_runs_read on public.payroll_runs
for select to authenticated using (public.has_permission('payroll.read'));
create policy payroll_items_read on public.payroll_items
for select to authenticated using (
  public.has_permission('payroll.read')
  or (
    public.can_read_own_payroll_run(run_id)
    and exists (select 1 from public.employees employee where employee.id = employee_id and employee.profile_id = auth.uid())
  )
);
create policy payroll_line_items_read on public.payroll_line_items
for select to authenticated using (
  public.has_permission('payroll.read')
  or exists (
    select 1
    from public.payroll_items item
    join public.employees employee on employee.id = item.employee_id
    where item.id = payroll_item_id
      and employee.profile_id = auth.uid()
      and public.can_read_own_payroll_run(item.run_id)
  )
);
create policy payroll_payments_read on public.payroll_payments
for select to authenticated using (public.has_permission('payroll.read'));

revoke all on table public.payroll_settings, public.payroll_periods, public.payroll_runs,
  public.payroll_items, public.payroll_line_items, public.payroll_payments from anon, authenticated;
grant select on table public.payroll_settings, public.payroll_periods, public.payroll_runs,
  public.payroll_items, public.payroll_line_items, public.payroll_payments to authenticated;

create or replace function public.prevent_approved_payroll_run_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'approved' then
    raise exception using errcode = '55000', message = 'approved payroll runs are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create or replace function public.prevent_approved_payroll_item_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare target_run_id uuid;
begin
  target_run_id := case when tg_op = 'DELETE' then old.run_id else new.run_id end;
  if exists (select 1 from public.payroll_runs run where run.id = target_run_id and run.status = 'approved') then
    raise exception using errcode = '55000', message = 'approved payroll items are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create or replace function public.prevent_approved_payroll_line_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare target_item_id uuid;
begin
  target_item_id := case when tg_op = 'DELETE' then old.payroll_item_id else new.payroll_item_id end;
  if exists (
    select 1 from public.payroll_items item
    join public.payroll_runs run on run.id = item.run_id
    where item.id = target_item_id and run.status = 'approved'
  ) then
    raise exception using errcode = '55000', message = 'approved payroll line items are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create or replace function public.prevent_payroll_payment_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'payroll payments are append-only';
end
$$;

create trigger payroll_runs_approved_immutable
before update or delete on public.payroll_runs
for each row execute function public.prevent_approved_payroll_run_mutation();
create trigger payroll_items_approved_immutable
before insert or update or delete on public.payroll_items
for each row execute function public.prevent_approved_payroll_item_mutation();
create trigger payroll_lines_approved_immutable
before insert or update or delete on public.payroll_line_items
for each row execute function public.prevent_approved_payroll_line_mutation();
create trigger payroll_payments_append_only
before update or delete on public.payroll_payments
for each row execute function public.prevent_payroll_payment_mutation();

revoke all on function public.can_read_own_payroll_run(uuid), public.can_read_own_payroll_period(uuid),
  public.prevent_approved_payroll_run_mutation(), public.prevent_approved_payroll_item_mutation(),
  public.prevent_approved_payroll_line_mutation(), public.prevent_payroll_payment_mutation()
from public, anon, authenticated;
grant execute on function public.can_read_own_payroll_run(uuid), public.can_read_own_payroll_period(uuid) to authenticated;

comment on table public.payroll_runs is 'Versioned regular, supplemental, correction and historical payroll runs. Approved runs are immutable.';
comment on table public.payroll_payments is 'Append-only CFO execution record for an approved payroll run.';
