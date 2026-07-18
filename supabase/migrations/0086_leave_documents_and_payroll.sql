-- Private leave evidence. Payroll effects are added later in this migration's feature batch.

alter table public.leave_request_events drop constraint leave_request_events_event_type_check;
alter table public.leave_request_events add constraint leave_request_events_event_type_check
  check (event_type in (
    'submitted', 'approved', 'rejected', 'withdrawn', 'cancelled', 'logged_on_behalf',
    'evidence_attached', 'evidence_removed'
  ));

create table public.leave_documents (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  storage_path text not null unique,
  original_file_name text not null check (length(btrim(original_file_name)) between 1 and 255),
  mime_type text not null check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'image/heic', 'image/heif', 'image/avif'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete restrict,
  constraint leave_document_path_valid check (public.is_valid_private_file_path(storage_path))
);
create index leave_documents_request_idx on public.leave_documents(leave_request_id, created_at)
  where removed_at is null;

alter table public.leave_documents enable row level security;
create policy leave_documents_scoped_read on public.leave_documents for select to authenticated using (
  public.has_permission('leave.manage')
  or exists (
    select 1 from public.employees employee
    where employee.id = employee_id and employee.profile_id = auth.uid()
  )
);
revoke all on public.leave_documents from public, anon, authenticated;
grant select on public.leave_documents to authenticated;

