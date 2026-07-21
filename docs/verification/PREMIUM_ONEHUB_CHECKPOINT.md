# Premium OneHub Checkpoint

**Date:** 21 July 2026
**Branch:** `codex/stabilize-tasks-15-22`
**Scope:** premium whole-application presentation, role-aware dashboards, visual reports and responsive route coverage

## Implemented

- Shared premium tokens, surfaces, metrics, activities, actions, tables, modals and accessible chart primitives.
- Premium desktop, tablet and mobile shell with grouped navigation, role identity and numeric notification counts.
- Role-aware home compositions for HR, MD/CFO, Warehouse Manager, Project Manager, Coordinator and Employee access profiles.
- Visual Reports & Audits workspaces using authorised domain aggregates and drill-down destinations.
- Premium route coverage across Projects, Daily Tracker, Inventory, Project Cash, HR, payroll, employee self-service, authentication and administration.
- Refreshed responsive evidence at 1440 px, 1024 px and 390 px.

## Fresh verification evidence

| Check | Result |
| --- | --- |
| TypeScript | Pass — `npm run typecheck` |
| ESLint | Pass — `npm run lint` |
| Unit/component suites | Pass — 104 files, 368 tests |
| Browser acceptance | Pass — 14 Playwright journeys |
| Production build | Pass — Vite production output generated |
| Diff whitespace check | Pass — `git diff --check` |

The production build continues to report a non-blocking size warning for the existing payslip/export bundle. Route-level code splitting is already active; further PDF/export splitting is a performance optimisation, not an acceptance blocker.

## Hosted database verification

| Check | Result |
| --- | --- |
| Linked database acceptance | Pass — all 23 rollback-safe SQL suites |
| Hosted schema lint | Pass — no schema errors found |
| Migration parity | Pass — local versions exactly match `supabase_migrations.schema_migrations` |

Four acceptance fixtures were made safe for a populated hosted database without weakening production rules:

- Leave and staff-advance list assertions now identify their synthetic records instead of counting unrelated live records.
- Storage policy assertions now identify their synthetic object instead of counting legitimate files already in the private bucket.
- Warehouse approval routing now seeds canonical receipt valuations before testing threshold decisions, matching the production rule that ignores requester-entered price estimates.

The Supabase management API still returns HTTP 403 for `migration list` because the configured token lacks that platform endpoint privilege. Migration parity was therefore verified directly against the hosted migration ledger. The acceptance suites roll back their fixtures, and no hosted migration or deployment was performed during this verification.
