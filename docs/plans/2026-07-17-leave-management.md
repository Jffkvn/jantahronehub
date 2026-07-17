# Leave Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver secure whole-day leave management for employees and HR, including private evidence, actionable notifications, balances, public holidays, HR-on-behalf entry, and unpaid-leave payroll deductions.

**Architecture:** Adapt the proven legacy HR and employee workflows into OneHub screens, but place all authoritative calculations and mutations behind audited PostgreSQL functions and row-level access. Reuse OneHub's employee identity, permissions, notifications, private storage, payroll line items, and visual system.

**Tech Stack:** React 19, TypeScript, TanStack Query, React Hook Form, Zod, Supabase PostgreSQL/RLS/Storage, Vitest, Playwright.

**Working constraint:** Implement in the current consolidated workspace. Preserve all existing uncommitted work. Do not commit, push, or deploy unless the user later requests it.

---

## Task 1: Lock the database contract with failing acceptance tests

**Files:**

- Create: `supabase/tests/leave_management.sql`
- Modify: `supabase/tests/storage_rls.sql`

1. Add tests for seeded leave types and whole-day-only constraints.
2. Add tests proving employees can read and submit only their own requests.
3. Add tests proving HR can log leave on behalf, approve, reject, cancel, and adjust balances.
4. Add working-day tests for weekends and public holidays.
5. Add tests for derived balances and cross-year rejection.
6. Add tests that CFO/MD cannot read sensitive request reasons or documents through operational APIs.
7. Add private evidence storage isolation tests.
8. Run the new database suite and confirm it fails because the feature does not exist yet.

## Task 2: Build the secure leave foundation

**Files:**

- Create: `supabase/migrations/0085_leave_management.sql`
- Test: `supabase/tests/leave_management.sql`

1. Add explicit leave management and reporting permissions and assign them to the appropriate roles.
2. Create leave types, holidays, entitlements, balance adjustments, requests, request events, and document metadata tables.
3. Add indexes, immutable audit fields, status constraints, and whole-day date constraints.
4. Add RLS that denies direct authenticated mutation and scopes reads to employee self-service or HR operations.
5. Add a server working-day function that excludes weekends and active public holidays.
6. Add derived-balance functions rather than mutable used-day counters.
7. Seed the configurable legacy leave type defaults.
8. Run the focused database tests until the structural and access tests pass.

## Task 3: Implement atomic workflow and notifications

**Files:**

- Modify: `supabase/migrations/0085_leave_management.sql`
- Modify: `supabase/tests/leave_management.sql`
- Modify if required: `src/modules/notifications/api/notifications.ts`

1. Add employee submit and pending-withdraw functions.
2. Add HR log-on-behalf, approve, reject, cancel, type setup, holiday setup, entitlement setup, and balance-adjustment functions.
3. Require reasons for rejection, cancellation, and manual adjustments.
4. Record append-only events for every state transition.
5. Create HR notifications on submission and employee notifications on decisions/on-behalf creation with action paths.
6. Add idempotency protections for repeated actions.
7. Run the database tests and the notification unit tests.

## Task 4: Add private supporting-document uploads

**Files:**

- Create: `supabase/migrations/0086_leave_documents_and_payroll.sql`
- Modify: `src/lib/security/filePolicy.ts`
- Modify: `src/lib/security/filePolicy.test.ts`
- Modify: `src/lib/security/privateFiles.ts`
- Modify: `src/lib/security/privateFiles.test.ts`
- Modify: `supabase/tests/storage_rls.sql`

1. Define accepted evidence types and conservative file-size limits.
2. Add a request-scoped private path: `leave/<employee>/<request>/<uuid>-<safe-name>`.
3. Add storage policies that restrict upload/read/delete to the employee owner and permitted HR users.
4. Add document attach/remove server functions and metadata validation.
5. Add signed-link helpers in the existing private-file layer.
6. Run focused file-policy, private-file, storage, and leave tests.

## Task 5: Add typed leave APIs and schemas

**Files:**

- Create: `src/modules/hr/schemas/leave.ts`
- Create: `src/modules/hr/schemas/leave.test.ts`
- Create: `src/modules/hr/api/leave.ts`
- Create: `src/modules/hr/api/leave.test.ts`

1. Define schemas for types, balances, requests, decisions, holidays, adjustments, and summaries.
2. Explicitly reject half-day/fractional durations and cross-year ranges.
3. Wrap every leave RPC in typed query and mutation functions.
4. Add private evidence upload and signed-download functions.
5. Normalize server errors into clear form messages.
6. Run the new schema and API tests.

## Task 6: Build reusable leave components from the legacy patterns

**Files:**

