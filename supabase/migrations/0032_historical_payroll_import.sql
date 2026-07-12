insert into public.permissions(key, resource, action, description)
values ('payroll.migrate_history', 'payroll', 'migrate_history', 'Commit protected historical payroll migration batches.')
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.key = 'super_admin'
  and permission.key = 'payroll.migrate_history'
on conflict do nothing;

create table public.historical_payroll_import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  source_file_name text not null check (length(btrim(source_file_name)) between 1 and 255),
  source_file_hash text not null unique check (source_file_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'committed' check (status in ('committed', 'rolled_back')),
  period_count integer not null default 0 check (period_count >= 0),
  row_count integer not null default 0 check (row_count >= 0),
  imported_by uuid not null references public.profiles(id) on delete restrict,
  imported_at timestamptz not null default now()
);

create table public.historical_payroll_import_periods (
  id uuid primary key default extensions.gen_random_uuid(),
  batch_id uuid not null references public.historical_payroll_import_batches(id) on delete restrict,
  payroll_run_id uuid not null unique references public.payroll_runs(id) on delete restrict,
  source_sheet_name text not null check (length(btrim(source_sheet_name)) between 1 and 120),
  period_start date not null,
  row_count integer not null check (row_count > 0),
  gross_total numeric(16,2) not null check (gross_total >= 0),
  net_total numeric(16,2) not null check (net_total >= 0),
  created_at timestamptz not null default now(),
  unique (batch_id, source_sheet_name),
  unique (period_start)
);

create table public.historical_payroll_import_rows (
  id uuid primary key default extensions.gen_random_uuid(),
  batch_id uuid not null references public.historical_payroll_import_batches(id) on delete restrict,
  import_period_id uuid not null references public.historical_payroll_import_periods(id) on delete restrict,
  payroll_item_id uuid not null unique references public.payroll_items(id) on delete restrict,
  source_row_number integer not null check (source_row_number >= 2),
  row_hash text not null unique check (length(btrim(row_hash)) between 8 and 128),
  employee_id uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (import_period_id, source_row_number)
);

alter table public.historical_payroll_import_batches enable row level security;
alter table public.historical_payroll_import_periods enable row level security;
alter table public.historical_payroll_import_rows enable row level security;

create policy historical_payroll_import_batches_read on public.historical_payroll_import_batches
for select to authenticated using (public.has_permission('payroll.migrate_history'));
create policy historical_payroll_import_periods_read on public.historical_payroll_import_periods
for select to authenticated using (public.has_permission('payroll.migrate_history'));
create policy historical_payroll_import_rows_read on public.historical_payroll_import_rows
for select to authenticated using (public.has_permission('payroll.migrate_history'));

revoke all on public.historical_payroll_import_batches,
  public.historical_payroll_import_periods,
  public.historical_payroll_import_rows
from anon, authenticated;
grant select on public.historical_payroll_import_batches,
  public.historical_payroll_import_periods,
  public.historical_payroll_import_rows
to authenticated;

