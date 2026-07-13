# Tasks 15–22 Stabilization Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Convert the Antigravity Task 22 continuation into a secure, correct, visually refined and fully verified continuation of the canonical Egypro OneHub 2.0 repository.

**Architecture:** Work only on the isolated `codex/stabilize-tasks-15-22` branch. Repair hosted database behavior through additive migrations, keep financial and stock transitions inside atomic permission-checked RPCs, and add focused domain/UI tests before modifying implementations. Use the Antigravity Supabase project for all stabilization tests; do not touch the original Supabase project until final promotion rehearsal.

**Tech Stack:** React 19, TypeScript, Vite, React Router, TanStack Query, Supabase/PostgreSQL, pgTAP, Vitest, Testing Library and Playwright.

---

## Execution Rules

- Work only in `/Users/jeffadhaya/.config/superpowers/worktrees/Egypro-Onehub-2.0/stabilize-tasks-15-22`.
- Do not modify `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0` or `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0 AI Continuation`.
- Use Supabase project `sewbxazwpjbtevckorbl` during stabilization.
- Do not push any migration to original project `kgntxnwvnayhjpsoauuj` during Tasks 1–10.
- Do not edit an already-hosted migration as the only correction. `0052_fix_revokes.sql` is already hosted; add stabilization migrations `0053` onward.
- Begin each behavior change with a failing test.
- Commit each task independently after its focused tests and `git diff --check` pass.
- Never commit `.env`, database passwords, webhook secrets or provider credentials.

## Task 1: Establish the Stabilization Database Baseline

**Files:**
- Inspect: `supabase/migrations/*.sql`
- Inspect: `supabase/.temp/project-ref`
- Create: `docs/verification/STABILIZATION_BASELINE.md`

**Steps:**

1. Link only the isolated worktree to `sewbxazwpjbtevckorbl`.
2. Run `npx supabase migration list --linked` and record local/remote parity.
3. Run `npx supabase db lint --linked --level warning` and record the existing `v_ref` warning.
4. Run every existing hosted pgTAP suite inside a transaction using the Antigravity database password supplied interactively.
5. Record pass/fail counts without storing credentials or connection URLs.
6. Run `npm run verify` and `npm run test:e2e`.
7. Commit: `docs: record stabilization baseline`.

## Task 2: Close Cash Authorization Bypasses

**Files:**
- Create: `supabase/migrations/0053_harden_cash_authorization.sql`
- Modify: `supabase/tests/cash_advances.sql`
- Test: `supabase/tests/cash_advances.sql`

**Steps:**

1. Add failing pgTAP assertions proving a coordinator cannot directly insert an approved/disbursed request or accepted expense.
2. Add failing assertions proving one employee cannot query another employee's outstanding balance through `get_cash_advance_balance` or `has_outstanding_advances`.
3. Run the cash test and confirm the new assertions fail against the current hosted schema.
4. Revoke direct authenticated `INSERT`/`UPDATE` where workflow RPCs are required.
5. Replace broad helper execution with owner-or-finance authorization and explicit grants.
6. Set hardened `SECURITY DEFINER` search paths and schema-qualify referenced objects.
7. Apply migration `0053` to the Antigravity project.
8. Rerun the cash suite and linked database lint.
9. Commit: `security: close cash workflow authorization bypasses`.

## Task 3: Enforce Cash Accounting Invariants

**Files:**
- Create: `supabase/migrations/0054_enforce_cash_accounting.sql`
- Modify: `supabase/tests/cash_advances.sql`
- Modify if required: `src/modules/cash/api/cashAdvances.ts`
- Test: `supabase/tests/cash_advances.sql`

**Steps:**

