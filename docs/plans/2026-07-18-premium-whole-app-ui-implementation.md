# Premium Whole-App UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform every reachable Egypro OneHub route into one responsive, premium, role-aware product with visual dashboards, drillable reports, consistent forms and polished operational workspaces while preserving all verified permissions and business workflows.

**Architecture:** Keep the current React, React Query and Supabase feature architecture. Add a small shared presentation layer for dashboard composition and accessible SVG/CSS visualisations, upgrade the existing shell and global `oh-*` system, and compose role dashboards from existing authorised APIs. Apply the shared system to existing pages instead of rewriting operational logic.

**Tech Stack:** React 19, TypeScript, React Router 7, TanStack React Query, Supabase, Lucide React, CSS custom properties, Vitest, Testing Library and Playwright.

---

## Working rules

- Preserve role access, RLS, RPCs, uploads, notifications, audits and canonical data sources.
- Reuse current API modules and workflows; do not create parallel business logic for presentation.
- Build charts locally with accessible SVG/CSS primitives instead of adding a chart dependency.
- Use real data only. Empty data receives a useful empty state, never invented values.
- Write or update focused tests before each behaviour change.
- Commit after each coherent task so the long redesign remains recoverable.

### Task 1: Establish the premium tokens and shared surface primitives

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Create: `src/components/ui/MetricCard.tsx`
- Create: `src/components/ui/MetricCard.test.tsx`
- Create: `src/components/ui/Panel.tsx`
- Create: `src/components/ui/Panel.test.tsx`
- Create: `src/components/ui/QuickActions.tsx`
- Create: `src/components/ui/QuickActions.test.tsx`
- Create: `src/components/ui/ActivityList.tsx`
- Create: `src/components/ui/ActivityList.test.tsx`
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/DataTable.tsx`
- Modify: `src/components/ui/EmptyState.tsx`
- Modify: `src/components/ui/Modal.tsx`

**Steps:**
1. Add failing component tests for semantic headings, links/actions, accessible labels, empty states and loading content.
2. Run `npm run test:unit -- src/components/ui/MetricCard.test.tsx src/components/ui/Panel.test.tsx src/components/ui/QuickActions.test.tsx src/components/ui/ActivityList.test.tsx` and confirm failure.
3. Implement the primitives using the existing `oh-*` naming and current `Button`, `StatusBadge` and router conventions.
4. Expand tokens for restrained semantic chart colours, layered surfaces, premium shadows, compact radii, focus rings and motion durations.
5. Upgrade shared button, table, empty-state and modal styling without changing their public behaviour.
6. Re-run focused tests and `npm run typecheck`.
7. Commit: `feat: establish premium UI foundations`.

### Task 2: Add accessible visualisation primitives

**Files:**
- Create: `src/components/charts/ChartFrame.tsx`
- Create: `src/components/charts/TrendChart.tsx`
- Create: `src/components/charts/BarChart.tsx`
- Create: `src/components/charts/DonutChart.tsx`
- Create: `src/components/charts/ProgressList.tsx`
- Create: `src/components/charts/charts.test.tsx`
- Modify: `src/styles/global.css`

**Steps:**
1. Write tests requiring a chart title, summary, accessible data description and resilient zero/empty rendering.
2. Run the focused chart tests and confirm failure.
3. Implement dependency-free SVG/CSS visuals with keyboard-safe links only where a chart is actionable.
4. Provide compact legends and text summaries so colour is never the sole carrier of meaning.
5. Verify currency, percentage, long-label and all-zero cases.
6. Re-run focused tests and type checking.
7. Commit: `feat: add accessible dashboard visualisations`.

### Task 3: Refine the application shell and navigation

**Files:**
- Modify: `src/layout/AppShell.tsx`
- Modify: `src/layout/Sidebar.tsx`
- Modify: `src/layout/Topbar.tsx`
- Modify: `src/layout/MobileNav.tsx`
- Modify: `src/layout/AppShell.test.tsx`
- Modify: `src/styles/global.css`
- Modify: notification/search components imported by `Topbar.tsx`

**Steps:**
1. Extend shell tests for grouped navigation, active route, numeric unread badge, user role label and mobile navigation.
2. Confirm the new assertions fail.
3. Refine the brand block, sidebar grouping, active states, sticky top bar and compact identity treatment.
4. Show unread notification count rather than a dot, capped visually at `99+`, while preserving existing notification behaviour.
5. Make notification items use their existing destination metadata when present.
6. Ensure desktop collapse, tablet drawer and phone navigation remain keyboard and touch accessible.
7. Run shell, notification and navigation tests plus type checking.
8. Commit: `feat: refine premium application shell`.

### Task 4: Build the role-aware home dashboard composition

**Files:**
- Create: `src/modules/home/dashboard-model.ts`
- Create: `src/modules/home/dashboard-model.test.ts`
- Create: `src/modules/home/components/DashboardHeader.tsx`
- Create: `src/modules/home/components/RoleDashboard.tsx`
- Create: `src/modules/home/components/HrDashboard.tsx`
- Create: `src/modules/home/components/ExecutiveDashboard.tsx`
- Create: `src/modules/home/components/WarehouseDashboard.tsx`
- Create: `src/modules/home/components/ProjectManagerDashboard.tsx`
- Create: `src/modules/home/components/CoordinatorDashboard.tsx`
- Create: `src/modules/home/components/EmployeeDashboard.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: home/API modules needed to reuse existing authorised queries
- Create or modify: `src/pages/HomePage.test.tsx`
- Modify: `src/styles/global.css`

