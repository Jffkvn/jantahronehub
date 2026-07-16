# Role Acceptance Corrections Implementation Plan

## Outcome

Close the acceptance blockers discovered during live role testing without broadening operational authority:

- Managing Director (MD) receives read-only company oversight, not HR employee maintenance.
- Chief Financial Officer (CFO) and MD receive correct company-wide aggregates rather than self-only rows.
- Warehouse Manager is not shown a general governance destination that always denies access.
- Direct URLs and visible navigation enforce the same authority.

## Confirmed current mismatch

- The hosted MD role has project, daily-update, cash and report permissions, but no employee, payroll or inventory read permission.
- The hosted Warehouse Manager role has inventory permissions but no `reports.view` permission.
- The UI nevertheless advertises HR to MD and Reports to Warehouse Manager.
- Workforce reporting reads the employee tables through caller RLS, so CFO/MD see only their own linked employee row.
- Reports starts every domain query for every report viewer, so executive visibility depends accidentally on unrelated raw-table permissions.

## Security boundary

Migration `0068` adds the `SECURITY DEFINER`, empty-search-path, read-only `get_governance_report_snapshot()` boundary. Corrective migration `0069` preserves the deployed implementation as a non-callable internal helper and narrows the public result to approved payroll totals only.

The function will:

1. require `reports.view`;
2. accept no profile or employee identifier from the caller;
3. return only the curated report shapes already displayed by the governance workspace;
4. expose workforce counts and department distribution without employee dossiers, salary records, national IDs, contacts or bank details;
5. return payroll totals, inventory/asset oversight, project health, cash reconciliation and receipt exceptions from canonical ledgers;
6. grant execution only to `authenticated` after revoking default/public access.

MD will not receive `employees.read`, `employees.create`, `employees.update`, `employees.archive`, `payroll.read` or `inventory.read`. This avoids turning aggregate reporting into raw operational access.

## UI and route rules

- Remove MD from the HR module role list.
- Remove Warehouse Manager from the Reports module role list.
- Guard `/hr/*` with an any-of check for `employees.read` or `payroll.read`.
- Guard `/reports/*` with `reports.view`.
- Load the Reports workspace from the single governance snapshot.
- Keep aggregate exports behind `reports.export`.
- Keep employee-level statutory payroll exports additionally behind `payroll.read` so MD cannot export payroll line items.

## Test-first sequence

1. Add failing module-visibility tests for MD and Warehouse Manager.
2. Add failing route-permission tests for the new any-of guard.
3. Add a failing reports API test requiring `get_governance_report_snapshot`.
4. Expand `reports_audit.sql` with failing tests for function existence, privilege restrictions, unauthorized denial, company-wide CFO/MD workforce totals and continued absence of employee mutation permissions.
5. Implement migration `0068`, corrective migration `0069`, and the client/UI changes.
6. Run focused unit and pgTAP tests.
7. Apply `0068` and corrective `0069` only to the confirmed linked project, then run the hosted SQL gates and linked lint.
8. Run the full app verification and browser suite.
9. Update the role acceptance evidence and the Projects plan migration numbers to begin at `0070` before Projects implementation.
10. Review the security-sensitive diff and commit the role-correction checkpoint.

## Acceptance evidence

- MD navigation: Home, My Workspace, Project Cash, Daily Tracker and Reports & Audits; no HR Management or operational Inventory destination.
- MD direct HR and Inventory URLs: denied before an operational workspace renders; inventory oversight remains available in Reports.
- MD report snapshot: correct company-wide aggregates and no employee dossier fields.
- MD employee create/update/archive permissions: false.
- CFO report snapshot: correct company-wide workforce aggregate while retaining payroll/payment authority and no employee mutation authority.
- Warehouse Manager navigation: no Reports & Audits destination.
- Warehouse Manager direct Reports URL: denied.
- All existing role, HR, payroll, inventory, project, cash and report tests remain green.