- Create: `src/modules/hr/components/LeaveRequestForm.tsx`
- Create: `src/modules/hr/components/LeaveRequestForm.test.tsx`
- Create: `src/modules/hr/components/LeaveCalendar.tsx`
- Create: `src/modules/hr/components/LeaveBalanceCards.tsx`
- Create: `src/modules/hr/components/LeaveStatusBadge.tsx`

1. Adapt the legacy request flow to OneHub form controls and design tokens.
2. Remove all partial-day inputs.
3. Show server-calculated working days before confirmation.
4. Support actual evidence selection/upload when required.
5. Build accessible list/calendar and balance components shared by HR and employee views.
6. Test validation, keyboard behavior, evidence requirements, and error states.

## Task 7: Deliver the HR Leave workspace

**Files:**

- Create: `src/modules/hr/pages/LeaveManagementPage.tsx`
- Create: `src/modules/hr/pages/LeaveManagementPage.test.tsx`
- Modify: `src/modules/hr/HrPage.tsx`
- Modify: `src/modules/hr/components/HrNavigation.tsx`

1. Add **Leave** to HR navigation under explicit leave permission.
2. Build summary cards, filters, approval queue, request list, and calendar.
3. Add request detail with evidence and audit history.
4. Add approve/reject/cancel actions with mandatory reasons.
5. Add **Log leave for employee** using the shared form and immediate approved status.
6. Add type, holiday, entitlement, and balance-adjustment setup without permanent deletion.
7. Run the HR leave page tests and existing HR navigation tests.

## Task 8: Deliver employee self-service Leave

**Files:**

- Create: `src/modules/portal/api/leave.ts`
- Create: `src/modules/portal/api/leave.test.ts`
- Create: `src/modules/portal/pages/MyLeavePage.tsx`
- Create: `src/modules/portal/pages/MyLeavePage.test.tsx`
- Modify: `src/modules/portal/PortalPage.tsx`
- Modify: `src/modules/portal/pages/shared.tsx`

1. Add **Leave** to My Workspace navigation.
2. Add personal balances, request action, status history, and pending withdrawal.
3. Add privacy-safe approved-absence calendar data without coworker reasons or evidence.
4. Connect decision notifications to the matching request.
5. Add clear empty, loading, upload, and error states.
6. Run employee leave tests and existing portal tests.

## Task 9: Add the employee-dossier Leave tab

**Files:**

- Modify: `src/modules/hr/pages/EmployeeDossierPage.tsx`
- Modify or create the matching dossier test file.

1. Add a permission-guarded Leave tab.
2. Show the selected employee's balances and request history.
3. Add a preselected **Log leave** action for HR.
4. Ensure CFO payroll access does not accidentally expose this HR-only tab.
5. Run dossier and role-access tests.

## Task 10: Integrate approved unpaid leave with payroll

**Files:**

- Modify: `supabase/migrations/0086_leave_documents_and_payroll.sql`
- Modify: `supabase/tests/payroll_workflow.sql`
- Modify: `src/modules/payroll/api/payroll.ts`
- Modify: `src/modules/payroll/api/payroll.test.ts`
- Modify: `src/modules/payroll/pages/PayrollRunsPage.tsx`
- Modify the matching payroll page test.

1. Add a server query that returns approved unpaid working days and a server-calculated deduction for a payroll period.
2. Generate one deterministic `deduction` line with code `UNPAID_LEAVE` per affected employee.
3. Prevent duplicate deduction lines when a draft is regenerated.
4. Preserve the deduction snapshot after payroll approval.
5. Display the deduction description and days in payroll detail/payslip line items.
6. Run payroll database and frontend tests.

## Task 11: Add browser acceptance coverage

**Files:**

- Create: `e2e/leave-management.spec.ts`

1. Test employee request → HR notification → HR approval → employee notification.
2. Test HR-on-behalf entry.
3. Test required evidence upload and signed retrieval.
4. Test withdrawal, rejection, cancellation, and corrected balance.
5. Test public-holiday/weekend calculation.
6. Test unpaid-leave appearance in a payroll draft.
7. Test role boundaries for employee, HR, CFO, and MD.

## Task 12: Apply and verify the complete vertical slice

1. Review the migration diff and confirm the linked Supabase project before applying it.
2. If the user prefers to conserve Codex usage, provide the exact database-push command for the user to run locally.
3. Run focused leave, notification, storage, HR, portal, and payroll tests.
4. Run all database acceptance suites.
5. Run `npm run typecheck`.
6. Run `npm run lint`.
7. Run `npm run test:unit`.
8. Run the relevant Playwright tests, then the complete browser suite.
9. Run database lint and `npm run build`.
10. Report evidence, remaining known issues, and manual test accounts/flows. Do not commit, push, or deploy.
