-- Close Staff Advances privacy, navigation, and payroll-integration gaps.

-- HR notes are private operational context. Employees retain the advance
-- reason and full status history, but never receive HR's internal notes.
create or replace function public.rpc_list_my_staff_advances()
returns table (
  id uuid, employee_id uuid, employee_name text, amount numeric, reason text,
  date_issued date, deduction_start_month date, num_instalments integer,
  monthly_deduction numeric, balance_remaining numeric, status text, source text,
  notes text, submitted_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select advance.id, advance.employee_id, employee.legal_name, advance.amount, advance.reason,
    advance.date_issued, advance.deduction_start_month, advance.num_instalments,
    advance.monthly_deduction, advance.balance_remaining, advance.status, advance.source,
    null::text, advance.created_at
  from public.staff_advances advance
  join public.employees employee on employee.id = advance.employee_id
  where advance.employee_id = public._staff_advance_employee_for_profile(public.current_profile_id())
  order by advance.created_at desc
$$;
revoke all on function public.rpc_list_my_staff_advances() from public, anon;
grant execute on function public.rpc_list_my_staff_advances() to authenticated;

-- Normalize Staff Advances notification destinations in one place. This fixes
-- both existing records and every future notification produced by the module.
alter table public.notifications
  drop constraint if exists notifications_action_path_check;
alter table public.notifications
  add constraint notifications_action_path_check check (
    action_path is null or (
      action_path ~ '^/[A-Za-z0-9_/-]+(\?(request|advance)=[0-9a-f-]{36})?$'
      and action_path !~ '//'
      and action_path !~ '\.\.'
    )
  );

create or replace function public._normalize_staff_advance_notification_path()
returns trigger language plpgsql set search_path = '' as $$
declare v_advance_id text;
begin
  if new.event_key like 'staff_advance_submitted_%' then
    v_advance_id := substring(new.event_key from '^staff_advance_submitted_([0-9a-f-]{36})_');
    if v_advance_id is not null then new.action_path := '/hr/staff-advances?advance=' || v_advance_id; end if;
  elsif new.event_key like 'staff_advance_logged_%' then
    v_advance_id := substring(new.event_key from '^staff_advance_logged_([0-9a-f-]{36})$');
    if v_advance_id is not null then new.action_path := '/my/advances?advance=' || v_advance_id; end if;
  elsif new.event_key like 'staff_advance_decision_%' then
    v_advance_id := substring(new.event_key from '^staff_advance_decision_([0-9a-f-]{36})_');
    if v_advance_id is not null then new.action_path := '/my/advances?advance=' || v_advance_id; end if;
  end if;
  return new;
end
$$;
revoke all on function public._normalize_staff_advance_notification_path() from public, anon, authenticated;

drop trigger if exists normalize_staff_advance_notification_path on public.notifications;
create trigger normalize_staff_advance_notification_path
before insert or update of event_key, action_path on public.notifications
for each row execute function public._normalize_staff_advance_notification_path();

update public.notifications
set action_path = case
  when event_key like 'staff_advance_submitted_%'
    then '/hr/staff-advances?advance=' || substring(event_key from '^staff_advance_submitted_([0-9a-f-]{36})_')
  when event_key like 'staff_advance_logged_%'
    then '/my/advances?advance=' || substring(event_key from '^staff_advance_logged_([0-9a-f-]{36})$')
  when event_key like 'staff_advance_decision_%'
    then '/my/advances?advance=' || substring(event_key from '^staff_advance_decision_([0-9a-f-]{36})_')
  else action_path
end
where event_key like 'staff_advance_submitted_%'
   or event_key like 'staff_advance_logged_%'
   or event_key like 'staff_advance_decision_%';

-- Link the automatic payroll line to its source advance. A regular payroll
-- can contain only one open advance per employee by the Staff Advances rule.
alter table public.payroll_line_items
  add column staff_advance_id uuid references public.staff_advances(id) on delete restrict;
create unique index payroll_line_items_staff_advance_idx
  on public.payroll_line_items(payroll_item_id, staff_advance_id)
  where staff_advance_id is not null;

alter function public._insert_payroll_items(uuid, jsonb)
  rename to _insert_payroll_items_before_staff_advances;
revoke all on function public._insert_payroll_items_before_staff_advances(uuid, jsonb)
  from public, anon, authenticated;

create or replace function public._insert_payroll_items(target_run_id uuid, item_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.current_profile_id();
  v_period_start date;
  v_run_type text;
  v_item jsonb;
  v_payroll_item public.payroll_items%rowtype;
  v_advance public.staff_advances%rowtype;
  v_deduction numeric;
begin
  select period.period_start, run.run_type into v_period_start, v_run_type
  from public.payroll_runs run
  join public.payroll_periods period on period.id = run.period_id
  where run.id = target_run_id;
  if v_period_start is null then raise no_data_found using message = 'payroll run not found'; end if;

  if v_run_type = 'historical' then
    perform public._insert_payroll_items_before_staff_advances(target_run_id, item_payload);
    return;
  end if;

  for v_item in select value from jsonb_array_elements(item_payload) loop
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_item -> 'line_items', '[]'::jsonb)) line
      where upper(btrim(line ->> 'code')) = 'STAFF_ADVANCE'
    ) then
      raise check_violation using message = 'STAFF_ADVANCE is reserved for the automatic staff advance calculation';
    end if;
  end loop;

  perform public._insert_payroll_items_before_staff_advances(target_run_id, item_payload);

  -- Supplemental and correction payrolls must not recover a second instalment
  -- for the same employee and month.
  if v_run_type <> 'regular' then return; end if;

  for v_payroll_item in
    select item.* from public.payroll_items item where item.run_id = target_run_id
  loop
    select advance.* into v_advance
    from public.staff_advances advance
    where advance.employee_id = v_payroll_item.employee_id
      and advance.status in ('active', 'flagged')
      and advance.deduction_start_month <= v_period_start
      and not exists (
        select 1 from public.advance_repayments repayment
        where repayment.advance_id = advance.id
          and repayment.payroll_period = v_period_start
          and repayment.source = 'payroll'
      )
    for update;

    if found then
      v_deduction := least(v_advance.monthly_deduction, v_advance.balance_remaining);
      if v_deduction > v_payroll_item.net_pay then
        raise check_violation using message = 'Staff advance deduction exceeds employee net pay.';
      end if;

      insert into public.payroll_line_items
        (payroll_item_id, kind, code, description, amount, staff_advance_id, created_by)
      values
        (v_payroll_item.id, 'salary_advance', 'STAFF_ADVANCE',
         'Scheduled staff advance repayment', v_deduction, v_advance.id, v_actor);

      update public.payroll_items set
        salary_advance_deduction = salary_advance_deduction + v_deduction,
        total_deductions = total_deductions + v_deduction,
        net_pay = net_pay - v_deduction
      where id = v_payroll_item.id;
    end if;
  end loop;
