-- Canonical project identity for stock requests and equipment custody.

alter table public.stock_requests
  add column project_id uuid references public.projects(id) on delete restrict;

alter table public.stock_request_items
  add column expected_return_date date,
  add constraint stock_request_items_expected_return_equipment_check
    check (expected_return_date is null or equipment_asset_id is not null);

alter table public.asset_custody
  add column project_id uuid references public.projects(id) on delete restrict,
  add column expected_return_date date;

create index stock_requests_project_idx
  on public.stock_requests (project_id, created_at desc);
create index asset_custody_project_active_idx
  on public.asset_custody (project_id, expected_return_date)
  where ended_at is null;

-- Backfill only unambiguous normalized names. The display snapshot remains for
-- historical readability but is not used as the operational relationship.
with normalized_matches as (
  select request.id as request_id, (array_agg(project.id order by project.id))[1] as project_id
  from public.stock_requests request
  join public.projects project
    on lower(regexp_replace(btrim(project.name), '\s+', ' ', 'g'))
     = lower(regexp_replace(btrim(request.project_name), '\s+', ' ', 'g'))
  group by request.id
  having count(*) = 1
)
update public.stock_requests request
set project_id = match.project_id
from normalized_matches match
where request.id = match.request_id;

update public.asset_custody custody
set project_id = request.project_id,
    expected_return_date = item.expected_return_date
from public.stock_requests request,
     public.stock_request_items item
where request.id = custody.stock_request_id
  and item.id = custody.stock_request_item_id
  and item.request_id = request.id
  and request.project_id is not null;

create or replace function public.rpc_list_unresolved_inventory_project_links()
returns table (
  record_type text,
  record_id uuid,
  project_name_snapshot text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.has_permission('inventory.read')
    or public.has_permission('projects.read_all')
  ) then
    raise insufficient_privilege using message = 'inventory oversight permission is required';
  end if;

  return query
  select 'stock_request'::text, request.id, request.project_name, request.created_at
  from public.stock_requests request
  where request.project_id is null
  union all
  select 'asset_custody'::text, custody.id, custody.project_name, custody.created_at
  from public.asset_custody custody
  where custody.project_id is null
  order by created_at desc;
end
$$;

