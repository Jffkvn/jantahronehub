# Egypro OneHub 2.0 — Consolidated Product Backlog

**Recorded:** 17 July 2026  
**Purpose:** Preserve all incomplete, deferred, and unverified work before beginning the remaining HR domains.  
**Change policy:** This file records scope only. It does not mark work complete without current automated or manual evidence.

## Current baseline

The consolidated local application already contains the substantially completed operational foundation:

- HR employee setup, employee records, role administration, and verified role visibility.
- Canonical Projects workspace, project creation and assignment, multiple coordinators, project status management, and guarded completion.
- Project Cash, inventory requests, equipment custody, project-linked summaries, documents, and history.
- Daily Tracker separation, coordinator and PM updates, PM review, multiple same-day updates, and up to ten phone-compatible evidence photos.
- Singular consumable and equipment receiving at the single Egypro HQ Warehouse, including inline category creation and receipt details.
- System notifications for the tested project, cash, inventory, and tracker events.

These areas still require the final consolidated acceptance and production-readiness checkpoint described below.

## Priority 1 — Remaining HR domains

### 1. Leave management

- Configurable leave types, rules, annual entitlements, carry-forward, and balances.
- Employee self-service request, balance, status, and history.
- Requests go **directly to HR** for approval or rejection; routine manager discussion happens offline.
- HR can record leave on behalf of an employee, cancel or correct it with a reason, and see team/company calendars.
- Public holidays and working-day calculations.
- Supporting-document upload using private storage.
- Unpaid-leave output for payroll where applicable.
- Notifications, audit history, exports, and visual reporting.

### 2. Salary/staff advances

- A separate employee-finance domain; it must not reuse Project Cash records or terminology.
- Employee request, amount, reason, status, and history.
- HR/CFO review flow to be confirmed during design.
- Approved amount, repayment schedule, outstanding balance, corrections, and settlement.
- Payroll deduction integration and auditable exports.
- Private supporting documents and role-scoped reporting.

### 3. Performance management

- Review cycles and employee inclusion.
- Goals/KPIs, weights, manager ratings and comments, overall score, and recommendations.
- Draft, submitted, approved, acknowledged, reopened, and historical states.
- Employee visibility boundaries and confidential HR/management reporting.
- Controlled import/export where useful.

### 4. Training and certifications

- Training catalogue/record, topic, provider, date, duration, cost, and completion state.
- Employee assignment and self-service visibility.
- Certificate/evidence upload using private storage.
- Certification issue and expiry dates, renewal history, and expiry alerts.
- Compliance and cost reporting.

### 5. Shared HR workflow foundation

- Reusable approval events, actionable notifications, private documents, audit history, and exports.
- Role-scoped read models for employee, HR, CFO, and MD experiences.
- Navigation and quick actions in My Workspace and HR Management.
- Automated database authorization tests plus browser acceptance journeys for each domain.
- Existing HR mutation security hardening: complete audited RPC coverage and removal of unnecessary direct table mutation privileges.

## Priority 2 — Known operational corrections and acceptance closure

- Notification bell must show a clear numeric unread count, not only a small red dot; manually verify it after a fresh cash, inventory, project-assignment, and daily-update event.
- Confirm notification rows open the exact related request, advance, project, or daily update for every receiving role.
- Perform the short manual PM and coordinator photo-update confirmation against the hosted database after the latest migrations.
- Reconcile `docs/acceptance/ROLE_ACCEPTANCE_TESTS.md` with the manual journeys already completed by the user; remove stale `HOSTED MANUAL PENDING` claims only when evidence exists.
- Review the full dirty worktree, especially security-sensitive database, storage, notification, cash, inventory, and project changes.
- Run the final consolidated checkpoint: application tests, report/security tests, browser tests, all database suites, schema lint, type checking, lint, and production build.
- Commit the complete coherent local project only after the checkpoint passes. Do not push or deploy until explicitly requested.

## Priority 3 — UI/UX and reporting phase

- Refurbish Project Details and all project tabs so cash reconciliation, inventory reconciliation, team, updates, documents, and history share a polished visual hierarchy.
- Refurbish Daily Tracker and project Daily Updates with clearer submitter identity, title, evidence gallery, state, timestamps, and review actions.
- Build visual, role-aware dashboards and reports using charts, trends, distributions, exception lists, and drill-down destinations rather than number-only cards.
- Add role-aware quick actions for HR, CFO/MD, Inventory/Warehouse, Employee, Coordinator, and PM workspaces.
- Apply the approved legacy-inspired smooth dropdown/modal/form treatment consistently.
- Complete the four premium reference screens: HR, CFO/MD, Inventory, and Employee/Coordinator.
- Verify desktop, tablet, mobile, keyboard, touch, screen-reader, loading, empty, error, and long-content states.

## Priority 4 — Production hardening and deployment

- Preserve the active route and unfinished form data during routine Supabase token/session refreshes.
- Add unsaved-change protection for modal close, navigation, browser refresh/close, and sign-out; use secure server-backed drafts for sensitive long workflows.
- Resolve the large payslip bundle/code-splitting warning.
- Configure and test the real sending domain and invitation-email/first-login journey.
- Complete final RLS, storage, audit, accessibility, performance, and production-environment review.
- Prepare deployment configuration, backups/rollback notes, administrator training, and production release checklist.
- Production deployment remains explicitly not done.

## Agreed execution order

1. Design and implement Leave end-to-end.
2. Implement Staff Advances and payroll deduction integration.
3. Implement Performance Management.
4. Implement Training and Certifications.
5. Complete HR dashboards, reports, and quick actions.
6. Close Priority 2 acceptance items before committing the consolidated local application.
7. Complete the broader UI/UX phase and production hardening.

## Explicitly deferred, not forgotten

- Numeric notification badge and complete action-link manual verification.
- Broad visual dashboard/report redesign and quick actions.
- Daily Tracker and project-detail visual refurbishment.
- Invitation email delivery pending a configured domain.
- Final production deployment.

