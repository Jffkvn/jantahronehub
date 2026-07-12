-- 1. Helper functions to calculate balance and check outstanding status
create or replace function public.get_cash_advance_balance(p_advance_id uuid)
returns numeric(15,2)
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select amount_disbursed from public.cash_advance_requests
      where id = p_advance_id
    ),
    0::numeric
  ) - coalesce(
    (
      select sum(amount) from public.cash_advance_expenses
      where cash_advance_id = p_advance_id
        and status = 'accepted'
    ),
    0::numeric
  ) - coalesce(
    (
      select sum(amount) from public.cash_advance_returns
      where cash_advance_id = p_advance_id
    ),
    0::numeric
  );
$$;

create or replace function public.has_outstanding_advances(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.cash_advance_requests
    where user_id = p_user_id
      and status = 'disbursed'
  );
$$;

-- 2. Atomic RPCs
create or replace function public.rpc_request_cash_advance(
  p_project_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_purpose text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advance_id uuid;
  v_is_cfo boolean;
begin
  -- Validate caller has permission
  if not public.has_permission('cash_advances.request') then
    raise exception 'Unauthorized: Insufficient privileges to request cash advance' using errcode = '42501';
  end if;

  v_is_cfo := public.has_permission('cash_advances.manage');

  -- If request is on behalf of someone else, caller must be CFO
  if p_user_id != auth.uid() and not v_is_cfo then
    raise exception 'Unauthorized: Only CFO can request advances on behalf of other users' using errcode = '42501';
  end if;

  -- Validate project assignment for non-CFO
  if not v_is_cfo and not public.is_member_on_project(p_project_id, auth.uid()) then
    raise exception 'Unauthorized: You are not assigned to this project' using errcode = '42501';
  end if;

  -- Insert request
  insert into public.cash_advance_requests (
    project_id,
    user_id,
    amount_requested,
    purpose,
    status,
    entered_by
  ) values (
    p_project_id,
    p_user_id,
    p_amount,
    p_purpose,
    'pending_approval',
    auth.uid()
  ) returning id into v_advance_id;

  return v_advance_id;
end;
$$;

create or replace function public.rpc_approve_cash_advance(
  p_advance_id uuid,
  p_override_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_user_id uuid;
  v_has_outstanding boolean;
begin
  -- Validate caller has management permission
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to approve cash advances' using errcode = '42501';
  end if;

  -- Get request info
  select status, user_id into v_status, v_user_id
  from public.cash_advance_requests
  where id = p_advance_id;

  if v_status is null then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  if v_status != 'pending_approval' then
    raise exception 'Conflict: Request is already approved, disbursed or completed' using errcode = 'L0001';
  end if;

  -- Check outstanding advances warning
  v_has_outstanding := public.has_outstanding_advances(v_user_id);
  if v_has_outstanding and (p_override_reason is null or trim(p_override_reason) = '') then
    raise exception 'Warning: Outstanding advances detected. CFO override reason is required.' using errcode = 'W0001';
  end if;

  -- Update status to approved
  update public.cash_advance_requests
  set
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    override_reason = case when v_has_outstanding then p_override_reason else null end,
    updated_at = now()
  where id = p_advance_id;
end;
$$;

create or replace function public.rpc_disburse_cash_advance(
  p_advance_id uuid,
  p_amount numeric,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  -- Validate caller has management permission
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to disburse cash advances' using errcode = '42501';
  end if;

  -- Validate parameter
  if p_amount <= 0 then
    raise exception 'Validation: Disbursement amount must be positive' using errcode = '22023';
  end if;

  -- Get request info
  select status into v_status
  from public.cash_advance_requests
  where id = p_advance_id;

  if v_status is null then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  if v_status != 'approved' then
    raise exception 'Conflict: Request must be in approved status for disbursement' using errcode = 'L0002';
  end if;

  -- Update request to disbursed
  update public.cash_advance_requests
  set
    status = 'disbursed',
    amount_disbursed = p_amount,
    disbursement_reference = p_reference,
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
set search_path = public
as $$
declare
  v_status text;
  v_user_id uuid;
  v_expense_id uuid;
begin
  -- Get request info
  select status, user_id into v_status, v_user_id
  from public.cash_advance_requests
  where id = p_advance_id;

  if v_status is null then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  -- Authenticated user must be the assignee of the cash advance
  if v_user_id != auth.uid() then
    raise exception 'Unauthorized: You are not the owner of this cash advance' using errcode = '42501';
  end if;

  if v_status != 'disbursed' then
    raise exception 'Conflict: Expenses can only be logged for disbursed cash advances' using errcode = 'L0003';
  end if;

  if p_amount <= 0 then
    raise exception 'Validation: Expense amount must be positive' using errcode = '22023';
  end if;

  -- Validate receipt-unavailable explanation
  if p_receipt_unavailable and (p_receipt_unavailable_explanation is null or trim(p_receipt_unavailable_explanation) = '') then
    raise exception 'Validation: Explanation is mandatory for receipt-unavailable expenses' using errcode = 'V0001';
  end if;

  -- Insert expense
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
set search_path = public
as $$
declare
  v_status text;
begin
  -- Validate caller has management permission
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to review expenses' using errcode = '42501';
  end if;

  -- Get expense info
  select status into v_status
  from public.cash_advance_expenses
  where id = p_expense_id;

  if v_status is null then
    raise exception 'Not Found: Expense record not found' using errcode = 'P0002';
  end if;

  if v_status != 'pending_review' then
    raise exception 'Conflict: Expense has already been reviewed' using errcode = 'L0004';
  end if;

  -- Update status
  update public.cash_advance_expenses
  set
    status = case when p_accept then 'accepted' else 'rejected' end,
    rejection_reason = case when p_accept then null else p_rejection_reason end,
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
set search_path = public
as $$
declare
  v_status text;
  v_user_id uuid;
  v_return_id uuid;
begin
  -- Validate caller has management permission
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to record returned cash' using errcode = '42501';
  end if;

  -- Get request info
  select status, user_id into v_status, v_user_id
  from public.cash_advance_requests
  where id = p_advance_id;

  if v_status is null then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  if v_status != 'disbursed' then
    raise exception 'Conflict: Cash returns can only be logged for active disbursed advances' using errcode = 'L0005';
  end if;

  if p_amount <= 0 then
    raise exception 'Validation: Returned amount must be positive' using errcode = '22023';
  end if;

  -- Insert return
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
    p_reference,
    p_notes
  ) returning id into v_return_id;

  return v_return_id;
end;
$$;

create or replace function public.rpc_close_cash_advance(
  p_advance_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_balance numeric(15,2);
begin
  -- Validate caller has management permission
  if not public.has_permission('cash_advances.manage') then
    raise exception 'Unauthorized: Insufficient privileges to close advances' using errcode = '42501';
  end if;

  -- Get request info
  select status into v_status
  from public.cash_advance_requests
  where id = p_advance_id;

  if v_status is null then
    raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002';
  end if;

  if v_status != 'disbursed' then
    raise exception 'Conflict: Only active disbursed advances can be closed' using errcode = 'L0006';
  end if;

  -- Check outstanding balance reconciliation
  v_balance := public.get_cash_advance_balance(p_advance_id);
  if v_balance != 0::numeric then
    raise exception 'Conflict: Cannot close advance: outstanding balance of % UGX is not zero.', v_balance using errcode = 'B0001';
  end if;

  -- Update request status to completed
  update public.cash_advance_requests
  set
    status = 'completed',
    closed_by = auth.uid(),
    closed_at = now(),
    updated_at = now()
  where id = p_advance_id;
end;
$$;

-- Grant execution permissions
grant execute on function public.get_cash_advance_balance(uuid) to authenticated;
grant execute on function public.has_outstanding_advances(uuid) to authenticated;
grant execute on function public.rpc_request_cash_advance(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.rpc_approve_cash_advance(uuid, text) to authenticated;
grant execute on function public.rpc_disburse_cash_advance(uuid, numeric, text) to authenticated;
grant execute on function public.rpc_submit_cash_expense(uuid, date, text, numeric, text, text, text, boolean, text) to authenticated;
grant execute on function public.rpc_review_cash_expense(uuid, boolean, text) to authenticated;
grant execute on function public.rpc_return_cash(uuid, date, numeric, text, text) to authenticated;
grant execute on function public.rpc_close_cash_advance(uuid) to authenticated;