create or replace function public.rpc_attach_leave_document(
  p_leave_request_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_size_bytes bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.current_profile_id();
  request_row public.leave_requests%rowtype;
  employee_profile uuid;
  document_id uuid;
begin
  select request_value.* into request_row
  from public.leave_requests request_value
  where request_value.id = p_leave_request_id for update;
  if not found then raise no_data_found using message = 'Leave request not found.'; end if;

  select employee.profile_id into employee_profile
  from public.employees employee where employee.id = request_row.employee_id;
  if actor is null or (actor <> employee_profile and not public.has_permission('leave.manage')) then
    raise insufficient_privilege using message = 'You may only attach evidence to your own leave request.';
  end if;
  if request_row.status <> 'pending' then
    raise invalid_parameter_value using message = 'Evidence can only be changed while leave is pending.';
  end if;
  if (select count(*) from public.leave_documents document
      where document.leave_request_id = p_leave_request_id and document.removed_at is null) >= 10 then
    raise check_violation using message = 'A leave request can contain up to 10 supporting documents.';
  end if;
  if p_storage_path !~ ('^' || actor::text || '/leave-evidence/' || p_leave_request_id::text ||
      '/[0-9a-f-]+[.](pdf|jpe?g|png|webp|heic|heif|avif)$')
     or not public.is_valid_private_file_path(p_storage_path)
     or not exists (select 1 from storage.objects object
       where object.bucket_id = 'private-files' and object.name = p_storage_path) then
    raise check_violation using message = 'A valid uploaded leave document is required.';
  end if;

  insert into public.leave_documents
    (leave_request_id, employee_id, storage_path, original_file_name, mime_type, size_bytes, uploaded_by)
  values
    (p_leave_request_id, request_row.employee_id, p_storage_path, btrim(p_original_file_name),
      lower(p_mime_type), p_size_bytes, actor)
  returning id into document_id;

  insert into public.leave_request_events
    (leave_request_id, event_type, from_status, to_status, actor_profile_id, reason)
  values (p_leave_request_id, 'evidence_attached', request_row.status, request_row.status,
    actor, btrim(p_original_file_name));
  return document_id;
end
$$;
revoke all on function public.rpc_attach_leave_document(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.rpc_attach_leave_document(uuid, text, text, text, bigint) to authenticated;

create or replace function public.rpc_list_leave_documents(p_leave_request_id uuid)
returns table (
  id uuid, storage_path text, original_file_name text, mime_type text,
  size_bytes bigint, created_at timestamptz
) language plpgsql security definer set search_path = '' stable as $$
declare actor uuid := public.current_profile_id(); employee_profile uuid;
begin
  select employee.profile_id into employee_profile
  from public.leave_requests request_row
  join public.employees employee on employee.id = request_row.employee_id
  where request_row.id = p_leave_request_id;
  if employee_profile is null then raise no_data_found using message = 'Leave request not found.'; end if;
  if actor is null or (actor <> employee_profile and not public.has_permission('leave.manage')) then
    raise insufficient_privilege using message = 'You may only view evidence for your own leave request.';
  end if;
  return query
  select document.id, document.storage_path, document.original_file_name,
    document.mime_type, document.size_bytes, document.created_at
  from public.leave_documents document
  where document.leave_request_id = p_leave_request_id and document.removed_at is null
  order by document.created_at, document.id;
end
$$;
revoke all on function public.rpc_list_leave_documents(uuid) from public, anon;
grant execute on function public.rpc_list_leave_documents(uuid) to authenticated;

create or replace function public.rpc_remove_leave_document(p_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.current_profile_id();
  document_row public.leave_documents%rowtype;
  request_row public.leave_requests%rowtype;
  employee_profile uuid;
begin
  select * into document_row from public.leave_documents where id = p_document_id for update;
  if not found or document_row.removed_at is not null then
    raise no_data_found using message = 'Leave document not found.';
  end if;
  select * into request_row from public.leave_requests where id = document_row.leave_request_id for update;
  select profile_id into employee_profile from public.employees where id = request_row.employee_id;
  if actor is null or (actor <> employee_profile and not public.has_permission('leave.manage')) then
    raise insufficient_privilege using message = 'You may only remove evidence from your own leave request.';
  end if;
  if request_row.status <> 'pending' then
    raise invalid_parameter_value using message = 'Evidence can only be changed while leave is pending.';
  end if;
  update public.leave_documents set removed_at = now(), removed_by = actor where id = p_document_id;
  insert into public.leave_request_events
    (leave_request_id, event_type, from_status, to_status, actor_profile_id, reason)
  values (request_row.id, 'evidence_removed', request_row.status, request_row.status,
    actor, document_row.original_file_name);
end
$$;
revoke all on function public.rpc_remove_leave_document(uuid) from public, anon;
grant execute on function public.rpc_remove_leave_document(uuid) to authenticated;

-- Evidence-aware approval is defined after leave_documents exists so clean databases
-- can apply 0085 and 0086 in sequence.
create or replace function public.rpc_decide_leave_request(p_request_id uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.leave_assert_hr(); request_row public.leave_requests%rowtype; employee_profile uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise invalid_parameter_value using message = 'Decision must be approved or rejected.';
  end if;
  if p_decision = 'rejected' and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise invalid_parameter_value using message = 'A rejection reason of at least 3 characters is required.';
  end if;
  select * into request_row from public.leave_requests where id = p_request_id for update;
  if request_row.id is null then raise no_data_found using message = 'Leave request not found.'; end if;
  if request_row.status = p_decision then return; end if;
  if request_row.status <> 'pending' then
    raise invalid_parameter_value using message = 'Only pending leave can be decided.';
  end if;
  if p_decision = 'approved'
    and exists (
      select 1 from public.leave_types type_row
      where type_row.id = request_row.leave_type_id and type_row.requires_evidence
    )
    and not exists (
      select 1 from public.leave_documents document
      where document.leave_request_id = p_request_id and document.removed_at is null
    ) then
    raise invalid_parameter_value using message = 'Supporting evidence is required before this leave can be approved.';
  end if;
  update public.leave_requests set status = p_decision, decided_by = actor, decided_at = now(),
    decision_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now()
  where id = p_request_id;
  insert into public.leave_request_events
    (leave_request_id, event_type, from_status, to_status, actor_profile_id, reason)
  values (p_request_id, p_decision, 'pending', p_decision, actor,
    nullif(btrim(coalesce(p_reason, '')), ''));
  select employee.profile_id into employee_profile
  from public.employees employee where employee.id = request_row.employee_id;
  if employee_profile is not null then
    insert into public.notifications (recipient_profile_id, title, message, category, event_key, action_path)
    values (employee_profile, 'Leave Request ' || initcap(p_decision),
      'HR has ' || p_decision || ' your leave request.', 'hr',
      'leave_decision_' || p_request_id || '_' || p_decision,
      '/my/leave?request=' || p_request_id) on conflict (event_key) do nothing;
  end if;
end
$$;
revoke all on function public.rpc_decide_leave_request(uuid, text, text) from public, anon;
grant execute on function public.rpc_decide_leave_request(uuid, text, text) to authenticated;

drop policy if exists private_files_read on storage.objects;
create policy private_files_read on storage.objects for select to authenticated using (
  bucket_id = 'private-files' and public.is_valid_private_file_path(name) and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('files.read')
    or exists (select 1 from public.project_documents document where document.storage_path = storage.objects.name
      and document.archived_at is null and (public.has_permission('projects.read_all') or public.is_member_on_project(document.project_id, auth.uid())))
    or exists (select 1 from public.employee_documents document join public.employees employee on employee.id = document.employee_id
      where document.storage_path = storage.objects.name and document.employee_visible and document.archived_at is null
        and employee.profile_id = auth.uid() and employee.archived_at is null)
    or exists (select 1 from public.cash_advance_expenses expense join public.cash_advance_requests request on request.id = expense.cash_advance_id
      where expense.receipt_url = storage.objects.name and (request.user_id = auth.uid() or public.has_permission('cash_advances.manage')))
    or exists (select 1 from public.daily_updates update_row where storage.objects.name = any(update_row.photo_urls)
      and (public.has_permission('daily_updates.read_all') or public.is_member_on_project(update_row.project_id, auth.uid()) or update_row.submitted_by = auth.uid()))
    or exists (select 1 from public.leave_documents document
      where document.storage_path = storage.objects.name and document.removed_at is null
        and public.has_permission('leave.manage')
        and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
  )
);

create or replace function public._payroll_leave_percentage(
  p_employee_id uuid,
  p_period_start date,
  p_base_percentage numeric
) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  period_end date := (p_period_start + interval '1 month - 1 day')::date;
  working_days integer;
  unpaid_days integer;
begin
  if p_period_start <> date_trunc('month', p_period_start)::date then
    raise invalid_parameter_value using message = 'Payroll period must start on the first day of a month.';
  end if;
  if p_base_percentage not between 0 and 100 then
    raise invalid_parameter_value using message = 'Payroll percentage must be between 0 and 100.';
  end if;

  select count(*)::integer into working_days
  from generate_series(p_period_start, period_end, interval '1 day') day_value
  where extract(isodow from day_value) < 6
    and not exists (
      select 1 from public.public_holidays holiday
      where holiday.holiday_date = day_value::date and holiday.is_active
    );

  select count(distinct day_value::date)::integer into unpaid_days
  from public.leave_requests request_row
  join public.leave_types type_row
    on type_row.id = request_row.leave_type_id and type_row.is_paid = false
  cross join lateral generate_series(
    greatest(request_row.start_date, p_period_start),
    least(request_row.end_date, period_end),
    interval '1 day'
  ) day_value
  where request_row.employee_id = p_employee_id
    and request_row.status = 'approved'
    and request_row.start_date <= period_end
    and request_row.end_date >= p_period_start
    and extract(isodow from day_value) < 6
    and not exists (
      select 1 from public.public_holidays holiday
      where holiday.holiday_date = day_value::date and holiday.is_active
    );

  if working_days = 0 then return p_base_percentage; end if;
  return round(p_base_percentage * greatest(working_days - unpaid_days, 0) / working_days, 4);
end
$$;
revoke all on function public._payroll_leave_percentage(uuid, date, numeric) from public, anon, authenticated;

create or replace function public.rpc_payroll_leave_percentage(
  p_employee_id uuid,
  p_period_start date,
  p_base_percentage numeric
) returns numeric
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('payroll.prepare') then
    raise insufficient_privilege using message = 'payroll.prepare permission is required';
  end if;
  return public._payroll_leave_percentage(p_employee_id, p_period_start, p_base_percentage);
end
$$;
revoke all on function public.rpc_payroll_leave_percentage(uuid, date, numeric) from public, anon;
grant execute on function public.rpc_payroll_leave_percentage(uuid, date, numeric) to authenticated;

-- Preserve the established payroll calculator, then place the Leave adjustment at
-- its single server-side entry point. All draft, replacement and amendment RPCs
-- already call _insert_payroll_items, so alternate clients cannot bypass Leave.
alter function public._insert_payroll_items(uuid, jsonb) rename to _insert_payroll_items_before_leave;
revoke all on function public._insert_payroll_items_before_leave(uuid, jsonb) from public, anon, authenticated;

create or replace function public._insert_payroll_items(target_run_id uuid, item_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.current_profile_id();
  period_start date;
  run_type text;
  item jsonb;
  adjusted_payload jsonb := '[]'::jsonb;
  target_employee_id uuid;
  base_percentage numeric;
  adjusted_percentage numeric;
  payroll_item public.payroll_items%rowtype;
  leave_amount numeric;
begin
  select period.period_start, run.run_type into period_start, run_type
  from public.payroll_runs run
  join public.payroll_periods period on period.id = run.period_id
  where run.id = target_run_id;
  if period_start is null then raise no_data_found using message = 'payroll run not found'; end if;

  if run_type = 'historical' then
    perform public._insert_payroll_items_before_leave(target_run_id, item_payload);
    return;
  end if;

  for item in select value from jsonb_array_elements(item_payload) loop
    target_employee_id := (item ->> 'employee_id')::uuid;
    select coalesce(nullif(item ->> 'percent_of_month_worked', '')::numeric, confidential.pct_month_worked)
      into base_percentage
    from public.employee_confidential_profiles confidential
    where confidential.employee_id = target_employee_id;
    if base_percentage is null then
      raise check_violation using message = 'each payroll employee requires an active compensation profile';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(item -> 'line_items', '[]'::jsonb)) line
      where upper(btrim(line ->> 'code')) = 'UNPAID_LEAVE'
    ) then
      raise check_violation using message = 'UNPAID_LEAVE is reserved for the automatic leave calculation';
    end if;
    adjusted_percentage := public._payroll_leave_percentage(target_employee_id, period_start, base_percentage);
    adjusted_payload := adjusted_payload || jsonb_build_array(
      jsonb_set(item, '{percent_of_month_worked}', to_jsonb(adjusted_percentage), true)
    );
  end loop;

  perform public._insert_payroll_items_before_leave(target_run_id, adjusted_payload);

  for item in select value from jsonb_array_elements(item_payload) loop
    target_employee_id := (item ->> 'employee_id')::uuid;
    select coalesce(nullif(item ->> 'percent_of_month_worked', '')::numeric, confidential.pct_month_worked)
      into base_percentage
    from public.employee_confidential_profiles confidential
    where confidential.employee_id = target_employee_id;
    adjusted_percentage := public._payroll_leave_percentage(target_employee_id, period_start, base_percentage);
    if adjusted_percentage < base_percentage then
      select * into payroll_item from public.payroll_items
      where run_id = target_run_id and employee_id = target_employee_id;
      leave_amount := round(payroll_item.contractual_gross * (base_percentage - adjusted_percentage) / 100);
      if leave_amount > 0 then
        insert into public.payroll_line_items
          (payroll_item_id, kind, code, description, amount, created_by)
        values
          (payroll_item.id, 'deduction', 'UNPAID_LEAVE',
           'Unpaid leave applied through payroll proration', leave_amount, actor);
      end if;
    end if;
  end loop;
end
$$;
revoke all on function public._insert_payroll_items(uuid, jsonb) from public, anon, authenticated;
