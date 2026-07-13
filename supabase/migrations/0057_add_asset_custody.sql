-- Record who is responsible for every issued equipment asset, preserve
-- transfer/return history, and allow QR fulfilment of one exact request line.

alter table public.stock_request_items
  add column quantity_issued integer not null default 0,
  add column fulfilled_by uuid references public.profiles(id) on delete restrict,
  add column fulfilled_at timestamptz,
  add constraint stock_request_items_quantity_issued_check
    check (quantity_issued between 0 and quantity),
  add constraint stock_request_items_fulfilment_metadata_check
    check (
      (quantity_issued = 0 and fulfilled_by is null and fulfilled_at is null)
      or
      (quantity_issued > 0 and fulfilled_by is not null and fulfilled_at is not null)
    );

-- Preserve the state of requests fulfilled before per-line fulfilment existed.
update public.stock_request_items item
set quantity_issued = item.quantity,
    fulfilled_by = coalesce(request.approved_by, request.requested_by),
    fulfilled_at = request.updated_at
from public.stock_requests request
where request.id = item.request_id
  and request.status = 'fulfilled';

create table public.asset_custody (
  id uuid primary key default extensions.gen_random_uuid(),
  equipment_asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  stock_request_id uuid not null references public.stock_requests(id) on delete restrict,
  stock_request_item_id uuid not null references public.stock_request_items(id) on delete restrict,
  custodian_profile_id uuid not null references public.profiles(id) on delete restrict,
  project_name text not null check (length(btrim(project_name)) between 1 and 200),
  issued_from_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issue_condition text not null check (length(btrim(issue_condition)) between 1 and 500),
  issued_at timestamptz not null default now(),
  previous_custody_id uuid references public.asset_custody(id) on delete restrict,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete restrict,
  end_reason text check (end_reason in ('returned', 'transferred')),
  transfer_reason text check (transfer_reason is null or length(btrim(transfer_reason)) between 1 and 1000),
  return_id uuid references public.asset_returns(id) on delete restrict,
  returned_to_warehouse_id uuid references public.warehouses(id) on delete restrict,
  return_condition text check (return_condition in ('good', 'damaged', 'lost')),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= issued_at),
  check (
    (
      ended_at is null
      and ended_by is null
      and end_reason is null
      and transfer_reason is null
      and return_id is null
      and returned_to_warehouse_id is null
      and return_condition is null
    )
    or
    (
      ended_at is not null
      and ended_by is not null
      and end_reason = 'transferred'
      and transfer_reason is not null
      and return_id is null
      and returned_to_warehouse_id is null
      and return_condition is null
    )
    or
    (
      ended_at is not null
      and ended_by is not null
      and end_reason = 'returned'
      and transfer_reason is null
      and return_id is not null
      and returned_to_warehouse_id is not null
      and return_condition is not null
    )
  )
);

create unique index asset_custody_one_active_per_asset_uidx
  on public.asset_custody (equipment_asset_id)
  where ended_at is null;

create index asset_custody_asset_history_idx
  on public.asset_custody (equipment_asset_id, issued_at desc);

create index asset_custody_custodian_active_idx
  on public.asset_custody (custodian_profile_id, issued_at desc)
  where ended_at is null;

comment on table public.asset_custody is
  'Append-preserving custody history for equipment issued to a person and project.';

-- Best-effort custody baseline for assets already assigned before this table.
-- The latest fulfilled request item and its issue movement are authoritative.
insert into public.asset_custody (
  equipment_asset_id,
  stock_request_id,
  stock_request_item_id,
  custodian_profile_id,
  project_name,
  issued_from_warehouse_id,
  issued_by,
  issue_condition,
  issued_at
)
select distinct on (asset.id)
  asset.id,
  request.id,
  item.id,
  request.requested_by,
  request.project_name,
  movement.warehouse_id,
  movement.performed_by,
  'Condition not recorded before custody tracking',
  movement.created_at
