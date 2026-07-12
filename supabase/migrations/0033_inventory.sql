-- Base schema migration for Inventory and Warehouse module

-- 1. Tables
create table public.warehouses (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  location text check (length(btrim(location)) > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.item_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 100),
  description text check (length(btrim(description)) > 0),
  created_at timestamptz not null default now()
);

create table public.equipment_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  category_id uuid not null references public.item_categories(id) on delete restrict,
  serial_number text not null unique check (length(btrim(serial_number)) > 0),
  model_name text not null check (length(btrim(model_name)) > 0),
  status text not null default 'available' check (status in ('available', 'assigned', 'maintenance', 'damaged', 'lost')),
  current_warehouse_id uuid references public.warehouses(id) on delete set null,
  is_sensitive boolean not null default false,
  condition_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consumable_items (
  id uuid primary key default extensions.gen_random_uuid(),
  category_id uuid not null references public.item_categories(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  sku text not null unique check (sku ~ '^[A-Z0-9-]+$'),
  unit_of_measure text not null check (length(btrim(unit_of_measure)) > 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  created_at timestamptz not null default now()
);

create table public.stock_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  received_by uuid not null references public.profiles(id) on delete restrict,
  reference_number text not null check (length(btrim(reference_number)) > 0),
  received_at timestamptz not null default now()
);

create table public.stock_receipt_items (
  id uuid primary key default extensions.gen_random_uuid(),
  receipt_id uuid not null references public.stock_receipts(id) on delete cascade,
  consumable_item_id uuid references public.consumable_items(id) on delete restrict,
  equipment_asset_id uuid references public.equipment_assets(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  check (
    (consumable_item_id is not null and equipment_asset_id is null) or
    (consumable_item_id is null and equipment_asset_id is not null)
  )
);

create table public.stock_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  project_name text not null check (length(btrim(project_name)) > 0),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'fulfilled', 'rejected')),
  total_estimated_value numeric not null default 0 check (total_estimated_value >= 0),
  escalated_to_cfo boolean not null default false,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_request_items (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null references public.stock_requests(id) on delete cascade,
  consumable_item_id uuid references public.consumable_items(id) on delete restrict,
  equipment_asset_id uuid references public.equipment_assets(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  estimated_unit_price numeric not null check (estimated_unit_price >= 0),
  check (
    (consumable_item_id is not null and equipment_asset_id is null) or
    (consumable_item_id is null and equipment_asset_id is not null)
  )
);

create table public.stock_movements (
  id uuid primary key default extensions.gen_random_uuid(),
  movement_type text not null check (movement_type in ('receipt', 'issue', 'return', 'adjustment_add', 'adjustment_remove')),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  consumable_item_id uuid references public.consumable_items(id) on delete restrict,
  equipment_asset_id uuid references public.equipment_assets(id) on delete restrict,
  quantity integer not null check (quantity <> 0),
  reference_id uuid not null, -- Links to stock_receipt_items, stock_request_items, etc.
  performed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (consumable_item_id is not null and equipment_asset_id is null) or
    (consumable_item_id is null and equipment_asset_id is not null)
  )
);

create table public.asset_returns (
  id uuid primary key default extensions.gen_random_uuid(),
  equipment_asset_id uuid not null references public.equipment_assets(id) on delete restrict,
  returned_by uuid not null references public.profiles(id) on delete restrict,
  returned_to_warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  condition text not null check (condition in ('good', 'damaged', 'lost')),
  notes text,
  created_at timestamptz not null default now()
);

create table public.damage_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  equipment_asset_id uuid references public.equipment_assets(id) on delete restrict,
  consumable_item_id uuid references public.consumable_items(id) on delete restrict,
  reported_by uuid not null references public.profiles(id) on delete restrict,
  description text not null check (length(btrim(description)) > 0),
  action_taken text,
  created_at timestamptz not null default now(),
  check (
    (consumable_item_id is not null and equipment_asset_id is null) or
    (consumable_item_id is null and equipment_asset_id is not null)
  )
);

-- 2. Indexes for fast computed balance lookups
create index stock_movements_consumable_idx on public.stock_movements (consumable_item_id, warehouse_id);
create index stock_movements_equipment_idx on public.stock_movements (equipment_asset_id);

