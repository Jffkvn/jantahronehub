# Projects Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a standalone, role-safe Projects workspace where CFOs and Project Managers can create projects, CFOs can assign a PM later, multiple coordinators can be assigned, coordinators submit daily updates only for their projects, PMs review those updates, and each project presents reconciled Cash and Inventory information from the canonical ledgers.

**Architecture:** PostgreSQL remains the authorization and workflow boundary. Granular permissions and security-definer RPCs create or change projects atomically, enforce one active PM, preserve assignment history and reasons, and expose small role-aware aggregate queries; React consumes those typed contracts through independently loaded Projects panels. Projects becomes its own module and route tree, while Daily Tracker remains an action queue and Cash and Inventory retain ownership of their ledgers.

**Tech Stack:** React 19, TypeScript, React Router, React Hook Form, Zod, TanStack Query, Supabase PostgreSQL/RLS/RPC/Storage, Vitest, Testing Library, pgTAP, Playwright.

---

## Execution prerequisites and boundaries

1. Work from the stabilized repository only.
2. Do not begin implementation until the deployed HR Setup work in migrations `0064`–`0066` is committed, the populated-database fixtures pass, and `git status --short` is clean.
3. Complete the acceptance-blocking role mismatch checkpoint before this plan. This plan reserves migration numbers `0068`–`0071` on the assumption that the role checkpoint uses `0067`. If the next available number differs, rename every migration in this plan before applying any of them; never rename an applied migration.
4. Use the legacy Egypro applications only as read-only visual references.
5. Run every database test against the designated OneHub test project, never an unrelated production database.
6. Keep commits scoped to the task that just passed. Do not combine unrelated HR, Reports or Warehouse redesign work with Projects commits.

## Task 1: Confirm the clean baseline and freeze the security contract

**Files:**

- Read: `docs/plans/2026-07-15-projects-workspace-design.md`
- Read: `supabase/migrations/0039_projects_and_daily_updates.sql`
- Read: `supabase/migrations/0040_fix_projects_rls_recursion.sql`
- Read: `supabase/migrations/0041_cash_advances.sql`
- Read: `supabase/migrations/0057_add_asset_custody.sql`
- Read: `src/config/modules.ts`
- Read: `src/modules/auth/AuthGateway.ts`

### Step 1: Verify the prerequisite checkpoint

Run:

```bash
git status --short
git log -5 --oneline --decorate
npm run verify
npm run test:e2e
```

Expected: no uncommitted HR Setup work, the current application verification passes, and the existing Playwright suite passes.

### Step 2: Verify the populated-database baseline

Run all 16 existing SQL suites before adding Projects assertions:

```bash
for test_file in supabase/tests/*.sql; do
  psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f "$test_file" || exit 1
done
```

Expected: every suite passes and rolls back. Stop if a fixture relies on global row counts or globally unique names; repair the fixture in its own checkpoint before Projects work.

### Step 3: Record the implementation invariants in the working notes

Use these rules throughout the plan:

- never grant `projects.manage` to `project_manager`;
- remove the stale CFO dependence on broad `projects.manage` and use granular create/assign/read permissions;
- an assigned PM can update their project and assign coordinators, but cannot appoint or replace the primary PM;
- a CFO can create a project without a PM, assign coordinators, and appoint or replace the PM later;
- a PM-created project atomically assigns that PM as its primary PM;
- coordinators submit only when they have an active coordinator assignment;
- CFO and MD oversight does not imply PM endorsement authority;
- project list and summary functions return aggregates, not unrestricted underlying cash or personnel rows;
- all test assertions scope their rows by deterministic IDs instead of assuming an empty database.

No commit is required for this task.

## Task 2: Add the granular project authorization and workflow foundation

**Files:**

- Modify: `supabase/tests/projects_workflow.sql`
- Create: `supabase/migrations/0068_projects_operational_foundation.sql`

### Step 1: Write the failing pgTAP contract

Extend `supabase/tests/projects_workflow.sql` with deterministic, rollback-safe assertions for:

- permissions `projects.create`, `projects.assign_all`, `projects.update_all` and `projects.read_operational`;
- `projects.create` granted to `super_admin`, `cfo` and `project_manager` only;
- `projects.assign_all` granted to `super_admin` and `cfo` only;
- `projects.update_all` granted only to `super_admin`;
- stale CFO `projects.manage` and `daily_updates.endorse` grants removed;
- stale HR Admin project-wide access removed unless explicitly restored by a later approved requirement;
- expanded project fields and allowed statuses;
- a unique project code;
- no more than one active `pm` assignment per project;
- multiple active coordinator assignments;
- assignment actor, assignment reason, end actor and end reason retained after reassignment;
- Project Manager creation atomically assigns the caller as PM;
- CFO creation succeeds with coordinators and no PM;
- CFO can appoint a PM later;
- an assigned PM can add or remove coordinators with a reason;
- an assigned PM cannot appoint, replace or remove the primary PM;
- unauthorized users cannot create, update or assign by direct table calls or RPC calls;
- direct authenticated insert/update privileges are revoked from `projects` and `project_assignments`;
- only an active coordinator assignment satisfies daily-update creation;
- only the assigned PM can endorse or request revision;
- mutation RPCs append `audit_events` without exposing sensitive payloads;
- all failed multi-row operations roll back completely.

