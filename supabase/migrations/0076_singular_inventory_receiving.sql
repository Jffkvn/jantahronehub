-- First-time and existing-item receiving with complete supplier evidence.

alter table public.stock_receipts
  add column supplier_name text,
  add column invoice_number text,
  add column received_date date not null default current_date,
  add column purchase_value numeric(15,2) not null default 0 check (purchase_value >= 0);

create or replace function public.rpc_create_consumable_item(
  p_category_id uuid, p_name text, p_sku text, p_unit_of_measure text, p_reorder_level integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_item_id uuid;
begin
  if public.current_profile_id() is null or not public.has_permission('inventory.receipt') then
    raise insufficient_privilege using message = 'inventory receipt permission is required';
  end if;
  if length(btrim(coalesce(p_name,''))) < 2 or upper(btrim(coalesce(p_sku,''))) !~ '^[A-Z0-9-]+$'
     or length(btrim(coalesce(p_unit_of_measure,''))) < 1 or coalesce(p_reorder_level,-1) < 0 then
    raise invalid_parameter_value using message = 'valid item master details are required';
  end if;
  insert into public.consumable_items (category_id, name, sku, unit_of_measure, reorder_level)
  values (p_category_id, btrim(p_name), upper(btrim(p_sku)), btrim(p_unit_of_measure), p_reorder_level)
  returning id into v_item_id;
  insert into public.audit_events (actor_profile_id,event_type,entity_type,entity_id,new_values)
  values (public.current_profile_id(),'inventory.item_created','consumable_item',v_item_id::text,jsonb_build_object('sku',upper(btrim(p_sku)),'name',btrim(p_name)));
  return v_item_id;
exception when unique_violation then
  raise unique_violation using message = 'item SKU already exists';
end $$;

create or replace function public.rpc_receive_consumable(
  p_item_id uuid, p_category_id uuid, p_name text, p_sku text,
  p_unit_of_measure text, p_reorder_level integer,
  p_warehouse_id uuid, p_supplier_name text, p_grn_number text,
  p_invoice_number text, p_received_date date, p_quantity integer, p_unit_price numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item_id uuid := p_item_id; v_receipt_id uuid;
begin
  if public.current_profile_id() is null or not public.has_permission('inventory.receipt') then
    raise insufficient_privilege using message = 'inventory receipt permission is required';
  end if;
  if length(btrim(coalesce(p_supplier_name,''))) < 2 or length(btrim(coalesce(p_grn_number,''))) < 2
     or length(btrim(coalesce(p_invoice_number,''))) < 2 or p_received_date is null or p_received_date > current_date
     or coalesce(p_quantity,0) <= 0 or coalesce(p_unit_price,-1) < 0 then
    raise invalid_parameter_value using message = 'complete supplier, GRN, invoice, date, quantity and value details are required';
  end if;
  if v_item_id is null then
    v_item_id := public.rpc_create_consumable_item(p_category_id,p_name,p_sku,p_unit_of_measure,p_reorder_level);
  end if;
  v_receipt_id := public.rpc_receive_stock(p_warehouse_id,btrim(p_grn_number),jsonb_build_array(jsonb_build_object(
    'consumable_item_id',v_item_id,'quantity',p_quantity,'unit_price',p_unit_price
  )));
  update public.stock_receipts set supplier_name=btrim(p_supplier_name), invoice_number=btrim(p_invoice_number),
    received_date=p_received_date, received_at=p_received_date::timestamptz, purchase_value=p_quantity*p_unit_price
  where id=v_receipt_id;
  return jsonb_build_object('item_id',v_item_id,'receipt_id',v_receipt_id);
end $$;

create or replace function public.rpc_receive_new_equipment(
  p_category_id uuid, p_model_name text, p_serial_number text, p_is_sensitive boolean,
  p_condition_notes text, p_warehouse_id uuid, p_supplier_name text, p_grn_number text,
  p_invoice_number text, p_received_date date, p_purchase_value numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_asset_id uuid; v_receipt_id uuid;
begin
  if public.current_profile_id() is null or not public.has_permission('inventory.receipt') then
    raise insufficient_privilege using message = 'inventory receipt permission is required';
  end if;
  if length(btrim(coalesce(p_model_name,''))) < 2 or length(btrim(coalesce(p_serial_number,''))) < 2
     or length(btrim(coalesce(p_condition_notes,''))) < 2 or length(btrim(coalesce(p_supplier_name,''))) < 2
     or length(btrim(coalesce(p_grn_number,''))) < 2 or length(btrim(coalesce(p_invoice_number,''))) < 2
     or p_received_date is null or p_received_date > current_date or coalesce(p_purchase_value,-1) < 0 then
    raise invalid_parameter_value using message = 'complete asset, supplier, GRN, invoice, date, value and condition details are required';
  end if;
  insert into public.equipment_assets (category_id,serial_number,model_name,is_sensitive,condition_notes,status)
  values (p_category_id,btrim(p_serial_number),btrim(p_model_name),coalesce(p_is_sensitive,false),btrim(p_condition_notes),'available')
  returning id into v_asset_id;
  v_receipt_id := public.rpc_receive_stock(p_warehouse_id,btrim(p_grn_number),jsonb_build_array(jsonb_build_object(
    'equipment_asset_id',v_asset_id,'quantity',1,'unit_price',p_purchase_value
  )));
  update public.stock_receipts set supplier_name=btrim(p_supplier_name), invoice_number=btrim(p_invoice_number),
    received_date=p_received_date, received_at=p_received_date::timestamptz, purchase_value=p_purchase_value
  where id=v_receipt_id;
  insert into public.audit_events (actor_profile_id,event_type,entity_type,entity_id,new_values)
  values (public.current_profile_id(),'inventory.asset_received','equipment_asset',v_asset_id::text,jsonb_build_object('receipt_id',v_receipt_id,'serial_number',btrim(p_serial_number),'purchase_value',p_purchase_value));
  return jsonb_build_object('asset_id',v_asset_id,'receipt_id',v_receipt_id);
exception when unique_violation then
  raise unique_violation using message = 'equipment serial or GRN already exists';
end $$;

revoke all on function public.rpc_create_consumable_item(uuid,text,text,text,integer) from public,anon;
revoke all on function public.rpc_receive_consumable(uuid,uuid,text,text,text,integer,uuid,text,text,text,date,integer,numeric) from public,anon;
revoke all on function public.rpc_receive_new_equipment(uuid,text,text,boolean,text,uuid,text,text,text,date,numeric) from public,anon;
grant execute on function public.rpc_create_consumable_item(uuid,text,text,text,integer) to authenticated;
grant execute on function public.rpc_receive_consumable(uuid,uuid,text,text,text,integer,uuid,text,text,text,date,integer,numeric) to authenticated;
grant execute on function public.rpc_receive_new_equipment(uuid,text,text,boolean,text,uuid,text,text,text,date,numeric) to authenticated;
