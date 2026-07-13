begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(50);

-- 1. Table existence checks
select has_table('public', 'warehouses', 'warehouses table exists');
select has_table('public', 'item_categories', 'item_categories table exists');
select has_table('public', 'equipment_assets', 'equipment_assets table exists');
select has_table('public', 'consumable_items', 'consumable_items table exists');
select has_table('public', 'stock_receipts', 'stock_receipts table exists');
select has_table('public', 'stock_receipt_items', 'stock_receipt_items table exists');
select has_table('public', 'stock_requests', 'stock_requests table exists');
select has_table('public', 'stock_request_items', 'stock_request_items table exists');
select has_table('public', 'stock_movements', 'stock_movements table exists');
select has_table('public', 'asset_returns', 'asset_returns table exists');
select has_table('public', 'damage_reports', 'damage_reports table exists');

-- 2. Function presence checks
select has_function('public', 'rpc_receive_stock', array['uuid', 'text', 'jsonb'], 'rpc_receive_stock function exists');
select has_function('public', 'rpc_request_stock', array['text', 'jsonb'], 'rpc_request_stock function exists');
select has_function('public', 'rpc_approve_stock_request', array['uuid'], 'rpc_approve_stock_request function exists');
select has_function('public', 'rpc_issue_stock', array['uuid', 'uuid'], 'rpc_issue_stock function exists');
select has_function('public', 'rpc_return_asset', array['uuid', 'text', 'uuid', 'text'], 'rpc_return_asset function exists');
select has_function('public', 'rpc_adjust_stock', array['uuid', 'uuid', 'uuid', 'integer', 'text'], 'rpc_adjust_stock function exists');

-- 3. Setup test data
insert into auth.users (id, email)
values
  ('60000000-0000-0000-0000-000000000001', 'inv-admin@example.invalid'),
  ('60000000-0000-0000-0000-000000000002', 'inv-wm@example.invalid'),
  ('60000000-0000-0000-0000-000000000003', 'inv-pm@example.invalid'),
  ('60000000-0000-0000-0000-000000000004', 'inv-cfo@example.invalid');

insert into public.profiles (id, display_name)
values
  ('60000000-0000-0000-0000-000000000001', 'Inv Admin'),
  ('60000000-0000-0000-0000-000000000002', 'Inv WM'),
  ('60000000-0000-0000-0000-000000000003', 'Inv PM'),
  ('60000000-0000-0000-0000-000000000004', 'Inv CFO');

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('60000000-0000-0000-0000-000000000001'::uuid, 'super_admin'::text),
  ('60000000-0000-0000-0000-000000000002'::uuid, 'warehouse_manager'::text),
  ('60000000-0000-0000-0000-000000000003'::uuid, 'project_manager'::text),
  ('60000000-0000-0000-0000-000000000004'::uuid, 'cfo'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key;

-- Set session context to warehouse manager
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- Add base inventory setup (categories, consumable_items, equipment_assets, warehouses)
reset role;

create temp table test_warehouse (id uuid);
create temp table test_other_warehouse (id uuid);
create temp table test_category (id uuid);
create temp table test_consumable (id uuid);
create temp table test_equipment (id uuid);

with ins_wh as (
  insert into public.warehouses (name, location)
  values ('Central Warehouse', 'Kampala')
  returning id
)
insert into test_warehouse (id) select id from ins_wh;

with ins_wh as (
  insert into public.warehouses (name, location)
  values ('Secondary Warehouse', 'Jinja')
  returning id
)
insert into test_other_warehouse (id) select id from ins_wh;

with ins_cat as (
  insert into public.item_categories (name, description)
  values ('Tools', 'Construction tools')
  returning id
)
insert into test_category (id) select id from ins_cat;

with ins_con as (
  insert into public.consumable_items (category_id, name, sku, unit_of_measure)
  select id, 'Cement', 'CEM-001', 'bag' from test_category
  returning id
)
insert into test_consumable (id) select id from ins_con;

with ins_eq as (
  insert into public.equipment_assets (category_id, serial_number, model_name, status, is_sensitive)
  select id, 'EQ-SN-001', 'Drill 5000', 'available', false from test_category
  returning id
)
insert into test_equipment (id) select id from ins_eq;

grant select on test_warehouse, test_other_warehouse, test_category, test_consumable, test_equipment to authenticated;

-- 4. Test Stock Receipt (GRN) via RPC
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$
  select public.rpc_receive_stock(
    (select id from test_warehouse),
    'GRN-100',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from test_consumable),
        'quantity', 50,
        'unit_price', 35000
      ),
      jsonb_build_object(
        'equipment_asset_id', (select id from test_equipment),
        'quantity', 1,
        'unit_price', 150000
      )
    )
  )
  $$,
  'warehouse manager can successfully post stock receipt via RPC'
);

