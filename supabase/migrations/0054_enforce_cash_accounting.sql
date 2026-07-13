-- Serialize every balance-changing operation on the parent advance row and
-- enforce the cash-accountability invariants before writing ledger records.

create or replace function public.rpc_disburse_cash_advance(
  p_advance_id uuid,
  p_amount numeric,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_amount_requested numeric(15,2);
begin
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to disburse cash advances' using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'Validation: Disbursement amount must be positive' using errcode = '22023';
  end if;

  if p_reference is null or trim(p_reference) = '' then
    raise exception 'Validation: Disbursement reference is required' using errcode = '22023';
  end if;

  select request.status, request.amount_requested
  into v_status, v_amount_requested
  from public.cash_advance_requests request
  where request.id = p_advance_id
  for update;

  if not found then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  if v_status != 'approved' then
    raise exception 'Conflict: Request must be in approved status for disbursement' using errcode = 'L0002';
  end if;

  if p_amount > v_amount_requested then
    raise exception 'Validation: Disbursement amount cannot exceed amount requested' using errcode = '22023';
  end if;

  update public.cash_advance_requests
  set
    status = 'disbursed',
    amount_disbursed = p_amount,
    disbursement_reference = trim(p_reference),
    disbursed_by = auth.uid(),
    disbursed_at = now(),
    updated_at = now()
  where id = p_advance_id;
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
    ), 0::numeric)
  into v_available
  from public.cash_advance_requests request
  where request.id = p_advance_id;

  if p_amount > v_available then
    raise exception 'Validation: Expense amount exceeds outstanding cash advance balance' using errcode = '22023';
  end if;

  insert into public.cash_advance_expenses (
    cash_advance_id,
    expense_date,
    category,
    amount,
    vendor,
    explanation,
    receipt_url,
    receipt_unavailable,
    receipt_unavailable_explanation,
    status
  ) values (
    p_advance_id,
    p_date,
    p_category,
    p_amount,
    p_vendor,
    p_explanation,
    p_receipt_url,
    p_receipt_unavailable,
    p_receipt_unavailable_explanation,
    'pending_review'
  ) returning id into v_expense_id;

  return v_expense_id;
end;
$$;

create or replace function public.rpc_review_cash_expense(
  p_expense_id uuid,
  p_accept boolean,
  p_rejection_reason text
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
    raise exception 'Unauthorized: Insufficient privileges to review expenses' using errcode = '42501';
  end if;

  select expense.status, expense.cash_advance_id
  into v_status, v_advance_id
  from public.cash_advance_expenses expense
  where expense.id = p_expense_id
  for update;

  if not found then
    raise exception 'Not Found: Expense record not found' using errcode = 'P0002';
  end if;

  if v_status != 'pending_review' then
    raise exception 'Conflict: Expense has already been reviewed' using errcode = 'L0004';
  end if;

  if not p_accept and (p_rejection_reason is null or trim(p_rejection_reason) = '') then
    raise exception 'Validation: Rejection reason is required' using errcode = '22023';
  end if;

  perform 1
  from public.cash_advance_requests request
  where request.id = v_advance_id
  for update;

  update public.cash_advance_expenses
  set
    status = case when p_accept then 'accepted' else 'rejected' end,
    rejection_reason = case when p_accept then null else trim(p_rejection_reason) end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_expense_id;
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
    ), 0::numeric)
  into v_available
  from public.cash_advance_requests request
  where request.id = p_advance_id;

  if p_amount > v_available then
    raise exception 'Validation: Returned amount exceeds outstanding cash advance balance' using errcode = '22023';
  end if;

  insert into public.cash_advance_returns (
    cash_advance_id,
    return_date,
    amount,
    returned_by,
    received_by,
    receipt_reference,
    notes
  ) values (
    p_advance_id,
    p_date,
    p_amount,
    v_user_id,
    auth.uid(),
    trim(p_reference),
    p_notes
  ) returning id into v_return_id;

  return v_return_id;
end;
$$;
