begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

-- 1. Setup checks
select has_table('public', 'inventory_settings', 'inventory_settings table exists');
select has_function('public', 'rpc_escalate_stock_request', array['uuid'], 'rpc_escalate_stock_request function exists');

-- 2. Setup test data
insert into auth.users (id, email)
values
  ('70000000-0000-0000-0000-000000000001', 'route-admin@example.invalid'),
  ('70000000-0000-0000-0000-000000000002', 'route-wm@example.invalid'),
  ('70000000-0000-0000-0000-000000000003', 'route-pm@example.invalid'),
  ('70000000-0000-0000-0000-000000000004', 'route-cfo@example.invalid')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('70000000-0000-0000-0000-000000000001', 'Route Admin'),
  ('70000000-0000-0000-0000-000000000002', 'Route WM'),
  ('70000000-0000-0000-0000-000000000003', 'Route PM'),
  ('70000000-0000-0000-0000-000000000004', 'Route CFO')
on conflict (id) do nothing;

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('70000000-0000-0000-0000-000000000001'::uuid, 'super_admin'::text),
  ('70000000-0000-0000-0000-000000000002'::uuid, 'warehouse_manager'::text),
  ('70000000-0000-0000-0000-000000000003'::uuid, 'project_manager'::text),
  ('70000000-0000-0000-0000-000000000004'::uuid, 'cfo'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key
on conflict do nothing;

-- Set session context to superuser to create setup fixtures
reset role;

create temp table r_warehouse (id uuid);
create temp table r_category (id uuid);
create temp table r_consumable (id uuid);
create temp table r_equipment_regular (id uuid);
create temp table r_equipment_sensitive (id uuid);

with ins_wh as (
  insert into public.warehouses (name, location)
  values ('Routing Warehouse', 'Kampala')
  returning id
)
insert into r_warehouse (id) select id from ins_wh;

with ins_cat as (
  insert into public.item_categories (name, description)
  values ('Routing Category', 'Routing tests')
  returning id
)
insert into r_category (id) select id from ins_cat;

with ins_con as (
  insert into public.consumable_items (category_id, name, sku, unit_of_measure, reorder_level)
  select id, 'Route Cement', 'RC-001', 'bag', 10 from r_category
  returning id
)
insert into r_consumable (id) select id from ins_con;

with ins_eq_reg as (
  insert into public.equipment_assets (category_id, serial_number, model_name, status, is_sensitive)
  select id, 'EQ-REG-01', 'Standard Tool', 'available', false from r_category
  returning id
)
insert into r_equipment_regular (id) select id from ins_eq_reg;

with ins_eq_sens as (
  insert into public.equipment_assets (category_id, serial_number, model_name, status, is_sensitive)
  select id, 'EQ-SENS-01', 'Sensitive Scanner', 'available', true from r_category
  returning id
)
insert into r_equipment_sensitive (id) select id from ins_eq_sens;

-- Seed stock levels (15 bags of Route Cement)
insert into public.stock_movements (movement_type, warehouse_id, consumable_item_id, quantity, reference_id, performed_by)
select 'receipt', (select id from r_warehouse), (select id from r_consumable), 15, extensions.gen_random_uuid(), '70000000-0000-0000-0000-000000000001';

grant select on r_warehouse, r_category, r_consumable, r_equipment_regular, r_equipment_sensitive to authenticated;

-- Ensure default settings
update public.inventory_settings
set approval_mode = 'threshold_escalation',
    cfo_threshold = 2000000,
    critical_stock_escalation = true
where singleton = true;

-- Test 3: Below threshold request (value = UGX 35,000, threshold = UGX 2,000,000)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

create temp table r_req_below (id uuid);
grant select on r_req_below to authenticated;

with ins_req as (
  select public.rpc_request_stock(
    'Below Threshold Project',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from r_consumable),
        'quantity', 1,
        'estimated_unit_price', 35000
      )
    )
  ) as id
)
insert into r_req_below (id) select id from ins_req;

reset role;
select is((select escalated_to_cfo from public.stock_requests where id = (select id from r_req_below)), false, 'below threshold request does not escalate to CFO');

-- Test 4: Warehouse Manager can approve below threshold request
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$
  select public.rpc_approve_stock_request((select id from r_req_below))
  $$,
  'warehouse manager can approve below-threshold request'
);

-- Test 5: Exactly at threshold request (value = UGX 2,000,000)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

create temp table r_req_at (id uuid);
grant select on r_req_at to authenticated;

with ins_req as (
  select public.rpc_request_stock(
    'At Threshold Project',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from r_consumable),
        'quantity', 2,
        'estimated_unit_price', 1000000
      )
    )
  ) as id
)
insert into r_req_at (id) select id from ins_req;

reset role;
select is((select escalated_to_cfo from public.stock_requests where id = (select id from r_req_at)), true, 'request exactly at threshold escalates to CFO');

-- Test 6: Warehouse Manager CANNOT approve exactly-at-threshold request
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$
  select public.rpc_approve_stock_request((select id from r_req_at))
  $$,
  '42501',
  'Unauthorized: Only CFO can approve escalated stock requests.',
  'warehouse manager cannot approve escalated request'
);

-- Test 7: CFO can approve escalated request
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$
  select public.rpc_approve_stock_request((select id from r_req_at))
  $$,
  'CFO can approve escalated request'
);