**Steps:**
1. Write tests mapping each canonical role/access profile to the correct dashboard and quick actions.
2. Confirm failures before implementation.
3. Create typed dashboard models from existing leave, advances, training, performance, projects, inventory, cash and governance APIs.
4. Use safe aggregate/report data only for executive views; do not widen raw HR access.
5. Build six compositions with shared metric, visual, activity and action primitives.
6. Provide explicit loading, empty and partial-data states so one failed widget does not blank the dashboard.
7. Make every actionable metric and quick action navigate to an authorised destination.
8. Run focused model/page tests, type checking and lint.
9. Commit: `feat: add role-aware operational dashboards`.

### Task 5: Turn Reports & Audits into a visual workspace

**Files:**
- Modify: `src/pages/ReportsPage.tsx`
- Create: `src/modules/reports/report-visuals.ts`
- Create: `src/modules/reports/report-visuals.test.ts`
- Create: `src/modules/reports/components/WorkforceReport.tsx`
- Create: `src/modules/reports/components/PayrollReport.tsx`
- Create: `src/modules/reports/components/InventoryReport.tsx`
- Create: `src/modules/reports/components/ProjectsReport.tsx`
- Create: `src/modules/reports/components/CashReport.tsx`
- Modify: existing report API/tests
- Modify: `src/styles/global.css`

**Steps:**
1. Add tests converting governance snapshot data into honest trend, distribution, progress and exception series.
2. Confirm failing tests.
3. Keep existing report authorisation and audited exports intact.
4. Compose visual domain tabs with metric rows, charts, exception cards and filtered drill-down links.
5. Replace blank chart regions with meaningful no-data explanations and authorised next actions.
6. Verify MD/CFO aggregate boundaries and Warehouse Manager-specific reporting destination.
7. Run focused report/security tests, type checking and lint.
8. Commit: `feat: visualise role-aware reports and audits`.

### Task 6: Refurbish Projects and Daily Tracker

**Files:**
- Modify: `src/modules/projects/pages/ProjectListPage.tsx`
- Modify: `src/modules/projects/pages/ProjectCreatePage.tsx`
- Modify: `src/modules/projects/pages/ProjectWorkspacePage.tsx`
- Modify: project summary/team/update/cash/inventory/document/history components
- Modify: Daily Tracker pages/components under `src/modules/tracker`
- Modify: relevant focused tests
- Modify: `src/styles/global.css`

**Steps:**
1. Add visual assertions for portfolio summaries, project cards/table, clear form sections, team identities, reconciliation cards and update evidence.
2. Preserve CFO/PM creation, CFO assignment, multiple coordinators, coordinator submission, PM review and completion guards.
3. Upgrade project list visuals and make the project workspace tabs consistent and compact.
4. Refine cash and inventory reconciliation into balanced visual panels with clear totals and destinations.
5. Present documents/history as useful timelines and evidence collections.
6. Show daily-update submitter name and title, evidence gallery, review state and action hierarchy.
7. Run project/tracker unit tests and relevant browser journeys.
8. Commit: `feat: polish projects and daily operations`.

### Task 7: Refurbish Inventory and Project Cash

