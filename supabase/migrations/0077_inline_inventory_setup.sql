-- Inline category and warehouse creation for uninterrupted singular receiving.

alter table public.warehouses add column code text;

update public.warehouses
set code = 'WH-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where code is null;

alter table public.warehouses
  alter column code set not null,
  add constraint warehouses_code_format_check check (code ~ '^[A-Z0-9-]+$');

create unique index warehouses_code_case_uidx on public.warehouses (lower(code));
create unique index warehouses_name_case_uidx on public.warehouses (lower(btrim(name)));
create unique index item_categories_name_case_uidx on public.item_categories (lower(btrim(name)));

create or replace function public.resolve_inventory_category(
  p_category_id uuid,
  p_category_name text,
  p_category_description text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_category_id uuid;
begin
  if public.current_profile_id() is null or not public.has_permission('inventory.receipt') then
    raise insufficient_privilege using message = 'inventory receipt permission is required';
  end if;

  if p_category_id is not null then
    select category.id into v_category_id
    from public.item_categories category
    where category.id = p_category_id;
    if v_category_id is null then
      raise invalid_parameter_value using message = 'selected category does not exist';
    end if;
    return v_category_id;
  end if;

  if length(btrim(coalesce(p_category_name, ''))) < 2 then
    raise invalid_parameter_value using message = 'new category name is required';
  end if;

  insert into public.item_categories (name, description)
  values (btrim(p_category_name), nullif(btrim(coalesce(p_category_description, '')), ''))
  returning id into v_category_id;

  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values)
  values (
    public.current_profile_id(), 'inventory.category_created', 'item_category', v_category_id::text,
    jsonb_build_object('name', btrim(p_category_name))
  );
  return v_category_id;
exception when unique_violation then
  raise unique_violation using message = 'category name already exists';
end $$;

create or replace function public.resolve_inventory_warehouse(
  p_warehouse_id uuid,
  p_warehouse_code text,
  p_warehouse_name text,
  p_warehouse_location text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_warehouse_id uuid;
begin
  if public.current_profile_id() is null or not public.has_permission('inventory.receipt') then
    raise insufficient_privilege using message = 'inventory receipt permission is required';
  end if;

  if p_warehouse_id is not null then
    select warehouse.id into v_warehouse_id
    from public.warehouses warehouse
    where warehouse.id = p_warehouse_id and warehouse.status = 'active';
    if v_warehouse_id is null then
      raise invalid_parameter_value using message = 'selected active warehouse does not exist';
    end if;
    return v_warehouse_id;
  end if;

  if upper(btrim(coalesce(p_warehouse_code, ''))) !~ '^[A-Z0-9-]{2,30}$'
     or length(btrim(coalesce(p_warehouse_name, ''))) < 2
     or length(btrim(coalesce(p_warehouse_location, ''))) < 2 then
    raise invalid_parameter_value using message = 'new warehouse code, name and location are required';
  end if;

  insert into public.warehouses (code, name, location, status)
  values (
    upper(btrim(p_warehouse_code)), btrim(p_warehouse_name), btrim(p_warehouse_location), 'active'
  ) returning id into v_warehouse_id;

  insert into public.audit_events (actor_profile_id, event_type, entity_type, entity_id, new_values)
  values (
    public.current_profile_id(), 'inventory.warehouse_created', 'warehouse', v_warehouse_id::text,
    jsonb_build_object('code', upper(btrim(p_warehouse_code)), 'name', btrim(p_warehouse_name), 'location', btrim(p_warehouse_location))
  );
  return v_warehouse_id;
exception when unique_violation then
  if exists (select 1 from public.warehouses where lower(code) = lower(btrim(p_warehouse_code))) then
    raise unique_violation using message = 'warehouse code already exists';
  end if;
  raise unique_violation using message = 'warehouse name already exists';
end $$;

create or replace function public.rpc_create_consumable_item_inline(
  p_category_id uuid, p_category_name text, p_category_description text,
  p_name text, p_sku text, p_unit_of_measure text, p_reorder_level integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_category_id uuid;
begin
  v_category_id := public.resolve_inventory_category(p_category_id, p_category_name, p_category_description);
  return public.rpc_create_consumable_item(v_category_id, p_name, p_sku, p_unit_of_measure, p_reorder_level);
end $$;

create or replace function public.rpc_receive_consumable_inline(
  p_item_id uuid,
  p_category_id uuid, p_category_name text, p_category_description text,
  p_name text, p_sku text, p_unit_of_measure text, p_reorder_level integer,
  p_warehouse_id uuid, p_warehouse_code text, p_warehouse_name text, p_warehouse_location text,
  p_supplier_name text, p_grn_number text, p_invoice_number text, p_received_date date,
  p_quantity integer, p_unit_price numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_category_id uuid := p_category_id; v_warehouse_id uuid;
begin
  v_warehouse_id := public.resolve_inventory_warehouse(
    p_warehouse_id, p_warehouse_code, p_warehouse_name, p_warehouse_location
  );
  if p_item_id is null then
    v_category_id := public.resolve_inventory_category(
      p_category_id, p_category_name, p_category_description
    );
  end if;
  return public.rpc_receive_consumable(
    p_item_id, v_category_id, p_name, p_sku, p_unit_of_measure, p_reorder_level,
    v_warehouse_id, p_supplier_name, p_grn_number, p_invoice_number, p_received_date,
    p_quantity, p_unit_price
  );
end $$;

create or replace function public.rpc_receive_new_equipment_inline(
  p_category_id uuid, p_category_name text, p_category_description text,
  p_model_name text, p_serial_number text, p_is_sensitive boolean, p_condition_notes text,
  p_warehouse_id uuid, p_warehouse_code text, p_warehouse_name text, p_warehouse_location text,
  p_supplier_name text, p_grn_number text, p_invoice_number text, p_received_date date,
  p_purchase_value numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_category_id uuid; v_warehouse_id uuid;
begin
  v_category_id := public.resolve_inventory_category(
    p_category_id, p_category_name, p_category_description
  );
  v_warehouse_id := public.resolve_inventory_warehouse(
    p_warehouse_id, p_warehouse_code, p_warehouse_name, p_warehouse_location
  );
  return public.rpc_receive_new_equipment(
    v_category_id, p_model_name, p_serial_number, p_is_sensitive, p_condition_notes,
    v_warehouse_id, p_supplier_name, p_grn_number, p_invoice_number, p_received_date,
    p_purchase_value
  );
end $$;

revoke all on function public.resolve_inventory_category(uuid,text,text) from public, anon, authenticated;
revoke all on function public.resolve_inventory_warehouse(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.rpc_create_consumable_item_inline(uuid,text,text,text,text,text,integer) from public, anon;
revoke all on function public.rpc_receive_consumable_inline(uuid,uuid,text,text,text,text,text,integer,uuid,text,text,text,text,text,text,date,integer,numeric) from public, anon;
revoke all on function public.rpc_receive_new_equipment_inline(uuid,text,text,text,text,boolean,text,uuid,text,text,text,text,text,text,date,numeric) from public, anon;

grant execute on function public.rpc_create_consumable_item_inline(uuid,text,text,text,text,text,integer) to authenticated;
grant execute on function public.rpc_receive_consumable_inline(uuid,uuid,text,text,text,text,text,integer,uuid,text,text,text,text,text,text,date,integer,numeric) to authenticated;
grant execute on function public.rpc_receive_new_equipment_inline(uuid,text,text,text,text,boolean,text,uuid,text,text,text,text,text,text,date,numeric) to authenticated;