Use unique fixed UUIDs and filter every count by those UUIDs. Replace the old assertion that PM creation fails.

### Step 2: Run the focused test and confirm red

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/projects_workflow.sql
```

Expected: FAIL because the new permissions, columns and RPCs do not exist.

### Step 3: Implement the schema additions

In `0068_projects_operational_foundation.sql`:

- add `project_code`, `client_name`, `planned_start_date`, `expected_end_date`, `actual_completion_date`, `contract_reference`, `budget_reference`, `operational_notes` and `updated_by` to `projects`;
- expand status to `planned`, `active`, `on_hold`, `completed`, `cancelled` and `archived` while preserving existing rows;
- retain `health_status` values `on_track`, `needs_attention` and `at_risk`;
- add case-insensitive unique project-code enforcement and list/filter indexes;
- add `assigned_by`, `assignment_reason`, `unassigned_by` and `unassignment_reason` to `project_assignments`;
- add a partial unique index on `project_id` where `role_on_project = 'pm' and unassigned_at is null`;
- add or replace `is_coordinator_on_project(project_id, user_id)` and keep helper functions `security definer`, stable, with an empty search path;
- revoke direct authenticated writes on `projects` and `project_assignments`.

Before creating the one-PM index, detect duplicate active PMs and raise an actionable exception rather than silently deleting history.

### Step 4: Implement granular permissions and candidate lookup

Add and grant the new permission rows. Explicitly remove obsolete CFO and HR grants described by the test.

Create `rpc_list_project_assignment_candidates()` returning only active profiles that currently hold `project_manager` or `coordinator`, with role keys sufficient for UI filtering. It must require project creation or assignment authority and must not return emails or employee-confidential fields.

### Step 5: Implement atomic project and assignment RPCs

Create:

```sql
rpc_create_project(p_project jsonb, p_primary_pm_id uuid, p_coordinator_ids uuid[], p_reason text) returns uuid
rpc_update_project(p_project_id uuid, p_changes jsonb, p_reason text) returns void
rpc_assign_project_member(p_project_id uuid, p_user_id uuid, p_project_role text, p_reason text) returns uuid
rpc_unassign_project_member(p_assignment_id uuid, p_reason text) returns void
```

Each function must:

- derive the actor from `current_profile_id()`;
- validate a trimmed reason;
- whitelist accepted JSON keys and reject unknown keys;
- validate that an assignee holds the corresponding account role;
- enforce the CFO/PM/super-admin authority matrix;
- lock the project or active PM assignment before replacing it;
- preserve prior assignment rows by ending them instead of deleting;
- append an audit event in the same transaction;
- revoke execute from `public` and `anon`, then grant only to `authenticated`.

`rpc_update_project` must not perform completion, cancellation, archive, reopen or reverse-status transitions. Those transitions are added after Cash and Inventory safeguards exist.

### Step 6: Harden Daily Tracker writes

Replace broad direct daily-update mutation with explicit functions:

```sql
rpc_save_daily_update(p_update_id uuid, p_project_id uuid, p_update_date date, p_summary text, p_photo_urls text[], p_submit boolean) returns uuid
rpc_review_daily_update(p_update_id uuid, p_decision text, p_feedback text) returns void
```

The save function must require an active coordinator assignment for the target project and allow revision only by the original coordinator while still assigned. The review function must accept only `endorse` or `request_revision`, require the active primary PM except for super-admin support, and require feedback for a revision request. Revoke direct authenticated updates after the RPC contract is in place.

### Step 7: Verify and commit

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/projects_workflow.sql
npx supabase db lint --linked --level warning
git diff --check
git add supabase/migrations/0068_projects_operational_foundation.sql supabase/tests/projects_workflow.sql
git commit -m "feat: secure project creation and assignments"
```

Expected: the focused pgTAP suite passes and lint introduces no new warning.

## Task 3: Freeze the typed Projects API contract

**Files:**

- Modify: `src/modules/projects/schemas/project.ts`
- Replace: `src/modules/projects/api/projects.ts`
- Create: `src/modules/projects/api/projects.test.ts`
- Create: `src/modules/projects/types.ts`

### Step 1: Write failing adapter tests

Test:

- all expanded project fields and six statuses parse correctly;
- invalid project code, reversed dates and unsupported status values fail locally;
- creation normalizes text, coordinator IDs are de-duplicated, and a reason is required;
- PM and coordinator candidates remain distinct;
- RPC snake-case payloads map to stable application models;
- unknown or confidential fields are discarded;
- Supabase errors become safe actionable messages;
- create, update, assign, unassign, save-update and review-update call only the new RPCs;
- no API method writes directly to protected project tables.

