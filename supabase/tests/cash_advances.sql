begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

-- 1. Setup checks
select has_table('public', 'cash_advance_requests', 'cash_advance_requests table exists');
select has_table('public', 'cash_advance_expenses', 'cash_advance_expenses table exists');
select has_table('public', 'cash_advance_returns', 'cash_advance_returns table exists');
select has_function('public', 'get_cash_advance_balance', array['uuid'], 'get_cash_advance_balance function exists');
select has_function('public', 'has_outstanding_advances', array['uuid'], 'has_outstanding_advances function exists');

-- 2. Setup profiles, projects and assignments
-- We insert test users
insert into auth.users (id, email)
values
  ('80000000-0000-0000-0000-000000000001', 'pm_cash@example.invalid'),
  ('80000000-0000-0000-0000-000000000002', 'coord_cash@example.invalid'),
  ('80000000-0000-0000-0000-000000000003', 'md_cash@example.invalid'),
  ('80000000-0000-0000-0000-000000000004', 'cfo_cash@example.invalid')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('80000000-0000-0000-0000-000000000001', 'PM Cash User'),
  ('80000000-0000-0000-0000-000000000002', 'Coord Cash User'),
  ('80000000-0000-0000-0000-000000000003', 'MD Cash User'),
  ('80000000-0000-0000-0000-000000000004', 'CFO Cash User')
on conflict (id) do nothing;

insert into public.user_roles (profile_id, role_id)
select assigned.profile_id, role.id
from (values
  ('80000000-0000-0000-0000-000000000001'::uuid, 'project_manager'::text),
  ('80000000-0000-0000-0000-000000000002'::uuid, 'coordinator'::text),
  ('80000000-0000-0000-0000-000000000003'::uuid, 'managing_director'::text),
  ('80000000-0000-0000-0000-000000000004'::uuid, 'cfo'::text)
) assigned(profile_id, role_key)
join public.roles role on role.key = assigned.role_key
on conflict do nothing;

-- Create a test project and assign coordinator to it
insert into public.projects (id, name, site_location, status, created_by)
values ('90000000-0000-0000-0000-000000000099', 'Project Cash Test', 'Jinja Site', 'active', '80000000-0000-0000-0000-000000000004')
on conflict (id) do nothing;

insert into public.project_assignments (id, project_id, user_id, role_on_project)
values ('90000000-0000-0000-0000-000000000088', '90000000-0000-0000-0000-000000000099', '80000000-0000-0000-0000-000000000002', 'coordinator')
on conflict (id) do nothing;

-- 3. Run RLS & RPC Tests
-- Coordinator requesting cash advance
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$
    select public.rpc_request_cash_advance(
      '90000000-0000-0000-0000-000000000099',
      '80000000-0000-0000-0000-000000000002',
      1500000.00,
      'Site supplies transport'
    );
  $$,
  'Coordinator can request cash advance for themselves'
);

-- Coordinator trying to request cash advance on behalf of PM (fails)
select throws_ok(
  $$
    select public.rpc_request_cash_advance(
      '90000000-0000-0000-0000-000000000099',
      '80000000-0000-0000-0000-000000000001',
      500000.00,
      'PM transport override'
    );
  $$,
  '42501',
  'Unauthorized: Only CFO can request advances on behalf of other users',
  'Coordinator cannot request cash advance on behalf of others'
);

-- CFO creating cash advance on behalf of coordinator
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$
    select public.rpc_request_cash_advance(
      '90000000-0000-0000-0000-000000000099',
      '80000000-0000-0000-0000-000000000002',
      300000.00,
      'CFO direct advance'
    );
  $$,
  'CFO can request cash advance on behalf of coordinator'
);

-- Test CFO approval of Coordinator request.
select lives_ok(
  format(
    'select public.rpc_approve_cash_advance(%L, null)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1)
  ),
  'CFO can approve the pending cash advance request'
);

-- Test CFO disbursement.
select lives_ok(
  format(
    'select public.rpc_disburse_cash_advance(%L, 1500000.00, %L)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1),
    'MM-TXN-1002'
  ),
  'CFO can disburse the approved cash advance request'
);

-- The coordinator now has an outstanding advance. A second approval requires an override reason.
select throws_ok(
  format(
    'select public.rpc_approve_cash_advance(%L, null)',
    (select id from public.cash_advance_requests where purpose = 'CFO direct advance' limit 1)
  ),
  'W0001',
  'Warning: Outstanding advances detected. CFO override reason is required.',
  'CFO approval fails without override reason when outstanding advances exist'
);

select lives_ok(
  format(
    'select public.rpc_approve_cash_advance(%L, %L)',
    (select id from public.cash_advance_requests where purpose = 'CFO direct advance' limit 1),
    'Urgent extra site request override'
  ),
  'CFO can approve with override reason when outstanding advances exist'
);

-- Coordinator submits an expense.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  format(
    'select public.rpc_submit_cash_expense(%L, %L, %L, %L, %L, %L, null, true, null)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1),
    '2026-07-12',
    'transport',
    120000.00,
    'Local Boda Rider',
    'Transport of concrete bags'
  ),
  'V0001',
  'Validation: Explanation is mandatory for receipt-unavailable expenses',
  'Receipt-unavailable expense requires an explanation'
);

