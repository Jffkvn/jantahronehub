# Tasks 15–22 Promotion Runbook

**Prepared:** 14 July 2026
**Status:** Ready for review; no promotion executed
**Canonical repository:** `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0`
**Verified worktree:** `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0 Stabilized`
**Verified implementation baseline:** `codex/stabilize-tasks-15-22` through `7290ddb`, followed by this reviewed Task 12 promotion-preparation commit
**Original branch/commit:** `feature/foundation` at `e5407cc`

## 1. Promotion decision gate

Do not execute this runbook until the owner explicitly approves all three actions:

1. Fast-forward the canonical Git branch to the stabilized commit.
2. Apply the pending migrations to original Supabase project `kgntxnwvnayhjpsoauuj`.
3. Reconfigure/deploy the application against that original project.

The verified Antigravity project `sewbxazwpjbtevckorbl` remains the migration and test reference. It must not be confused with the original project during cutover.

## 2. Current Git comparison

The stabilized branch descends directly from the original commit:

- Merge base: `e5407cc788ca05cdb2dee0ba56e73247828b4f88`
- Original-only commits: `0`
- Stabilized-only commits: `33`
- Promotion type: clean fast-forward; no committed-history merge conflict expected

The canonical working tree contains uncommitted material:

- Eight Task 15 historical-payroll files that overlap files now tracked by the stabilized branch.
- An unrelated `outputs/` business-case workbook folder.

The eight Task 15 files must be preserved before fast-forwarding. The unrelated `outputs/` folder must remain untouched and must not be included in the product promotion commit.

## 3. Task 15 parity evidence

The stabilized implementation retains every behavior present in the original uncommitted checkpoint:

- Detects unambiguous month/year worksheet names.
- Requires explicit mapping when the year is absent, including `Payroll September`-style sheets.
- Accepts approved manual worksheet mappings.
- Parses operational payroll sheets and skips PAYE summary sheets.
- Rejects duplicate payroll periods.
- Builds current employee recommendations from the latest payroll plus `Staff Details`.
- Matches employees using reliable employee-number or company-email identifiers.
- Rejects conflicting identifier matches.
- Never commits a fuzzy/name-only match automatically.

Comparison details:

- `parseHistoricalWorkbook.test.ts` is byte-for-byte identical to the original checkpoint.
- The two original reconciliation tests remain in the stabilized suite.
- The original `0032_historical_payroll_import.sql` migration is byte-for-byte identical.
- The stabilized version adds email-only attachment, duplicate-index conflict, explicit review, profile create/enrichment/unchanged/unresolved previews, duplicate-file rollback, row-hash idempotency and approved-history immutability coverage.
- The migration page is routed under HR and protected by `payroll.migrate_history`.

Fresh focused verification on 14 July 2026:

```text
5 test files passed
23 tests passed
```

The hosted historical migration pgTAP suite also passed against `sewbxazwpjbtevckorbl` as part of the full 13-suite Task 11 run.

## 4. Original Task 15 checkpoint preservation

Run these commands only after promotion approval. They create a local safety branch containing exactly the original eight Task 15 files before the canonical branch changes:

```bash
cd "/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0"

git switch -c backup/pre-promotion-task15-2026-07-14
git add \
  src/modules/migrations/pages/HistoricalPayrollMigrationPage.tsx \
  src/modules/migrations/payroll/historicalPayrollImportApi.ts \
  src/modules/migrations/payroll/parseHistoricalWorkbook.test.ts \
  src/modules/migrations/payroll/parseHistoricalWorkbook.worker.ts \
  src/modules/migrations/payroll/reconcileEmployees.test.ts \
  src/modules/migrations/payroll/reconcileEmployees.ts \
  supabase/migrations/0032_historical_payroll_import.sql \
  supabase/tests/historical_payroll_import.sql
git commit -m "backup: preserve original task 15 checkpoint"

git switch feature/foundation
```