### Step 2: Confirm red

```bash
npm run test:unit -- src/modules/projects/api/projects.test.ts
```

Expected: FAIL because the new models and RPC adapter do not exist.

### Step 3: Implement the minimum adapter

Define separate models for:

- `ProjectListItem`;
- `ProjectDetail`;
- `ProjectAssignment` and assignment history;
- `ProjectCandidate`;
- `DailyUpdate` and revision history;
- create/update/assignment commands.

Keep React Query keys centralized and project-scoped. Do not place Cash or Inventory ledger calculations in this adapter.

### Step 4: Verify and commit

```bash
npm run test:unit -- src/modules/projects/api/projects.test.ts
npm run typecheck
git add src/modules/projects/api/projects.ts src/modules/projects/api/projects.test.ts src/modules/projects/schemas/project.ts src/modules/projects/types.ts
git commit -m "feat: add typed projects workflow API"
```

## Task 4: Build the reusable dropdown contract

**Files:**

- Create: `src/components/ui/Combobox.tsx`
- Create: `src/components/ui/Combobox.test.tsx`
- Create: `src/components/ui/MultiCombobox.tsx`
- Create: `src/components/ui/MultiCombobox.test.tsx`
- Modify: `src/styles/global.css`

### Step 1: Write failing accessibility and interaction tests

For the single combobox, prove:

- label association and `role="combobox"`;
- `aria-expanded`, `aria-controls` and active-option state;
- typing filters options;
- Arrow keys, Enter, Escape, Home and End work;
- disabled and error states are announced;
- clicking outside closes the list without losing a completed selection.

For the multi-combobox, additionally prove:

- multiple coordinators can be selected without duplicates;
- selected values render as removable chips;
- Backspace removes the last chip only when the search field is empty;
- removing a chip restores that option to the list;
- screen-reader status announces result and selection counts.

### Step 2: Confirm red

```bash
npm run test:unit -- src/components/ui/Combobox.test.tsx src/components/ui/MultiCombobox.test.tsx
```

### Step 3: Implement the components and reference styling

Use the approved legacy visual language: restrained uppercase labels, soft surface, rounded border, right chevron, navy/emerald focus ring and 120–180 ms transitions. Keep short fixed choices as native selects; use these components only for searchable PM/coordinator/project datasets.

Do not add an external component library. Preserve native buttons, visible focus, touch-sized targets and normal React text rendering.

### Step 4: Verify and commit

```bash
npm run test:unit -- src/components/ui/Combobox.test.tsx src/components/ui/MultiCombobox.test.tsx
npm run typecheck
npm run lint
git add src/components/ui/Combobox.tsx src/components/ui/Combobox.test.tsx src/components/ui/MultiCombobox.tsx src/components/ui/MultiCombobox.test.tsx src/styles/global.css
git commit -m "feat: add accessible project assignment pickers"
```

## Task 5: Add the standalone Projects module and protected route tree

**Files:**

- Modify: `src/config/modules.ts`
- Modify: `src/modules/auth/AuthGateway.ts`
- Modify: `src/modules/auth/AuthGateway.test.tsx`
- Modify: `src/modules/auth/RequirePermission.tsx`
- Create: `src/modules/auth/RequirePermission.test.tsx`
- Modify: `src/layout/AppShell.test.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/app/router.test.tsx`
- Create: `src/modules/projects/ProjectsPage.tsx`
- Create: `src/modules/projects/ProjectsPage.test.tsx`

### Step 1: Write failing module and route tests

Prove:

- `projects` is a recognized `ModuleKey` in access-context parsing;
- Projects and Daily Tracker are distinct navigation entries in the approved order;
- enabled-module filtering includes Projects only when `modules.enabled` contains `projects`;
- CFO, PM, coordinator, MD and super admin can open the appropriate Projects route;
- Warehouse Manager can open the limited operational project identity view;
- unrelated roles cannot open `/projects` by typing the URL;
- `RequirePermission` supports an `anyOf` contract without weakening existing `allOf` checks;
- direct loads, nested tab routes and unknown Projects paths resolve predictably.

### Step 2: Confirm red

```bash
npm run test:unit -- src/modules/auth/AuthGateway.test.tsx src/modules/auth/RequirePermission.test.tsx src/layout/AppShell.test.tsx src/app/router.test.tsx src/modules/projects/ProjectsPage.test.tsx
```

### Step 3: Add the module key end to end

Add `projects` to:

- `ModuleKey` and `oneHubModules` in `src/config/modules.ts`;
- the `moduleKeys` Zod enum in `AuthGateway.ts`;
- the `modules.enabled` JSON array in migration `0068_projects_operational_foundation.sql` using an idempotent update.

Do not repurpose the existing `tracker` key. Projects owns `/projects/*`; Daily Tracker keeps `/tracker/*`.

### Step 4: Add route-level authorization

