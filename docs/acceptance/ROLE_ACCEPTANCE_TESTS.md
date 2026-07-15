# OneHub Role-by-Role Acceptance Tests

## Purpose

Use this checklist to prove that each OneHub role receives the correct navigation, allowed actions, denied actions, and audit evidence before the User Administration checkpoint is merged.

Run these cases only against the designated Antigravity test Supabase project. Do not include passwords, MFA secrets, recovery codes, access tokens, or service-role keys in this document or in screenshots.

Invitation-email delivery is **PENDING DOMAIN**. During the no-domain test phase, create login accounts manually in Supabase Auth and connect them to OneHub by exact email.

## Test account setup chain

1. In the designated test Supabase dashboard, create one Auth user for each test persona.
2. Sign in to OneHub as the existing `super_admin` and complete TOTP verification.
3. Open **System Administration** and connect the first HR account using its exact Auth email.
4. Assign `hr_admin`, record a meaningful reason, and verify that an access-audit event appears.
5. Sign out and sign in as the new HR administrator.
6. As HR, connect the remaining test accounts and assign every non-super-admin role, including a second HR administrator.
7. Sign in as each persona and execute the applicable checks below.
8. Reopen System Administration as HR and `super_admin` and reconcile the visible status, employee link, roles, and audit trail.

Recommended personas:

| Persona | Role |
| --- | --- |
| Owner/support | `super_admin` |
| HR primary | `hr_admin` |
| HR secondary | `hr_admin` |
| Employee | `employee` |
| Project coordinator | `coordinator` |
| Project manager | `project_manager` |
| Warehouse manager | `warehouse_manager` |
| Finance lead | `cfo` |
| Managing director | `managing_director` |

## Evidence standard

For every result, record:

- tester and test date;
- `PASS`, `FAIL`, `BLOCKED`, or `NOT APPLICABLE`;
- the route or action tested;
- a screenshot or exported record when useful;
- the related OneHub audit event for a mutation;
- a concise defect note for every failure.

## User Administration controls

| ID | Actor | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| UA-01 | `super_admin` | System Administration is visible and `/admin` opens successfully. |  |  |
| UA-02 | `super_admin` | Can connect an existing Auth user as HR using exact email, display name, at least one role, and a reason. |  |  |
| UA-03 | `super_admin` | Can assign every supported role, including `super_admin`. |  |  |
| UA-04 | `super_admin` | Cannot deactivate or demote the last active super administrator. |  |  |
| UA-05 | `hr_admin` | System Administration is visible and `/admin` opens successfully. |  |  |
| UA-06 | `hr_admin` | Can connect employee, coordinator, PM, warehouse, CFO, MD, and additional HR accounts. |  |  |
| UA-07 | `hr_admin` | Never receives `super_admin` as an assignable role. |  |  |
| UA-08 | `hr_admin` | Can see a super-admin directory row but has no edit, deactivate, or reactivate controls for it. |  |  |
| UA-09 | `hr_admin` | A manually attempted super-admin mutation is rejected and leaves no partial change. |  |  |
| UA-10 | Any other role | System Administration is absent from navigation and a manually typed `/admin` route shows access unavailable. |  |  |
| UA-11 | HR or `super_admin` | Empty roles, invalid email, short reason, or duplicate employee link are rejected. |  |  |
| UA-12 | HR or `super_admin` | Edit, deactivate, and reactivate require a reason and refresh both the directory and access audit. |  |  |
| UA-13 | HR or `super_admin` | Deactivated and employee-unlinked accounts are clearly identified. |  |  |
| UA-14 | HR or `super_admin` | Search plus role, status, and employee-link filters return the expected accounts. |  |  |

## Role journeys

Module visibility below assumes all Egypro modules are enabled. A disabled module must remain hidden for every role.

### Super administrator

Expected navigation: Home, My Workspace, HR Management, Inventory Operations, Project Cash, Daily Tracker, Reports & Audits, and System Administration.

| ID | Journey | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| SA-01 | Open all enabled modules. | Every module opens without an access loop or blank page. |  |  |
| SA-02 | Connect and update a test account. | Change succeeds atomically and creates an access audit event with the recorded reason. |  |  |
| SA-03 | Attempt to remove the last active super-admin role. | Operation is denied and the account remains active with `super_admin`. |  |  |
| SA-04 | Sign in without completing required TOTP. | Owner workspace remains unavailable until MFA succeeds. |  |  |

