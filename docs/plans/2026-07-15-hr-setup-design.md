# Egypro OneHub 2.0 — HR Setup Design

**Date:** 15 July 2026  
**Status:** Approved during role-by-role user acceptance testing  
**Implementation folder:** `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0 Stabilized`

## Problem

The employee form reads departments and job titles from canonical database tables, but OneHub has no interface for creating or maintaining those records. A new deployment therefore shows only `Not assigned` in both dropdowns. The database also contains pay-grade support that is not exposed consistently in the employee workflow.

This is a product gap, not an onboarding error. Administrators must not need Supabase access or manual SQL to configure the company's employment structure.

## Selected Approach

Add an **HR Setup** destination inside HR Management. It is visible only to accounts with `employees.manage_setup`, initially `hr_admin` and `super_admin`.

The workspace manages:

- Departments.
- Job titles, optionally associated with a department.
- Pay grades with UGX minimum and maximum gross values.

This belongs under HR Management because it describes the employer's operating structure. System Administration remains responsible for authentication accounts, roles, access and employee links.

## User Experience

The Human Resources navigation adds a `Setup` destination alongside Employees and Payroll. The setup page uses focused in-page sections for Departments, Job titles and Pay grades.

Each section provides:

- Searchable active and archived records.
- Create and edit forms with clear validation.
- Assignment or dependency counts where relevant.
- Archive and restore actions.
- Empty states that explain why employee dropdowns are empty and offer the appropriate create action.

After a setup record is created, employee forms refresh their setup query and immediately show the new option. Job-title selection is filtered by the selected department while still supporting company-wide titles without a department.

The employee form also exposes pay grade so the existing `employment_periods.pay_grade_id` relationship becomes operational rather than dormant.

## Data and Workflow Rules

### Departments

- Code is required, uppercase-normalized and unique.
- Name is required and case-insensitively unique.
- Description is optional.
- A department may be edited while active.
- It cannot be archived while active job titles or current employee assignments depend on it.
- Historical references never cascade-delete.

### Job titles

- Code and name are required.
- A job title may be company-wide or associated with one department.
- It cannot be archived while assigned to a current employee.
- Historical employment records retain their references.

### Pay grades

- Code and name are required.
- Currency defaults to UGX.
- Minimum and maximum gross are optional non-negative amounts.
- Maximum cannot be less than minimum.
- A pay grade cannot be archived while assigned to a current employee.
- Historical employment records retain their references.

### Archive and restore

Setup records are archived, never hard-deleted through OneHub. Archived values disappear from new-assignment dropdowns but remain visible on historical records. Restore re-enables an archived record if its unique code and name are still valid.

## Authorization and Audit

- Reading employee setup requires an authenticated OneHub profile with employee-read access.
- Creating, editing, archiving and restoring setup requires `employees.manage_setup`.
- All mutations run through atomic database functions rather than direct browser writes.
- Each mutation validates permissions and dependencies inside the database transaction.
- Each successful mutation writes an append-only `audit_events` record with actor, action, previous values, new values and reason.
- Direct authenticated insert/update access to setup tables is revoked after the secure functions are introduced.
- Functions use a fixed search path and expose only safe validation messages to the client.

## Employee Assignment Integration

The employee domain gains `payGradeId` and pay-grade display data. Create and update workflows persist department, job title and pay grade together with the employment period.

Employee forms show:

- Department.
- Position / Job title.
- Pay grade.

Changing a department clears a selected job title when that title belongs to another department. Existing valid assignments remain selected during employee editing.

## Training Knowledge Register

Create `docs/training/TRAINING_KNOWLEDGE_REGISTER.md` as JantaHR's internal source for future manuals. Each entry records:

- Reference, date, module and relevant roles.
- Verified rule or concept.
- Plain-language explanation and suggested trainer wording.
- Practical example and expected behaviour.
- Common misunderstanding.
- Destination manual and verification status.

Initial entries cover:

- Account versus role versus employee record.
- Role permissions versus employee self-service identity.
- Why `super_admin` normally remains unlinked.
- Why a real HR employee should be linked.
- The employee-link workflow.
- HR Setup ownership and why empty dropdowns indicate missing setup records.

Defects and proposed improvements are labelled separately and never presented as approved user instructions.

## Error Handling

- Duplicate codes and names produce specific, safe messages.
- Dependency failures identify what must be reassigned or archived first.
- Invalid pay ranges are rejected before submission and again in the database.
- Failed mutations leave setup and audit data unchanged.
- Loading, empty, permission-denied and retry states are explicit.

## Verification

- Database tests prove permission enforcement, validation, atomic audit creation, dependency protection, archive and restore.
- API tests prove payload normalization and safe error mapping.
- Component tests cover create, edit, archive, restore, empty states and permission-aware navigation.
- Employee tests cover department-filtered job titles and pay-grade persistence.
- Playwright covers the HR journey from creating setup records to assigning them to an employee.
- The complete typecheck, lint, unit, build and Playwright suites must pass before commit.

## Non-goals

- Organizational charts.
- Department budgets.
- Approval workflows for setup changes.
- Effective-dated department reorganizations beyond existing employment-period history.
- Hard deletion of referenced setup records.
