# Six-item Operational Acceptance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close identity, valuation, notification, evidence-upload, and dashboard-navigation acceptance gaps in the existing Projects–Inventory–Cash–Daily Tracker workflow.

**Architecture:** Add one additive Supabase migration containing scoped operational read models, trusted stock valuation, notification destinations, and private daily-evidence policies. Update the existing APIs and pages to consume those capabilities, preserving current role and project membership boundaries.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, Supabase/PostgreSQL, Supabase Storage, Vitest, Testing Library, pgTAP.

---

### Task 1: Specify the database behavior

**Files:**
- Modify: `supabase/tests/inventory_workflow.sql`
- Modify: `supabase/tests/projects_workflow.sql`
- Modify: `supabase/tests/cash_advances.sql`
- Create: `supabase/migrations/0080_operational_acceptance_completion.sql`

1. Add failing pgTAP assertions for trusted request valuation, project-team request visibility, safe identity fields, notification destinations, and private daily evidence.
2. Run the affected SQL suites and confirm the new assertions fail for the intended missing behavior.
3. Add the least-privilege RPCs, valuation rules, notification destination data, and storage controls.
4. Re-run the focused SQL suites and require all assertions to pass.

### Task 2: Remove requester-entered inventory prices and expose safe identities

**Files:**
- Modify: `src/modules/warehouse/api/inventory.ts`
- Modify: `src/modules/warehouse/api/inventory.test.ts`
- Modify: `src/modules/warehouse/pages/RequestsPage.tsx`
- Modify: `src/modules/warehouse/pages/RequestsPage.test.tsx`
- Modify: `src/modules/cash/api/cash.ts`
- Modify: `src/modules/cash/pages/CashAdvancesPage.tsx`
- Modify: `src/modules/cash/pages/CashAdvancesPage.test.tsx`
- Modify: `src/modules/projects/api/projects.ts`
- Modify: `src/modules/projects/pages/DailyUpdatesTab.tsx`
- Modify: `src/modules/projects/pages/ProjectUpdatesTab.tsx`
- Modify: `src/modules/projects/pages/ProjectUpdatesTab.test.tsx`

1. Add failing UI/API tests showing quantity-only requests and actual `Name · Role` labels.
2. Run the tests and confirm the price input and fallback labels cause the expected failures.
3. Switch APIs to the scoped read RPCs and remove estimated price state, payload, and summary text from the request form.
4. Re-run the focused tests.

### Task 3: Add numeric and actionable notifications

**Files:**
- Modify: `src/modules/notifications/api/notifications.ts`
- Modify: `src/modules/notifications/NotificationCenter.tsx`
- Modify: `src/modules/notifications/NotificationCenter.test.tsx`
- Modify: `src/styles/global.css`

1. Add failing tests for a visible unread count, `9+` capping, and mark-read-then-navigate behavior.
2. Run the tests and confirm they fail against the dot-only, non-navigating implementation.
3. Render the badge, read `action_path`, and navigate after marking the notification read.
4. Re-run notification tests.

### Task 4: Add private ten-photo daily evidence

**Files:**
- Modify: `src/modules/projects/api/projects.ts`
- Modify: `src/modules/projects/pages/DailyUpdatesTab.tsx`
- Modify: `src/modules/projects/pages/ProjectUpdatesTab.tsx`
- Modify: `src/modules/projects/pages/ProjectUpdatesTab.test.tsx`
- Modify: `src/styles/global.css`

1. Add failing tests for multiple image selection, ten-file limit, size/type validation, previews, removal, and private stored paths.
2. Run the focused tests and confirm the URL-only interface fails.
3. Reuse the private-file helpers to upload evidence, roll back uploaded objects on submission failure, and sign paths for authorized display.
4. Re-run the focused tests.

### Task 5: Make warehouse overview metrics navigable

**Files:**
- Modify: `src/modules/warehouse/pages/OverviewPage.tsx`
- Create: `src/modules/warehouse/pages/OverviewPage.test.tsx`
- Modify: `src/modules/warehouse/pages/RequestsPage.tsx`

1. Add failing tests for metric destinations and pending-status query handling.
2. Run the focused test and confirm the plain metric articles fail.
3. Add accessible links and initialize the request filter from the URL query.
4. Re-run the focused test.

### Task 6: Verify the complete batch

**Files:**
- Verify: focused Vitest files
- Verify: `supabase/tests/inventory_workflow.sql`
- Verify: `supabase/tests/projects_workflow.sql`
- Verify: `supabase/tests/cash_advances.sql`

1. Run focused unit tests.
2. Run type checking and lint.
3. Run the affected linked database suites and schema lint after migration application.
4. Run the production build.
5. Do not push or deploy.
