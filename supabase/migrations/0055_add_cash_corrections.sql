-- Completed cash accountabilities are immutable until an authorized finance
-- user explicitly reopens them. Corrections reverse ledger entries in place;
-- they never delete financial history.

alter table public.cash_advance_expenses
  drop constraint cash_advance_expenses_status_check;

alter table public.cash_advance_expenses
  add constraint cash_advance_expenses_status_check
  check (status in ('pending_review', 'accepted', 'rejected', 'reversed'));

alter table public.cash_advance_expenses
  add column reversed_by uuid references public.profiles(id),
  add column reversed_at timestamptz,
  add column reversal_reason text,
  add constraint cash_advance_expenses_reversal_complete check (
    (status = 'reversed' and reversed_by is not null and reversed_at is not null and nullif(trim(reversal_reason), '') is not null)
    or
    (status <> 'reversed' and reversed_by is null and reversed_at is null and reversal_reason is null)
  );

alter table public.cash_advance_returns
  add column reversed_by uuid references public.profiles(id),
  add column reversed_at timestamptz,
  add column reversal_reason text,
  add constraint cash_advance_returns_reversal_complete check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or
    (reversed_at is not null and reversed_by is not null and nullif(trim(reversal_reason), '') is not null)
  );

create index idx_cash_advance_returns_active
  on public.cash_advance_returns(cash_advance_id)
  where reversed_at is null;

create or replace function public.get_cash_advance_balance(p_advance_id uuid)
returns numeric(15,2)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_user_id uuid;
  v_entered_by uuid;
  v_balance numeric(15,2);
begin
  select request.user_id, request.entered_by
  into v_user_id, v_entered_by
  from public.cash_advance_requests request
  where request.id = p_advance_id;

  if not found then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  if auth.uid() is null or not (
    auth.uid() = v_user_id
    or auth.uid() = v_entered_by
    or public.has_permission('cash_advances.view_all')
  ) then
    raise exception 'Unauthorized: You cannot view this cash advance balance' using errcode = '42501';
  end if;

  select
    coalesce(request.amount_disbursed, 0::numeric)
    - coalesce((
      select sum(expense.amount)
      from public.cash_advance_expenses expense
      where expense.cash_advance_id = request.id
        and expense.status = 'accepted'
    ), 0::numeric)
    - coalesce((
      select sum(returned.amount)
      from public.cash_advance_returns returned
      where returned.cash_advance_id = request.id
        and returned.reversed_at is null
    ), 0::numeric)
  into v_balance
  from public.cash_advance_requests request
  where request.id = p_advance_id;

  return v_balance;
end;
$$;

