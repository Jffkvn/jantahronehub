-- Inventory transitions are state machines, not unrestricted status updates.
-- Serialize request fulfilment, protect warehouse ownership, and make receipt
-- references idempotent within each warehouse.

create unique index stock_receipts_warehouse_reference_uidx
  on public.stock_receipts (warehouse_id, lower(btrim(reference_number)));

comment on index public.stock_receipts_warehouse_reference_uidx is
  'A receipt reference may be posted only once per warehouse, case-insensitively.';

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
  v_reference_number text;
  v_asset_status text;
  v_asset_warehouse_id uuid;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.receipt') then
    raise exception 'Unauthorized: Insufficient permissions to receive stock.' using errcode = '42501';
  end if;

  v_reference_number := btrim(p_reference_number);
  if v_reference_number is null or v_reference_number = '' then
    raise exception 'Receipt reference is required.' using errcode = '22000';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one receipt item is required.' using errcode = '22000';
  end if;

  perform 1
  from public.warehouses warehouse
  where warehouse.id = p_warehouse_id
    and warehouse.status = 'active';

  if not found then
    raise exception 'Active warehouse not found.' using errcode = '22000';
  end if;

  begin
    insert into public.stock_receipts (
      warehouse_id, received_by, reference_number, received_at
    ) values (
      p_warehouse_id, v_profile_id, v_reference_number, now()
    ) returning id into v_receipt_id;
  exception
    when unique_violation then
      raise exception 'Conflict: Receipt reference already exists for this warehouse.' using errcode = '23505';
  end;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_consumable_item_id := nullif(v_item->>'consumable_item_id', '')::uuid;
    v_equipment_asset_id := nullif(v_item->>'equipment_asset_id', '')::uuid;
    v_quantity := nullif(v_item->>'quantity', '')::integer;
    v_unit_price := nullif(v_item->>'unit_price', '')::numeric;

    if (v_consumable_item_id is null) = (v_equipment_asset_id is null) then
      raise exception 'Exactly one inventory item must be supplied per receipt row.' using errcode = '22000';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Receipt quantity must be positive.' using errcode = '22000';
    end if;

    if v_unit_price is null or v_unit_price < 0 then
      raise exception 'Receipt unit price must be zero or positive.' using errcode = '22000';
    end if;

    if v_consumable_item_id is not null then
      perform 1
      from public.consumable_items item
      where item.id = v_consumable_item_id;

      if not found then
        raise exception 'Consumable item not found.' using errcode = '22000';
      end if;

      insert into public.stock_receipt_items (
        receipt_id, consumable_item_id, quantity, unit_price
      ) values (
        v_receipt_id, v_consumable_item_id, v_quantity, v_unit_price
      );

      insert into public.stock_movements (
        movement_type, warehouse_id, consumable_item_id, quantity,
        reference_id, performed_by
      ) values (
        'receipt', p_warehouse_id, v_consumable_item_id, v_quantity,
        v_receipt_id, v_profile_id
      );
    else
      if v_quantity <> 1 then
        raise exception 'Equipment receipt quantity must be exactly one.' using errcode = '22000';
      end if;

      select asset.status, asset.current_warehouse_id
      into v_asset_status, v_asset_warehouse_id
      from public.equipment_assets asset
      where asset.id = v_equipment_asset_id
      for update;

      if not found then
        raise exception 'Equipment asset not found.' using errcode = '22000';
      end if;

      if v_asset_status <> 'available' or v_asset_warehouse_id is not null then
        raise exception 'Conflict: Equipment asset is not eligible for receipt in its current lifecycle state.' using errcode = 'L0103';
      end if;

      insert into public.stock_receipt_items (
        receipt_id, equipment_asset_id, quantity, unit_price
      ) values (
        v_receipt_id, v_equipment_asset_id, 1, v_unit_price
      );

      update public.equipment_assets
      set current_warehouse_id = p_warehouse_id,
          status = 'available',
          updated_at = now()
      where id = v_equipment_asset_id;

      insert into public.stock_movements (
        movement_type, warehouse_id, equipment_asset_id, quantity,
        reference_id, performed_by
      ) values (
        'receipt', p_warehouse_id, v_equipment_asset_id, 1,
        v_receipt_id, v_profile_id
      );
    end if;
  end loop;

  return v_receipt_id;