-- Check ledger balances
reset role;
select is((select sum(quantity)::bigint from public.stock_movements where consumable_item_id = (select id from test_consumable)), 50::bigint, 'stock movement records 50 bags of cement');
select is((select current_warehouse_id from public.equipment_assets where id = (select id from test_equipment)), (select id from test_warehouse), 'equipment asset is allocated to the warehouse');

-- Test multi-item receipt atomic rollback (invalid equipment ID)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$
  select public.rpc_receive_stock(
    (select id from test_warehouse),
    'GRN-ERR',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from test_consumable),
        'quantity', 10,
        'unit_price', 35000
      ),
      jsonb_build_object(
        'equipment_asset_id', '00000000-0000-0000-0000-000000000000'::uuid,
        'quantity', 1,
        'unit_price', 150000
      )
    )
  )
  $$,
  '22000',
  'Equipment asset not found.',
  'failed multi-item receipt rolls back everything'
);

reset role;
select is((select sum(quantity)::bigint from public.stock_movements where consumable_item_id = (select id from test_consumable)), 50::bigint, 'cement stock remains 50 bags after failed receipt');


-- 5. Test Stock Request via RPC
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select lives_ok(
  $$
  select public.rpc_request_stock(
    'Bridge Construction',
    jsonb_build_array(
      jsonb_build_object(
        'consumable_item_id', (select id from test_consumable),
        'quantity', 5,
        'estimated_unit_price', 35000
      ),
      jsonb_build_object(
        'equipment_asset_id', (select id from test_equipment),
        'quantity', 1,
        'estimated_unit_price', 150000
      )
    )
  )
  $$,
  'project manager can request stock via RPC'
);

-- Store request ID
reset role;
create temp table test_request as select id, status from public.stock_requests limit 1;
grant select on test_request to authenticated;
select is((select status from test_request), 'pending_approval', 'request starts in pending_approval state');

-- 6. Issue stock fails without approval
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$
  select public.rpc_issue_stock(
    (select id from test_request),
    (select id from test_warehouse)
  )
  $$,
  'L0102',
  'Conflict: Only approved stock requests can be issued.',
  'cannot issue stock before approval'
);

-- 7. Approve stock request
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$
  select public.rpc_approve_stock_request((select id from test_request))
  $$,
  'CFO can approve stock request'
);

-- 8. Test multi-item issue atomic rollback (exceeding stock on one item)
reset role;
create temp table test_fail_request (id uuid);
with ins_req as (
  insert into public.stock_requests (requested_by, project_name, status, total_estimated_value, escalated_to_cfo)
  values ('60000000-0000-0000-0000-000000000003', 'Failing Project', 'approved', 0, false)
  returning id
)
insert into test_fail_request (id) select id from ins_req;

insert into public.stock_request_items (request_id, consumable_item_id, quantity, estimated_unit_price)
select (select id from test_fail_request), (select id from test_consumable), 2, 35000;

insert into public.stock_request_items (request_id, consumable_item_id, quantity, estimated_unit_price)
select (select id from test_fail_request), (select id from test_consumable), 1000, 35000;

grant select on test_fail_request to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$
  select public.rpc_issue_stock(
    (select id from test_fail_request),
    (select id from test_warehouse)
  )
  $$,
  '22000',
  'Insufficient stock in warehouse for consumable.',
  'failed multi-item issue rolls back everything'
);

reset role;
select is((select sum(quantity)::bigint from public.stock_movements where consumable_item_id = (select id from test_consumable)), 50::bigint, 'cement stock remains 50 bags after failed issue');

-- 9. Issue stock succeeds with approval
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$
  select public.rpc_issue_stock(
    (select id from test_request),
    (select id from test_warehouse)
  )
  $$,
  'warehouse manager can issue stock after approval'
);

-- Verify stock decrement and equipment status
reset role;
select is((select sum(quantity)::bigint from public.stock_movements where consumable_item_id = (select id from test_consumable)), 45::bigint, 'remaining cement is 45 bags');
select is((select status from public.equipment_assets where id = (select id from test_equipment)), 'assigned', 'equipment status is updated to assigned');

-- 10. Return equipment asset
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$
  select public.rpc_return_asset(
    (select id from test_equipment),
    'good',
    (select id from test_warehouse),
    'Returned in clean condition'
  )
  $$,
  'warehouse manager can record equipment return'
);

