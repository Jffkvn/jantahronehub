-- Acceptance batch: trusted inventory valuation, operational identities,
-- navigable notifications and private daily-update evidence.

alter table public.notifications
  add column if not exists action_path text;

alter table public.notifications
  drop constraint if exists notifications_action_path_check;
alter table public.notifications
  add constraint notifications_action_path_check check (
    action_path is null or (
      action_path ~ '^/[A-Za-z0-9_/-]+$'
      and action_path !~ '//'
      and action_path !~ '\.\.'
    )
  );

create or replace function public.set_notification_action_path()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_entity_id uuid;
  v_project_id uuid;
begin
  if new.action_path is not null then return new; end if;

  if new.event_key ~ '^cash_advance_request_[0-9a-f-]{36}_' then
    v_entity_id := substring(new.event_key from '^cash_advance_request_([0-9a-f-]{36})_')::uuid;
    new.action_path := '/cash/advances/' || v_entity_id;
  elsif new.event_key ~ '^stock_request_[0-9a-f-]{36}_' then
    v_entity_id := substring(new.event_key from '^stock_request_([0-9a-f-]{36})_')::uuid;
    new.action_path := '/inventory/requests/' || v_entity_id;
  elsif new.event_key ~ '^daily_update_[0-9a-f-]{36}_' then
    v_entity_id := substring(new.event_key from '^daily_update_([0-9a-f-]{36})_')::uuid;
    select update_row.project_id into v_project_id
    from public.daily_updates update_row where update_row.id = v_entity_id;
    if v_project_id is not null then
      new.action_path := '/projects/' || v_project_id || '/updates';
    end if;
  elsif new.event_key ~ '^project_assignment_[0-9a-f-]{36}$' then
    v_entity_id := substring(new.event_key from '^project_assignment_([0-9a-f-]{36})$')::uuid;
    select assignment.project_id into v_project_id
    from public.project_assignments assignment where assignment.id = v_entity_id;
    if v_project_id is not null then
      new.action_path := '/projects/' || v_project_id || '/team';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists notification_action_path on public.notifications;
create trigger notification_action_path
before insert on public.notifications
for each row execute function public.set_notification_action_path();

-- Backfill existing notifications without changing their read state.
update public.notifications set action_path = null where action_path is null;

create or replace function public.project_role_label(p_project_id uuid, p_profile_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case assignment.role_on_project
       when 'pm' then 'Project Manager'
       when 'coordinator' then 'Project Coordinator'
     end
     from public.project_assignments assignment
     where assignment.project_id = p_project_id
       and assignment.user_id = p_profile_id
       and assignment.unassigned_at is null
     order by assignment.assigned_at desc limit 1),
    (select role.name from public.user_roles user_role
     join public.roles role on role.id = user_role.role_id
     where user_role.profile_id = p_profile_id
     order by case role.key
       when 'project_manager' then 1 when 'coordinator' then 2
       when 'cfo' then 3 when 'warehouse_manager' then 4 else 10 end,
       role.name limit 1),
    'Team member'
  )
$$;
revoke all on function public.project_role_label(uuid, uuid) from public, anon, authenticated;

create or replace function public.rpc_list_stock_requests(p_request_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    to_jsonb(request_row) || jsonb_build_object(
      'requester_name', coalesce(requester.display_name, 'Unknown team member'),
      'requester_role', public.project_role_label(request_row.project_id, request_row.requested_by),
      'profiles_requested_by', jsonb_build_object('display_name', coalesce(requester.display_name, 'Unknown team member')),
      'profiles_approved_by', case when approver.id is null then null else jsonb_build_object('display_name', approver.display_name) end
    ) order by request_row.created_at desc
  ), '[]'::jsonb)
  from public.stock_requests request_row
  left join public.profiles requester on requester.id = request_row.requested_by
  left join public.profiles approver on approver.id = request_row.approved_by
  where (p_request_id is null or request_row.id = p_request_id)
    and (
      request_row.requested_by = public.current_profile_id()
      or public.profile_has_role(public.current_profile_id(), 'warehouse_manager')
      or public.profile_has_role(public.current_profile_id(), 'cfo')
      or public.profile_has_role(public.current_profile_id(), 'super_admin')
      or public.is_member_on_project(request_row.project_id, public.current_profile_id())
    )
$$;
grant execute on function public.rpc_list_stock_requests(uuid) to authenticated;