Lazy-load `ProjectsPage`. Add guarded routes for:

```text
/projects
/projects/new
/projects/:projectId/summary
/projects/:projectId/team
/projects/:projectId/updates
/projects/:projectId/cash
/projects/:projectId/inventory
/projects/:projectId/documents
/projects/:projectId/history
```

Keep database authorization as the final boundary. Add temporary redirects from `/tracker/projects/:projectId` to `/projects/:projectId/summary` so existing bookmarks do not break.

### Step 5: Verify and commit

```bash
npm run test:unit -- src/modules/auth/AuthGateway.test.tsx src/modules/auth/RequirePermission.test.tsx src/layout/AppShell.test.tsx src/app/router.test.tsx src/modules/projects/ProjectsPage.test.tsx
npm run typecheck
git add src/config/modules.ts src/modules/auth src/layout/AppShell.test.tsx src/app/router.tsx src/app/router.test.tsx src/modules/projects/ProjectsPage.tsx src/modules/projects/ProjectsPage.test.tsx supabase/migrations/0068_projects_operational_foundation.sql
git commit -m "feat: add standalone projects navigation"
```

## Task 6: Build the project directory and dedicated creation page

**Files:**

- Create: `src/modules/projects/pages/ProjectsListPage.tsx`
- Create: `src/modules/projects/pages/ProjectsListPage.test.tsx`
- Create: `src/modules/projects/pages/CreateProjectPage.tsx`
- Create: `src/modules/projects/pages/CreateProjectPage.test.tsx`
- Create: `src/modules/projects/hooks/useProjectDraft.ts`
- Create: `src/modules/projects/hooks/useProjectDraft.test.tsx`
- Modify: `src/modules/projects/ProjectsPage.tsx`
- Modify: `src/styles/global.css`

### Step 1: Write failing list tests

Test loading skeletons, independent error/retry state, empty state, search, status/health/PM/coordinator/date filters, sort controls, pagination, active/at-risk/on-hold/completed counts and links to the canonical summary route. Verify Create Project appears only with `projects.create`.

### Step 2: Write failing creation and draft-preservation tests

Test:

- the dedicated `/projects/new` route, never a modal;
- all approved project fields and section headings;
- CFO can select no PM and multiple coordinators;
- Project Manager sees themselves as the fixed primary PM and can select multiple coordinators;
- unauthorized roles do not render or submit the form;
- validation and server failures preserve entered values;
- a background auth/access refresh does not remount or clear the form;
- session-scoped draft restoration survives a safe route remount;
- destructive navigation and `beforeunload` warn when dirty;
- success clears the draft and navigates to the new project summary.

### Step 3: Confirm red

```bash
npm run test:unit -- src/modules/projects/pages/ProjectsListPage.test.tsx src/modules/projects/pages/CreateProjectPage.test.tsx src/modules/projects/hooks/useProjectDraft.test.tsx
```

### Step 4: Implement the list and creation flow

Use server-side list parameters rather than loading entire domain ledgers. Use native selects for status/health and the reusable comboboxes for PM/coordinators. Store only non-sensitive form values in `sessionStorage`, namespaced by active profile ID, and clear them on success or explicit discard.

### Step 5: Verify and commit

```bash
npm run test:unit -- src/modules/projects/pages/ProjectsListPage.test.tsx src/modules/projects/pages/CreateProjectPage.test.tsx src/modules/projects/hooks/useProjectDraft.test.tsx
npm run typecheck
npm run lint
git add src/modules/projects/pages/ProjectsListPage.tsx src/modules/projects/pages/ProjectsListPage.test.tsx src/modules/projects/pages/CreateProjectPage.tsx src/modules/projects/pages/CreateProjectPage.test.tsx src/modules/projects/hooks src/modules/projects/ProjectsPage.tsx src/styles/global.css
git commit -m "feat: add project directory and creation flow"
```

## Task 7: Build the canonical workspace shell and Team tab

**Files:**

- Create: `src/modules/projects/pages/ProjectWorkspacePage.tsx`
- Create: `src/modules/projects/pages/ProjectWorkspacePage.test.tsx`
- Create: `src/modules/projects/pages/ProjectTeamTab.tsx`
- Create: `src/modules/projects/pages/ProjectTeamTab.test.tsx`
- Modify: `src/modules/projects/ProjectsPage.tsx`
- Remove after redirects are proven: `src/modules/projects/pages/OverviewTab.tsx`
- Remove after redirects are proven: `src/modules/projects/pages/ProjectDetailsTab.tsx`

### Step 1: Write failing workspace tests

Prove the project identity header and stable Summary, Team, Daily Updates, Cash, Inventory & Equipment, Documents and History links. Verify direct loads, back/forward navigation, mobile overflow and a not-found state.

### Step 2: Write failing Team tests

Prove:

