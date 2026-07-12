-- Migration 0036_fix_for_update_aggregates.sql
-- Fix aggregate FOR UPDATE issue by locking individual rows first before calculating the sum.

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
  v_item record;
  v_available_qty integer;
  v_eq_status text;
begin
  -- Access authorization check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.issue') then
    raise exception 'Unauthorized: Insufficient permissions to issue stock.' using errcode = '42501';
  end if;

  -- Validate request approval state
  select status into v_status
  from public.stock_requests
  where id = p_request_id;

  if not found then
    raise exception 'Stock request not found.';
  end if;

  if v_status <> 'approved' then
    raise exception 'Only approved stock requests can be issued.' using errcode = '42501';
  end if;

  -- Process request items atomically
  for v_item in select * from public.stock_request_items where request_id = p_request_id loop
    if v_item.consumable_item_id is not null then
      -- 1. Perform row locking first
      perform 1
      from public.stock_movements
      where consumable_item_id = v_item.consumable_item_id
        and warehouse_id = p_warehouse_id
      for update;

      -- 2. Compute stock level
      select coalesce(sum(quantity), 0) into v_available_qty
      from public.stock_movements
      where consumable_item_id = v_item.consumable_item_id
        and warehouse_id = p_warehouse_id;

      if v_available_qty < v_item.quantity then
        raise exception 'Insufficient stock in warehouse for consumable.' using errcode = '22000';
      end if;

      -- Post stock movement checkout
      insert into public.stock_movements (movement_type, warehouse_id, consumable_item_id, quantity, reference_id, performed_by)
      values ('issue', p_warehouse_id, v_item.consumable_item_id, -v_item.quantity, p_request_id, v_profile_id);

    elsif v_item.equipment_asset_id is not null then
      -- Check current asset availability
      select status into v_eq_status
      from public.equipment_assets
      where id = v_item.equipment_asset_id
      for update;

      if v_eq_status <> 'available' then
        raise exception 'Equipment asset is no longer available.' using errcode = '22000';
      end if;

      -- Update equipment asset assignment details
      update public.equipment_assets
      set status = 'assigned',
          current_warehouse_id = null
      where id = v_item.equipment_asset_id;

      -- Post stock movement checkout
      insert into public.stock_movements (movement_type, warehouse_id, equipment_asset_id, quantity, reference_id, performed_by)
      values ('issue', p_warehouse_id, v_item.equipment_asset_id, -1, p_request_id, v_profile_id);
    end if;
  end loop;

  -- Fulfill request
  update public.stock_requests
  set status = 'fulfilled',
      updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.rpc_adjust_stock(
  p_warehouse_id uuid,
  p_consumable_item_id uuid,
  p_equipment_asset_id uuid,
  p_quantity integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_movement_id uuid;
  v_movement_type text;
  v_available_qty integer;
  v_current_status text;
  v_current_wh uuid;
  v_new_status text;
begin
  -- Access authorization check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.adjust') then
    raise exception 'Unauthorized: Insufficient permissions to adjust stock.' using errcode = '42501';
  end if;

  -- Validate reason
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Adjustment reason is required.' using errcode = '22000';
  end if;

  -- Validate quantity
  if p_quantity = 0 then
    raise exception 'Adjustment quantity must be non-zero.' using errcode = '22000';
  end if;

  -- Ensure target exclusivity
  if (p_consumable_item_id is not null and p_equipment_asset_id is not null) or
     (p_consumable_item_id is null and p_equipment_asset_id is null) then
    raise exception 'Exactly one of consumable_item_id or equipment_asset_id must be provided.' using errcode = '22000';
  end if;

  -- 1. Consumable Adjustment
  if p_consumable_item_id is not null then
    if p_quantity < 0 then
      v_movement_type := 'adjustment_remove';
      -- Row lock
      perform 1
      from public.stock_movements
      where consumable_item_id = p_consumable_item_id
        and warehouse_id = p_warehouse_id
      for update;

      -- Check balance in warehouse
      select coalesce(sum(quantity), 0) into v_available_qty
      from public.stock_movements
      where consumable_item_id = p_consumable_item_id
        and warehouse_id = p_warehouse_id;

      if v_available_qty < abs(p_quantity) then
        raise exception 'Insufficient stock available for removal.' using errcode = '22000';
      end if;
    else
      v_movement_type := 'adjustment_add';
    end if;

    insert into public.stock_movements (
      movement_type, warehouse_id, consumable_item_id, quantity, reference_id, performed_by
    )
    values (
      v_movement_type, p_warehouse_id, p_consumable_item_id, p_quantity, extensions.gen_random_uuid(), v_profile_id
    )
    returning id into v_movement_id;

  -- 2. Equipment Asset Adjustment
  elsif p_equipment_asset_id is not null then
    if abs(p_quantity) <> 1 then
      raise exception 'Equipment adjustment quantity must be 1 or -1.' using errcode = '22000';
    end if;

    select status, current_warehouse_id into v_current_status, v_current_wh
    from public.equipment_assets
    where id = p_equipment_asset_id
    for update;

    if not found then
      raise exception 'Equipment asset not found.' using errcode = '22000';
    end if;

    if p_quantity = -1 then
      v_movement_type := 'adjustment_remove';
      -- To remove an asset, it must currently be available in the target warehouse
      if v_current_status <> 'available' or v_current_wh <> p_warehouse_id then
        raise exception 'Equipment asset is not available in this warehouse.' using errcode = '22000';
      end if;

      v_new_status := case when lower(p_reason) like '%damage%' then 'damaged' else 'lost' end;

      update public.equipment_assets
      set status = v_new_status,
          current_warehouse_id = null,
          condition_notes = coalesce(condition_notes, '') || ' | Removed: ' || p_reason
      where id = p_equipment_asset_id;

      -- Log damage/loss report
      insert into public.damage_reports (equipment_asset_id, reported_by, description)
      values (p_equipment_asset_id, v_profile_id, 'Asset adjusted out: ' || p_reason);

    else
      v_movement_type := 'adjustment_add';
      -- To adjust an asset back in, it must NOT currently be active in another warehouse or assigned
      if v_current_status = 'assigned' then
        raise exception 'Equipment asset is currently assigned and cannot be adjusted directly.' using errcode = '22000';
      end if;

      update public.equipment_assets
      set status = 'available',
          current_warehouse_id = p_warehouse_id,
          condition_notes = coalesce(condition_notes, '') || ' | Added back: ' || p_reason
      where id = p_equipment_asset_id;
    end if;

    insert into public.stock_movements (
      movement_type, warehouse_id, equipment_asset_id, quantity, reference_id, performed_by
    )
    values (
      v_movement_type, p_warehouse_id, p_equipment_asset_id, p_quantity, extensions.gen_random_uuid(), v_profile_id
    )
    returning id into v_movement_id;
  end if;

  return v_movement_id;
end;
$$;
