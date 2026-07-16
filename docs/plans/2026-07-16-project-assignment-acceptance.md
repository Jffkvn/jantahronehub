# Project Assignment Acceptance Corrections Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make project assignments display correctly, notify assigned staff, and appear consistently in Cash and Inventory while improving the Projects form and workspace presentation.

**Architecture:** Extend the guarded Projects database API with a minimal assignment view and atomic notification side effects. Reuse one operational-project eligibility rule in client queries and refine existing Projects components/CSS without redesigning unrelated modules.

**Tech Stack:** PostgreSQL/Supabase RLS and RPCs, React, TypeScript, TanStack Query, Vitest, Playwright, CSS.

---

### Task 1: Guarded assignment names and assignment notifications

**Files:**
- Create: `supabase/migrations/0074_project_assignment_acceptance.sql`
- Modify: `supabase/tests/projects_workflow.sql`
- Modify: `supabase/tests/notifications_policy.sql`
- Modify: `src/modules/projects/api/projects.ts`
- Test: `src/modules/projects/api/projects.test.ts`

1. Add failing SQL assertions proving an assigned coordinator's display name is returned to an authorized project reader and unrelated users cannot obtain it.
2. Add failing SQL assertions proving project creation and later assignment each create exactly one project notification for the assignee.
3. Run the affected SQL suites and confirm the new assertions fail because the guarded read and notification writes do not exist.
4. Add `rpc_list_project_assignments` returning the minimal assignment record plus `display_name` after checking project visibility.
5. Update project creation and assignment RPCs to call `create_notification` with stable event keys only when a new active assignment is inserted.
6. Change the Projects client adapter to read assignments through the guarded RPC and map `display_name` into the existing UI model.
7. Run affected unit and SQL tests and confirm they pass.

### Task 2: Canonical operational-project eligibility

**Files:**
- Modify: `src/modules/cash/api/cash.ts`
- Modify: `src/modules/cash/pages/CashAdvancesPage.tsx`
- Create: `src/modules/cash/api/cash.test.ts`
- Create or modify: `src/modules/cash/pages/CashAdvancesPage.test.tsx`

1. Add a failing API/component test proving planned, active, and on-hold assigned projects are selectable for a cash request.
2. Confirm the test fails because Cash filters to `active` only.
3. Replace the active-only query with an operational-project query using `planned`, `active`, and `on_hold`, preserving RLS assignment scope.
4. Rename query keys/functions from “active” to “operational” where needed.
5. Run Cash and Inventory request tests and confirm both workflows expose the same project.

### Task 3: Focused Projects visual refinement

**Files:**
- Modify: `src/modules/projects/pages/CreateProjectPage.tsx`
- Modify: `src/modules/projects/pages/ProjectWorkspacePage.tsx`
- Modify: `src/modules/projects/pages/ProjectTeamTab.tsx`
- Modify: `src/modules/projects/pages/ProjectDocumentsTab.tsx`
- Modify: `src/modules/projects/pages/ProjectHistoryTab.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/modules/projects/pages/CreateProjectPage.test.tsx`
- Modify: `src/modules/projects/pages/ProjectWorkspacePage.test.tsx`
- Modify: `src/modules/projects/pages/ProjectTeamTab.test.tsx`

1. Add failing semantic tests for section descriptions, named team rows, structured empty states, and readable project summary labels.
2. Confirm the tests fail for the missing hierarchy.
3. Add explicit section header/body wrappers and concise descriptions to the creation form.
4. Add structured project metric cards, team/history rows, and empty-state containers while keeping all current permissions and routes.
5. Refine CSS spacing, borders, typography, responsive grids, and tab/content containment.
6. Run focused Projects tests and inspect desktop/tablet rendering.

### Task 4: Role journey and closing gate

**Files:**
- Modify: `e2e/projects.spec.ts`
- Modify: `docs/acceptance/ROLE_ACCEPTANCE_TESTS.md`
- Modify: `docs/training/PROJECTS_DAILY_TRACKER.md`

1. Add a browser regression journey for assignment name, notification, and cash/inventory project consistency.
2. Run focused browser checks.
3. Apply migration `0074` to the linked Supabase project only after local SQL validation.
4. Run all affected SQL suites, clean database lint, complete application verification, and production build.
5. Record only evidenced acceptance results; leave unrelated manual journeys pending.
6. Review the final diff and keep the branch local/unpushed.