1. Add failing tests for over-disbursement, expense totals exceeding disbursement, returned cash exceeding outstanding cash, self-contradictory closure and invalid state transitions.
2. Add tests for required rejection, override, payment-reference and reopening reasons.
3. Run the suite and confirm failures.
4. Lock the relevant advance row during each balance-changing operation.
5. Reject any operation that would create a negative or inconsistent outstanding balance.
6. Add controlled reopen/reversal behavior if absent, preserving audit history.
7. Update the TypeScript API only if RPC signatures change.
8. Apply `0054`, rerun pgTAP, unit tests and `git diff --check`.
9. Commit: `fix: enforce cash advance reconciliation invariants`.

## Task 4: Repair Inventory State Transitions and Receiving

**Files:**
- Create: `supabase/migrations/0055_harden_inventory_workflows.sql`
- Modify: `supabase/tests/inventory_workflow.sql`
- Modify: `supabase/tests/warehouse_approval_routing.sql`
- Test: both database suites

**Steps:**

1. Add failing tests proving only `pending_approval` requests can be approved and only `approved` requests can be issued.
2. Add a two-session or lock-behavior regression test for duplicate fulfilment.
3. Add failing tests for issuing an asset from the wrong warehouse.
4. Add failing tests proving receipt replay cannot duplicate stock and receiving cannot silently reclaim assigned/damaged/lost equipment.
5. Run the tests and confirm failures.
6. Lock request headers before status checks and updates.
7. Enforce exact lifecycle source states and warehouse ownership.
8. Add a unique/idempotent receipt identity and lifecycle-aware equipment receipt behavior.
9. Remove the unused `v_ref` variable or use it meaningfully.
10. Apply `0055`, rerun inventory/approval pgTAP and linked lint.
11. Commit: `fix: make inventory transitions atomic and idempotent`.

## Task 5: Add Explicit Custody and Safe QR Fulfilment

**Files:**
- Create: `supabase/migrations/0056_add_asset_custody.sql`
- Modify: `supabase/tests/inventory_workflow.sql`
- Modify: `src/modules/warehouse/api/inventory.ts`
- Modify: `src/modules/warehouse/components/ScannerModal.tsx`
- Create: `src/modules/warehouse/components/ScannerModal.test.tsx`
- Modify: `src/modules/warehouse/pages/RequestDetailPage.tsx`

**Steps:**

1. Add failing database tests for custodian assignment, custody transfer, return and custody history.
2. Add a failing component test proving a scanned asset must belong to the selected request item.
3. Add `asset_custody` records linked to asset, request, recipient/project, issuer, issue condition and return information.
4. Change fulfilment RPCs to create custody atomically.
5. Make the scanner identify/validate a specific requested asset rather than issuing an unrelated entire request.
6. Surface clear validation errors and retain manual fallback.
7. Apply `0056`; run inventory pgTAP and the focused component test.
8. Commit: `feat: add auditable asset custody and safe QR issue`.

## Task 6: Correct Reports and Exports

**Files:**
- Create: `src/modules/reports/api/reports.test.ts`
- Modify: `src/modules/reports/api/reports.ts`
- Modify: `src/modules/reports/ReportsPage.tsx`
- Create: `supabase/migrations/0057_fix_report_permissions.sql`
- Modify: `supabase/tests/reports_audit.sql`

**Steps:**

1. Add failing unit tests proving signed stock issues/removals reduce inventory balances.
2. Add failing tests for `role_on_project='pm'`, endorsed daily updates, active workforce counts and custody reporting.
3. Add a failing test proving miscellaneous deductions are not automatically labeled LST.
4. Add failing pgTAP coverage showing `hr_admin` receives report permissions.
5. Run the focused tests and confirm failures.
6. Correct the inventory arithmetic and project-assignment query.
7. Source custodian data from the custody model.
8. Remove the hardcoded LST assumption and export only verified payroll fields.
9. Replace browser `alert()` calls with designed inline/toast feedback.
10. Apply `0057`; run report unit tests and pgTAP.
11. Commit: `fix: correct operational reports and HR access`.

## Task 7: Complete Historical Employee Reconciliation

