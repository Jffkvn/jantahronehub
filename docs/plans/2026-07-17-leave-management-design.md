# Leave Management Design

**Date:** 17 July 2026  
**Status:** Approved for implementation  
**Sources:** The working HR leave module in `egypro`, the employee leave module in `egypro-portal`, and OneHub's existing HR, payroll, notification, audit, and private-file foundations.

## Objective

Add a complete whole-day leave workflow to OneHub while retaining the proven experience of the legacy applications. Employees request leave directly from HR, HR may record leave on an employee's behalf, and approved unpaid leave feeds payroll deductions.

This release does not support half days or other partial-day leave.

## Reuse boundary

The following legacy behavior will be adapted rather than redesigned:

- leave type defaults and HR-configurable entitlements;
- employee balance cards, request history, request form, and calendar;
- HR pending queue, leave calendar, filters, balance management, and leave-on-behalf workflow;
- working-day calculations, excluding weekends;
- unpaid-leave payroll deduction behavior;
- the successful information hierarchy and interaction patterns from both legacy screens.

The following will be rebuilt for OneHub because copying it directly would bypass the consolidated application's security model:

- database tables, row-level access, atomic server operations, and audit history;
- OneHub employee identity and role permissions;
- actionable notifications;
- private evidence uploads and signed-file access;
- public-holiday handling and payroll integration;
- privacy-safe team calendar data.

Legacy browser-side balance mutation, permanent deletion, URL-only evidence, simulated conflict data, and half-day inputs will not be copied.

## Roles and workflow

### Employee

- Opens **My Workspace → Leave**.
- Views personal balances, personal request history, and a privacy-safe absence calendar.
- Submits a whole-day leave request directly to HR.
- Uploads supporting evidence when the leave type requires it.
- Withdraws a request while it is still pending.
- Receives an actionable notification after HR approves or rejects it.

### HR

- Opens **HR Management → Leave**.
- Reviews, approves, or rejects pending requests.
- Records approved leave on behalf of an employee after offline discussion.
- Cancels or corrects approved leave with a mandatory reason; records are never permanently deleted.
- Configures leave types, annual entitlements, balance adjustments, and public holidays.
- Sees employee names and operational detail needed to administer leave.

### CFO and Managing Director

- May see safe aggregate leave reporting where their reporting permissions allow it.
- Do not receive personal medical evidence, employee reasons, or HR mutation controls merely because of their executive role.

There is no manager-approval stage in the first release. Conversations with managers happen offline; the system request goes directly to HR.

## Data model

- `leave_types`: configurable name, code, paid/unpaid flag, default entitlement, evidence requirement, color, display order, and archive state.
- `public_holidays`: named dates excluded from working-day calculations.
- `leave_entitlements`: employee/type/year entitlement records.
- `leave_balance_adjustments`: append-only manual corrections with actor and reason.
- `leave_requests`: employee, type, dates, calculated working days, status, source, reasons, action metadata, and cancellation metadata.
- `leave_request_events`: append-only workflow audit trail.
- `leave_documents`: private storage metadata linked to the request and employee.

Balances are derived from entitlement plus adjustments minus approved, non-cancelled leave. OneHub will not maintain a mutable `used_days` counter that can drift out of sync.

## Server rules

- All durations are whole working days.
- Saturdays, Sundays, and configured public holidays are excluded.
- Cross-year requests are submitted separately per calendar year in this first release.
- Dates and balances are calculated on the server, not trusted from the browser.
- Submission, approval, rejection, withdrawal, cancellation, adjustment, and HR-on-behalf creation use atomic server functions.
- An employee can only access their own request detail and documents.
- HR actions require explicit leave-management permission.
- Every workflow action records its actor, timestamp, and reason where applicable.

## Default leave types

The legacy application's defaults will seed the initial setup: Annual, Sick, Day Off, Unpaid, Maternity, Paternity, and Compassionate leave. These are configurable operational defaults, not hard-coded legal assertions. HR can archive, rename, reorder, or adjust them.

## Evidence uploads

Supporting evidence is uploaded as an actual file to OneHub's private storage. Files use a request-scoped path and are accessed through short-lived signed links. File type and size are validated in the browser and again at the storage boundary.

## Notifications

- Employee submission notifies eligible HR users and opens the relevant request in `/hr/leave`.
- HR approval or rejection notifies the employee and opens the request in `/my/leave`.
- HR-on-behalf creation notifies the employee.
- Notification records use OneHub's existing unread count and actionable-path model.

## Payroll integration

Approved unpaid leave intersecting a payroll period creates a deterministic `UNPAID_LEAVE` deduction line during payroll draft preparation. The server calculates approved unpaid working days and the deduction from the employee's contractual gross and the payroll period's working days. The line is snapshotted into the payroll draft and cannot be duplicated when the draft is refreshed.

## Screens

### HR Leave

- summary cards for pending, approved/current, employees away, and upcoming leave;
- pending approval queue and searchable request list;
- calendar/list views;
- **Log leave for employee** action;
- leave type, public holiday, entitlement, and balance-adjustment setup;
- request detail with evidence, history, and decision actions.

### My Leave

- balance cards;
- whole-day request action;
- personal request history and status;
- privacy-safe team absence calendar;
- pending-request withdrawal.

### Employee dossier

HR receives a Leave tab showing the selected employee's balances and request history, with an action to log leave for that employee.

## Acceptance criteria

- Employees can submit only their own whole-day requests directly to HR.
- HR can approve/reject and can log approved leave on behalf of an employee.
- Working days consistently exclude weekends and configured holidays.
- Evidence is privately uploaded, not entered as a public URL.
- Balances remain correct after approval, rejection, withdrawal, cancellation, and adjustment.
- Approved unpaid leave appears once as a payroll deduction for the matching period.
- Notifications reach the correct users and open the correct record.
- CFO/MD aggregate access does not expose sensitive request detail.
- All database, unit, browser, lint, type, and production-build checks pass before the feature is called complete.