end;
$$;

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
  v_status text;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then
    raise exception 'Unauthorized: User profile not active.' using errcode = '42501';
  end if;

  select request.escalated_to_cfo, request.status
  into v_escalated, v_status
  from public.stock_requests request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'Stock request not found.' using errcode = '22000';
  end if;

  if v_status <> 'pending_approval' then
    raise exception 'Conflict: Only pending stock requests can be approved.' using errcode = 'L0101';
  end if;

  if v_escalated then
    if not public.has_permission('inventory.approve') then
      raise exception 'Unauthorized: Only CFO can approve escalated stock requests.' using errcode = '42501';
    end if;
  elsif not (
    public.has_permission('inventory.approve')
    or public.has_permission('inventory.issue')
  ) then
    raise exception 'Unauthorized: Insufficient permissions to approve stock requests.' using errcode = '42501';
  end if;

  update public.stock_requests
  set status = 'approved',
      approved_by = v_profile_id,
      approved_at = now(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

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

  -- The header lock serializes duplicate/replayed fulfilment of this request.
  select request.status
  into v_status
  from public.stock_requests request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'Stock request not found.' using errcode = '22000';
  end if;

  if v_status <> 'approved' then
    raise exception 'Conflict: Only approved stock requests can be issued.' using errcode = 'L0102';
  end if;

  for v_item in
    select item.*
    from public.stock_request_items item
    where item.request_id = p_request_id
    order by item.id
  loop
    if v_item.consumable_item_id is not null then
      -- Serialize balance changes even when the ledger has no lockable row yet.
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

      if v_available_qty < v_item.quantity then
        raise exception 'Insufficient stock in warehouse for consumable.' using errcode = '22000';
      end if;

      insert into public.stock_movements (
        movement_type, warehouse_id, consumable_item_id, quantity,
        reference_id, performed_by
      ) values (
        'issue', p_warehouse_id, v_item.consumable_item_id, -v_item.quantity,
        p_request_id, v_profile_id
      );
    elsif v_item.equipment_asset_id is not null then
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
    end if;
  end loop;

  update public.stock_requests
  set status = 'fulfilled',
      updated_at = now()
  where id = p_request_id;
end;
$$;

-- Same opening-stock behavior as before, without the dead v_ref variable that
-- caused the linked database lint warning.
create or replace function public.rpc_bulk_opening_stock(
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_row jsonb;
  v_wh_id uuid;
  v_item_id uuid;
  v_wh_name text;
  v_sku text;
  v_qty integer;
begin
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.receipt') then
    raise exception 'Unauthorized: Insufficient permissions to load opening stock.' using errcode = '42501';
  end if;

  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one opening-stock row is required.' using errcode = '22000';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_wh_name := btrim(v_row->>'warehouse_name');
    v_sku := btrim(v_row->>'sku');
    v_qty := nullif(v_row->>'quantity', '')::integer;

    if v_wh_name is null or v_wh_name = ''
       or v_sku is null or v_sku = ''
       or v_qty is null then
      raise exception 'Warehouse name, SKU, and quantity are required.' using errcode = '22000';
    end if;

    if v_qty <= 0 then
      raise exception 'Quantity must be positive.' using errcode = '22000';
    end if;

    select warehouse.id
    into v_wh_id
    from public.warehouses warehouse
    where lower(warehouse.name) = lower(v_wh_name)
      and warehouse.status = 'active';

    if v_wh_id is null then
      raise exception 'Warehouse "%" not found.', v_wh_name using errcode = '22000';
    end if;

    select item.id
    into v_item_id
    from public.consumable_items item
    where lower(item.sku) = lower(v_sku);

    if v_item_id is null then
      raise exception 'Consumable SKU "%" not found.', v_sku using errcode = '22000';
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_wh_name := btrim(v_row->>'warehouse_name');
    v_sku := btrim(v_row->>'sku');
    v_qty := (v_row->>'quantity')::integer;

    select warehouse.id
    into v_wh_id
    from public.warehouses warehouse
    where lower(warehouse.name) = lower(v_wh_name)
      and warehouse.status = 'active';

    select item.id
    into v_item_id
    from public.consumable_items item
    where lower(item.sku) = lower(v_sku);

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_wh_id::text || ':' || v_item_id::text, 0)
    );

    insert into public.stock_movements (
      movement_type, warehouse_id, consumable_item_id, quantity,
      reference_id, performed_by
    ) values (
      'receipt', v_wh_id, v_item_id, v_qty,
      extensions.gen_random_uuid(), v_profile_id
    );
  end loop;
end;
$$;