**Files:**
- Modify: warehouse pages under `src/modules/warehouse/pages`
- Modify: cash pages under `src/modules/cash/pages`
- Modify: warehouse/cash components and focused tests
- Modify: `src/styles/global.css`

**Steps:**
1. Add focused view tests for visual summaries, responsive tables/cards, action bars, receipts, custody and reconciliation.
2. Preserve the verified HQ-only warehouse behaviour and singular receiving workflows.
3. Make warehouse overview metrics actionable and visually distinguish stock, assets, custody, requests and exceptions.
4. Present item-master creation, new receipt, existing receipt and equipment entry with shared premium form sections.
5. Refine request approval/fulfilment, ledger and custody views without changing threshold routing.
6. Refine cash request, approval, disbursement, uploaded evidence, returns and accountability views.
7. Run focused inventory/cash tests and linked database suites when presentation work exposes query changes.
8. Commit: `feat: polish inventory and project cash workspaces`.

### Task 8: Refurbish HR, payroll and the employee portal

**Files:**
- Modify: pages under `src/modules/hr/pages`
- Modify: pages under `src/modules/payroll/pages`
- Modify: pages under `src/modules/portal/pages`
- Modify: relevant shared components and focused tests
- Modify: `src/styles/global.css`

**Steps:**
1. Add focused visual/interaction tests for HR action bars, record summaries, filters, modals and employee privacy states.
2. Upgrade Employees, HR setup and payroll pages using the shared metrics, panels, table and form patterns.
3. Upgrade Leave, Staff Advances, Performance and Training while preserving the completed workflows and role boundaries.
4. Upgrade My Workspace into a cohesive personal dashboard and refurbish profile, documents, payslips and each self-service domain.
5. Ensure private employee records remain scoped and evidence/certificate/receipt uploads retain existing behaviour.
6. Run all HR, payroll and portal unit tests plus relevant database acceptance suites.
7. Commit: `feat: polish HR payroll and employee workspaces`.

### Task 9: Refurbish authentication, administration and remaining shared states

**Files:**
- Modify: authentication pages/components
- Modify: administration pages/components under `src/modules/admin`
- Modify: remaining reachable pages identified by route audit
- Modify: focused tests and `src/styles/global.css`

**Steps:**
1. Audit every route in the router against the approved premium system.
2. Upgrade login, invitation and TOTP surfaces with clear security hierarchy and responsive forms.
3. Upgrade role administration, system setup, audit and import screens without weakening security affordances.
4. Standardise loading skeletons, empty states, errors, confirmations and destructive actions.
5. Verify every reachable route uses shared tokens and no legacy unstyled control remains.
6. Run relevant auth/admin tests and type checking.
7. Commit: `feat: complete premium route coverage`.

### Task 10: Responsive, accessibility and browser acceptance

**Files:**
- Modify: `src/styles/global.css`
- Modify: affected components found during testing
- Create or modify: Playwright premium UI journeys under `e2e`

**Steps:**
1. Add browser journeys for HR, CFO/MD, Warehouse Manager, Project Manager, Coordinator and Employee.
2. Verify approximately 1440 px, 1024 px and 390 px layouts for shell, dashboard, table/form and modal route families.
3. Exercise keyboard navigation, focus restoration, dialogs, dropdowns, tabs, chart summaries and notification links.
4. Test long names, large UGX values, zero data, loading, request failure and dense tables.
5. Fix issues found and rerun the focused journeys until green.
6. Run `npm run test:e2e`.
7. Commit: `test: verify premium responsive experiences`.

### Task 11: Final operational and production checkpoint

**Files:**
- Modify only defects found during verification
- Update: relevant acceptance/status documentation

**Steps:**
1. Run `git diff --check`.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Run `npm run test:unit`.
5. Run all application and reporting-security browser tests.
6. Run all linked database acceptance suites required by the repository.
7. Run linked schema lint at warning level.
8. Run `npm run build` and inspect bundle warnings.
9. Review the final diff for permission, identity, notification, upload and audit regressions.
10. Update the consolidated product status with evidence only.
11. Commit: `feat: complete premium OneHub experience`.

## Completion evidence

- Six role dashboards use canonical data and authorised quick actions.
- Reports contain meaningful accessible visuals and drill-downs.
- Every current route family uses the shared premium presentation system.
- Desktop, tablet and phone browser journeys pass.
- Existing business, security, database and upload tests remain green.
- Production build and linked schema lint pass.