select lives_ok(
  format(
    'select public.rpc_submit_cash_expense(%L, %L, %L, %L, %L, %L, null, true, %L)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1),
    '2026-07-12',
    'transport',
    120000.00,
    'Local Boda Rider',
    'Transport of concrete bags',
    'Boda boda rider did not have printer/receipt book'
  ),
  'Coordinator can submit receipt-unavailable expense with mandatory explanation'
);

-- CFO reviews the expense and records returned cash.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select lives_ok(
  format(
    'select public.rpc_review_cash_expense(%L, true, null)',
    (
      select expense.id
      from public.cash_advance_expenses expense
      join public.cash_advance_requests request on request.id = expense.cash_advance_id
      where request.purpose = 'Site supplies transport'
        and expense.explanation = 'Transport of concrete bags'
      limit 1
    )
  ),
  'CFO can accept/approve expense item'
);

select lives_ok(
  format(
    'select public.rpc_return_cash(%L, %L, 500000.00, %L, %L)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1),
    '2026-07-12',
    'MM-RET-5591',
    'Unused cash returned'
  ),
  'CFO can record cash return from coordinator'
);

-- 1,500,000 disbursed - 120,000 expense - 500,000 returned = 880,000 outstanding.
select results_eq(
  format(
    'select public.get_cash_advance_balance(%L)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1)
  ),
  $$ select 880000.00::numeric $$,
  'Outstanding balance matches reconciliation invariant'
);

select throws_ok(
  format(
    'select public.rpc_close_cash_advance(%L)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1)
  ),
  'B0001',
  'Conflict: Cannot close advance: outstanding balance of 880000.00 UGX is not zero.',
  'Cannot close advance with non-zero outstanding balance'
);

select lives_ok(
  format(
    'select public.rpc_return_cash(%L, %L, 880000.00, %L, %L)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1),
    '2026-07-12',
    'MM-RET-5592',
    'Final balance return'
  ),
  'CFO can record second cash return to reach zero outstanding balance'
);

select results_eq(
  format(
    'select public.get_cash_advance_balance(%L)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1)
  ),
  $$ select 0.00::numeric $$,
  'Outstanding balance is now zero'
);

select lives_ok(
  format(
    'select public.rpc_close_cash_advance(%L)',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1)
  ),
  'CFO can close advance successfully when outstanding balance is zero'
);

select results_eq(
  format(
    'select status from public.cash_advance_requests where id = %L',
    (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1)
  ),
  $$ select 'completed'::text $$,
  'Request status is now completed'
);

-- Security regressions: workflow state must not be forgeable through table writes.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$
    insert into public.cash_advance_requests (
      project_id,
      user_id,
      amount_requested,
      purpose,
      status,
      entered_by,
      approved_by,
      approved_at,
      disbursed_by,
      disbursed_at,
      amount_disbursed,
      disbursement_reference
    ) values (
      '90000000-0000-0000-0000-000000000099',
      '80000000-0000-0000-0000-000000000002',
      750000.00,
      'Forged direct disbursement',
      'disbursed',
      '80000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000004',
      now(),
      '80000000-0000-0000-0000-000000000004',
      now(),
      750000.00,
      'FORGED-DIRECT-REQUEST'
    )
  $$,
  '42501',
  'permission denied for table cash_advance_requests',
  'Coordinator cannot forge an approved or disbursed request through a direct insert'
);

select throws_ok(
  $$
    insert into public.cash_advance_expenses (
      cash_advance_id,
      expense_date,
      category,
      amount,
      vendor,
      explanation,
      status,
      reviewed_by,
      reviewed_at
    ) values (
      (select id from public.cash_advance_requests where purpose = 'Site supplies transport' limit 1),
      current_date,
      'transport',
      25000.00,
      'Forged Vendor',
      'Forged accepted expense',
      'accepted',
      '80000000-0000-0000-0000-000000000004',
      now()
    )
  $$,
  '42501',
  'permission denied for table cash_advance_expenses',
  'Coordinator cannot forge an accepted expense through a direct insert'
);

-- Even the CFO must use the audited return RPC rather than writing ledger rows directly.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select throws_ok(
  $$
    insert into public.cash_advance_returns (
      cash_advance_id,
      return_date,
      amount,
      returned_by,
      received_by,
      receipt_reference,
      notes
    ) values (
      (select id from public.cash_advance_requests where purpose = 'CFO direct advance' limit 1),
      current_date,
      1000.00,
      '80000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000004',
      'FORGED-DIRECT-RETURN',
      'Direct write must be rejected'
    )
  $$,
  '42501',
  'permission denied for table cash_advance_returns',
  'CFO cannot bypass the audited return RPC with a direct insert'
);

-- Security-definer balance helpers must not disclose another employee's finances.
reset role;
create temporary table cash_security_targets (
  advance_id uuid not null
) on commit drop;
insert into cash_security_targets (advance_id)
select id
from public.cash_advance_requests
where purpose = 'CFO direct advance'
limit 1;
grant select on cash_security_targets to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  format(
    'select public.get_cash_advance_balance(%L)',
    (select advance_id from cash_security_targets limit 1)
  ),
  '42501',
  'Unauthorized: You cannot view this cash advance balance',
  'Project manager cannot read another employee cash advance balance'
);

select throws_ok(
  $$ select public.has_outstanding_advances('80000000-0000-0000-0000-000000000002') $$,
  '42501',
  'Unauthorized: You cannot view another user cash advance status',
  'Project manager cannot read another employee outstanding-advance status'
);

rollback;