from public.equipment_assets asset
join public.stock_request_items item
  on item.equipment_asset_id = asset.id
join public.stock_requests request
  on request.id = item.request_id
join lateral (
  select stock_movement.warehouse_id,
         stock_movement.performed_by,
         stock_movement.created_at
  from public.stock_movements stock_movement
  where stock_movement.equipment_asset_id = asset.id
    and stock_movement.movement_type = 'issue'
    and stock_movement.reference_id = request.id
  order by stock_movement.created_at desc
  limit 1
) movement on true
where asset.status = 'assigned'
  and request.status = 'fulfilled'
order by asset.id, request.updated_at desc, item.id;

alter table public.asset_custody enable row level security;

create policy asset_custody_read on public.asset_custody
for select to authenticated
using (
  public.has_permission('inventory.read')
  or custodian_profile_id = public.current_profile_id()
);

revoke all on table public.asset_custody from public, anon, authenticated;
grant select on table public.asset_custody to authenticated;

create or replace function public.rpc_issue_stock(
  p_request_id uuid,
  p_warehouse_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_status text;
  v_requester_id uuid;
  v_project_name text;
  v_item record;
  v_remaining_quantity integer;
  v_available_qty integer;
  v_eq_status text;
  v_eq_warehouse_id uuid;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.issue') then
    raise exception 'Unauthorized: Insufficient permissions to issue stock.' using errcode = '42501';
  end if;

  perform 1
  from public.warehouses warehouse
  where warehouse.id = p_warehouse_id
    and warehouse.status = 'active';

  if not found then
    raise exception 'Active warehouse not found.' using errcode = '22000';
  end if;

  select request.status, request.requested_by, request.project_name
  into v_status, v_requester_id, v_project_name
  from public.stock_requests request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'Stock request not found.' using errcode = '22000';
  end if;

  if v_status <> 'approved' then
    raise exception 'Conflict: Only approved stock requests can be issued.' using errcode = 'L0102';
  end if;

  if not exists (
    select 1 from public.stock_request_items item where item.request_id = p_request_id
  ) then
    raise exception 'Stock request has no items to issue.' using errcode = '22000';
  end if;

  for v_item in
    select item.*
    from public.stock_request_items item
    where item.request_id = p_request_id
    order by item.id
    for update
  loop
    v_remaining_quantity := v_item.quantity - v_item.quantity_issued;
    if v_remaining_quantity = 0 then
      continue;
    end if;

    if v_item.consumable_item_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          p_warehouse_id::text || ':' || v_item.consumable_item_id::text,
          0
        )
      );

      select coalesce(sum(movement.quantity), 0)
      into v_available_qty
      from public.stock_movements movement
      where movement.consumable_item_id = v_item.consumable_item_id
        and movement.warehouse_id = p_warehouse_id;

      if v_available_qty < v_remaining_quantity then
        raise exception 'Insufficient stock in warehouse for consumable.' using errcode = '22000';
      end if;

      insert into public.stock_movements (
        movement_type, warehouse_id, consumable_item_id, quantity,
        reference_id, performed_by
      ) values (
        'issue', p_warehouse_id, v_item.consumable_item_id, -v_remaining_quantity,
        p_request_id, v_profile_id
      );
    elsif v_item.equipment_asset_id is not null then
      if v_remaining_quantity <> 1 then
        raise exception 'Equipment request quantity must be exactly one.' using errcode = '22000';
      end if;

      select asset.status, asset.current_warehouse_id
      into v_eq_status, v_eq_warehouse_id
      from public.equipment_assets asset
      where asset.id = v_item.equipment_asset_id
      for update;

      if not found then
        raise exception 'Equipment asset not found.' using errcode = '22000';
      end if;

      if v_eq_status <> 'available'
         or v_eq_warehouse_id is distinct from p_warehouse_id then
        raise exception 'Equipment asset is not available in the issuing warehouse.' using errcode = '22000';
      end if;

      update public.equipment_assets
      set status = 'assigned',
          current_warehouse_id = null,
          updated_at = now()
      where id = v_item.equipment_asset_id;

      insert into public.stock_movements (
        movement_type, warehouse_id, equipment_asset_id, quantity,
        reference_id, performed_by
      ) values (
        'issue', p_warehouse_id, v_item.equipment_asset_id, -1,
        p_request_id, v_profile_id
      );

      insert into public.asset_custody (
        equipment_asset_id, stock_request_id, stock_request_item_id,
        custodian_profile_id, project_name, issued_from_warehouse_id,
        issued_by, issue_condition
      ) values (
        v_item.equipment_asset_id, p_request_id, v_item.id,
        v_requester_id, v_project_name, p_warehouse_id,
        v_profile_id, 'good'
      );
    end if;

    update public.stock_request_items
    set quantity_issued = quantity,
        fulfilled_by = v_profile_id,
        fulfilled_at = now()
    where id = v_item.id;
  end loop;

  if not exists (
    select 1
    from public.stock_request_items item
    where item.request_id = p_request_id
      and item.quantity_issued < item.quantity
  ) then
    update public.stock_requests
    set status = 'fulfilled',
        updated_at = now()
    where id = p_request_id;
  end if;