### HR administrator

Expected navigation: Home, My Workspace, HR Management, Reports & Audits, and System Administration.

| ID | Journey | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| HR-01 | Create or update an employee and open their dossier. | Authorized HR workflow succeeds and is audited where required. |  |  |
| HR-02 | Prepare and approve payroll. | HR workflow is available; payment execution remains a CFO activity. |  |  |
| HR-03 | Connect another HR and each non-super-admin test role. | Accounts appear with the requested roles and audit reasons. |  |  |
| HR-04 | Attempt to manage `super_admin`. | No UI action is offered; a direct request is rejected by the database. |  |  |
| HR-05 | Open Inventory or Project Cash by typing the route. | Access is denied unless HR is separately granted an appropriate operational role. |  |  |

### Employee

Expected navigation: Home and My Workspace.

| ID | Journey | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| EMP-01 | Open own profile, documents, and published payslips. | Only the signed-in employee's records are visible. |  |  |
| EMP-02 | Attempt to open another employee dossier or `/admin`. | Access is denied and no confidential record is returned. |  |  |
| EMP-03 | Attempt to call a user-administration mutation. | Database rejects the request and no audit/mutation record is created. |  |  |

### Project coordinator

Expected navigation: Home, My Workspace, Inventory Operations, Project Cash, and Daily Tracker.

| ID | Journey | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| CO-01 | Submit a stock request, cash request, and daily update for an assigned project. | Requests are created within assigned-project scope. |  |  |
| CO-02 | Attempt CFO approval, warehouse fulfillment, or `/admin`. | Unauthorized action is absent or denied. |  |  |

### Project manager

Expected navigation: Home, My Workspace, Inventory Operations, Project Cash, and Daily Tracker.

| ID | Journey | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| PM-01 | Review assigned project activity and submit permitted operational requests. | Assigned-project workflows succeed. |  |  |
| PM-02 | Attempt warehouse fulfillment, CFO-only action, or `/admin`. | Unauthorized action is absent or denied. |  |  |

### Warehouse manager

Expected navigation: Home, My Workspace, Inventory Operations, and Reports & Audits.

| ID | Journey | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| WH-01 | Receive stock and fulfill an already approved request. | Ledger movement is atomic and records the fulfiller. |  |  |
| WH-02 | Attempt to fulfill a request that still requires CFO approval. | Fulfillment is denied and stock remains unchanged. |  |  |
| WH-03 | Attempt payroll, cash approval, or `/admin`. | Unauthorized action is absent or denied. |  |  |

### Chief finance officer

Expected navigation: Home, My Workspace, HR Management, Inventory Operations, Project Cash, and Reports & Audits.

| ID | Journey | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| CFO-01 | Approve an escalated stock request. | Approval is recorded; stock does not move until warehouse fulfillment. |  |  |
| CFO-02 | Approve/disburse a cash advance and review accountability. | Ledger reconciles and each step records the actor. |  |  |
| CFO-03 | Override an outstanding-advance warning with a reason. | Override succeeds and is permanently audited. |  |  |
| CFO-04 | Record payroll payment execution. | Payment reference is recorded without modifying approved payroll. |  |  |
| CFO-05 | Attempt HR payroll approval or `/admin`. | Unauthorized action is absent or denied. |  |  |

### Managing director

Expected navigation: Home, My Workspace, HR Management, Inventory Operations, Project Cash, Daily Tracker, and Reports & Audits.

| ID | Journey | Expected result | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| MD-01 | Review executive reports, project health, and operational exceptions. | Read-only oversight data loads from canonical ledgers. |  |  |
| MD-02 | Attempt warehouse fulfillment, payroll mutation, or `/admin`. | Unauthorized action is absent or denied unless separately assigned. |  |  |

## Audit reconciliation

After role testing, verify that:

- every successful user connection, role change, deactivation, and reactivation has one corresponding access-audit event;
- the audit event identifies actor, target, reason, timestamp, and before/after access state;
- rejected mutations created no partial account, role, employee-link, or audit data;
- HR never changed a super-admin record;
- no page or exported evidence exposes an Auth password, MFA secret, token, or service-role key.

## Deferred email check

| ID | Dependency | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- |
| MAIL-01 | Verified sending domain and configured Resend/Supabase SMTP | Invitation email arrives, link opens the intended OneHub origin, and first-login setup succeeds. | PENDING DOMAIN |  |