create or replace function public.rpc_submit_cash_expense(
  p_advance_id uuid,
  p_date date,
  p_category text,
  p_amount numeric,
  p_vendor text,
  p_explanation text,
  p_receipt_url text,
  p_receipt_unavailable boolean,
  p_receipt_unavailable_explanation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_user_id uuid;
  v_available numeric(15,2);
  v_expense_id uuid;
begin
  select request.status, request.user_id
  into v_status, v_user_id
  from public.cash_advance_requests request
  where request.id = p_advance_id
  for update;

  if not found then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  if v_user_id != auth.uid() then
    raise exception 'Unauthorized: You are not the owner of this cash advance' using errcode = '42501';
  end if;

  if v_status != 'disbursed' then
    raise exception 'Conflict: Expenses can only be logged for disbursed cash advances' using errcode = 'L0003';
  end if;

  if p_amount <= 0 then
    raise exception 'Validation: Expense amount must be positive' using errcode = '22023';
  end if;

  if p_receipt_unavailable and (
    p_receipt_unavailable_explanation is null
    or trim(p_receipt_unavailable_explanation) = ''
  ) then
    raise exception 'Validation: Explanation is mandatory for receipt-unavailable expenses' using errcode = 'V0001';
  end if;

  select
    coalesce(request.amount_disbursed, 0::numeric)
    - coalesce((
      select sum(expense.amount)
      from public.cash_advance_expenses expense
      where expense.cash_advance_id = request.id
        and expense.status in ('pending_review', 'accepted')
    ), 0::numeric)
    - coalesce((
      select sum(returned.amount)
      from public.cash_advance_returns returned
      where returned.cash_advance_id = request.id
        and returned.reversed_at is null
    ), 0::numeric)
  into v_available
  from public.cash_advance_requests request
  where request.id = p_advance_id;

  if p_amount > v_available then
    raise exception 'Validation: Expense amount exceeds outstanding cash advance balance' using errcode = '22023';
  end if;

  insert into public.cash_advance_expenses (
    cash_advance_id, expense_date, category, amount, vendor, explanation,
    receipt_url, receipt_unavailable, receipt_unavailable_explanation, status
  ) values (
    p_advance_id, p_date, p_category, p_amount, p_vendor, p_explanation,
    p_receipt_url, p_receipt_unavailable, p_receipt_unavailable_explanation, 'pending_review'
  ) returning id into v_expense_id;

  return v_expense_id;
end;
$$;

create or replace function public.rpc_return_cash(
  p_advance_id uuid,
  p_date date,
  p_amount numeric,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_user_id uuid;
  v_available numeric(15,2);
  v_return_id uuid;
begin
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to record returned cash' using errcode = '42501';
  end if;

  select request.status, request.user_id
  into v_status, v_user_id
  from public.cash_advance_requests request
  where request.id = p_advance_id
  for update;

  if not found then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  if v_status != 'disbursed' then
    raise exception 'Conflict: Cash returns can only be logged for active disbursed advances' using errcode = 'L0005';
  end if;

  if p_amount <= 0 then
    raise exception 'Validation: Returned amount must be positive' using errcode = '22023';
  end if;

  if p_reference is null or trim(p_reference) = '' then
    raise exception 'Validation: Return reference is required' using errcode = '22023';
  end if;

  select
    coalesce(request.amount_disbursed, 0::numeric)
    - coalesce((
      select sum(expense.amount)
      from public.cash_advance_expenses expense
      where expense.cash_advance_id = request.id
        and expense.status in ('pending_review', 'accepted')
    ), 0::numeric)
    - coalesce((
      select sum(returned.amount)
      from public.cash_advance_returns returned
      where returned.cash_advance_id = request.id
        and returned.reversed_at is null
    ), 0::numeric)
  into v_available
  from public.cash_advance_requests request
  where request.id = p_advance_id;

  if p_amount > v_available then
    raise exception 'Validation: Returned amount exceeds outstanding cash advance balance' using errcode = '22023';
  end if;

  insert into public.cash_advance_returns (
    cash_advance_id, return_date, amount, returned_by, received_by,
    receipt_reference, notes
  ) values (
    p_advance_id, p_date, p_amount, v_user_id, auth.uid(), trim(p_reference), p_notes
  ) returning id into v_return_id;

  return v_return_id;
end;
$$;

create or replace function public.rpc_reopen_cash_advance(
  p_advance_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_closed_by uuid;
  v_closed_at timestamptz;
begin
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to reopen cash advances' using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Validation: Reopen reason is required' using errcode = '22023';
  end if;

  select request.status, request.closed_by, request.closed_at
  into v_status, v_closed_by, v_closed_at
  from public.cash_advance_requests request
  where request.id = p_advance_id
  for update;

  if not found then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  if v_status != 'completed' then
    raise exception 'Conflict: Only completed cash advances can be reopened' using errcode = 'L0007';
  end if;

  update public.cash_advance_requests
  set status = 'disbursed', closed_by = null, closed_at = null, updated_at = now()
  where id = p_advance_id;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    auth.uid(), 'cash_advance.reopened', 'cash_advance', p_advance_id::text,
    jsonb_build_object('status', v_status, 'closed_by', v_closed_by, 'closed_at', v_closed_at),
    jsonb_build_object('status', 'disbursed'), trim(p_reason)
  );
end;
$$;

create or replace function public.rpc_reverse_cash_expense(
  p_expense_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_advance_id uuid;
begin
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to reverse cash expenses' using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Validation: Expense reversal reason is required' using errcode = '22023';
  end if;

  select expense.status, expense.cash_advance_id
  into v_status, v_advance_id
  from public.cash_advance_expenses expense
  where expense.id = p_expense_id
  for update;

  if not found then
    raise exception 'Not Found: Expense record not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.cash_advance_requests request
  where request.id = v_advance_id and request.status = 'disbursed'
  for update;

  if not found then
    raise exception 'Conflict: Reopen the completed cash advance before reversing an expense' using errcode = 'L0008';
  end if;

  if v_status != 'accepted' then
    raise exception 'Conflict: Only accepted cash expenses can be reversed' using errcode = 'L0009';
  end if;

  update public.cash_advance_expenses
  set status = 'reversed', reversed_by = auth.uid(), reversed_at = now(),
      reversal_reason = trim(p_reason), updated_at = now()
  where id = p_expense_id;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    auth.uid(), 'cash_advance.expense_reversed', 'cash_expense', p_expense_id::text,
    jsonb_build_object('status', v_status), jsonb_build_object('status', 'reversed'), trim(p_reason)
  );
end;
$$;

create or replace function public.rpc_reverse_cash_return(
  p_return_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_advance_id uuid;
  v_reversed_at timestamptz;
  v_amount numeric(15,2);
begin
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to reverse cash returns' using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Validation: Cash return reversal reason is required' using errcode = '22023';
  end if;

  select returned.cash_advance_id, returned.reversed_at, returned.amount
  into v_advance_id, v_reversed_at, v_amount
  from public.cash_advance_returns returned
  where returned.id = p_return_id
  for update;

  if not found then
    raise exception 'Not Found: Cash return record not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.cash_advance_requests request
  where request.id = v_advance_id and request.status = 'disbursed'
  for update;

  if not found then
    raise exception 'Conflict: Reopen the completed cash advance before reversing a return' using errcode = 'L0010';
  end if;

  if v_reversed_at is not null then
    raise exception 'Conflict: Cash return has already been reversed' using errcode = 'L0011';
  end if;

  update public.cash_advance_returns
  set reversed_by = auth.uid(), reversed_at = now(), reversal_reason = trim(p_reason)
  where id = p_return_id;

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    auth.uid(), 'cash_advance.return_reversed', 'cash_return', p_return_id::text,
    jsonb_build_object('amount', v_amount, 'reversed', false),
    jsonb_build_object('amount', v_amount, 'reversed', true), trim(p_reason)
  );
end;
$$;

revoke all on function public.rpc_reopen_cash_advance(uuid, text) from public, anon;
revoke all on function public.rpc_reverse_cash_expense(uuid, text) from public, anon;
revoke all on function public.rpc_reverse_cash_return(uuid, text) from public, anon;

grant execute on function public.rpc_reopen_cash_advance(uuid, text) to authenticated;
grant execute on function public.rpc_reverse_cash_expense(uuid, text) to authenticated;
grant execute on function public.rpc_reverse_cash_return(uuid, text) to authenticated;
