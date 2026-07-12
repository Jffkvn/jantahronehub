-- Migration 0038_inventory_bulk_import.sql
-- Implement bulk operations and import wrappers for inventory, equipment, consumables, and receipts.

-- 1. Bulk Item Master Import RPC
create or replace function public.rpc_bulk_import_item_master(
  p_categories jsonb,
  p_consumables jsonb,
  p_equipment jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_row jsonb;
  v_cat_id uuid;
  v_wh_id uuid;
  v_cat_name text;
  v_wh_name text;
  v_sku text;
  v_serial text;
  v_name text;
begin
  -- Access check (requires super_admin/cfo/manager roles)
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not (public.has_permission('inventory.receipt') or public.has_permission('inventory.adjust')) then
    raise exception 'Unauthorized: Insufficient permissions to import catalog items.' using errcode = '42501';
  end if;

  -- A. Insert Categories
  for v_row in select * from jsonb_array_elements(p_categories) loop
    v_name := trim(v_row->>'name');
    if v_name is null or v_name = '' then
      raise exception 'Category name is required.' using errcode = '22000';
    end if;

    insert into public.item_categories (name, description)
    values (v_name, v_row->>'description')
    on conflict (name) do nothing;
  end loop;

  -- B. Insert Consumables
  for v_row in select * from jsonb_array_elements(p_consumables) loop
    v_sku := trim(v_row->>'sku');
    v_name := trim(v_row->>'name');
    v_cat_name := trim(v_row->>'category_name');

    if v_sku is null or v_sku = '' or v_name is null or v_name = '' or v_cat_name is null or v_cat_name = '' then
      raise exception 'SKU, name, and category name are required for consumables.' using errcode = '22000';
    end if;

    -- Lookup category
    select id into v_cat_id
    from public.item_categories
    where lower(name) = lower(v_cat_name);

    if v_cat_id is null then
      raise exception 'Category "%" not found.', v_cat_name using errcode = '22000';
    end if;

    -- Duplicate check
    if exists (select 1 from public.consumable_items where lower(sku) = lower(v_sku)) then
      raise exception 'Consumable SKU "%" already exists.', v_sku using errcode = '23505';
    end if;

    insert into public.consumable_items (category_id, name, sku, unit_of_measure, reorder_level)
    values (
      v_cat_id,
      v_name,
      v_sku,
      coalesce(v_row->>'unit_of_measure', 'pcs'),
      coalesce((v_row->>'reorder_level')::integer, 0)
    );
  end loop;

  -- C. Insert Equipment
  for v_row in select * from jsonb_array_elements(p_equipment) loop
    v_serial := trim(v_row->>'serial_number');
    v_name := trim(v_row->>'model_name');
    v_cat_name := trim(v_row->>'category_name');
    v_wh_name := trim(v_row->>'current_warehouse_name');

    if v_serial is null or v_serial = '' or v_name is null or v_name = '' or v_cat_name is null or v_cat_name = '' then
      raise exception 'Serial number, model name, and category name are required for equipment assets.' using errcode = '22000';
    end if;

    -- Lookup category
    select id into v_cat_id
    from public.item_categories
    where lower(name) = lower(v_cat_name);

    if v_cat_id is null then
      raise exception 'Category "%" not found.', v_cat_name using errcode = '22000';
    end if;

    -- Lookup warehouse
    if v_wh_name is not null and v_wh_name <> '' then
      select id into v_wh_id
      from public.warehouses
      where lower(name) = lower(v_wh_name);

      if v_wh_id is null then
        raise exception 'Warehouse "%" not found.', v_wh_name using errcode = '22000';
      end if;
    end if;

    -- Duplicate check
    if exists (select 1 from public.equipment_assets where lower(serial_number) = lower(v_serial)) then
      raise exception 'Equipment serial number "%" already exists.', v_serial using errcode = '23505';
    end if;

    insert into public.equipment_assets (category_id, serial_number, model_name, status, current_warehouse_id, is_sensitive, condition_notes)
    values (
      v_cat_id,
      v_serial,
      v_name,
      coalesce((v_row->>'status'), 'available')::text,
      v_wh_id,
      coalesce((v_row->>'is_sensitive')::boolean, false),
      v_row->>'condition_notes'
    );
  end loop;
end;
$$;

-- 2. Bulk Goods Received Import RPC
create or replace function public.rpc_bulk_receive_stock(
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
  v_asset_id uuid;
  v_wh_name text;
  v_sku_or_serial text;
  v_ref text;
  v_qty integer;
  v_price numeric;
  
  -- Grouping helpers
  v_group_cursor record;
  v_items_array jsonb;
begin
  -- Access check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.receipt') then
    raise exception 'Unauthorized: Insufficient permissions to receive stock.' using errcode = '42501';
  end if;

  -- First, perform validation and lookups on every row
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_ref := trim(v_row->>'receipt_reference');
    v_wh_name := trim(v_row->>'warehouse_name');
    v_sku_or_serial := trim(v_row->>'sku_or_serial');
    v_qty := (v_row->>'quantity')::integer;
    v_price := (v_row->>'unit_price')::numeric;

    if v_ref is null or v_ref = '' or v_wh_name is null or v_wh_name = '' or v_sku_or_serial is null or v_sku_or_serial = '' or v_qty is null or v_price is null then
      raise exception 'Reference, warehouse, SKU/Serial, quantity, and unit price are required.' using errcode = '22000';
    end if;

    if v_qty <= 0 then
      raise exception 'Quantity must be positive.' using errcode = '22000';
    end if;

    -- Lookup warehouse
    select id into v_wh_id
    from public.warehouses
    where lower(name) = lower(v_wh_name);

    if v_wh_id is null then
      raise exception 'Warehouse "%" not found.', v_wh_name using errcode = '22000';
    end if;

    -- Check if it is a consumable SKU or equipment serial number
    select id into v_item_id
    from public.consumable_items
    where lower(sku) = lower(v_sku_or_serial);

    if v_item_id is null then
      select id into v_asset_id
      from public.equipment_assets
      where lower(serial_number) = lower(v_sku_or_serial);

      if v_asset_id is null then
        raise exception 'Identifier "%" is neither a valid consumable SKU nor an equipment serial number.', v_sku_or_serial using errcode = '22000';
      end if;
    end if;
  end loop;

  -- Group rows by receipt reference and warehouse to call the single rpc_receive_stock
  for v_group_cursor in 
    select distinct 
      trim(r->>'receipt_reference') as receipt_reference,
      trim(r->>'warehouse_name') as warehouse_name
    from jsonb_array_elements(p_rows) r
  loop
    -- Lookup warehouse ID
    select id into v_wh_id
    from public.warehouses
    where lower(name) = lower(v_group_cursor.warehouse_name);

    -- Build items JSON array for this group
    v_items_array := '[]'::jsonb;
    for v_row in 
      select * from jsonb_array_elements(p_rows) r
      where trim(r->>'receipt_reference') = v_group_cursor.receipt_reference
        and trim(r->>'warehouse_name') = v_group_cursor.warehouse_name
    loop
      v_sku_or_serial := trim(v_row->>'sku_or_serial');
      v_qty := (v_row->>'quantity')::integer;
      v_price := (v_row->>'unit_price')::numeric;

      -- Check if consumable or equipment
      select id into v_item_id
      from public.consumable_items
      where lower(sku) = lower(v_sku_or_serial);

      if v_item_id is not null then
        v_items_array := v_items_array || jsonb_build_object(
          'consumable_item_id', v_item_id,
          'quantity', v_qty,
          'unit_price', v_price
        );
      else
        select id into v_asset_id
        from public.equipment_assets
        where lower(serial_number) = lower(v_sku_or_serial);

        v_items_array := v_items_array || jsonb_build_object(
          'equipment_asset_id', v_asset_id,
          'quantity', v_qty,
          'unit_price', v_price
        );
      end if;
    end loop;

    -- Call standard receipt RPC
    perform public.rpc_receive_stock(v_wh_id, v_group_cursor.receipt_reference, v_items_array);
  end loop;
end;
$$;

-- 3. Bulk Opening Stock Import RPC
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
  v_ref text;
begin
  -- Access check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.receipt') then
    raise exception 'Unauthorized: Insufficient permissions to load opening stock.' using errcode = '42501';
  end if;

  v_ref := 'Opening Stock ' || to_char(now(), 'YYYY-MM-DD');

  -- First, perform validation and lookups on every row
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_wh_name := trim(v_row->>'warehouse_name');
    v_sku := trim(v_row->>'sku');
    v_qty := (v_row->>'quantity')::integer;

    if v_wh_name is null or v_wh_name = '' or v_sku is null or v_sku = '' or v_qty is null then
      raise exception 'Warehouse name, SKU, and quantity are required.' using errcode = '22000';
    end if;

    if v_qty <= 0 then
      raise exception 'Quantity must be positive.' using errcode = '22000';
    end if;

    -- Lookup warehouse
    select id into v_wh_id
    from public.warehouses
    where lower(name) = lower(v_wh_name);

    if v_wh_id is null then
      raise exception 'Warehouse "%" not found.', v_wh_name using errcode = '22000';
    end if;

    -- Lookup consumable item
    select id into v_item_id
    from public.consumable_items
    where lower(sku) = lower(v_sku);

    if v_item_id is null then
      raise exception 'Consumable SKU "%" not found.', v_sku using errcode = '22000';
    end if;
  end loop;

  -- Insert ledger receipts for opening stock
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_wh_name := trim(v_row->>'warehouse_name');
    v_sku := trim(v_row->>'sku');
    v_qty := (v_row->>'quantity')::integer;

    select id into v_wh_id
    from public.warehouses
    where lower(name) = lower(v_wh_name);

    select id into v_item_id
    from public.consumable_items
    where lower(sku) = lower(v_sku);

    insert into public.stock_movements (
      movement_type, warehouse_id, consumable_item_id, quantity, reference_id, performed_by
    )
    values (
      'receipt',
      v_wh_id,
      v_item_id,
      v_qty,
      extensions.gen_random_uuid(),
      v_profile_id
    );
  end loop;
end;
$$;

-- 4. Bulk Stock Adjustment Import RPC
create or replace function public.rpc_bulk_adjust_stock(
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
  v_asset_id uuid;
  v_wh_name text;
  v_sku_or_serial text;
  v_qty integer;
  v_reason text;
begin
  -- Access check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.adjust') then
    raise exception 'Unauthorized: Insufficient permissions to adjust stock.' using errcode = '42501';
  end if;

  -- First, perform validation and lookups on every row
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_wh_name := trim(v_row->>'warehouse_name');
    v_sku_or_serial := trim(v_row->>'sku_or_serial');
    v_qty := (v_row->>'quantity')::integer;
    v_reason := trim(v_row->>'reason');

    if v_wh_name is null or v_wh_name = '' or v_sku_or_serial is null or v_sku_or_serial = '' or v_qty is null then
      raise exception 'Warehouse name, identifier SKU/Serial, and quantity are required.' using errcode = '22000';
    end if;

    if v_qty = 0 then
      raise exception 'Quantity cannot be zero.' using errcode = '22000';
    end if;

    if v_reason is null or v_reason = '' then
      raise exception 'Reason is required for every stock adjustment.' using errcode = '22000';
    end if;

    -- Lookup warehouse
    select id into v_wh_id
    from public.warehouses
    where lower(name) = lower(v_wh_name);

    if v_wh_id is null then
      raise exception 'Warehouse "%" not found.', v_wh_name using errcode = '22000';
    end if;

    -- Check if it is a consumable SKU or equipment serial number
    select id into v_item_id
    from public.consumable_items
    where lower(sku) = lower(v_sku_or_serial);

    if v_item_id is null then
      select id into v_asset_id
      from public.equipment_assets
      where lower(serial_number) = lower(v_sku_or_serial);

      if v_asset_id is null then
        raise exception 'Identifier "%" is neither a valid consumable SKU nor an equipment serial number.', v_sku_or_serial using errcode = '22000';
      end if;
    end if;
  end loop;

  -- Run adjustments
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_wh_name := trim(v_row->>'warehouse_name');
    v_sku_or_serial := trim(v_row->>'sku_or_serial');
    v_qty := (v_row->>'quantity')::integer;
    v_reason := trim(v_row->>'reason');

    select id into v_wh_id
    from public.warehouses
    where lower(name) = lower(v_wh_name);

    select id into v_item_id
    from public.consumable_items
    where lower(sku) = lower(v_sku_or_serial);

    if v_item_id is not null then
      perform public.rpc_adjust_stock(v_wh_id, v_item_id, null, v_qty, v_reason);
    else
      select id into v_asset_id
      from public.equipment_assets
      where lower(serial_number) = lower(v_sku_or_serial);

      perform public.rpc_adjust_stock(v_wh_id, null, v_asset_id, v_qty, v_reason);
    end if;
  end loop;
end;
$$;

grant execute on function public.rpc_bulk_import_item_master to authenticated;
grant execute on function public.rpc_bulk_receive_stock to authenticated;
grant execute on function public.rpc_bulk_opening_stock to authenticated;
grant execute on function public.rpc_bulk_adjust_stock to authenticated;