**Files:**
- Modify: `src/modules/migrations/payroll/reconcileEmployees.test.ts`
- Modify: `src/modules/migrations/payroll/reconcileEmployees.ts`
- Modify: `src/modules/migrations/payroll/historicalPayrollImportApi.ts`
- Modify: `src/modules/migrations/pages/HistoricalPayrollMigrationPage.tsx`
- Modify if required: `supabase/migrations/0032_historical_payroll_import.sql` for clean local history only
- Create if hosted behavior changes: `supabase/migrations/0058_fix_historical_employee_reconciliation.sql`
- Modify: `supabase/tests/historical_payroll_import.sql`

**Steps:**

1. Add failing tests for email-only matches with no employee number.
2. Add failing tests for duplicate email/number conflicts and name-only unresolved suggestions.
3. Add tests for reviewed current-profile creation/enrichment from the latest payroll plus Staff Details.
4. Implement independent ID/email lookup maps and explicit conflict states.
5. Add a preview step for create, enrich, unchanged and unresolved employees.
6. Require manual confirmation before profile changes and historical commit.
7. Preserve atomic payroll import and duplicate-file protection.
8. If database behavior changes, apply additive migration `0058` to the Antigravity project.
9. Run parser/reconciler unit tests and historical-import pgTAP.
10. Commit: `fix: complete reviewed historical employee reconciliation`.

## Task 8: Harden Notification Delivery and Preferences

**Files:**
- Create: `supabase/migrations/0059_harden_notification_delivery.sql`
- Modify: `supabase/tests/notifications_policy.sql`
- Modify: `supabase/functions/send-notification/notification_logic.ts`
- Modify: `supabase/functions/send-notification/index.ts`
- Modify: `supabase/functions/send-notification/edge_function.test.ts`
- Modify: `src/modules/notifications/NotificationCenter.test.tsx`
- Modify: `src/modules/notifications/NotificationCenter.tsx`
- Modify: `src/modules/notifications/api/notifications.ts`

**Steps:**

1. Add failing tests proving missing webhook/provider configuration fails closed.
2. Add a concurrency/idempotency test proving only one worker can claim a delivery.
3. Add database tests for user and deployment notification preferences.
4. Correct misleading UI tests that currently describe foreign-notification rendering as privacy protection.
5. Add a failing UI test for a visible notification-query error state.
6. Remove committed secrets, localhost production defaults and fallback senders.
7. Add an atomic pending-to-processing claim RPC and provider idempotency key.
8. Respect enabled channels and user preferences before creating deliveries.
9. Keep in-app delivery available when email is disabled.
10. Apply `0059`; deploy the Edge Function only after secrets are configured outside Git.
11. Run notification pgTAP, Edge Function tests and component tests.
12. Commit: `security: harden notification delivery and preferences`.

## Task 9: Standardize HR and Payroll Navigation

**Files:**
- Create: `src/components/ui/BackLink.tsx`
- Create: `src/components/ui/BackLink.test.tsx`
- Create: `src/modules/hr/components/HrNavigation.tsx`
- Create: `src/modules/hr/components/HrNavigation.test.tsx`
- Modify: `src/modules/hr/HrPage.tsx`
- Modify: `src/modules/hr/pages/EmployeeDossierPage.tsx`
- Modify: `src/modules/hr/pages/EmployeeImportPage.tsx`
- Modify: `src/modules/migrations/pages/HistoricalPayrollMigrationPage.tsx`
- Modify: `src/modules/payroll/pages/PayrollRunPage.tsx`
- Modify: `src/modules/payroll/pages/PayrollRunsPage.tsx`

**Steps:**

1. Add failing tests for a consistent back link on every HR/payroll detail or tool route.
2. Add failing tests for permission-aware HR sub-navigation.
3. Implement a shared icon, label, destination and focus-visible treatment.
4. Add persistent Employees/Payroll/migration navigation according to permissions.
5. Ensure the run page returns to `/hr/payroll` and employee tools return to `/hr/employees`.
6. Preserve browser history only as an enhancement, never as the sole destination.
7. Run focused HR/payroll tests.
8. Commit: `feat: standardize HR and payroll navigation`.