- one primary PM and multiple coordinators are displayed separately;
- history shows assignment start/end, actor and reason;
- CFO can appoint or replace the PM and manage coordinators;
- assigned PM can manage coordinators only;
- PM assignment controls are absent for an assigned PM;
- MD, coordinator and Warehouse Manager receive read-only views appropriate to their access;
- every assign/unassign/replace operation requires a reason;
- duplicate assignment and stale-concurrency errors preserve the form and explain the conflict.

### Step 3: Implement and verify

```bash
npm run test:unit -- src/modules/projects/pages/ProjectWorkspacePage.test.tsx src/modules/projects/pages/ProjectTeamTab.test.tsx src/modules/projects/ProjectsPage.test.tsx
npm run typecheck
```

### Step 4: Commit

```bash
git add src/modules/projects
git commit -m "feat: add project workspace and team management"
```

## Task 8: Separate Daily Tracker submission and PM review queues

**Files:**

- Modify: `src/modules/projects/TrackerPage.tsx`
- Modify: `src/modules/projects/TrackerPage.test.tsx`
- Replace: `src/modules/projects/pages/DailyUpdatesTab.tsx`
- Create: `src/modules/projects/pages/DailyUpdatesTab.test.tsx`
- Modify: `src/modules/projects/pages/MissedUpdatesTab.tsx`
- Create: `src/modules/projects/pages/MissedUpdatesTab.test.tsx`
- Create: `src/modules/projects/pages/ProjectUpdatesTab.tsx`
- Create: `src/modules/projects/pages/ProjectUpdatesTab.test.tsx`

### Step 1: Write failing queue tests

Test:

- a coordinator sees only actively assigned projects requiring an update, drafts, revisions and recent submissions;
- a coordinator cannot select or submit against an unassigned project;
- draft, submit, revise and resubmit call `rpc_save_daily_update` with the intended status;
- a PM sees submitted updates only for projects they actively manage;
- PM Endorse and Request Revision controls are based on `daily_updates.endorse` plus active PM assignment, not `projects.manage`;
- CFO and MD monitoring views do not receive PM review controls;
- project links open `/projects/:id/updates`;
- missing-update monitoring is scoped and retryable;
- Project Updates shows author, date, evidence, feedback and revision history.

### Step 2: Confirm red

```bash
npm run test:unit -- src/modules/projects/TrackerPage.test.tsx src/modules/projects/pages/DailyUpdatesTab.test.tsx src/modules/projects/pages/MissedUpdatesTab.test.tsx src/modules/projects/pages/ProjectUpdatesTab.test.tsx
```

### Step 3: Implement and verify

Remove the assumption that every RLS-visible project is coordinatable. Fetch explicit action queues from authorized RPCs. Remove `setTimeout` state synchronization; pass the desired draft/submitted decision directly to the mutation.

```bash
npm run test:unit -- src/modules/projects/TrackerPage.test.tsx src/modules/projects/pages/DailyUpdatesTab.test.tsx src/modules/projects/pages/MissedUpdatesTab.test.tsx src/modules/projects/pages/ProjectUpdatesTab.test.tsx
npm run typecheck
npm run lint
```

### Step 4: Commit

```bash
git add src/modules/projects
git commit -m "feat: connect project daily update queues"
```

## Task 9: Add canonical Project Cash aggregates

**Files:**

- Modify: `supabase/tests/cash_advances.sql`
- Create: `supabase/tests/project_summaries.sql`
- Create: `supabase/migrations/0069_project_cash_summary.sql`
- Create: `src/modules/projects/api/projectSummaries.ts`
- Create: `src/modules/projects/api/projectSummaries.test.ts`
- Create: `src/modules/projects/pages/ProjectCashTab.tsx`
- Create: `src/modules/projects/pages/ProjectCashTab.test.tsx`
- Create: `src/modules/projects/pages/ProjectSummaryTab.tsx`
- Create: `src/modules/projects/pages/ProjectSummaryTab.test.tsx`

### Step 1: Write failing database reconciliation tests

Seed project-scoped requests, accepted and rejected expenses, returns and outstanding balances. Prove `rpc_get_project_cash_summary(project_id)` returns:

- requested;
- approved;
- disbursed;
- accepted expenses;
- returned cash;
- outstanding balance;
- pending-accountability and receipt-exception counts.

Reconcile every value with the canonical cash tables. Prove CFO/MD/super-admin and the assigned PM receive the approved aggregate, coordinators receive only the approved privacy-safe scope, Warehouse Manager receives no cash data, and unrelated users are rejected.