create function public.commit_historical_payroll_import(
  source_file_name text,
  source_file_hash text,
  import_periods jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  batch_id uuid;
  period_item jsonb;
  row_item jsonb;
  period_id_value uuid;
  run_id uuid;
  import_period_id uuid;
  payroll_item_id uuid;
  period_counter integer := 0;
  row_counter integer := 0;
  period_start_value date;
  period_end_value date;
  run_number_value integer;
  expected_gross numeric;
  expected_paye numeric;
  expected_nssf_employee numeric;
  expected_nssf_employer numeric;
  expected_wht numeric;
  expected_deductions numeric;
  expected_net numeric;
  imported_gross numeric;
  imported_paye numeric;
  imported_nssf_employee numeric;
  imported_nssf_employer numeric;
  imported_wht numeric;
  imported_deductions numeric;
  imported_net numeric;
  target_employee_id uuid;
  item_payment_method text;
  item_bank_name text;
  item_account_number text;
  item_mobile_money_number text;
begin
  if not public.has_permission('payroll.migrate_history') then
    raise insufficient_privilege using message = 'payroll.migrate_history permission is required';
  end if;
  if jsonb_typeof(import_periods) <> 'array' or jsonb_array_length(import_periods) = 0 or jsonb_array_length(import_periods) > 120 then
    raise check_violation using message = 'historical import must contain between 1 and 120 payroll periods';
  end if;
  if lower(source_file_hash) !~ '^[0-9a-f]{64}$' then
    raise check_violation using message = 'source file hash must be a 64-character hex digest';
  end if;
  if exists (
    select 1 from public.historical_payroll_import_batches batch
    where batch.source_file_hash = lower(commit_historical_payroll_import.source_file_hash)
  ) then
    raise exception using errcode = '23505', message = 'This historical payroll workbook has already been imported.';
  end if;

  insert into public.historical_payroll_import_batches(source_file_name, source_file_hash, imported_by)
  values (btrim(source_file_name), lower(source_file_hash), actor)
  returning id into batch_id;

  for period_item in select value from jsonb_array_elements(import_periods) loop
    period_start_value := (period_item ->> 'period_start')::date;
    period_end_value := (period_item ->> 'period_end')::date;
    if period_start_value <> date_trunc('month', period_start_value)::date
      or period_end_value <> (period_start_value + interval '1 month - 1 day')::date then
      raise check_violation using message = 'historical payroll period dates are invalid';
    end if;
    if jsonb_typeof(period_item -> 'rows') <> 'array' or jsonb_array_length(period_item -> 'rows') = 0 or jsonb_array_length(period_item -> 'rows') > 1000 then
      raise check_violation using message = 'historical payroll period must contain between 1 and 1000 rows';
    end if;
    if exists (
      select 1
      from public.payroll_runs run
      join public.payroll_periods period on period.id = run.period_id
      where period.period_start = period_start_value
        and run.run_type in ('regular', 'historical')
    ) then
      raise exception using errcode = '23505', message = 'A base payroll run already exists for this period.';
    end if;

    insert into public.payroll_periods(period_start, period_end, label, created_by)
    values (period_start_value, period_end_value, coalesce(nullif(btrim(period_item ->> 'label'), ''), to_char(period_start_value, 'FMMonth YYYY')), actor)
    on conflict (period_start) do nothing;
    select id into period_id_value from public.payroll_periods where period_start = period_start_value for update;
    select coalesce(max(run.run_number), 0) + 1 into run_number_value from public.payroll_runs run where run.period_id = period_id_value;

    insert into public.payroll_runs(
      period_id, run_number, run_type, source_run_id, status, reason, calculation_settings,
      created_by, updated_by
    )
    values (
      period_id_value, run_number_value, 'historical', null, 'draft',
      'Historical payroll imported from workbook',
      jsonb_build_object('source', 'historical_import', 'sourceFileHash', lower(source_file_hash), 'sourceSheetName', period_item ->> 'sheet_name'),
      actor, actor
    )
    returning id into run_id;

    expected_gross := coalesce((period_item -> 'totals' ->> 'gross')::numeric, 0);
    expected_paye := coalesce((period_item -> 'totals' ->> 'paye')::numeric, 0);
    expected_nssf_employee := coalesce((period_item -> 'totals' ->> 'nssf_employee')::numeric, 0);
    expected_nssf_employer := coalesce((period_item -> 'totals' ->> 'nssf_employer')::numeric, 0);
    expected_wht := coalesce((period_item -> 'totals' ->> 'wht')::numeric, 0);
    expected_deductions := coalesce((period_item -> 'totals' ->> 'deductions')::numeric, 0);
    expected_net := coalesce((period_item -> 'totals' ->> 'net')::numeric, 0);

    insert into public.historical_payroll_import_periods(
      batch_id, payroll_run_id, source_sheet_name, period_start, row_count, gross_total, net_total
    )
    values (
      batch_id, run_id, btrim(period_item ->> 'sheet_name'), period_start_value,
      jsonb_array_length(period_item -> 'rows'), expected_gross, expected_net
    )
    returning id into import_period_id;

    for row_item in select value from jsonb_array_elements(period_item -> 'rows') loop
      target_employee_id := nullif(row_item ->> 'employee_id', '')::uuid;
      if target_employee_id is null or not exists (select 1 from public.employees employee where employee.id = target_employee_id) then
        raise check_violation using message = 'each historical payroll row requires a reviewed employee_id';
      end if;
      item_payment_method := coalesce(nullif(row_item ->> 'payment_method', ''), 'cash');
      if item_payment_method not in ('bank', 'mobile_money', 'cash') then
        raise check_violation using message = 'invalid historical payment method';
      end if;
      item_account_number := nullif(btrim(row_item ->> 'account_number'), '');
      item_mobile_money_number := nullif(btrim(row_item ->> 'mobile_money_number'), '');
      item_bank_name := nullif(btrim(row_item ->> 'bank_name'), '');
      if item_payment_method = 'bank' then
        item_bank_name := coalesce(item_bank_name, 'Historical bank');
        if item_account_number is null then raise check_violation using message = 'bank historical rows require an account number'; end if;
      elsif item_payment_method = 'mobile_money' and item_mobile_money_number is null then
        raise check_violation using message = 'mobile money historical rows require a mobile money number';
      end if;

      insert into public.payroll_items(
        run_id, employee_id, employee_number, employee_name, tax_treatment, nssf_applicable,
        percent_of_month_worked, contractual_gross, prorated_gross, overtime_hours,
        overtime_rate, overtime_pay, allowances, taxable_gross, paye, nssf_employee,
        nssf_employer, wht, salary_advance_deduction, other_deductions,
        total_deductions, net_pay
      )
      values (
        run_id,
        target_employee_id,
        btrim(row_item ->> 'employee_number'),
        btrim(row_item ->> 'employee_name'),
        coalesce(nullif(row_item ->> 'tax_treatment', ''), 'local'),
        coalesce((row_item ->> 'nssf_applicable')::boolean, true),
        coalesce((row_item ->> 'percent_of_month_worked')::numeric, 100),
        coalesce((row_item ->> 'contractual_gross')::numeric, 0),
        coalesce((row_item ->> 'prorated_gross')::numeric, 0),
        coalesce((row_item ->> 'overtime_hours')::numeric, 0),
        coalesce((row_item ->> 'overtime_rate')::numeric, 0),
        coalesce((row_item ->> 'overtime_pay')::numeric, 0),
        coalesce((row_item ->> 'allowances')::numeric, 0),
        coalesce((row_item ->> 'taxable_gross')::numeric, 0),
        coalesce((row_item ->> 'paye')::numeric, 0),
        coalesce((row_item ->> 'nssf_employee')::numeric, 0),
        coalesce((row_item ->> 'nssf_employer')::numeric, 0),
        coalesce((row_item ->> 'wht')::numeric, 0),
        coalesce((row_item ->> 'salary_advance_deduction')::numeric, 0),
        coalesce((row_item ->> 'other_deductions')::numeric, 0),
        coalesce((row_item ->> 'total_deductions')::numeric, 0),
        coalesce((row_item ->> 'net_pay')::numeric, 0)
      )
      returning id into payroll_item_id;

      update public.payroll_items
      set tin_number = nullif(btrim(row_item ->> 'tin_number'), ''),
        nssf_number = nullif(btrim(row_item ->> 'nssf_number'), ''),
        payment_method = item_payment_method,
        bank_name = item_bank_name,
        account_number = item_account_number,
        sort_code = nullif(btrim(row_item ->> 'sort_code'), ''),
        mobile_money_number = item_mobile_money_number
      where id = payroll_item_id;

      insert into public.historical_payroll_import_rows(
        batch_id, import_period_id, payroll_item_id, source_row_number, row_hash, employee_id
      )
      values (
        batch_id, import_period_id, payroll_item_id,
        (row_item ->> 'row_number')::integer, btrim(row_item ->> 'row_hash'), target_employee_id
      );
    end loop;

    perform public._refresh_payroll_run_totals(run_id);
    select total_gross, total_paye, total_nssf_employee, total_nssf_employer, total_wht, total_deductions, total_net
    into imported_gross, imported_paye, imported_nssf_employee, imported_nssf_employer, imported_wht, imported_deductions, imported_net
    from public.payroll_runs
    where id = run_id;

    if imported_gross <> expected_gross
      or imported_paye <> expected_paye
      or imported_nssf_employee <> expected_nssf_employee
      or imported_nssf_employer <> expected_nssf_employer
      or imported_wht <> expected_wht
      or imported_deductions <> expected_deductions
      or imported_net <> expected_net then
      raise check_violation using message = 'historical payroll totals do not reconcile';
    end if;

    update public.payroll_runs
    set status = 'approved',
      approved_by = actor,
      approved_at = now(),
      updated_by = actor,
      updated_at = now()
    where id = run_id;

    period_counter := period_counter + 1;
    row_counter := row_counter + jsonb_array_length(period_item -> 'rows');
  end loop;

  update public.historical_payroll_import_batches
  set period_count = period_counter,
    row_count = row_counter
  where id = batch_id;

  insert into public.audit_events(actor_profile_id, event_type, entity_type, entity_id, new_values)
  values (
    actor,
    'payroll.history_imported',
    'historical_payroll_import',
    batch_id::text,
    jsonb_build_object('periods', period_counter, 'rows', row_counter, 'file_hash', lower(source_file_hash))
  );

  return jsonb_build_object('batchId', batch_id, 'periods', period_counter, 'rows', row_counter);
end
$$;

revoke all on function public.commit_historical_payroll_import(text, text, jsonb) from public, anon;
grant execute on function public.commit_historical_payroll_import(text, text, jsonb) to authenticated;

comment on function public.commit_historical_payroll_import(text, text, jsonb) is
  'Commits reviewed historical payroll periods as immutable approved payroll runs and rejects duplicate files, periods and row hashes.';