## Task 10: Refine HR and Payroll Visual Hierarchy

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/styles/tokens.css`
- Modify: `src/modules/payroll/components/PayrollLineEditor.tsx`
- Modify: `src/modules/payroll/pages/PayrollRunPage.tsx`
- Modify: `src/modules/payroll/pages/PayrollRunsPage.tsx`
- Modify: `src/modules/hr/pages/EmployeeDirectoryPage.tsx`
- Modify: `src/app/router.tsx`
- Create: `src/app/HrPreview.tsx`
- Modify: `e2e/payroll.spec.ts`
- Create: `e2e/hr-ui.spec.ts`

**Steps:**

1. Add development/e2e preview routes containing representative HR directory, payroll list and payroll detail states without production mock fallbacks.
2. Add failing Playwright assertions for shared navigation, compact page-title scale, non-overflowing forms and readable mobile cards.
3. Reduce normal page-title sizing to approximately `2rem` desktop and `1.65rem` mobile while retaining the dashboard display scale.
4. Normalize inputs, selects, buttons and adjustment rows through existing OneHub primitives.
5. Tighten summary-card and employee-card spacing without reducing touch targets below 44px.
6. Clarify employee identity, inputs, adjustments and calculated totals as distinct visual groups.
7. Validate 1440px desktop, 1024px tablet and 390px mobile layouts.
8. Capture review screenshots and inspect them for truncation, hierarchy, focus and action placement.
9. Run focused unit tests and Playwright.
10. Commit: `style: refine HR and payroll usability`.

## Task 11: Performance and Full Stabilization Verification

**Files:**
- Modify if needed: `vite.config.ts`
- Modify if needed: payroll/export imports that create oversized entry chunks
- Create: `docs/verification/STABILIZATION_RESULTS.md`

**Steps:**

1. Run `npm run build` and record route/chunk sizes.
2. Confirm spreadsheet parsing remains isolated to import routes/workers.
3. Lazy-load payslip/PDF generation at the export action boundary.
4. Add explicit manual chunking only where it improves initial-route loading without creating fragile coupling.
5. Run `npm run verify`.
6. Run the complete Playwright suite.
7. Run all hosted pgTAP suites against `sewbxazwpjbtevckorbl`.
8. Run `npx supabase db lint --linked --level warning`.
9. Run `npm audit`, `git diff --check` and a tracked-secret scan.
10. Request a fresh code/security review and resolve all critical/high findings.
11. Record exact results and remaining nonblocking items.
12. Commit: `test: verify tasks 15-22 stabilization`.

## Task 12: Prepare Canonical Promotion Without Applying It

**Files:**
- Create: `docs/cutover/TASKS_15_22_PROMOTION.md`

**Steps:**

1. Compare the stabilized branch with original commit `e5407cc` and the original uncommitted Task 15 checkpoint.
2. Verify the stabilized Task 15 contains every intended parser/reconciler behavior from the original checkpoint.
3. List migrations that would be applied to original Supabase project `kgntxnwvnayhjpsoauuj`.
4. Create a database backup and rollback checklist, but do not execute against the original project yet.
5. Document the exact Git integration approach and conflict handling.
6. Present verification evidence and request explicit approval before touching the original Supabase project or canonical branch.
7. Commit: `docs: prepare stabilized branch promotion`.

## Final Stabilization Commands

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run test:e2e
npx supabase db lint --linked --level warning
npm audit
git diff --check
git status --short
```

Expected result: all commands succeed, all hosted pgTAP suites pass against the Antigravity project, no tracked secrets exist, critical workflows reject invalid transitions, reports reconcile to ledger data, and HR/payroll screens pass desktop/tablet/mobile review.