### Step 2: Confirm red

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/project_summaries.sql
```

### Step 3: Implement the aggregate function

Create a small `security definer` RPC with an empty search path and explicit authorization. Do not add totals to `projects`. Do not return receipt URLs, vendors or expense explanations in the summary function. Add project-scoped indexes only when justified by the query plan.

### Step 4: Write failing UI/API tests and implement

Test numeric parsing, empty ledgers, panel-only loading/error/retry, links to canonical Cash records and a reconciliation label. The Project Summary page must continue rendering identity/team/update panels when Cash fails.

### Step 5: Verify and commit

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/cash_advances.sql
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/project_summaries.sql
npm run test:unit -- src/modules/projects/api/projectSummaries.test.ts src/modules/projects/pages/ProjectCashTab.test.tsx src/modules/projects/pages/ProjectSummaryTab.test.tsx
npm run typecheck
git add supabase/migrations/0069_project_cash_summary.sql supabase/tests/cash_advances.sql supabase/tests/project_summaries.sql src/modules/projects/api/projectSummaries.ts src/modules/projects/api/projectSummaries.test.ts src/modules/projects/pages/ProjectCashTab.tsx src/modules/projects/pages/ProjectCashTab.test.tsx src/modules/projects/pages/ProjectSummaryTab.tsx src/modules/projects/pages/ProjectSummaryTab.test.tsx
git commit -m "feat: add reconciled project cash summaries"
```

## Task 10: Link Inventory requests and custody to canonical projects

**Files:**

- Modify: `supabase/tests/inventory_workflow.sql`
- Modify: `supabase/tests/warehouse_approval_routing.sql`
- Create: `supabase/migrations/0070_inventory_project_links.sql`
- Modify: `src/modules/warehouse/api/inventory.ts`
- Create or modify: `src/modules/warehouse/api/inventory.test.ts`
- Modify: `src/modules/warehouse/pages/RequestsPage.tsx`
- Modify or create: `src/modules/warehouse/pages/RequestsPage.test.tsx`
- Modify: `src/modules/warehouse/components/ScannerModal.tsx`
- Modify: `src/modules/warehouse/components/ScannerModal.test.tsx`

### Step 1: Write failing canonical-link tests

Prove:

- `stock_requests.project_id` and `asset_custody.project_id` reference `projects`;
- new stock requests require a valid canonical project ID;
- PM/coordinator requesters can request only for actively assigned projects;
- Warehouse/CFO processing can read the project identity needed for fulfilment;
- the stored `project_name` remains a historical display snapshot but is never authoritative;
- legacy rows backfill only when one normalized project-name match exists;
- unresolved legacy rows remain visible to an explicit reconciliation query instead of being attached arbitrarily;
- equipment request lines can record an expected return date;
- issue and custody transfer preserve project ID and expected return;
- old name-based RPC overloads either resolve one canonical project or reject the request; they cannot create new unlinked rows.

### Step 2: Confirm red

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/inventory_workflow.sql
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/warehouse_approval_routing.sql
```

### Step 3: Implement the migration

Add nullable `project_id` to historical tables, indexes, best-effort backfill and new-write enforcement through RPCs. Add `expected_return_date` to equipment request/custody data. Replace free-text project parameters with UUID parameters in the primary request and transfer functions while retaining a guarded compatibility overload for the deployment transition.

Do not set a blanket `NOT NULL` until the unresolved legacy-row query returns zero on the target database.

### Step 4: Update Warehouse callers test-first

Change request forms from project-name text entry to the reusable searchable project combobox. Preserve the project name only for display. Update scanner and request detail tests for project IDs and expected-return metadata.

### Step 5: Verify and commit

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/inventory_workflow.sql
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/warehouse_approval_routing.sql
npm run test:unit -- src/modules/warehouse/api/inventory.test.ts src/modules/warehouse/pages/RequestsPage.test.tsx src/modules/warehouse/components/ScannerModal.test.tsx
npm run typecheck
git add supabase/migrations/0070_inventory_project_links.sql supabase/tests/inventory_workflow.sql supabase/tests/warehouse_approval_routing.sql src/modules/warehouse
git commit -m "feat: link inventory custody to projects"
```

## Task 11: Add canonical Inventory and Equipment project summaries

**Files:**

- Modify: `supabase/tests/project_summaries.sql`
- Modify: `supabase/migrations/0070_inventory_project_links.sql`
- Modify: `src/modules/projects/api/projectSummaries.ts`
- Modify: `src/modules/projects/api/projectSummaries.test.ts`
- Create: `src/modules/projects/pages/ProjectInventoryTab.tsx`
- Create: `src/modules/projects/pages/ProjectInventoryTab.test.tsx`
- Modify: `src/modules/projects/pages/ProjectSummaryTab.tsx`
- Modify: `src/modules/projects/pages/ProjectSummaryTab.test.tsx`

### Step 1: Write failing reconciliation tests

Prove `rpc_get_project_inventory_summary(project_id)` reconciles with canonical requests, request lines, movements and active custody for:

- request counts by status;
- requested and issued estimated value;
- issued consumable quantities;
- active equipment custody;
- overdue expected returns;
- damaged/lost return warnings;
- unresolved legacy-link count.

Prove an error in Inventory does not suppress Cash, team or update summaries.

### Step 2: Implement the aggregate and panel

Return small aggregates and project-scoped record references, not the whole ledger. Link operational actions back to `/inventory/requests/:id` or the existing canonical Warehouse destination.