-- 3. Row-Level Security (RLS) Configuration
alter table public.warehouses enable row level security;
alter table public.item_categories enable row level security;
alter table public.equipment_assets enable row level security;
alter table public.consumable_items enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_items enable row level security;
alter table public.stock_requests enable row level security;
alter table public.stock_request_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.asset_returns enable row level security;
alter table public.damage_reports enable row level security;

-- 4. Permissions seeding
insert into public.permissions (key, resource, action, description)
values
  ('inventory.read', 'inventory', 'read', 'Read inventory items, warehouses, and movements.'),
  ('inventory.request', 'inventory', 'request', 'Create stock requests for projects.'),
  ('inventory.approve', 'inventory', 'approve', 'Approve stock requests.'),
  ('inventory.issue', 'inventory', 'issue', 'Issue approved stock requests (checkout).'),
  ('inventory.receipt', 'inventory', 'receipt', 'Receive goods and stock (GRN).'),
  ('inventory.adjust', 'inventory', 'adjust', 'Adjust stock quantities and asset statuses.')
on conflict (key) do nothing;

-- Roles & Permission assignments
-- Grant all permissions to super_admin
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
  and p.key like 'inventory.%'
on conflict do nothing;

-- Grant to warehouse_manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'warehouse_manager'
  and p.key in ('inventory.read', 'inventory.issue', 'inventory.receipt', 'inventory.adjust')
on conflict do nothing;

-- Grant to cfo
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'cfo'
  and p.key in ('inventory.read', 'inventory.approve', 'inventory.receipt', 'inventory.adjust')
on conflict do nothing;

-- Grant to project_manager & coordinator
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('project_manager', 'coordinator')
  and p.key in ('inventory.read', 'inventory.request')
on conflict do nothing;

-- 5. RLS Policies
-- Read permissions for everyone except basic employees
create policy inventory_read_policy on public.warehouses
  for select using (public.has_permission('inventory.read'));

create policy inventory_read_policy on public.item_categories
  for select using (public.has_permission('inventory.read'));

create policy inventory_read_policy on public.equipment_assets
  for select using (public.has_permission('inventory.read'));

create policy inventory_read_policy on public.consumable_items
  for select using (public.has_permission('inventory.read'));

create policy inventory_read_policy on public.stock_receipts
  for select using (public.has_permission('inventory.read'));

create policy inventory_read_policy on public.stock_receipt_items
  for select using (public.has_permission('inventory.read'));

create policy inventory_read_policy on public.stock_requests
  for select using (
    public.has_permission('inventory.read')
    or requested_by = auth.uid()
  );

create policy inventory_read_policy on public.stock_request_items
  for select using (
    public.has_permission('inventory.read')
    or exists (
      select 1 from public.stock_requests r
      where r.id = request_id and r.requested_by = auth.uid()
    )
  );

create policy inventory_read_policy on public.stock_movements
  for select using (public.has_permission('inventory.read'));

create policy inventory_read_policy on public.asset_returns
  for select using (public.has_permission('inventory.read'));

create policy inventory_read_policy on public.damage_reports
  for select using (public.has_permission('inventory.read'));

-- Revoke all direct client writes (writes must go through atomic RPCs)
revoke all on table public.warehouses from anon, authenticated;
revoke all on table public.item_categories from anon, authenticated;
revoke all on table public.equipment_assets from anon, authenticated;
revoke all on table public.consumable_items from anon, authenticated;
revoke all on table public.stock_receipts from anon, authenticated;
revoke all on table public.stock_receipt_items from anon, authenticated;
revoke all on table public.stock_requests from anon, authenticated;
revoke all on table public.stock_request_items from anon, authenticated;
revoke all on table public.stock_movements from anon, authenticated;
revoke all on table public.asset_returns from anon, authenticated;
revoke all on table public.damage_reports from anon, authenticated;

grant select on public.warehouses to authenticated;
grant select on public.item_categories to authenticated;
grant select on public.equipment_assets to authenticated;
grant select on public.consumable_items to authenticated;
grant select on public.stock_receipts to authenticated;
grant select on public.stock_receipt_items to authenticated;
grant select on public.stock_requests to authenticated;
grant select on public.stock_request_items to authenticated;
grant select on public.stock_movements to authenticated;
grant select on public.asset_returns to authenticated;
grant select on public.damage_reports to authenticated;