Confirm `outputs/` is still present and untracked. Do not add or delete it.

## 5. Canonical Git promotion

Because both folders share the same Git repository, no file copy or patch application is needed. After the checkpoint branch exists:

```bash
cd "/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0"

git merge --ff-only codex/stabilize-tasks-15-22
git rev-parse HEAD
git status --short
```

Before fast-forwarding, record the reviewed branch head with `git rev-parse codex/stabilize-tasks-15-22`. After fast-forwarding, `git rev-parse HEAD` must match it exactly.

The repository currently has no configured push URL. Promotion is local until an approved remote is added. Do not invent or replace a remote during cutover.

If Git refuses because an overlapping untracked Task 15 file remains, stop. Confirm it exists on `backup/pre-promotion-task15-2026-07-14`, then remove only that verified duplicate and retry the fast-forward. Never use `git reset --hard`, `git clean -fd` or broad deletion.

## 6. Pending original-project migrations

The original hosted project `kgntxnwvnayhjpsoauuj` was checked read-only on 14 July 2026 and is current through migration `0032`. The following 23 migrations would be applied:

| Migration | Purpose |
|---|---|
| `0033_inventory.sql` | Inventory and warehouse tables |
| `0034_inventory_rpcs.sql` | Atomic receive, request, approve, issue and return functions |
| `0035_inventory_adjustment.sql` | Audited stock adjustments |
| `0036_fix_for_update_aggregates.sql` | Safe row locking before stock aggregation |
| `0037_warehouse_approval_routing.sql` | Configurable manager/CFO routing and UGX threshold |
| `0038_inventory_bulk_import.sql` | Controlled item, asset and receipt bulk operations |
| `0039_projects_and_daily_updates.sql` | Projects, assignments, field updates and revisions |
| `0040_fix_projects_rls_recursion.sql` | Non-recursive project RLS policies |
| `0041_cash_advances.sql` | Cash request, expense and return ledgers |
| `0042_cash_advance_rpcs.sql` | Cash approval, disbursement and accountability functions |
| `0043_reports_audit.sql` | Report permissions and export audit events |
| `0050_notifications.sql` | In-app notification foundation |
| `0051_harden_notifications.sql` | Notification constraints, privacy and idempotency |
| `0052_fix_revokes.sql` | Restrict notification creation to trusted server paths |
| `0053_harden_cash_authorization.sql` | Force cash ledger writes through permission-checked RPCs |
| `0054_enforce_cash_accounting.sql` | Serialize cash changes and enforce reconciliation invariants |
| `0055_add_cash_corrections.sql` | Audited reopen, reversal and correction workflow |
| `0056_harden_inventory_workflows.sql` | Inventory state-machine and receipt replay protections |
| `0057_add_asset_custody.sql` | Asset custody, transfers and exact QR issue workflow |
| `0058_fix_report_permissions.sql` | Correct canonical HR report-role grants |
| `0059_fix_historical_employee_reconciliation.sql` | Atomic reviewed employee/profile migration fixes |
| `0060_harden_notification_delivery.sql` | Delivery queue, preferences and fail-closed email setup |
| `0061_recover_notification_delivery_claims.sql` | Recovery of stale notification worker claims |

Before applying them, run a dry-run from the canonical repository and confirm the project reference:

```bash
cd "/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0"
test "$(cat supabase/.temp/project-ref)" = "kgntxnwvnayhjpsoauuj"
npx supabase db push --linked --dry-run
```

Stop if the project reference differs or the dry-run contains anything outside migrations `0033`–`0061`.

## 7. Backup checklist before database promotion

Database and Storage backups are separate. Complete and verify both.

### PostgreSQL

- Put the client application into a short maintenance window.
- Record current migration ledger, table counts and reconciliation totals.
- Create an encrypted/custom-format `pg_dump` of the original project.
- Verify the dump can be listed with `pg_restore --list`.
- Store the dump outside the repository with owner-only filesystem permissions.
- Record its filename, timestamp, size and SHA-256 checksum in the cutover notes.
- Perform a restore rehearsal into a disposable/staging database before production cutover.

