# Tasks 15–22 Stabilization Design

**Date:** 13 July 2026  
**Canonical repository:** `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0`  
**Stabilization branch:** `codex/stabilize-tasks-15-22`  
**Isolated worktree:** `/Users/jeffadhaya/.config/superpowers/worktrees/Egypro-Onehub-2.0/stabilize-tasks-15-22`

## Objective

Preserve the working implementation delivered through Task 22, correct the security and workflow defects found during review, improve the HR/payroll user experience, and produce a verified branch that can safely become the continuation of the canonical OneHub repository.

## Repository and Database Isolation

- The original `feature/foundation` working tree remains untouched at commit `e5407cc`, including its uncommitted Task 15 checkpoint.
- The Antigravity continuation remains untouched at commit `51b9c54`.
- Stabilization occurs only on `codex/stabilize-tasks-15-22`, which is based on the continuation commit.
- The Antigravity Supabase project `sewbxazwpjbtevckorbl` is the stabilization database.
- The original Supabase project `kgntxnwvnayhjpsoauuj` receives no migrations until the stabilized branch passes all acceptance checks.
- Existing hosted migrations are never rewritten as the sole fix. Migration `0052_fix_revokes.sql` is already hosted; stabilization corrections begin with additive migration `0053` or later.

## Stabilization Workstreams

### 1. Cash Security and Reconciliation

- Remove direct authenticated writes that bypass the cash-advance RPC workflow.
- Restrict balance helpers to the record owner and authorized finance roles.
- Enforce valid request, approval, disbursement, expense, return, closure and reopening transitions.
- Prevent disbursements, accepted expenses and cash returns from creating negative or contradictory balances.
- Require reasons and references where the approved design requires accountability.
- Add database tests for hostile direct writes, cross-user reads and every invalid transition.

### 2. Inventory Integrity and Custody

- Lock request headers before approval and fulfilment transitions.
- Require exact source states so rejected or fulfilled requests cannot be reopened.
- Verify equipment belongs to the issuing warehouse.
- Make receiving idempotent and lifecycle-aware.
- Represent physical custody explicitly instead of treating the warehouse issuer as custodian.
- Make QR actions verify the scanned asset against the selected request and requested item.
- Add concurrency-oriented and lifecycle database tests.

### 3. Reporting Correctness

- Sum signed inventory-ledger quantities correctly.
- Correct project-assignment queries to use `role_on_project` and the `pm` role value.
- Correct the HR report permission key to `hr_admin`.
- Derive custody from the custody model, not `performed_by`.
- Include the correct project-update states and verify workforce active-status logic.
- Remove unverified assumptions such as treating any miscellaneous deduction as LST.
- Add calculation-focused tests for every report and export.

### 4. Historical Employee Reconciliation

- Preserve the working atomic and duplicate-protected historical payroll import.
- Resolve employee matches independently by employee number and unique email.
- Add an explicit reviewed profile-creation/enrichment stage using the latest payroll and Staff Details.
- Keep name-only suggestions unresolved until a human confirms them.
- Reconcile imported employee and payroll totals before commit.

### 5. Notification Hardening

- Remove committed webhook secrets, localhost defaults and fallback production credentials.
- Fail closed when deployment configuration is missing.
- Atomically claim email deliveries before calling the provider.
- Add provider idempotency keys and retry-safe delivery states.
- Add deployment and user notification preferences.
- Show notification-query failures rather than presenting them as an empty inbox.
- Keep payroll notification bodies free of salary and net-pay values.

### 6. HR and Payroll User Experience

The existing OneHub branding, shell, colour palette and overall visual character remain. The refinement focuses on clarity and operating speed.

- Add a persistent HR sub-navigation for Employees, Payroll and permitted migration tools.
- Use a shared back-navigation component on every HR/payroll detail, import, migration and transaction page.
- Keep browser history navigation as a fallback, with a deterministic module destination when no relevant history exists.
- Reduce ordinary workspace page titles from the current `2.6rem` maximum to approximately `2rem` desktop and `1.65rem` mobile.
- Reserve large display typography for the home dashboard only.
- Standardize form controls, buttons, status badges, cards and financial inputs so payroll does not fall back to native-looking browser controls.
- Tighten payroll summary cards and line-item spacing to show more useful information without crowding.
- Strengthen grouping between employee identity, calculation inputs, adjustments and totals.
- Make primary, secondary and destructive actions visually distinct and consistently placed.
- Provide designed loading, empty, error and permission-denied states.
- Validate desktop, tablet and mobile layouts using screenshot-backed Playwright tests.

## Error Handling

- Invalid workflow transitions fail before any data changes.
- Multi-record financial and stock operations remain atomic.
- User-facing errors explain what was rejected without exposing internal details.
- UI mutations surface failures through inline messages or toasts; they do not silently log errors.
- Imports and notifications remain idempotent under retries.

## Testing and Promotion

Each workstream follows test-driven development and receives an independent commit. Acceptance requires:

- Complete `npm run verify` success.
- Complete Playwright success, including new HR/payroll navigation and responsive visual checks.
- Every relevant pgTAP suite passing against the Antigravity Supabase project.
- Linked database lint with no unresolved warnings introduced by Tasks 15–22.
- Security review of all new `SECURITY DEFINER` functions, grants and RLS policies.
- Performance comparison of route chunks and large HR/payroll screens.
- Clean Git diff and no secrets in tracked files.

Only after those checks pass will the migration history be rehearsed against the original Supabase project and the stabilized branch be proposed for integration into the canonical repository.
