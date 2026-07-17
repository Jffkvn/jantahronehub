-- Private, directly uploaded evidence for operational cash expenses.

create or replace function public.rpc_submit_cash_expense(
  p_advance_id uuid, p_date date, p_category text, p_amount numeric,
  p_vendor text, p_explanation text, p_receipt_url text,
  p_receipt_unavailable boolean, p_receipt_unavailable_explanation text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_user_id uuid;
  v_available numeric(15,2);
  v_expense_id uuid;
begin
  select request.status, request.user_id into v_status, v_user_id
  from public.cash_advance_requests request
  where request.id = p_advance_id for update;

  if not found then raise exception 'Not Found: Cash advance request not found' using errcode = 'P0002'; end if;
  if v_user_id != auth.uid() then raise exception 'Unauthorized: You are not the owner of this cash advance' using errcode = '42501'; end if;
  if v_status != 'disbursed' then raise exception 'Conflict: Expenses can only be logged for disbursed cash advances' using errcode = 'L0003'; end if;
  if p_amount <= 0 then raise exception 'Validation: Expense amount must be positive' using errcode = '22023'; end if;

  if p_receipt_unavailable then
    if p_receipt_unavailable_explanation is null or length(btrim(p_receipt_unavailable_explanation)) < 3 then
      raise exception 'Validation: Explanation is mandatory for receipt-unavailable expenses' using errcode = 'V0001';
    end if;
    p_receipt_url := null;
  else
    if p_receipt_url is null
       or p_receipt_url !~ ('^' || v_user_id::text || '/cash-receipts/' || p_advance_id::text || '/[0-9a-f-]+[.](pdf|jpe?g|png|webp)$')
       or not public.is_valid_private_file_path(p_receipt_url)
       or not exists (select 1 from storage.objects object where object.bucket_id = 'private-files' and object.name = p_receipt_url) then
      raise exception 'Validation: A valid uploaded receipt document is required' using errcode = 'V0001';
    end if;
    p_receipt_unavailable_explanation := null;
  end if;

  select coalesce(request.amount_disbursed, 0::numeric)
    - coalesce((select sum(expense.amount) from public.cash_advance_expenses expense where expense.cash_advance_id = request.id and expense.status in ('pending_review', 'accepted')), 0::numeric)
    - coalesce((select sum(returned.amount) from public.cash_advance_returns returned where returned.cash_advance_id = request.id and returned.reversed_at is null), 0::numeric)
  into v_available from public.cash_advance_requests request where request.id = p_advance_id;
  if p_amount > v_available then raise exception 'Validation: Expense amount exceeds outstanding cash advance balance' using errcode = '22023'; end if;

  insert into public.cash_advance_expenses (
    cash_advance_id, expense_date, category, amount, vendor, explanation,
    receipt_url, receipt_unavailable, receipt_unavailable_explanation, status
  ) values (
    p_advance_id, p_date, p_category, p_amount, btrim(p_vendor), btrim(p_explanation),
    p_receipt_url, p_receipt_unavailable, p_receipt_unavailable_explanation, 'pending_review'
  ) returning id into v_expense_id;
  return v_expense_id;
end $$;

drop policy if exists private_files_read on storage.objects;
create policy private_files_read on storage.objects for select to authenticated using (
  bucket_id = 'private-files' and public.is_valid_private_file_path(name) and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('files.read')
    or exists (
      select 1 from public.project_documents document
      where document.storage_path = storage.objects.name and document.archived_at is null
        and (public.has_permission('projects.read_all') or public.is_member_on_project(document.project_id, auth.uid()))
    )
    or exists (
      select 1 from public.employee_documents document join public.employees employee on employee.id = document.employee_id
      where document.storage_path = storage.objects.name and document.employee_visible and document.archived_at is null
        and employee.profile_id = auth.uid() and employee.archived_at is null
    )
    or exists (
      select 1 from public.cash_advance_expenses expense
      join public.cash_advance_requests request on request.id = expense.cash_advance_id
      where expense.receipt_url = storage.objects.name
        and (request.user_id = auth.uid() or public.has_permission('cash_advances.manage'))
    )
  )
);

drop policy if exists private_files_remove on storage.objects;
create policy private_files_remove on storage.objects for delete to authenticated using (
  bucket_id = 'private-files' and public.is_valid_private_file_path(name)
  and ((storage.foldername(name))[1] = auth.uid()::text or public.has_permission('files.manage'))
);
