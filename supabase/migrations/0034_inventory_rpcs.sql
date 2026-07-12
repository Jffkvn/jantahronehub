-- RPC migration for Inventory and Warehouse module

-- Helper to check active user profile ID
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
$$;

-- 1. Receive Stock RPC
create or replace function public.rpc_receive_stock(
  p_warehouse_id uuid,
  p_reference_number text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_item jsonb;
  v_consumable_item_id uuid;
  v_equipment_asset_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_profile_id uuid;
begin
  -- Access authorization check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.receipt') then
    raise exception 'Unauthorized: Insufficient permissions to receive stock.' using errcode = '42501';
  end if;

  -- Insert receipt header
  insert into public.stock_receipts (warehouse_id, received_by, reference_number, received_at)
  values (p_warehouse_id, v_profile_id, p_reference_number, now())
  returning id into v_receipt_id;

  -- Process receipt items
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_consumable_item_id := (v_item->>'consumable_item_id')::uuid;
    v_equipment_asset_id := (v_item->>'equipment_asset_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric;

    if v_consumable_item_id is not null then
      -- Add receipt row
      insert into public.stock_receipt_items (receipt_id, consumable_item_id, quantity, unit_price)
      values (v_receipt_id, v_consumable_item_id, v_quantity, v_unit_price);

      -- Ledger entry
      insert into public.stock_movements (movement_type, warehouse_id, consumable_item_id, quantity, reference_id, performed_by)
      values ('receipt', p_warehouse_id, v_consumable_item_id, v_quantity, v_receipt_id, v_profile_id);

    elsif v_equipment_asset_id is not null then
      -- Add receipt row
      insert into public.stock_receipt_items (receipt_id, equipment_asset_id, quantity, unit_price)
      values (v_receipt_id, v_equipment_asset_id, 1, v_unit_price);

      -- Update equipment asset warehouse and status
      update public.equipment_assets
      set current_warehouse_id = p_warehouse_id,
          status = 'available'
      where id = v_equipment_asset_id;

      -- Ledger entry
      insert into public.stock_movements (movement_type, warehouse_id, equipment_asset_id, quantity, reference_id, performed_by)
      values ('receipt', p_warehouse_id, v_equipment_asset_id, 1, v_receipt_id, v_profile_id);
    else
      raise exception 'Invalid receipt item payload.';
    end if;
  end loop;

  return v_receipt_id;
end;
$$;

-- 2. Request Stock RPC
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
  v_request_id uuid;
  v_item jsonb;
  v_consumable_item_id uuid;
  v_equipment_asset_id uuid;
  v_quantity integer;
  v_estimated_unit_price numeric;
  v_total_estimated_value numeric := 0;
  v_escalated_to_cfo boolean := false;
  v_profile_id uuid;
  v_asset_status text;
  v_is_sensitive boolean;
  v_available_qty integer;
begin
  -- Access authorization check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.request') then
    raise exception 'Unauthorized: Insufficient permissions to request stock.' using errcode = '42501';
  end if;

  -- Validate item constraints & calculate value
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_consumable_item_id := (v_item->>'consumable_item_id')::uuid;
    v_equipment_asset_id := (v_item->>'equipment_asset_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_estimated_unit_price := (v_item->>'estimated_unit_price')::numeric;

    v_total_estimated_value := v_total_estimated_value + (v_quantity * v_estimated_unit_price);

    if v_equipment_asset_id is not null then
      select status, is_sensitive into v_asset_status, v_is_sensitive
      from public.equipment_assets
      where id = v_equipment_asset_id;

      if not found then
        raise exception 'Equipment asset not found.';
      end if;

      if v_asset_status <> 'available' then
        raise exception 'Equipment asset is currently % (not available).', v_asset_status;
      end if;

      if v_is_sensitive then
        v_escalated_to_cfo := true;
      end if;

    elsif v_consumable_item_id is not null then
      -- Calculate current ledger balance
      select coalesce(sum(quantity), 0) into v_available_qty
      from public.stock_movements
      where consumable_item_id = v_consumable_item_id;

      if v_available_qty < v_quantity then
        raise exception 'Insufficient stock available in ledger.';
      end if;
    end if;
  end loop;

  -- CFO Escalation policy (UGX 2,000,000 threshold)
  if v_total_estimated_value >= 2000000 then
    v_escalated_to_cfo := true;
  end if;

  -- Create request header
  insert into public.stock_requests (
    requested_by, project_name, status, total_estimated_value, escalated_to_cfo, created_at, updated_at
  )
  values (
    v_profile_id, p_project_name, 'pending_approval', v_total_estimated_value, v_escalated_to_cfo, now(), now()
  )
  returning id into v_request_id;

  -- Insert items
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_consumable_item_id := (v_item->>'consumable_item_id')::uuid;
    v_equipment_asset_id := (v_item->>'equipment_asset_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_estimated_unit_price := (v_item->>'estimated_unit_price')::numeric;

    insert into public.stock_request_items (
      request_id, consumable_item_id, equipment_asset_id, quantity, estimated_unit_price
    )
    values (
      v_request_id, v_consumable_item_id, v_equipment_asset_id, v_quantity, v_estimated_unit_price
    );
  end loop;

  return v_request_id;
end;
$$;

-- 3. Approve Stock Request RPC
create or replace function public.rpc_approve_stock_request(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_escalated boolean;
begin
  -- Access authorization check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.approve') then
    raise exception 'Unauthorized: Insufficient permissions to approve stock requests.' using errcode = '42501';
  end if;

  select escalated_to_cfo into v_escalated
  from public.stock_requests
  where id = p_request_id;

  if not found then
    raise exception 'Stock request not found.';
  end if;

  update public.stock_requests
  set status = 'approved',
      approved_by = v_profile_id,
      approved_at = now(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

-- 4. Issue Stock (Fulfill Request) RPC
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
      -- Check computed stock level in ledger for this specific warehouse
      select coalesce(sum(quantity), 0) into v_available_qty
      from public.stock_movements
      where consumable_item_id = v_item.consumable_item_id
        and warehouse_id = p_warehouse_id
      for update;

      if v_available_qty < v_item.quantity then
        raise exception 'Insufficient stock in warehouse for consumable.';
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
        raise exception 'Equipment asset is no longer available.';
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

-- 5. Return Asset RPC
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
begin
  -- Access authorization check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.issue') then
    raise exception 'Unauthorized: Insufficient permissions to return stock.' using errcode = '42501';
  end if;

  -- Check current asset status
  select status into v_status
  from public.equipment_assets
  where id = p_equipment_asset_id
  for update;

  if not found then
    raise exception 'Equipment asset not found.';
  end if;

  if v_status <> 'assigned' then
    raise exception 'Equipment asset is not currently checked out.';
  end if;

  -- Log return
  insert into public.asset_returns (equipment_asset_id, returned_by, returned_to_warehouse_id, condition, notes)
  values (p_equipment_asset_id, v_profile_id, p_warehouse_id, p_condition, p_notes)
  returning id into v_return_id;

  -- Update asset status based on condition
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
      condition_notes = coalesce(condition_notes, '') || ' | Return: ' || p_notes
  where id = p_equipment_asset_id;

  -- Log damage report if returned in damaged or lost condition
  if p_condition <> 'good' then
    insert into public.damage_reports (equipment_asset_id, reported_by, description)
    values (p_equipment_asset_id, v_profile_id, 'Asset returned in ' || p_condition || ' condition: ' || p_notes);
  end if;

  -- Ledger entry
  insert into public.stock_movements (movement_type, warehouse_id, equipment_asset_id, quantity, reference_id, performed_by)
  values ('return', p_warehouse_id, p_equipment_asset_id, 1, v_return_id, v_profile_id);
end;
$$;

grant execute on function public.rpc_receive_stock to authenticated;
grant execute on function public.rpc_request_stock to authenticated;
grant execute on function public.rpc_approve_stock_request to authenticated;
grant execute on function public.rpc_issue_stock to authenticated;
grant execute on function public.rpc_return_asset to authenticated;
