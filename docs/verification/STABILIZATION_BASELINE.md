# Tasks 15–22 Stabilization Baseline

**Date:** 13 July 2026  
**Branch:** `codex/stabilize-tasks-15-22`  
**Supabase project:** `sewbxazwpjbtevckorbl` (`Egypro Onehub Antigravity`)

## Isolation

- The stabilization worktree is linked only to the Antigravity Supabase project.
- The original Supabase project `kgntxnwvnayhjpsoauuj` was not changed.
- The canonical repository working tree at `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0` was not changed.
- The Antigravity continuation repository was not changed.

## Migration and Database Baseline

- Local and hosted migrations match from `0001` through `0052`.
- `0052_fix_revokes.sql` is already present in hosted history.
- Linked database lint reports one pre-existing warning: `rpc_bulk_opening_stock` declares but never reads `v_ref`.

## Hosted Database Tests

All existing suites complete successfully inside rollback transactions after correcting two defects in the test harness itself:

- `cash_advances.sql`: 22 assertions passed.
- `employee_imports.sql`: all transactional `DO` checks passed.
- `historical_payroll_import.sql`: 14 assertions passed.
- `hr_rls.sql`: 32 assertions passed.
- `identity_rls.sql`: 35 assertions passed.
- `inventory_workflow.sql`: 39 assertions passed.
- `notifications_policy.sql`: 33 assertions passed.
- `payroll_exports.sql`: 6 assertions passed.
- `payroll_workflow.sql`: 42 assertions passed.
- `projects_workflow.sql`: 22 assertions passed.
- `reports_audit.sql`: 10 assertions passed.
- `storage_rls.sql`: 13 assertions passed.
- `warehouse_approval_routing.sql`: 18 assertions passed.

Total pgTAP assertions: **286 passed**.

### Test-harness corrections

1. `cash_advances.sql` contained a bare PL/pgSQL `DECLARE` block in a SQL file and planned 21 assertions while containing 22. It was replaced with valid SQL pgTAP assertions.
2. `projects_workflow.sql` checked a hardcoded date before the test assignment existed and on which an endorsed update was already present. The missed-update assertion now uses `current_date`.

Neither correction changed production database behavior.

## Frontend Baseline

- `npm ci`: completed; zero package vulnerabilities reported.
- `npm run verify`: passed.
- TypeScript: passed.
- ESLint: passed.
- Vitest: 41 files and 136 tests passed.
- Production build: passed with pre-existing chunk-size warnings.
- Playwright: 5 tests passed.

## Baseline Conclusion

The continuation is reproducibly green under its existing tests. Stabilization tests added after this checkpoint must first fail against this baseline for the reviewed defect, then pass only after the corresponding additive migration or application correction.
