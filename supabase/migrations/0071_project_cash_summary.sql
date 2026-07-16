create or replace function public.rpc_get_project_cash_summary(p_project_id uuid)
returns table (
  requested numeric,
  approved numeric,
  disbursed numeric,
  accepted_expenses numeric,
  returned_cash numeric,
  outstanding_balance numeric,
  pending_accountability_count bigint,
  receipt_exception_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.projects project where project.id = p_project_id) then
    raise no_data_found using message = 'project not found';
  end if;
  if public.profile_has_role(public.current_profile_id(), 'warehouse_manager') then
    raise insufficient_privilege using message = 'project cash summary is unavailable for this role';
  end if;
  if not (
    public.has_permission('cash_advances.view_all')
    or public.is_member_on_project(p_project_id, public.current_profile_id())
  ) then
    raise insufficient_privilege using message = 'project cash summary access is required';
  end if;

  return query
  with project_requests as (
    select request.*
    from public.cash_advance_requests request
    where request.project_id = p_project_id
  ),
  expense_totals as (
    select
      coalesce(sum(expense.amount) filter (where expense.status = 'accepted'), 0) accepted,
      count(*) filter (where expense.status = 'pending_review') pending_count,
      count(*) filter (
        where expense.receipt_unavailable
          and expense.status in ('pending_review', 'accepted')
      ) receipt_count
    from public.cash_advance_expenses expense
    join project_requests request on request.id = expense.cash_advance_id
  ),
  return_totals as (
    select coalesce(sum(returned.amount) filter (where returned.reversed_at is null), 0) returned
    from public.cash_advance_returns returned
    join project_requests request on request.id = returned.cash_advance_id
  )
  select
    coalesce(sum(request.amount_requested), 0)::numeric,
    coalesce(sum(request.amount_requested) filter (
      where request.status in ('approved', 'disbursed', 'completed')
    ), 0)::numeric,
    coalesce(sum(request.amount_disbursed), 0)::numeric,
    expense_totals.accepted::numeric,
    return_totals.returned::numeric,
    greatest(
      coalesce(sum(request.amount_disbursed), 0)
      - expense_totals.accepted
      - return_totals.returned,
      0
    )::numeric,
    (
      expense_totals.pending_count
      + count(*) filter (where request.status = 'disbursed')
    )::bigint,
    expense_totals.receipt_count::bigint
  from project_requests request
  cross join expense_totals
  cross join return_totals
  group by expense_totals.accepted, expense_totals.pending_count,
    expense_totals.receipt_count, return_totals.returned;
end
$$;

revoke all on function public.rpc_get_project_cash_summary(uuid) from public, anon;
grant execute on function public.rpc_get_project_cash_summary(uuid) to authenticated;