create or replace function public.rpc_list_cash_advances(p_request_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    to_jsonb(request_row) || jsonb_build_object(
      'projects', jsonb_build_object('name', project.name),
      'profiles_user', jsonb_build_object('display_name', coalesce(recipient.display_name, 'Unknown team member')),
      'profiles_entered_by', jsonb_build_object('display_name', coalesce(entered.display_name, 'Unknown team member')),
      'profiles_approved_by', case when approved.id is null then null else jsonb_build_object('display_name', approved.display_name) end,
      'profiles_disbursed_by', case when disbursed.id is null then null else jsonb_build_object('display_name', disbursed.display_name) end,
      'profiles_closed_by', case when closed.id is null then null else jsonb_build_object('display_name', closed.display_name) end,
      'requester_role', public.project_role_label(request_row.project_id, request_row.user_id)
    ) order by request_row.requested_at desc
  ), '[]'::jsonb)
  from public.cash_advance_requests request_row
  join public.projects project on project.id = request_row.project_id
  left join public.profiles recipient on recipient.id = request_row.user_id
  left join public.profiles entered on entered.id = request_row.entered_by
  left join public.profiles approved on approved.id = request_row.approved_by
  left join public.profiles disbursed on disbursed.id = request_row.disbursed_by
  left join public.profiles closed on closed.id = request_row.closed_by
  where (p_request_id is null or request_row.id = p_request_id)
    and (
      public.has_permission('cash_advances.view_all')
      or request_row.user_id = public.current_profile_id()
      or request_row.entered_by = public.current_profile_id()
    )
$$;
grant execute on function public.rpc_list_cash_advances(uuid) to authenticated;

create or replace function public.rpc_list_daily_updates(p_project_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    to_jsonb(update_row) || jsonb_build_object(
      'profiles_submitted_by', jsonb_build_object(
        'display_name', coalesce(submitter.display_name, 'Unknown team member'),
        'role_name', public.project_role_label(update_row.project_id, update_row.submitted_by)
      ),
      'profiles_endorsed_by', case when endorser.id is null then null else jsonb_build_object('display_name', endorser.display_name) end,
      'projects', jsonb_build_object('name', project.name)
    ) order by update_row.update_date desc, update_row.created_at desc
  ), '[]'::jsonb)
  from public.daily_updates update_row
  join public.projects project on project.id = update_row.project_id
  left join public.profiles submitter on submitter.id = update_row.submitted_by
  left join public.profiles endorser on endorser.id = update_row.endorsed_by
  where (p_project_id is null or update_row.project_id = p_project_id)
    and (
      public.has_permission('daily_updates.read_all')
      or update_row.submitted_by = public.current_profile_id()
      or public.is_member_on_project(update_row.project_id, public.current_profile_id())
    )
$$;
grant execute on function public.rpc_list_daily_updates(uuid) to authenticated;

