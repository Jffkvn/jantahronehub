-- Migration 0037_warehouse_approval_routing.sql
-- Implement configurable approval routing, settings table, permissions, and functions.

-- 1. Create inventory settings table (singleton)
create table public.inventory_settings (
  singleton boolean primary key default true check (singleton),
  approval_mode text not null default 'threshold_escalation' check (approval_mode in ('warehouse_manager_only', 'threshold_escalation', 'cfo_approval_all')),
  cfo_threshold numeric not null default 2000000 check (cfo_threshold >= 0),
  critical_stock_escalation boolean not null default false,
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

-- Seed default settings row
insert into public.inventory_settings (singleton, approval_mode, cfo_threshold, critical_stock_escalation)
values (true, 'threshold_escalation', 2000000, false)
on conflict (singleton) do nothing;

-- 2. Seed settings management permission
insert into public.permissions (key, resource, action, description)
values ('inventory.manage_settings', 'inventory', 'manage_settings', 'Manage warehouse and inventory routing settings.')
on conflict (key) do nothing;

-- Assign to super_admin
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
  and p.key = 'inventory.manage_settings'
on conflict do nothing;

-- 3. RLS configurations
alter table public.inventory_settings enable row level security;

create policy inventory_settings_read on public.inventory_settings
  for select using (public.has_permission('inventory.read'));

create policy inventory_settings_manage on public.inventory_settings
  for all using (public.has_permission('inventory.manage_settings'));

revoke all on table public.inventory_settings from anon, authenticated;
grant select on table public.inventory_settings to authenticated;

-- 4. Re-implement rpc_request_stock to use dynamic configurations
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
  v_reorder_level integer;
  v_settings record;
begin
  -- Access authorization check
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not public.has_permission('inventory.request') then
    raise exception 'Unauthorized: Insufficient permissions to request stock.' using errcode = '42501';
  end if;

  -- Get current settings
  select approval_mode, cfo_threshold, critical_stock_escalation
  into v_settings
  from public.inventory_settings
  where singleton = true;

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
        raise exception 'Equipment asset not found.' using errcode = '22000';
      end if;

      if v_asset_status <> 'available' then
        raise exception 'Equipment asset is currently % (not available).', v_asset_status using errcode = '22000';
      end if;

      -- Check sensitive asset escalation rule
      if v_settings.approval_mode = 'threshold_escalation' and v_is_sensitive then
        v_escalated_to_cfo := true;
      end if;

    elsif v_consumable_item_id is not null then
      -- Calculate current ledger balance
      select coalesce(sum(quantity), 0) into v_available_qty
      from public.stock_movements
      where consumable_item_id = v_consumable_item_id;

      if v_available_qty < v_quantity then
        raise exception 'Insufficient stock available in ledger.' using errcode = '22000';
      end if;

      -- Check critical stock escalation rule
      if v_settings.approval_mode = 'threshold_escalation' and v_settings.critical_stock_escalation then
        select reorder_level into v_reorder_level
        from public.consumable_items
        where id = v_consumable_item_id;

        if v_available_qty - v_quantity < v_reorder_level then
          v_escalated_to_cfo := true;
        end if;
      end if;
    end if;
  end loop;

  -- Resolve escalation routing based on approval mode
  if v_settings.approval_mode = 'cfo_approval_all' then
    v_escalated_to_cfo := true;
  elsif v_settings.approval_mode = 'warehouse_manager_only' then
    v_escalated_to_cfo := false;
  else -- threshold_escalation
    if v_total_estimated_value >= v_settings.cfo_threshold then
      v_escalated_to_cfo := true;
    end if;
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

-- 5. Re-implement rpc_approve_stock_request to enforce dynamic escalation permissions
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
  if v_profile_id is null then
    raise exception 'Unauthorized: User profile not active.' using errcode = '42501';
  end if;

  select escalated_to_cfo into v_escalated
  from public.stock_requests
  where id = p_request_id;

  if not found then
    raise exception 'Stock request not found.' using errcode = '22000';
  end if;

  -- Enforce role capabilities based on routing state
  if v_escalated then
    if not public.has_permission('inventory.approve') then
      raise exception 'Unauthorized: Only CFO can approve escalated stock requests.' using errcode = '42501';
    end if;
  else
    if not (public.has_permission('inventory.approve') or public.has_permission('inventory.issue')) then
      raise exception 'Unauthorized: Insufficient permissions to approve stock requests.' using errcode = '42501';
    end if;
  end if;

  update public.stock_requests
  set status = 'approved',
      approved_by = v_profile_id,
      approved_at = now(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

-- 6. Add rpc_escalate_stock_request for manual manager escalation
create or replace function public.rpc_escalate_stock_request(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_status text;
begin
  -- Access authorization check (requiring either manager issue or admin approve permission)
  v_profile_id := public.current_profile_id();
  if v_profile_id is null or not (public.has_permission('inventory.issue') or public.has_permission('inventory.approve')) then
    raise exception 'Unauthorized: Insufficient permissions to escalate stock requests.' using errcode = '42501';
  end if;

  select status into v_status
  from public.stock_requests
  where id = p_request_id;

  if not found then
    raise exception 'Stock request not found.' using errcode = '22000';
  end if;

  if v_status <> 'pending_approval' then
    raise exception 'Only pending stock requests can be escalated.' using errcode = '22000';
  end if;

  update public.stock_requests
  set escalated_to_cfo = true,
      updated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.rpc_escalate_stock_request to authenticated;