### Step 3: Verify and commit

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/project_summaries.sql
npm run test:unit -- src/modules/projects/api/projectSummaries.test.ts src/modules/projects/pages/ProjectInventoryTab.test.tsx src/modules/projects/pages/ProjectSummaryTab.test.tsx
npm run typecheck
git add supabase/migrations/0070_inventory_project_links.sql supabase/tests/project_summaries.sql src/modules/projects/api/projectSummaries.ts src/modules/projects/api/projectSummaries.test.ts src/modules/projects/pages/ProjectInventoryTab.tsx src/modules/projects/pages/ProjectInventoryTab.test.tsx src/modules/projects/pages/ProjectSummaryTab.tsx src/modules/projects/pages/ProjectSummaryTab.test.tsx
git commit -m "feat: add project inventory and custody summaries"
```

## Task 12: Add documents, history and guarded completion

**Files:**

- Modify: `supabase/tests/projects_workflow.sql`
- Modify: `supabase/tests/project_summaries.sql`
- Modify: `supabase/tests/storage_rls.sql`
- Create: `supabase/migrations/0071_project_documents_history_completion.sql`
- Modify: `src/lib/security/privateFiles.ts`
- Modify: `src/lib/security/privateFiles.test.ts`
- Create: `src/modules/projects/pages/ProjectDocumentsTab.tsx`
- Create: `src/modules/projects/pages/ProjectDocumentsTab.test.tsx`
- Create: `src/modules/projects/pages/ProjectHistoryTab.tsx`
- Create: `src/modules/projects/pages/ProjectHistoryTab.test.tsx`
- Create: `src/modules/projects/components/ProjectStatusDialog.tsx`
- Create: `src/modules/projects/components/ProjectStatusDialog.test.tsx`

### Step 1: Write failing database and storage tests

Test:

- project document metadata, allowed MIME types, size and private storage-path layout;
- assigned members and authorized oversight can read permitted project files;
- only authorized PM/CFO/super-admin upload controls are accepted according to the approved role matrix;
- unrelated users cannot read metadata or signed files;
- project history is chronological and includes creation, edits, assignments, daily updates, Cash events and Inventory/custody events without leaking confidential payloads;
- completion returns warnings for outstanding cash, pending accountability, active equipment custody and overdue returns;
- PM can request completion but cannot override Cash or Warehouse exceptions;
- only the appropriate domain owner or super admin can record an override, always with a reason;
- close, cancel, archive, reopen and status reversal preserve a permanent audit reason;
- projects with operational activity are never hard-deleted.

### Step 2: Confirm red

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/projects_workflow.sql
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/project_summaries.sql
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/storage_rls.sql
```

### Step 3: Implement secure documents and history

Create `project_documents` metadata with paths shaped like:

```text
<uploader-profile-id>/projects/<project-id>/<document-id>.<extension>
```

Add project-aware Storage policies, an audited metadata-registration RPC and a role-aware history RPC. Generate signed URLs only after validating the path and metadata authorization.

### Step 4: Implement status checks and transitions

Create:

```sql
rpc_check_project_completion(project_id) returns jsonb
rpc_transition_project_status(project_id, target_status, reason, override_domain, override_reason) returns void
```

Lock the project, re-evaluate canonical Cash and Inventory state inside the transition transaction, reject stale or unauthorized overrides, set actual completion date where applicable and append the audit event atomically.

### Step 5: Implement UI test-first

Show document upload/list/error states, role-safe history, completion warnings and domain-specific resolution links. Never imply that a warning is resolved merely because the dialog closes.

