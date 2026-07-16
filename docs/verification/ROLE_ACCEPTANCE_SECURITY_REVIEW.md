# Role Acceptance Security Review

**Checkpoint:** MD/CFO governance reporting and Warehouse Manager navigation correction
**Migrations:** `0068_governance_report_snapshot.sql`, `0069_filter_governance_approved_payroll.sql`
**Review result:** No Critical or High-severity regression found.

## Authorization outcome

- MD no longer receives the HR Management or operational Inventory modules from role-based navigation.
- `/hr/*` requires either `employees.read` or `payroll.read`; `/inventory/*` requires `inventory.read`.
- Warehouse Manager no longer receives the general Reports module.
- `/reports/*` requires `reports.view` even when entered directly.
- CFO and MD continue to lack `employees.create`, `employees.update` and `employees.archive`.
- MD was not granted raw employee, payroll or inventory table permissions to make reporting work.

## Governance snapshot boundary

`get_governance_report_snapshot()` is a curated reporting boundary rather than a caller-selected employee lookup:

- accepts no profile, employee or project identifier;
- checks `reports.view` inside the function;
- uses `SECURITY DEFINER` with an empty search path and fully qualified application relations/functions;
- revokes default/public, anonymous and authenticated execution before granting only authenticated execution;
- returns workforce counts and department distribution without employee names, contacts, national IDs, bank details, salary records or employee dossier fields;
- returns the existing governance report shapes for payroll totals, stock balances, asset custody, project health, cash reconciliation and receipt exceptions;
- filters the executive payroll summary to approved runs; draft payroll totals remain outside the governance snapshot;
- does not perform writes.

Employee-level statutory payroll exports remain additionally gated by `payroll.read`. MD can export the aggregate report shapes but cannot use the Reports page to query payroll items.

## Verification evidence

- `reports_audit.sql`: 22/22, including anonymous denial, coordinator denial, CFO/MD company totals, absence of employee mutation permissions and exclusion of draft payroll totals.
- All 16 hosted SQL suites passed after migration `0068` was applied.
- The focused 22-test reporting suite passed after corrective migration `0069`.
- Linked database lint: no schema errors.
- Local and remote migrations match through `0069`.
- Application verification: 60 test files and 225 tests passed; typecheck, lint and production build passed.
- Browser verification: 14/14 Playwright journeys passed.
- Dependency audit: zero known vulnerabilities at the configured high-severity gate.

## Non-blocking observation

The production build retains the existing large payslip bundle warning. It is a performance/code-splitting concern, not an authorization or data-exposure blocker for this checkpoint.