-- Verify returned equipment status
reset role;
select is((select status from public.equipment_assets where id = (select id from test_equipment)), 'available', 'equipment status is restored to available');

-- 11. Test Stock Adjustment via RPC
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

-- Authorized adjustment
select lives_ok(
  $$
  select public.rpc_adjust_stock(
    (select id from test_warehouse),
    (select id from test_consumable),
    null,
    -5,
    'Damaged in warehouse storage'
  )
  $$,
  'CFO can adjust stock (authorized)'
);

-- Verify balance decrement
reset role;
select is((select sum(quantity)::bigint from public.stock_movements where consumable_item_id = (select id from test_consumable)), 40::bigint, 'remaining cement is 40 bags after adjustment');

-- Unauthorized adjustment
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$
  select public.rpc_adjust_stock(
    (select id from test_warehouse),
    (select id from test_consumable),
    null,
    -5,
    'Attempt'
  )
  $$,
  '42501',
  'Unauthorized: Insufficient permissions to adjust stock.',
  'project manager cannot adjust stock (unauthorized)'
);

-- Validation checks
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

-- Quantity is 0
select throws_ok(
  $$
  select public.rpc_adjust_stock(
    (select id from test_warehouse),
    (select id from test_consumable),
    null,
    0,
    'Reason'
  )
  $$,
  '22000',
  'Adjustment quantity must be non-zero.',
  'adjust stock fails if quantity is 0'
);

-- Empty reason
select throws_ok(
  $$
  select public.rpc_adjust_stock(
    (select id from test_warehouse),
    (select id from test_consumable),
    null,
    -5,
    '   '
  )
  $$,
  '22000',
  'Adjustment reason is required.',
  'adjust stock fails if reason is empty'
);

-- Insufficient stock rollback
select throws_ok(
  $$
  select public.rpc_adjust_stock(
    (select id from test_warehouse),
    (select id from test_consumable),
    null,
    -100,
    'Exceed balance'
  )
  $$,
  '22000',
  'Insufficient stock available for removal.',
  'adjust stock fails if stock is insufficient'
);

-- 12. Transition, replay, warehouse-ownership, and asset-lifecycle guards.
-- Replaying a fulfilled request must not post a second set of issue movements.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$
  select public.rpc_issue_stock(
    (select id from test_request),
    (select id from test_warehouse)
  )
  $$,
  'L0102',
  'Conflict: Only approved stock requests can be issued.',
  'fulfilled request cannot be issued a second time'
);

reset role;
select is(
  (
    select count(*)::bigint
    from public.stock_movements
    where movement_type = 'issue'
      and reference_id = (select id from test_request)
      and consumable_item_id = (select id from test_consumable)
  ),
  1::bigint,
  'replayed fulfilment does not duplicate consumable issue movements'
);

-- An available asset in Central Warehouse cannot be issued from Secondary Warehouse.
create temp table test_wrong_warehouse_request (id uuid);
with ins_req as (
  insert into public.stock_requests (
    requested_by, project_name, status, total_estimated_value, escalated_to_cfo
  ) values (
    '60000000-0000-0000-0000-000000000003',
    'Wrong Warehouse Project',
    'approved',
    150000,
    false
  ) returning id
)
insert into test_wrong_warehouse_request (id) select id from ins_req;

insert into public.stock_request_items (
  request_id, equipment_asset_id, quantity, estimated_unit_price
)
select id, (select id from test_equipment), 1, 150000
from test_wrong_warehouse_request;

grant select on test_wrong_warehouse_request to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$
  select public.rpc_issue_stock(
    (select id from test_wrong_warehouse_request),
    (select id from test_other_warehouse)
  )
  $$,
  '22000',
  'Equipment asset is not available in the issuing warehouse.',
  'equipment cannot be issued from the wrong warehouse'
);

reset role;
select is(
  (select status from public.equipment_assets where id = (select id from test_equipment)),
  'available',
  'wrong-warehouse issue leaves equipment available in its actual warehouse'
);

-- A warehouse/reference pair is an idempotency identity for receipts.
create temp table test_replay_consumable (id uuid);
with ins_con as (
  insert into public.consumable_items (category_id, name, sku, unit_of_measure)
  select id, 'Receipt Replay Item', 'RRI-001', 'piece' from test_category
  returning id
)
insert into test_replay_consumable (id) select id from ins_con;
grant select on test_replay_consumable to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$
  select public.rpc_receive_stock(
    (select id from test_warehouse),
    'GRN-REPLAY-001',
    jsonb_build_array(jsonb_build_object(
      'consumable_item_id', (select id from test_replay_consumable),
      'quantity', 7,
      'unit_price', 1000
    ))
  )
  $$,
  'first use of a receipt reference succeeds'
);