Suggested interactive pattern; it does not echo or commit the password:

```bash
cd "/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0"
umask 077
mkdir -p "$HOME/OneHub-Backups/2026-07-14"
read -s "PGPASSWORD?Enter ORIGINAL Supabase DATABASE password: "
export PGPASSWORD
pg_dump "$(cat supabase/.temp/pooler-url)" \
  --format=custom --no-owner --no-acl \
  --file "$HOME/OneHub-Backups/2026-07-14/original-before-tasks-15-22.dump"
unset PGPASSWORD
pg_restore --list "$HOME/OneHub-Backups/2026-07-14/original-before-tasks-15-22.dump" >/dev/null
shasum -a 256 "$HOME/OneHub-Backups/2026-07-14/original-before-tasks-15-22.dump"
```

### Supabase Storage

- Export an inventory of every bucket and object path.
- Download every object from private buckets using an authorized server-side process.
- Preserve content type, byte size and checksum in a manifest.
- Verify a sample of HR documents, receipts, evidence and payroll files opens correctly.
- Store the object archive beside the database dump, encrypted and outside Git.

Database dumps do not contain Storage objects; a database-only backup is not sufficient.

## 8. Rehearsal and production application order

1. Restore the backup into a disposable rehearsal project.
2. Apply migrations `0033`–`0061` there.
3. Run all 13 hosted SQL suites against the rehearsal project.
4. Run employee/payroll migration preview without committing production data.
5. Reconcile employee, payroll, inventory and outstanding-cash totals.
6. Obtain owner approval for the production window.
7. Confirm the production reference is `kgntxnwvnayhjpsoauuj`.
8. Apply the migrations using `npx supabase db push --linked`.
9. Run schema lint and the full hosted SQL suite.
10. Deploy the verified application build and run the role-based smoke checks.
11. Keep email delivery disabled until the Resend domain and secrets are deliberately configured.

## 9. Post-promotion verification

Run from the canonical repository:

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

Then confirm:

- Migration ledger matches through `0061`.
- All 13 hosted SQL suites pass.
- Super-admin MFA and access context work.
- HR navigation exposes Employees, Payroll and protected migration only to permitted roles.
- Payroll export and personal payslip routes work without exposing company totals.
- Inventory request, escalation, issue, custody and return flows reconcile.
- Project cash request, warning override, expense exception, return and correction flows reconcile.
- Notifications remain in-app-only until email is intentionally enabled.
- No production route uses mock data.

## 10. Rollback plan

### Application-only rollback

- Keep `backup/pre-promotion-task15-2026-07-14` and the pre-promotion tag/commit reference.
- If the new application fails before database promotion, point deployment back to commit `e5407cc`.
- If migrations have already been applied, do not assume the old client is compatible with hardened permissions and RLS changes; validate it against the restored rehearsal project first.

### Database rollback

- Do not improvise reverse/down migrations on the live database.
- Stop writes and preserve a forensic dump of the failed state.
- Restore the verified pre-promotion dump into a clean Supabase project/database.
- Restore the Storage archive separately.
- Reconfigure the deployment to the restored project only after row counts, payroll totals, stock balances and outstanding cash reconcile.
- Keep the failed project isolated until the incident and audit trail are reviewed.

Because migrations `0053`–`0061` deliberately tighten permissions and workflow invariants, restoring the verified pre-promotion state is safer than attempting a partial rollback.

## 11. Explicit approval required

Preparation is complete when this document and the Task 11 evidence are committed. The next agent must stop and ask the owner before:

- modifying `feature/foundation`;
- applying migrations to `kgntxnwvnayhjpsoauuj`;
- changing production environment variables;
- configuring Resend or enabling email delivery;
- deploying or switching client traffic.
