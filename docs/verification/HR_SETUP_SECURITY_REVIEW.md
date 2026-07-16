# HR Setup Security Review

**Scope:** Uncommitted HR Setup workspace, employee setup assignments, migrations 0064–0067, and the related React client/API changes.

**Outcome:** No critical or high-severity security regression was identified in this checkpoint. The HR Setup mutation boundary is permission checked, audited, and protected from direct browser-table writes. One pre-existing employee-write audit gap remains recorded below for a separate hardening slice.

## Controls confirmed

- Every HR Setup `security definer` workflow uses an empty `search_path`, checks `employees.manage_setup`, requires an active actor, and requires a meaningful audit reason.
- The private authorization helper is not executable by browser roles. Public workflow functions are executable only by `authenticated`, with authorization enforced inside each function.
- Direct `insert`, `update`, and `delete` privileges are revoked from `departments`, `job_titles`, and `pay_grades`; setup changes must pass through the audited workflows.
- Archive and restore logic uses explicit allow-listed branches rather than dynamic SQL, locks the selected record, preserves history, and blocks active dependencies.
- Every successful setup mutation and its audit event occur in the same transaction.
- The employment-period integrity trigger rejects archived setup records and department/title mismatches regardless of the write path.
- The React API validates inputs and exposes only an allow-list of safe database messages. Unexpected database details are replaced with a generic error.
- A focused scan of the touched React/TypeScript files found no new raw-HTML injection sink, string-to-code execution, untrusted redirect, browser token storage, or embedded secret.

## Finding HR-SEC-001 — Authorized direct employee writes can bypass RPC audit

- **Severity:** Medium
- **Location:** `supabase/migrations/0010_hr_employees.sql:227-231`; `supabase/migrations/0016_complete_employee_profile.sql:20-25`
- **Evidence:** The `authenticated` role retains direct `insert` and `update` table privileges on employees, employment periods, and confidential employee profiles. RLS restricts those writes to users with the corresponding employee permission, but an authorized HR client can still write around the employee RPC audit events.
- **Impact:** A compromised or defective authorized HR client could change employee data without producing the complete employee workflow audit record. This does not grant an ordinary employee new write authority.
- **Checkpoint effect:** This gap predates HR Setup. Migration 0064 removes the equivalent bypass for setup master data, and migration 0066 still enforces active and compatible setup assignments on every employment-period write.
- **Fix:** In a dedicated hardening migration, move all remaining employee mutations behind complete audited RPCs, add contract tests for every supported operation, then revoke direct `insert` and `update` privileges from the three employee tables.
- **Mitigation:** Existing RLS permission checks, setup-integrity trigger, append-only audit controls, and restricted UI reduce exposure until the dedicated migration is implemented.
- **False-positive notes:** If an external trusted integration intentionally writes these tables directly, inventory that integration before revoking privileges and provide it a narrowly scoped audited workflow.

## Deferred acceptance correction

The Managing Director employee controls and route visibility are a separate acceptance issue. Database RLS still rejects unauthorized mutations, but the misleading controls must be removed in the next role-correction checkpoint.

## Final-review corrections

Migration 0067 closed both Important findings raised during final review:

- Referenced job titles can no longer move between departments and silently change the meaning of current or historical employee assignments.
- Employee self-service now obtains only the signed-in employee's grade name from a dedicated minimum-data function; pay ranges and other employees' grade records remain protected.

The regression contracts pass in `supabase/tests/hr_setup.sql`, `supabase/tests/hr_rls.sql`, and `src/modules/portal/api/selfService.test.ts`.