create or replace function public.rpc_request_stock(
  p_project_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_item jsonb;
  v_consumable_item_id uuid;
  v_equipment_asset_id uuid;
  v_quantity integer;
  v_estimated_unit_price numeric;
  v_expected_return_date date;
  v_total_estimated_value numeric := 0;
  v_escalated_to_cfo boolean := false;
  v_profile_id uuid := public.current_profile_id();
  v_project_name text;
  v_project_status text;
  v_asset_status text;
  v_is_sensitive boolean;
  v_available_qty integer;
  v_reorder_level integer;
  v_settings record;
begin
  if v_profile_id is null or not public.has_permission('inventory.request') then
    raise insufficient_privilege using message = 'Insufficient permissions to request stock.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise invalid_parameter_value using message = 'At least one request item is required.';
  end if;

  select project.name, project.status
  into v_project_name, v_project_status
  from public.projects project
  where project.id = p_project_id;
  if not found then
    raise invalid_parameter_value using message = 'Canonical project not found.';
  end if;
  if v_project_status not in ('planned', 'active', 'on_hold') then
    raise invalid_parameter_value using message = 'Stock can be requested only for an operational project.';
  end if;
  if (
    public.profile_has_role(v_profile_id, 'project_manager')
    or public.profile_has_role(v_profile_id, 'coordinator')
  ) and not public.is_member_on_project(p_project_id, v_profile_id) then
    raise insufficient_privilege using message = 'Active project assignment is required to request stock.';
  end if;

  select approval_mode, cfo_threshold, critical_stock_escalation
  into v_settings
  from public.inventory_settings
  where singleton = true;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_consumable_item_id := nullif(v_item->>'consumable_item_id', '')::uuid;
    v_equipment_asset_id := nullif(v_item->>'equipment_asset_id', '')::uuid;
    v_quantity := nullif(v_item->>'quantity', '')::integer;
    v_estimated_unit_price := nullif(v_item->>'estimated_unit_price', '')::numeric;
    v_expected_return_date := nullif(v_item->>'expected_return_date', '')::date;

    if (v_consumable_item_id is null) = (v_equipment_asset_id is null)
       or v_quantity is null or v_quantity <= 0
       or v_estimated_unit_price is null or v_estimated_unit_price < 0 then
      raise invalid_parameter_value using message = 'Invalid stock request item.';
    end if;
    if v_expected_return_date is not null and v_equipment_asset_id is null then
      raise invalid_parameter_value using message = 'Expected return applies only to equipment.';
    end if;
    if v_expected_return_date is not null and v_expected_return_date < current_date then
      raise invalid_parameter_value using message = 'Expected return date cannot be in the past.';
    end if;

    v_total_estimated_value := v_total_estimated_value + (v_quantity * v_estimated_unit_price);
    if v_equipment_asset_id is not null then
      if v_quantity <> 1 then
        raise invalid_parameter_value using message = 'Equipment request quantity must be exactly one.';
      end if;
      select asset.status, asset.is_sensitive
      into v_asset_status, v_is_sensitive
      from public.equipment_assets asset
      where asset.id = v_equipment_asset_id;
      if not found then raise invalid_parameter_value using message = 'Equipment asset not found.'; end if;
      if v_asset_status <> 'available' then
        raise invalid_parameter_value using message = 'Equipment asset is not available.';
      end if;
      if v_settings.approval_mode = 'threshold_escalation' and v_is_sensitive then
        v_escalated_to_cfo := true;
      end if;
    else
      select coalesce(sum(movement.quantity), 0)
      into v_available_qty
      from public.stock_movements movement
      where movement.consumable_item_id = v_consumable_item_id;
      if v_available_qty < v_quantity then
        raise invalid_parameter_value using message = 'Insufficient stock available in ledger.';
      end if;
      if v_settings.approval_mode = 'threshold_escalation' and v_settings.critical_stock_escalation then
        select item.reorder_level into v_reorder_level
        from public.consumable_items item where item.id = v_consumable_item_id;
        if not found then raise invalid_parameter_value using message = 'Consumable item not found.'; end if;
        if v_available_qty - v_quantity < v_reorder_level then v_escalated_to_cfo := true; end if;
      end if;
    end if;
  end loop;

  if v_settings.approval_mode = 'cfo_approval_all' then
    v_escalated_to_cfo := true;
  elsif v_settings.approval_mode = 'warehouse_manager_only' then
    v_escalated_to_cfo := false;
  elsif v_total_estimated_value >= v_settings.cfo_threshold then
    v_escalated_to_cfo := true;
  end if;

  insert into public.stock_requests (
    requested_by, project_id, project_name, status,
    total_estimated_value, escalated_to_cfo
  ) values (
    v_profile_id, p_project_id, v_project_name, 'pending_approval',
    v_total_estimated_value, v_escalated_to_cfo
  ) returning id into v_request_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.stock_request_items (
      request_id, consumable_item_id, equipment_asset_id, quantity,
      estimated_unit_price, expected_return_date
    ) values (
      v_request_id,
      nullif(v_item->>'consumable_item_id', '')::uuid,
      nullif(v_item->>'equipment_asset_id', '')::uuid,
      (v_item->>'quantity')::integer,
      (v_item->>'estimated_unit_price')::numeric,
      nullif(v_item->>'expected_return_date', '')::date
    );
  end loop;
  return v_request_id;
end
$$;

-- Transitional compatibility: a name must resolve to exactly one project.
create or replace function public.rpc_request_stock(
  p_project_name text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_match_count integer;
begin
  select count(*), (array_agg(project.id order by project.id))[1]
  into v_match_count, v_project_id
  from public.projects project
  where lower(regexp_replace(btrim(project.name), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(p_project_name), '\s+', ' ', 'g'));
  if v_match_count <> 1 then
    raise invalid_parameter_value using message = 'Project name must resolve to exactly one canonical project.';
  end if;
  return public.rpc_request_stock(v_project_id, p_items);
end
$$;

create or replace function public.sync_asset_custody_project_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_project_id uuid;
  v_item_return_date date;
  v_project_name text;
begin
  select request.project_id, item.expected_return_date
  into v_request_project_id, v_item_return_date
  from public.stock_requests request
  join public.stock_request_items item on item.request_id = request.id
  where request.id = new.stock_request_id
    and item.id = new.stock_request_item_id;
  if not found then raise foreign_key_violation using message = 'Custody request item does not belong to its request.'; end if;
  new.project_id := coalesce(new.project_id, v_request_project_id);
  new.expected_return_date := coalesce(new.expected_return_date, v_item_return_date);
  if new.project_id is not null then
    select project.name into v_project_name from public.projects project where project.id = new.project_id;
    if not found then raise foreign_key_violation using message = 'Custody project not found.'; end if;
    new.project_name := v_project_name;
  end if;
  return new;
end
$$;

create trigger asset_custody_project_link_before_insert
before insert on public.asset_custody
for each row execute function public.sync_asset_custody_project_link();

create or replace function public.rpc_transfer_asset_custody(
  p_equipment_asset_id uuid,
  p_new_custodian_profile_id uuid,
  p_project_id uuid,
  p_expected_return_date date,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_current public.asset_custody%rowtype;
  v_reason text := btrim(p_reason);
begin
  if v_profile_id is null or not public.has_permission('inventory.issue') then
    raise insufficient_privilege using message = 'Insufficient permissions to transfer asset custody.';
  end if;
  if v_reason is null or v_reason = '' then
    raise invalid_parameter_value using message = 'Custody transfer reason is required.';
  end if;
  if p_expected_return_date is not null and p_expected_return_date < current_date then
    raise invalid_parameter_value using message = 'Expected return date cannot be in the past.';
  end if;
  perform 1 from public.profiles profile
  where profile.id = p_new_custodian_profile_id and profile.status = 'active';
  if not found then raise invalid_parameter_value using message = 'New custodian profile is not active.'; end if;
  perform 1 from public.projects project
  where project.id = p_project_id and project.status in ('planned', 'active', 'on_hold');
  if not found then raise invalid_parameter_value using message = 'Operational project not found.'; end if;

  select custody.* into v_current
  from public.asset_custody custody
  where custody.equipment_asset_id = p_equipment_asset_id and custody.ended_at is null
  for update;
  if not found then raise invalid_parameter_value using message = 'No active custody record exists for this asset.'; end if;
  if v_current.custodian_profile_id = p_new_custodian_profile_id
     and v_current.project_id = p_project_id
     and v_current.expected_return_date is not distinct from p_expected_return_date then
    raise invalid_parameter_value using message = 'New custody assignment must change the custodian, project, or return date.';
  end if;

  update public.asset_custody
  set ended_at = now(), ended_by = v_profile_id,
      end_reason = 'transferred', transfer_reason = v_reason
  where id = v_current.id;

  insert into public.asset_custody (
    equipment_asset_id, stock_request_id, stock_request_item_id,
    custodian_profile_id, project_id, project_name, expected_return_date,
    issued_from_warehouse_id, issued_by, issue_condition, previous_custody_id
  ) values (
    p_equipment_asset_id, v_current.stock_request_id, v_current.stock_request_item_id,
    p_new_custodian_profile_id, p_project_id, v_current.project_name, p_expected_return_date,
    v_current.issued_from_warehouse_id, v_profile_id, 'custody transfer', v_current.id
  );

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    v_profile_id, 'inventory.custody_transferred', 'asset_custody', p_equipment_asset_id::text,
    jsonb_build_object(
      'custodian_profile_id', v_current.custodian_profile_id,
      'project_id', v_current.project_id,
      'expected_return_date', v_current.expected_return_date
    ),
    jsonb_build_object(
      'custodian_profile_id', p_new_custodian_profile_id,
      'project_id', p_project_id,
      'expected_return_date', p_expected_return_date
    ),
    v_reason
  );
end
$$;

create or replace function public.rpc_get_project_inventory_summary(p_project_id uuid)
returns table (
  draft_request_count bigint,
  pending_request_count bigint,
  approved_request_count bigint,
  fulfilled_request_count bigint,
  rejected_request_count bigint,
  requested_estimated_value numeric,
  issued_estimated_value numeric,
  issued_consumable_quantity bigint,
  active_equipment_custody_count bigint,
  overdue_return_count bigint,
  damaged_or_lost_return_count bigint,
  unresolved_legacy_link_count bigint
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
  if not (
    public.has_permission('inventory.read')
    or public.has_permission('projects.read_all')
    or public.is_member_on_project(p_project_id, public.current_profile_id())
  ) then
    raise insufficient_privilege using message = 'project inventory summary access is required';
  end if;

  return query
  with project_requests as (
    select request.* from public.stock_requests request
    where request.project_id = p_project_id
  ),
  request_totals as (
    select
      count(*) filter (where request.status = 'draft')::bigint draft_count,
      count(*) filter (where request.status = 'pending_approval')::bigint pending_count,
      count(*) filter (where request.status = 'approved')::bigint approved_count,
      count(*) filter (where request.status = 'fulfilled')::bigint fulfilled_count,
      count(*) filter (where request.status = 'rejected')::bigint rejected_count,
      coalesce(sum(request.total_estimated_value), 0)::numeric requested_value
    from project_requests request
  ),
  item_totals as (
    select
      coalesce(sum(item.quantity_issued * item.estimated_unit_price), 0)::numeric issued_value,
      coalesce(sum(item.quantity_issued) filter (where item.consumable_item_id is not null), 0)::bigint consumable_quantity
    from public.stock_request_items item
    join project_requests request on request.id = item.request_id
  ),
  custody_totals as (
    select
      count(*) filter (where custody.ended_at is null)::bigint active_count,
      count(*) filter (
        where custody.ended_at is null
          and custody.expected_return_date < current_date
      )::bigint overdue_count,
      count(*) filter (
        where custody.end_reason = 'returned'
          and custody.return_condition in ('damaged', 'lost')
      )::bigint damaged_lost_count
    from public.asset_custody custody
    where custody.project_id = p_project_id
  ),
  unresolved as (
    select (
      (select count(*) from public.stock_requests request, public.projects project
       where project.id = p_project_id and request.project_id is null
         and lower(regexp_replace(btrim(request.project_name), '\s+', ' ', 'g'))
           = lower(regexp_replace(btrim(project.name), '\s+', ' ', 'g')))
      +
      (select count(*) from public.asset_custody custody, public.projects project
       where project.id = p_project_id and custody.project_id is null
         and lower(regexp_replace(btrim(custody.project_name), '\s+', ' ', 'g'))
           = lower(regexp_replace(btrim(project.name), '\s+', ' ', 'g')))
    )::bigint unresolved_count
  )
  select
    request_totals.draft_count, request_totals.pending_count,
    request_totals.approved_count, request_totals.fulfilled_count,
    request_totals.rejected_count, request_totals.requested_value,
    item_totals.issued_value, item_totals.consumable_quantity,
    custody_totals.active_count, custody_totals.overdue_count,
    custody_totals.damaged_lost_count, unresolved.unresolved_count
  from request_totals
  cross join item_totals
  cross join custody_totals
  cross join unresolved;
end
$$;

create or replace function public.rpc_transfer_asset_custody(
  p_equipment_asset_id uuid,
  p_new_custodian_profile_id uuid,
  p_project_name text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_match_count integer;
  v_expected_return_date date;
begin
  select count(*), (array_agg(project.id order by project.id))[1]
  into v_match_count, v_project_id
  from public.projects project
  where lower(regexp_replace(btrim(project.name), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(p_project_name), '\s+', ' ', 'g'));
  if v_match_count <> 1 then
    raise invalid_parameter_value using message = 'Project name must resolve to exactly one canonical project.';
  end if;
  select custody.expected_return_date into v_expected_return_date
  from public.asset_custody custody
  where custody.equipment_asset_id = p_equipment_asset_id and custody.ended_at is null;
  perform public.rpc_transfer_asset_custody(
    p_equipment_asset_id, p_new_custodian_profile_id, v_project_id,
    v_expected_return_date, p_reason
  );
end
$$;

revoke all on function public.rpc_request_stock(uuid, jsonb) from public, anon;
revoke all on function public.rpc_request_stock(text, jsonb) from public, anon;
revoke all on function public.rpc_list_unresolved_inventory_project_links() from public, anon;
revoke all on function public.rpc_transfer_asset_custody(uuid, uuid, uuid, date, text) from public, anon;
revoke all on function public.rpc_get_project_inventory_summary(uuid) from public, anon;
grant execute on function public.rpc_request_stock(uuid, jsonb) to authenticated;
grant execute on function public.rpc_request_stock(text, jsonb) to authenticated;
grant execute on function public.rpc_list_unresolved_inventory_project_links() to authenticated;
grant execute on function public.rpc_transfer_asset_custody(uuid, uuid, uuid, date, text) to authenticated;
grant execute on function public.rpc_get_project_inventory_summary(uuid) to authenticated;

comment on column public.stock_requests.project_name is
  'Historical display snapshot. project_id is the authoritative relationship.';
