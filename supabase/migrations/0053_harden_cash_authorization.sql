-- Cash ledger writes must flow through permission-checked, audited RPCs.
revoke insert, update on table public.cash_advance_requests from authenticated;
revoke insert, update on table public.cash_advance_expenses from authenticated;
revoke insert, update on table public.cash_advance_returns from authenticated;

-- Balance helpers are security definers because callers cannot read every ledger
-- table directly. They must therefore repeat the record-level authorization check.
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
    ), 0::numeric)
  into v_balance
  from public.cash_advance_requests request
  where request.id = p_advance_id;

  return v_balance;
end;
$$;

create or replace function public.has_outstanding_advances(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_has_outstanding boolean;
begin
  if auth.uid() is null or (
    p_user_id is distinct from auth.uid()
    and not public.has_permission('cash_advances.view_all')
  ) then
    raise exception 'Unauthorized: You cannot view another user cash advance status' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.cash_advance_requests request
    where request.user_id = p_user_id
      and request.status = 'disbursed'
  ) into v_has_outstanding;

  return v_has_outstanding;
end;
$$;

revoke all on function public.get_cash_advance_balance(uuid) from public, anon;
revoke all on function public.has_outstanding_advances(uuid) from public, anon;
grant execute on function public.get_cash_advance_balance(uuid) to authenticated;
grant execute on function public.has_outstanding_advances(uuid) to authenticated;
