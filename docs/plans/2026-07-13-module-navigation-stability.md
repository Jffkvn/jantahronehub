# Module Navigation Stability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate recursive module URLs and ensure Inventory, Project Cash and Daily Tracker always expose stable, recoverable navigation.

**Architecture:** Preserve the global sidebar plus horizontal module tabs. Replace route-relative tab destinations and fallbacks with canonical absolute paths, while keeping component-level route rendering intact. Add regression coverage before production changes and audit related navigation patterns for the same defect.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library, Playwright.

---

### Task 1: Reproduce module route recursion

**Files:**
- Test: `src/modules/warehouse/WarehousePage.test.tsx`
- Test: `src/modules/cash/CashPage.test.tsx`
- Test: `src/modules/projects/TrackerPage.test.tsx`

1. Add a failing Inventory test starting from an invalid nested URL and assert recovery to `/inventory/overview`.
2. Assert every Inventory tab exposes its canonical absolute `href`.
3. Add equivalent stable-link and fallback assertions for Project Cash and Daily Tracker.
4. Run the focused tests and confirm they fail because current destinations resolve relatively.

### Task 2: Implement canonical module navigation

**Files:**
- Modify: `src/modules/warehouse/WarehousePage.tsx`
- Modify: `src/modules/cash/CashPage.tsx`
- Modify: `src/modules/projects/TrackerPage.tsx`

1. Replace tab destinations with absolute module URLs.
2. Replace index and wildcard fallbacks with absolute landing URLs.
3. Preserve active states on list and detail routes.
4. Mark tab icons decorative.
5. Run focused tests until green.

### Task 3: Audit navigation and responsive behaviour

**Files:**
- Modify: `e2e/shell.spec.ts` or create a focused module-navigation spec if required.
- Modify only if evidence requires it: `src/styles/global.css`.

1. Search all module-level `NavLink`, `Link`, `Navigate` and programmatic navigation destinations.
2. Add Playwright coverage for repeated module-tab switching and invalid-route recovery.
3. Check the tab strip at desktop, tablet and mobile widths for clipping or inaccessible overflow.
4. Record any visual-hierarchy issues that belong to Task 10 rather than mixing them into this fix.

### Task 4: Verify and checkpoint

1. Run focused unit tests.
2. Run `npm run verify`.
3. Run `npm run test:e2e`.
4. Run `git diff --check`.
5. Review the complete diff and commit with `fix: stabilize module navigation`.
6. Stop and report the navigation/UI-audit checkpoint before beginning Task 10.