### Step 6: Verify and commit

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/projects_workflow.sql
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/project_summaries.sql
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/storage_rls.sql
npm run test:unit -- src/lib/security/privateFiles.test.ts src/modules/projects/pages/ProjectDocumentsTab.test.tsx src/modules/projects/pages/ProjectHistoryTab.test.tsx src/modules/projects/components/ProjectStatusDialog.test.tsx
npm run typecheck
git add supabase/migrations/0071_project_documents_history_completion.sql supabase/tests/projects_workflow.sql supabase/tests/project_summaries.sql supabase/tests/storage_rls.sql src/lib/security/privateFiles.ts src/lib/security/privateFiles.test.ts src/modules/projects
git commit -m "feat: add project history and completion safeguards"
```

## Task 13: Add role acceptance and end-to-end Projects coverage

**Files:**

- Create: `e2e/projects.spec.ts`
- Modify: `docs/acceptance/ROLE_ACCEPTANCE_TESTS.md`
- Create: `docs/training/PROJECTS_DAILY_TRACKER.md`
- Modify: `src/app/ComponentShowcase.tsx` only if a Projects preview route is required for deterministic E2E data
- Create: `src/app/ProjectsPreview.tsx` only if a preview is required

### Step 1: Write failing Playwright journeys

Cover:

1. CFO creates a project with multiple coordinators and no PM, then assigns the PM later.
2. Project Manager creates a project, is assigned atomically, updates operations and manages coordinators.
3. Coordinator sees the assigned project, submits an update and cannot target an unassigned project.
4. Assigned PM requests revision, coordinator resubmits and PM endorses.
5. MD sees company-wide read-only oversight and no mutation controls.
6. Warehouse Manager sees only operational project identity needed for Inventory work and no Cash or project-edit controls.
7. Project summary shows reconciled Cash and Inventory panels.
8. direct loading, repeated tab navigation and browser back/forward preserve the workspace.
9. creation values survive validation failure and safe background access refresh.
10. PM/coordinator comboboxes work with keyboard and narrow mobile viewport.

### Step 2: Confirm red

```bash
npm run test:e2e -- e2e/projects.spec.ts
```

### Step 3: Implement deterministic preview fixtures only if necessary

Keep preview data fake, local to E2E mode and incapable of bypassing production authorization. Do not add production-only branches for test convenience.

### Step 4: Update acceptance and training evidence

Document exact role journeys and mark only evidence-backed claims as automated passes. Explain the Projects/Daily Tracker distinction, creation authority, team assignment, daily submission/review and links into Cash and Inventory.

### Step 5: Verify and commit

```bash
npm run test:e2e -- e2e/projects.spec.ts
git add e2e/projects.spec.ts docs/acceptance/ROLE_ACCEPTANCE_TESTS.md docs/training/PROJECTS_DAILY_TRACKER.md src/app/ComponentShowcase.tsx src/app/ProjectsPreview.tsx
git commit -m "test: prove projects role workflows"
```

Stage only preview files that were actually required and created.

## Task 14: Full verification, security review and handoff

**Files:**

- Review: every file changed by Tasks 2–13
- Modify only if evidence requires correction: `docs/acceptance/ROLE_ACCEPTANCE_TESTS.md`
- Modify only if evidence requires correction: `docs/training/PROJECTS_DAILY_TRACKER.md`

### Step 1: Run application verification

```bash
npm run verify
npm run test:e2e
npm audit
git diff --check
```

Expected: typecheck, lint, all unit tests, production build, all Playwright tests and audit complete without a new unresolved high-severity issue.

### Step 2: Run all database suites

```bash
for test_file in supabase/tests/*.sql; do
  psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f "$test_file" || exit 1
done
npx supabase db lint --linked --level warning
```

Expected: all 16 original suites plus `project_summaries.sql` pass against the populated designated test database, every suite rolls back, and lint introduces no new warning.

### Step 3: Review the authorization diff manually

Confirm:

- PM never receives broad `projects.manage`;
- CFO assignment authority does not grant operational-edit or PM-review authority;
- MD and Warehouse Manager remain read-only;
- direct table writes cannot bypass project, assignment or Daily Tracker RPCs;
- all security-definer functions use an empty search path, derive the actor and have explicit revokes/grants;
- assignment and status reasons are trimmed, required and audited;
- aggregate functions cannot leak individual confidential Cash details;
- Inventory links use UUIDs and unresolved legacy names remain visible;
- document paths cannot escape their permitted prefix;
- completion checks re-read canonical ledgers inside the transaction;
- UI controls and database enforcement agree for every role.

### Step 4: Review performance and resilience

Confirm project lists are paginated, summary panels load independently, stable data remains visible during refresh, specialist code is lazy-loaded and no summary loads entire Cash or Inventory ledgers. Inspect query plans for new project/cash/inventory aggregate functions on representative populated data.

### Step 5: Align evidence claims

Change acceptance or training claims back to pending if their automated or manual evidence is absent. Record the exact passing commands and test counts in the handoff.

### Step 6: Commit final evidence corrections

If documentation required evidence-only corrections:

```bash
git add docs/acceptance/ROLE_ACCEPTANCE_TESTS.md docs/training/PROJECTS_DAILY_TRACKER.md
git commit -m "docs: align projects acceptance evidence"
```

If no corrections were required, do not create an empty commit.

### Step 7: Request code review before integration

Use `superpowers:requesting-code-review`. Resolve findings test-first, rerun the focused suite for every correction, then rerun Task 14 in full before claiming completion.

## Safe parallel execution map

After Task 2 freezes the database contract, the following work can proceed in isolated worktrees:

- Task 4 dropdown components can run in parallel with Task 3 API work.
- Task 9 Cash aggregation can run in parallel with Task 10 Inventory canonical linking.
- Task 13 acceptance documentation can be drafted while Tasks 11–12 finish, but claims must remain pending until verification exists.

The following must remain sequential:

- Task 2 before all mutation UI;
- Task 5 before standalone page integration;
- Task 10 before Inventory project summaries;
- Tasks 9 and 11 before guarded completion;
- all implementation tasks before final acceptance claims.

Do not run parallel edits against the same working directory. In particular, `src/app/router.tsx`, `src/config/modules.ts`, `src/styles/global.css`, `src/modules/projects/api/projects.ts` and sequential Supabase migration numbers are integration-owner files.
