begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select has_column('public', 'stock_requests', 'project_id', 'stock requests carry canonical project identity');
select has_column('public', 'stock_request_items', 'expected_return_date', 'equipment request lines carry expected return');
select has_column('public', 'asset_custody', 'project_id', 'custody carries canonical project identity');
select has_column('public', 'asset_custody', 'expected_return_date', 'custody preserves expected return');
select fk_ok('public', 'stock_requests', 'project_id', 'public', 'projects', 'id', 'stock request project is a foreign key');
select fk_ok('public', 'asset_custody', 'project_id', 'public', 'projects', 'id', 'custody project is a foreign key');
select has_function('public', 'rpc_request_stock', array['uuid', 'jsonb'], 'canonical project request overload exists');
select has_function('public', 'rpc_request_stock', array['text', 'jsonb'], 'guarded legacy request overload remains during transition');
select has_function('public', 'rpc_list_unresolved_inventory_project_links', array[]::text[], 'unresolved links are explicitly reconcilable');
select has_function('public', 'rpc_transfer_asset_custody', array['uuid', 'uuid', 'uuid', 'date', 'text'], 'canonical custody transfer overload exists');
select has_function('public', 'rpc_get_project_inventory_summary', array['uuid'], 'canonical project inventory summary exists');

insert into auth.users (id, email) values
  ('89000000-0000-4000-8000-000000000001', 'links-pm@example.invalid'),
  ('89000000-0000-4000-8000-000000000002', 'links-other-pm@example.invalid');
insert into public.profiles (id, display_name) values
  ('89000000-0000-4000-8000-000000000001', 'Links PM'),
  ('89000000-0000-4000-8000-000000000002', 'Other PM');
insert into public.user_roles (profile_id, role_id)
select profile_id, role.id
from (values
  ('89000000-0000-4000-8000-000000000001'::uuid),
  ('89000000-0000-4000-8000-000000000002'::uuid)
) fixture(profile_id)
cross join public.roles role
where role.key = 'project_manager';

insert into public.projects (
  id, project_code, name, site_location, status, health_status,
  created_by, updated_by
) values (
  '89000000-0000-4000-8000-000000000010', 'LINK-001', 'Canonical Link Project',
  'Kampala', 'active', 'on_track',
  '89000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001'
);
insert into public.project_assignments (
  project_id, user_id, role_on_project, assigned_by, assignment_reason
) values (
  '89000000-0000-4000-8000-000000000010',
  '89000000-0000-4000-8000-000000000001', 'pm',
  '89000000-0000-4000-8000-000000000001', 'Test project ownership'
);

insert into public.item_categories (id, name) values
  ('89000000-0000-4000-8000-000000000020', 'Link Test Equipment');
insert into public.equipment_assets (
  id, category_id, serial_number, model_name, status
) values (
  '89000000-0000-4000-8000-000000000021',
  '89000000-0000-4000-8000-000000000020', 'LINK-SERIAL-01', 'Link Drill', 'available'
);
insert into public.warehouses (id, code, name, location, status) values (
  '89000000-0000-4000-8000-000000000022', 'LINK-HQ', 'Link Test Warehouse', 'Kampala', 'active'
);
insert into public.stock_receipts (
  id, warehouse_id, received_by, reference_number, supplier_name, invoice_number,
  received_date, purchase_value
) values (
  '89000000-0000-4000-8000-000000000023',
  '89000000-0000-4000-8000-000000000022',
  '89000000-0000-4000-8000-000000000001',
  'LINK-GRN-001', 'Link Tools Supplier', 'LINK-INV-001', current_date, 1000
);
insert into public.stock_receipt_items (
  receipt_id, equipment_asset_id, quantity, unit_price
) values (
  '89000000-0000-4000-8000-000000000023',
  '89000000-0000-4000-8000-000000000021', 1, 1000
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"89000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.rpc_request_stock(
    '89000000-0000-4000-8000-000000000010'::uuid,
    '[{"equipment_asset_id":"89000000-0000-4000-8000-000000000021","quantity":1,"expected_return_date":"2099-12-31"}]'::jsonb
  ) $$,
  '42501', 'Active project assignment is required to request stock.',
  'unassigned project manager cannot request against the project'
);

select set_config('request.jwt.claims', '{"sub":"89000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.rpc_request_stock(
    '89000000-0000-4000-8000-000000000010'::uuid,
    '[{"equipment_asset_id":"89000000-0000-4000-8000-000000000021","quantity":1,"expected_return_date":"2099-12-31"}]'::jsonb
  ) $$,
  'assigned project manager can request equipment against canonical project'
);

reset role;
select is(
  (select project_id from public.stock_requests where requested_by = '89000000-0000-4000-8000-000000000001' order by created_at desc limit 1),
  '89000000-0000-4000-8000-000000000010'::uuid,
  'request stores the canonical project id'
);
select is(
  (select project_name from public.stock_requests where requested_by = '89000000-0000-4000-8000-000000000001' order by created_at desc limit 1),
  'Canonical Link Project',
  'request stores the project name only as a snapshot'
);
select is(
  (select item.expected_return_date
   from public.stock_request_items item
   join public.stock_requests request on request.id = item.request_id
   where request.requested_by = '89000000-0000-4000-8000-000000000001'
   order by request.created_at desc limit 1),
  '2099-12-31'::date,
  'equipment request preserves expected return date'
);
select is(
  (select summary.pending_request_count
   from public.rpc_get_project_inventory_summary('89000000-0000-4000-8000-000000000010') summary),
  1::bigint,
  'inventory summary reconciles the pending request count'
);
select is(
  (select summary.requested_estimated_value
   from public.rpc_get_project_inventory_summary('89000000-0000-4000-8000-000000000010') summary),
  1000::numeric,
  'inventory summary reconciles requested estimated value'
);

select * from finish();
rollback;