-- Test 8: Above threshold request (value = UGX 2,100,000) escalates
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

create temp table r_req_above (id uuid);
grant select on r_req_above to authenticated;

with ins_req as (
  select public.rpc_request_stock(
    'Above Threshold Project',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from r_consumable),
        'quantity', 3,
        'estimated_unit_price', 700000
      )
    )
  ) as id
)
insert into r_req_above (id) select id from ins_req;

reset role;
select is((select escalated_to_cfo from public.stock_requests where id = (select id from r_req_above)), true, 'above threshold request escalates to CFO');

-- Test 9: Sensitive asset request escalates regardless of value (value = UGX 150,000)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

create temp table r_req_sens (id uuid);
grant select on r_req_sens to authenticated;

with ins_req as (
  select public.rpc_request_stock(
    'Sensitive Asset Project',
    jsonb_build_array(
      jsonb_build_object(
        'equipment_asset_id', (select id from r_equipment_sensitive),
        'quantity', 1,
        'estimated_unit_price', 150000
      )
    )
  ) as id
)
insert into r_req_sens (id) select id from ins_req;

reset role;
select is((select escalated_to_cfo from public.stock_requests where id = (select id from r_req_sens)), true, 'sensitive asset request escalates regardless of value');

-- Test 10: Critical stock condition escalates (remaining stock drops below reorder level of 10)
-- 15 bags receipt - 6 bags request = 9 bags remaining (< 10 reorder level)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

create temp table r_req_crit (id uuid);
grant select on r_req_crit to authenticated;

with ins_req as (
  select public.rpc_request_stock(
    'Critical Stock Project',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from r_consumable),
        'quantity', 6,
        'estimated_unit_price', 35000
      )
    )
  ) as id
)
insert into r_req_crit (id) select id from ins_req;

reset role;
select is((select escalated_to_cfo from public.stock_requests where id = (select id from r_req_crit)), true, 'critical stock depletion triggers escalation');

-- Test 11: Manual escalation by WM
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

create temp table r_req_manual (id uuid);
grant select on r_req_manual to authenticated;

with ins_req as (
  select public.rpc_request_stock(
    'Manual Escalation Project',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from r_consumable),
        'quantity', 1,
        'estimated_unit_price', 35000
      )
    )
  ) as id
)
insert into r_req_manual (id) select id from ins_req;

-- WM manual escalation
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$
  select public.rpc_escalate_stock_request((select id from r_req_manual))
  $$,
  'warehouse manager can manually escalate a request'
);

reset role;
select is((select escalated_to_cfo from public.stock_requests where id = (select id from r_req_manual)), true, 'manually escalated request has escalated_to_cfo set to true');

-- Test 12: Manual escalation throws if unauthorized (Project Manager tries to escalate)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$
  select public.rpc_escalate_stock_request((select id from r_req_manual))
  $$,
  '42501',
  'Unauthorized: Insufficient permissions to escalate stock requests.',
  'unauthorized user cannot manually escalate a request'
);

-- Test 13: Manager-only mode ignores threshold
reset role;
update public.inventory_settings
set approval_mode = 'warehouse_manager_only'
where singleton = true;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

create temp table r_req_mgr_mode (id uuid);
grant select on r_req_mgr_mode to authenticated;

with ins_req as (
  select public.rpc_request_stock(
    'Manager Mode Project',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from r_consumable),
        'quantity', 3,
        'estimated_unit_price', 1000000
      )
    )
  ) as id
)
insert into r_req_mgr_mode (id) select id from ins_req;

reset role;
select is((select escalated_to_cfo from public.stock_requests where id = (select id from r_req_mgr_mode)), false, 'manager-only mode ignores threshold escalation');

-- Test 14: CFO-all mode escalates everything
reset role;
update public.inventory_settings
set approval_mode = 'cfo_approval_all'
where singleton = true;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

create temp table r_req_cfo_all (id uuid);
grant select on r_req_cfo_all to authenticated;

with ins_req as (
  select public.rpc_request_stock(
    'CFO All Project',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from r_consumable),
        'quantity', 1,
        'estimated_unit_price', 35000
      )
    )
  ) as id
)
insert into r_req_cfo_all (id) select id from ins_req;

reset role;
select is((select escalated_to_cfo from public.stock_requests where id = (select id from r_req_cfo_all)), true, 'cfo-all mode escalates low value request');

-- Test 15: CFO approval followed by warehouse manager fulfillment works correctly
-- 1. CFO approves the cfo-all request
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$
  select public.rpc_approve_stock_request((select id from r_req_cfo_all))
  $$,
  'CFO approves cfo-all request'
);

-- 2. Warehouse Manager fulfills/issues it
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$
  select public.rpc_issue_stock(
    (select id from r_req_cfo_all),
    (select id from r_warehouse)
  )
  $$,
  'warehouse manager can successfully issue the approved escalated request'
);

-- Test 16: Unauthorized checkout rejection (Project Manager trying to issue stock)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$
  select public.rpc_issue_stock(
    (select id from r_req_cfo_all),
    (select id from r_warehouse)
  )
  $$,
  '42501',
  'Unauthorized: Insufficient permissions to issue stock.',
  'unauthorized user cannot issue stock'
);

do $$
declare diagnostic text;
begin
  for diagnostic in select * from finish() loop
    raise exception using message = 'pgTAP failure: ' || diagnostic;
  end loop;
end
$$;

rollback;