end;
$$;

create or replace function public.rpc_issue_request_item(
  p_request_item_id uuid,
  p_warehouse_id uuid,
  p_issue_condition text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_request_id uuid;
  v_request_status text;
  v_requester_id uuid;
  v_project_name text;
  v_equipment_asset_id uuid;
  v_consumable_item_id uuid;
  v_quantity integer;
  v_quantity_issued integer;
  v_asset_status text;
  v_asset_warehouse_id uuid;
  v_issue_condition text;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.issue') then
    raise exception 'Unauthorized: Insufficient permissions to issue stock.' using errcode = '42501';
  end if;

  v_issue_condition := btrim(p_issue_condition);
  if v_issue_condition is null or v_issue_condition = '' then
    raise exception 'Issue condition is required.' using errcode = '22000';
  end if;

  perform 1
  from public.warehouses warehouse
  where warehouse.id = p_warehouse_id
    and warehouse.status = 'active';

  if not found then
    raise exception 'Active warehouse not found.' using errcode = '22000';
  end if;

  select item.request_id
  into v_request_id
  from public.stock_request_items item
  where item.id = p_request_item_id;

  if not found then
    raise exception 'Stock request item not found.' using errcode = '22000';
  end if;

  select request.status, request.requested_by, request.project_name
  into v_request_status, v_requester_id, v_project_name
  from public.stock_requests request
  where request.id = v_request_id
  for update;

  if v_request_status <> 'approved' then
    raise exception 'Conflict: Only approved stock requests can be issued.' using errcode = 'L0102';
  end if;

  select item.equipment_asset_id, item.consumable_item_id,
         item.quantity, item.quantity_issued
  into v_equipment_asset_id, v_consumable_item_id,
       v_quantity, v_quantity_issued
  from public.stock_request_items item
  where item.id = p_request_item_id
  for update;

  if v_equipment_asset_id is null or v_consumable_item_id is not null then
    raise exception 'QR equipment checkout requires an equipment request item.' using errcode = '22000';
  end if;

  if v_quantity <> 1 then
    raise exception 'Equipment request quantity must be exactly one.' using errcode = '22000';
  end if;

  if v_quantity_issued <> 0 then
    raise exception 'Conflict: This request item has already been issued.' using errcode = 'L0104';
  end if;

  select asset.status, asset.current_warehouse_id
  into v_asset_status, v_asset_warehouse_id
  from public.equipment_assets asset
  where asset.id = v_equipment_asset_id
  for update;

  if v_asset_status <> 'available'
     or v_asset_warehouse_id is distinct from p_warehouse_id then
    raise exception 'Equipment asset is not available in the issuing warehouse.' using errcode = '22000';
  end if;

  update public.equipment_assets
  set status = 'assigned',
      current_warehouse_id = null,
      updated_at = now()
  where id = v_equipment_asset_id;

  insert into public.stock_movements (
    movement_type, warehouse_id, equipment_asset_id, quantity,
    reference_id, performed_by
  ) values (
    'issue', p_warehouse_id, v_equipment_asset_id, -1,
    v_request_id, v_profile_id
  );

  insert into public.asset_custody (
    equipment_asset_id, stock_request_id, stock_request_item_id,
    custodian_profile_id, project_name, issued_from_warehouse_id,
    issued_by, issue_condition
  ) values (
    v_equipment_asset_id, v_request_id, p_request_item_id,
    v_requester_id, v_project_name, p_warehouse_id,
    v_profile_id, v_issue_condition
  );

  update public.stock_request_items
  set quantity_issued = quantity,
      fulfilled_by = v_profile_id,
      fulfilled_at = now()
  where id = p_request_item_id;

  if not exists (
    select 1
    from public.stock_request_items item
    where item.request_id = v_request_id
      and item.quantity_issued < item.quantity
  ) then
    update public.stock_requests
    set status = 'fulfilled',
        updated_at = now()
    where id = v_request_id;
  end if;
end;
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
  v_profile_id uuid;
  v_current_custody public.asset_custody%rowtype;
  v_project_name text;
  v_reason text;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.issue') then
    raise exception 'Unauthorized: Insufficient permissions to transfer asset custody.' using errcode = '42501';
  end if;

  v_project_name := btrim(p_project_name);
  v_reason := btrim(p_reason);
  if v_project_name is null or v_project_name = '' then
    raise exception 'Transfer project is required.' using errcode = '22000';
  end if;
  if v_reason is null or v_reason = '' then
    raise exception 'Custody transfer reason is required.' using errcode = '22000';
  end if;

  perform 1
  from public.profiles profile
  where profile.id = p_new_custodian_profile_id
    and profile.status = 'active';
  if not found then
    raise exception 'New custodian profile is not active.' using errcode = '22000';
  end if;

  select custody.*
  into v_current_custody
  from public.asset_custody custody
  where custody.equipment_asset_id = p_equipment_asset_id
    and custody.ended_at is null
  for update;

  if not found then
    raise exception 'No active custody record exists for this asset.' using errcode = '22000';
  end if;

  if v_current_custody.custodian_profile_id = p_new_custodian_profile_id
     and v_current_custody.project_name = v_project_name then
    raise exception 'New custody assignment must change the custodian or project.' using errcode = '22000';
  end if;

  update public.asset_custody
  set ended_at = now(),
      ended_by = v_profile_id,
      end_reason = 'transferred',
      transfer_reason = v_reason
  where id = v_current_custody.id;

  insert into public.asset_custody (
    equipment_asset_id, stock_request_id, stock_request_item_id,
    custodian_profile_id, project_name, issued_from_warehouse_id,
    issued_by, issue_condition, previous_custody_id
  ) values (
    p_equipment_asset_id,
    v_current_custody.stock_request_id,
    v_current_custody.stock_request_item_id,
    p_new_custodian_profile_id,
    v_project_name,
    v_current_custody.issued_from_warehouse_id,
    v_profile_id,
    'custody transfer',
    v_current_custody.id
  );

  insert into public.audit_events (
    actor_profile_id, event_type, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    v_profile_id,
    'inventory.custody_transferred',
    'asset_custody',
    p_equipment_asset_id::text,
    jsonb_build_object(
      'custodian_profile_id', v_current_custody.custodian_profile_id,
      'project_name', v_current_custody.project_name
    ),
    jsonb_build_object(
      'custodian_profile_id', p_new_custodian_profile_id,
      'project_name', v_project_name
    ),
    v_reason
  );
end;
$$;

create or replace function public.rpc_return_asset(
  p_equipment_asset_id uuid,
  p_condition text,
  p_warehouse_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_status text;
  v_return_id uuid;
  v_eq_status text;
  v_custody_id uuid;
  v_notes text;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.issue') then
    raise exception 'Unauthorized: Insufficient permissions to return stock.' using errcode = '42501';
  end if;

  if p_condition not in ('good', 'damaged', 'lost') then
    raise exception 'Return condition must be good, damaged, or lost.' using errcode = '22000';
  end if;

  perform 1
  from public.warehouses warehouse
  where warehouse.id = p_warehouse_id
    and warehouse.status = 'active';
  if not found then
    raise exception 'Active warehouse not found.' using errcode = '22000';
  end if;

  v_notes := nullif(btrim(p_notes), '');

  select asset.status
  into v_status
  from public.equipment_assets asset
  where asset.id = p_equipment_asset_id
  for update;

  if not found then
    raise exception 'Equipment asset not found.' using errcode = '22000';
  end if;
  if v_status <> 'assigned' then
    raise exception 'Equipment asset is not currently checked out.' using errcode = '22000';
  end if;

  select custody.id
  into v_custody_id
  from public.asset_custody custody
  where custody.equipment_asset_id = p_equipment_asset_id
    and custody.ended_at is null
  for update;

  if not found then
    raise exception 'No active custody record exists for this asset.' using errcode = '22000';
  end if;

  insert into public.asset_returns (
    equipment_asset_id, returned_by, returned_to_warehouse_id, condition, notes
  ) values (
    p_equipment_asset_id, v_profile_id, p_warehouse_id, p_condition, v_notes
  ) returning id into v_return_id;

  if p_condition = 'good' then
    v_eq_status := 'available';
  elsif p_condition = 'damaged' then
    v_eq_status := 'damaged';
  else
    v_eq_status := 'lost';
  end if;

  update public.equipment_assets
  set status = v_eq_status,
      current_warehouse_id = case when p_condition = 'good' then p_warehouse_id else null end,
      condition_notes = case
        when v_notes is null then condition_notes
        when nullif(btrim(condition_notes), '') is null then 'Return: ' || v_notes
        else condition_notes || ' | Return: ' || v_notes
      end,
      updated_at = now()
  where id = p_equipment_asset_id;

  update public.asset_custody
  set ended_at = now(),
      ended_by = v_profile_id,
      end_reason = 'returned',
      return_id = v_return_id,
      returned_to_warehouse_id = p_warehouse_id,
      return_condition = p_condition
  where id = v_custody_id;

  if p_condition <> 'good' then
    insert into public.damage_reports (
      equipment_asset_id, reported_by, description
    ) values (
      p_equipment_asset_id,
      v_profile_id,
      'Asset returned in ' || p_condition || ' condition'
        || case when v_notes is null then '.' else ': ' || v_notes end
    );
  end if;

  insert into public.stock_movements (
    movement_type, warehouse_id, equipment_asset_id, quantity,
    reference_id, performed_by
  ) values (
    'return', p_warehouse_id, p_equipment_asset_id, 1,
    v_return_id, v_profile_id
  );
end;
$$;

revoke all on function public.rpc_issue_stock(uuid, uuid) from public, anon;
revoke all on function public.rpc_issue_request_item(uuid, uuid, text) from public, anon;
revoke all on function public.rpc_transfer_asset_custody(uuid, uuid, text, text) from public, anon;
revoke all on function public.rpc_return_asset(uuid, text, uuid, text) from public, anon;

grant execute on function public.rpc_issue_stock(uuid, uuid) to authenticated;
grant execute on function public.rpc_issue_request_item(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_transfer_asset_custody(uuid, uuid, text, text) to authenticated;
grant execute on function public.rpc_return_asset(uuid, text, uuid, text) to authenticated;