end
$$;
revoke all on function public._insert_payroll_items(uuid, jsonb) from public, anon, authenticated;

alter function public.approve_payroll_run(uuid, text)
  rename to _approve_payroll_run_before_staff_advances;
revoke all on function public._approve_payroll_run_before_staff_advances(uuid, text)
  from public, anon, authenticated;

create or replace function public.approve_payroll_run(target_run_id uuid, approval_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.current_profile_id();
  v_period_start date;
  v_line record;
  v_advance public.staff_advances%rowtype;
  v_balance numeric;
  v_next_status text;
  v_employee_profile uuid;
begin
  -- The existing approval remains the authoritative permission, locking,
  -- reconciliation, immutability, and audit gate.
  perform public._approve_payroll_run_before_staff_advances(target_run_id, approval_reason);

  select period.period_start into v_period_start
  from public.payroll_runs run
  join public.payroll_periods period on period.id = run.period_id
  where run.id = target_run_id;

  for v_line in
    select line.id, line.staff_advance_id, line.amount
    from public.payroll_line_items line
    join public.payroll_items item on item.id = line.payroll_item_id
    where item.run_id = target_run_id and line.staff_advance_id is not null
  loop
    select * into v_advance from public.staff_advances
    where id = v_line.staff_advance_id for update;
    if v_advance.status not in ('active', 'flagged')
       or v_line.amount > v_advance.balance_remaining then
      raise check_violation using message = 'Staff advance balance changed; replace the payroll draft before approval.';
    end if;

    insert into public.advance_repayments(
      advance_id, employee_id, payroll_period, amount, source, notes,
      payroll_run_id, recorded_by
    ) values (
      v_advance.id, v_advance.employee_id, v_period_start, v_line.amount,
      'payroll', 'Automatically recorded on payroll approval', target_run_id, v_actor
    );

    v_balance := v_advance.balance_remaining - v_line.amount;
    v_next_status := case when v_balance = 0 then 'paid_off' else v_advance.status end;
    update public.staff_advances set
      balance_remaining = v_balance, status = v_next_status,
      updated_by = v_actor, updated_at = now()
    where id = v_advance.id;

    perform public._record_staff_advance_event(
      v_advance.id, 'payroll_repayment', v_advance.status, v_next_status,
      v_line.amount, 'Automatically recorded on payroll approval', v_actor
    );
    insert into public.audit_events(
      actor_profile_id, event_type, entity_type, entity_id,
      previous_values, new_values, reason
    ) values (
      v_actor, 'staff_advance.payroll_repayment', 'staff_advance', v_advance.id::text,
      jsonb_build_object('balance', v_advance.balance_remaining),
      jsonb_build_object('balance', v_balance, 'amount', v_line.amount, 'payroll_run_id', target_run_id),
      approval_reason
    );

    select employee.profile_id into v_employee_profile
    from public.employees employee where employee.id = v_advance.employee_id;
    if v_employee_profile is not null then
      insert into public.notifications(
        recipient_profile_id, title, message, category, event_key, action_path
      ) values (
        v_employee_profile, 'Staff Advance Repayment Recorded',
        'A scheduled staff advance repayment was included in approved payroll.',
        'hr', 'staff_advance_payroll_' || v_line.id,
        '/my/advances?advance=' || v_advance.id
      ) on conflict (event_key) do nothing;
    end if;
  end loop;
end
$$;
revoke all on function public.approve_payroll_run(uuid, text) from public, anon;
grant execute on function public.approve_payroll_run(uuid, text) to authenticated;