select throws_ok(
  $$
  select public.rpc_receive_stock(
    (select id from test_warehouse),
    ' grn-replay-001 ',
    jsonb_build_array(jsonb_build_object(
      'consumable_item_id', (select id from test_replay_consumable),
      'quantity', 7,
      'unit_price', 1000
    ))
  )
  $$,
  '23505',
  'Conflict: Receipt reference already exists for this warehouse.',
  'receipt replay cannot duplicate stock'
);

reset role;
select is(
  (
    select count(*)::bigint
    from public.stock_movements movement
    join public.stock_receipts receipt on receipt.id = movement.reference_id
    where receipt.warehouse_id = (select id from test_warehouse)
      and lower(btrim(receipt.reference_number)) = 'grn-replay-001'
      and movement.consumable_item_id = (select id from test_replay_consumable)
  ),
  1::bigint,
  'receipt replay leaves one ledger movement'
);

-- Receiving must not reclaim assets already outside the available/unlocated intake state.
create temp table test_lifecycle_assets (case_key text primary key, id uuid);
with ins_asset as (
  insert into public.equipment_assets (
    category_id, serial_number, model_name, status, current_warehouse_id, is_sensitive
  )
  select id, 'EQ-LIFE-ASSIGNED', 'Lifecycle Test Asset', 'assigned', null, false
  from test_category
  returning id
)
insert into test_lifecycle_assets (case_key, id)
select 'assigned', id from ins_asset;

with ins_asset as (
  insert into public.equipment_assets (
    category_id, serial_number, model_name, status, current_warehouse_id, is_sensitive
  )
  select id, 'EQ-LIFE-DAMAGED', 'Lifecycle Test Asset', 'damaged', null, false
  from test_category
  returning id
)
insert into test_lifecycle_assets (case_key, id)
select 'damaged', id from ins_asset;

with ins_asset as (
  insert into public.equipment_assets (
    category_id, serial_number, model_name, status, current_warehouse_id, is_sensitive
  )
  select id, 'EQ-LIFE-LOST', 'Lifecycle Test Asset', 'lost', null, false
  from test_category
  returning id
)
insert into test_lifecycle_assets (case_key, id)
select 'lost', id from ins_asset;
grant select on test_lifecycle_assets to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  format(
    'select public.rpc_receive_stock(%L, %L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 1, %L, 1000)))',
    (select id from test_warehouse),
    'GRN-LIFE-ASSIGNED',
    'equipment_asset_id',
    (select id from test_lifecycle_assets where case_key = 'assigned'),
    'quantity',
    'unit_price'
  ),
  'L0103',
  'Conflict: Equipment asset is not eligible for receipt in its current lifecycle state.',
  'receiving cannot silently reclaim an assigned asset'
);

select throws_ok(
  format(
    'select public.rpc_receive_stock(%L, %L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 1, %L, 1000)))',
    (select id from test_warehouse),
    'GRN-LIFE-DAMAGED',
    'equipment_asset_id',
    (select id from test_lifecycle_assets where case_key = 'damaged'),
    'quantity',
    'unit_price'
  ),
  'L0103',
  'Conflict: Equipment asset is not eligible for receipt in its current lifecycle state.',
  'receiving cannot silently reclaim a damaged asset'
);

select throws_ok(
  format(
    'select public.rpc_receive_stock(%L, %L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 1, %L, 1000)))',
    (select id from test_warehouse),
    'GRN-LIFE-LOST',
    'equipment_asset_id',
    (select id from test_lifecycle_assets where case_key = 'lost'),
    'quantity',
    'unit_price'
  ),
  'L0103',
  'Conflict: Equipment asset is not eligible for receipt in its current lifecycle state.',
  'receiving cannot silently reclaim a lost asset'
);

reset role;
select results_eq(
  $$
    select lifecycle.case_key, asset.status
    from test_lifecycle_assets lifecycle
    join public.equipment_assets asset on asset.id = lifecycle.id
    order by lifecycle.case_key
  $$,
  $$
    values
      ('assigned'::text, 'assigned'::text),
      ('damaged'::text, 'damaged'::text),
      ('lost'::text, 'lost'::text)
  $$,
  'failed lifecycle receipts preserve every asset status'
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