-- Requesters provide quantities only. The warehouse ledger is the valuation authority.
create or replace function public.rpc_request_stock(p_project_id uuid, p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_request_id uuid;
  v_item jsonb;
  v_consumable_item_id uuid;
  v_equipment_asset_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_expected_return_date date;
  v_total numeric := 0;
  v_escalated boolean := false;
  v_actor uuid := public.current_profile_id();
  v_project_name text;
  v_project_status text;
  v_asset_status text;
  v_sensitive boolean;
  v_available integer;
  v_reorder integer;
  v_settings record;
begin
  if v_actor is null or not public.has_permission('inventory.request') then
    raise insufficient_privilege using message = 'Insufficient permissions to request stock.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise invalid_parameter_value using message = 'At least one request item is required.';
  end if;
  select project.name, project.status into v_project_name, v_project_status
  from public.projects project where project.id = p_project_id;
  if not found then raise invalid_parameter_value using message = 'Canonical project not found.'; end if;
  if v_project_status not in ('planned', 'active', 'on_hold') then
    raise invalid_parameter_value using message = 'Stock can be requested only for an operational project.';
  end if;
  if (public.profile_has_role(v_actor, 'project_manager') or public.profile_has_role(v_actor, 'coordinator'))
     and not public.is_member_on_project(p_project_id, v_actor) then
    raise insufficient_privilege using message = 'Active project assignment is required to request stock.';
  end if;
  select approval_mode, cfo_threshold, critical_stock_escalation into v_settings
  from public.inventory_settings where singleton = true;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_consumable_item_id := nullif(v_item->>'consumable_item_id', '')::uuid;
    v_equipment_asset_id := nullif(v_item->>'equipment_asset_id', '')::uuid;
    v_quantity := nullif(v_item->>'quantity', '')::integer;
    v_expected_return_date := nullif(v_item->>'expected_return_date', '')::date;
    if (v_consumable_item_id is null) = (v_equipment_asset_id is null) or v_quantity is null or v_quantity <= 0 then
      raise invalid_parameter_value using message = 'Invalid stock request item.';
    end if;
    if v_expected_return_date is not null and (v_equipment_asset_id is null or v_expected_return_date < current_date) then
      raise invalid_parameter_value using message = 'Invalid expected return date.';
    end if;

    select receipt_item.unit_price into v_unit_price
    from public.stock_receipt_items receipt_item
    join public.stock_receipts receipt on receipt.id = receipt_item.receipt_id
    where receipt_item.unit_price > 0
      and ((v_consumable_item_id is not null and receipt_item.consumable_item_id = v_consumable_item_id)
        or (v_equipment_asset_id is not null and receipt_item.equipment_asset_id = v_equipment_asset_id))
    order by receipt.received_at desc, receipt_item.id desc limit 1;
    if v_unit_price is null then
      raise invalid_parameter_value using message = 'Warehouse valuation is missing for a requested item. Record a positive purchase value before requesting it.';
    end if;
    v_total := v_total + (v_quantity * v_unit_price);

    if v_equipment_asset_id is not null then
      if v_quantity <> 1 then raise invalid_parameter_value using message = 'Equipment request quantity must be exactly one.'; end if;
      select asset.status, asset.is_sensitive into v_asset_status, v_sensitive
      from public.equipment_assets asset where asset.id = v_equipment_asset_id;
      if not found then raise invalid_parameter_value using message = 'Equipment asset not found.'; end if;
      if v_asset_status <> 'available' then raise invalid_parameter_value using message = 'Equipment asset is not available.'; end if;
      if v_settings.approval_mode = 'threshold_escalation' and v_sensitive then v_escalated := true; end if;
    else
      select coalesce(sum(movement.quantity), 0) into v_available
      from public.stock_movements movement where movement.consumable_item_id = v_consumable_item_id;
      if v_available < v_quantity then raise invalid_parameter_value using message = 'Insufficient stock available in ledger.'; end if;
      select item.reorder_level into v_reorder from public.consumable_items item where item.id = v_consumable_item_id;
      if v_settings.approval_mode = 'threshold_escalation' and v_settings.critical_stock_escalation
         and v_available - v_quantity < v_reorder then v_escalated := true; end if;
    end if;
  end loop;

  if v_settings.approval_mode = 'cfo_approval_all' then v_escalated := true;
  elsif v_settings.approval_mode = 'warehouse_manager_only' then v_escalated := false;
  elsif v_total >= v_settings.cfo_threshold then v_escalated := true; end if;

  insert into public.stock_requests (requested_by, project_id, project_name, status, total_estimated_value, escalated_to_cfo)
  values (v_actor, p_project_id, v_project_name, 'pending_approval', v_total, v_escalated)
  returning id into v_request_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_consumable_item_id := nullif(v_item->>'consumable_item_id', '')::uuid;
    v_equipment_asset_id := nullif(v_item->>'equipment_asset_id', '')::uuid;
    select receipt_item.unit_price into v_unit_price
    from public.stock_receipt_items receipt_item join public.stock_receipts receipt on receipt.id = receipt_item.receipt_id
    where receipt_item.unit_price > 0 and ((v_consumable_item_id is not null and receipt_item.consumable_item_id = v_consumable_item_id)
      or (v_equipment_asset_id is not null and receipt_item.equipment_asset_id = v_equipment_asset_id))
    order by receipt.received_at desc, receipt_item.id desc limit 1;
    insert into public.stock_request_items (request_id, consumable_item_id, equipment_asset_id, quantity, estimated_unit_price, expected_return_date)
    values (v_request_id, v_consumable_item_id, v_equipment_asset_id, (v_item->>'quantity')::integer,
      v_unit_price, nullif(v_item->>'expected_return_date', '')::date);
  end loop;
  return v_request_id;
end
$$;
grant execute on function public.rpc_request_stock(uuid, jsonb) to authenticated;

create or replace function public.rpc_save_daily_update(
  p_update_id uuid, p_project_id uuid, p_update_date date, p_summary text,
  p_photo_urls text[], p_submit boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.current_profile_id();
  saved_id uuid;
  existing public.daily_updates%rowtype;
  evidence_path text;
begin
  if actor is null or not public.is_coordinator_on_project(p_project_id, actor) then
    raise insufficient_privilege using message = 'active coordinator assignment is required';
  end if;
  if length(btrim(coalesce(p_summary, ''))) < 1 then raise check_violation using message = 'daily update summary is required'; end if;
  if p_update_date is null then raise not_null_violation using message = 'daily update date is required'; end if;
  if coalesce(cardinality(p_photo_urls), 0) > 10 then raise check_violation using message = 'A daily update can contain up to 10 photos.'; end if;

  if p_update_id is not null then
    select * into existing from public.daily_updates where id = p_update_id for update;
    if not found then raise no_data_found using message = 'daily update not found'; end if;
    if existing.submitted_by <> actor or existing.project_id <> p_project_id or existing.status not in ('draft', 'revision_requested') then
      raise insufficient_privilege using message = 'only the assigned original coordinator may revise this update';
    end if;
  end if;

  foreach evidence_path in array coalesce(p_photo_urls, array[]::text[]) loop
    if evidence_path = any(coalesce(existing.photo_urls, array[]::text[])) then continue; end if;
    if evidence_path !~ ('^' || actor::text || '/daily-evidence/' || p_project_id::text || '/[0-9a-f-]+[.](jpe?g|png|webp)$')
       or not public.is_valid_private_file_path(evidence_path)
       or not exists (select 1 from storage.objects object where object.bucket_id = 'private-files' and object.name = evidence_path) then
      raise check_violation using message = 'A valid uploaded daily-update photo is required.';
    end if;
  end loop;

  if p_update_id is null then
    insert into public.daily_updates (project_id, submitted_by, update_date, summary, photo_urls, status)
    values (p_project_id, actor, p_update_date, btrim(p_summary), coalesce(p_photo_urls, array[]::text[]),
      case when coalesce(p_submit, false) then 'submitted' else 'draft' end) returning id into saved_id;
  else
    update public.daily_updates set update_date = p_update_date, summary = btrim(p_summary),
      photo_urls = coalesce(p_photo_urls, array[]::text[]), status = case when coalesce(p_submit, false) then 'submitted' else 'draft' end,
      pm_feedback = case when coalesce(p_submit, false) then null else pm_feedback end,
      endorsed_by = null, endorsed_at = null, updated_at = now()
    where id = p_update_id returning id into saved_id;
  end if;

  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values)
  values (actor, case when p_update_id is null then 'daily_updates.created' else 'daily_updates.revised' end,
    'daily_update', saved_id::text, jsonb_build_object('project_id', p_project_id, 'update_date', p_update_date,
      'submitted', coalesce(p_submit, false), 'photo_count', coalesce(cardinality(p_photo_urls), 0)));
  return saved_id;
end
$$;

drop policy if exists private_files_read on storage.objects;
create policy private_files_read on storage.objects for select to authenticated using (
  bucket_id = 'private-files' and public.is_valid_private_file_path(name) and (
    (storage.foldername(name))[1] = auth.uid()::text or public.has_permission('files.read')
    or exists (select 1 from public.project_documents document where document.storage_path = storage.objects.name
      and document.archived_at is null and (public.has_permission('projects.read_all') or public.is_member_on_project(document.project_id, auth.uid())))
    or exists (select 1 from public.employee_documents document join public.employees employee on employee.id = document.employee_id
      where document.storage_path = storage.objects.name and document.employee_visible and document.archived_at is null
        and employee.profile_id = auth.uid() and employee.archived_at is null)
    or exists (select 1 from public.cash_advance_expenses expense join public.cash_advance_requests request on request.id = expense.cash_advance_id
      where expense.receipt_url = storage.objects.name and (request.user_id = auth.uid() or public.has_permission('cash_advances.manage')))
    or exists (select 1 from public.daily_updates update_row where storage.objects.name = any(update_row.photo_urls)
      and (public.has_permission('daily_updates.read_all') or public.is_member_on_project(update_row.project_id, auth.uid()) or update_row.submitted_by = auth.uid()))
  )
);
