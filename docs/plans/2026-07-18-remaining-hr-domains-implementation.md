# Remaining HR Domains Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port the proven legacy Staff Advances, Performance, and Training/Certifications workflows into the single OneHub application with OneHub security, identity, audit, notifications, uploads, and payroll integration.

**Architecture:** Preserve legacy fields, states, calculations, and journeys. Put database mutations behind permission-checked RPCs; expose typed API modules to focused HR and employee pages; reuse existing OneHub components and private storage instead of introducing parallel infrastructure.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query, Zod, Supabase/PostgreSQL, Vitest, Testing Library, SheetJS.

---

## Task 1: Staff Advances database contract

**Files:**
- Create: `supabase/tests/staff_advances.sql`
- Create: `supabase/migrations/0089_staff_advances.sql`

1. Write failing database acceptance tests for employee self-request/read isolation, HR direct logging, approve/reject, repayment, correction/settlement/write-off reasons, denied roles, audit history, notifications, and payroll deduction scheduling.
2. Run the focused database test and confirm it fails because the contract is absent.
3. Add tables for advances, repayments, and append-only events; add scoped permissions and RPCs; connect approved scheduled deductions to the existing payroll advance line-item mechanism.
4. Re-run the focused database test until it passes.

## Task 2: Staff Advances typed integration

**Files:**
- Create: `src/modules/hr/schemas/staffAdvances.test.ts`
- Create: `src/modules/hr/schemas/staffAdvances.ts`
- Create: `src/modules/hr/api/staffAdvances.test.ts`
- Create: `src/modules/hr/api/staffAdvances.ts`

1. Write failing schema and API adapter tests covering legacy fields, money/date validation, statuses, safe errors, and RPC payload mapping.
2. Implement the smallest Zod schemas and typed adapters that satisfy them, following the existing Leave API conventions.
3. Run focused unit tests and type checking.

## Task 3: Staff Advances employee and HR journeys

**Files:**
- Create: `src/modules/portal/pages/MyAdvancesPage.test.tsx`
- Create: `src/modules/portal/pages/MyAdvancesPage.tsx`
- Create: `src/modules/hr/pages/StaffAdvancesPage.test.tsx`
- Create: `src/modules/hr/pages/StaffAdvancesPage.tsx`
- Modify: `src/modules/portal/PortalPage.tsx`
- Modify: `src/modules/portal/pages/shared.tsx`
- Modify: `src/modules/hr/HrPage.tsx`
- Modify: `src/modules/hr/components/HrNavigation.tsx`
- Modify: `src/app/router.tsx`

1. Write failing employee tests for requesting and seeing own status, balance, repayment progress, and decisions.
2. Write failing HR tests for direct logging, reviewing, deciding, correcting, recording repayment, and viewing history.
3. Port the legacy journeys into OneHub pages and navigation, reusing shared modal, employee identity, badge, notification, and error components.
4. Run focused UI tests, type checking, lint, and build; commit the complete Staff Advances slice.

## Task 4: Performance database and typed contract

**Files:**
- Create: `supabase/tests/performance_management.sql`
- Create: `supabase/migrations/0091_performance_management.sql`
- Create: `src/modules/hr/schemas/performance.test.ts`
- Create: `src/modules/hr/schemas/performance.ts`
- Create: `src/modules/hr/api/performance.test.ts`
- Create: `src/modules/hr/api/performance.ts`

1. Write failing tests for cycles, participants, KPI goals, manager ratings, recommendations, draft/submitted/approved/acknowledged/reopened transitions, employee isolation, permissions, audit, and notifications.
2. Implement the database contract and typed adapters while preserving the legacy review calculations and fields.
3. Re-run focused database/unit tests and type checking.

## Task 5: Performance HR, manager, and employee journeys

**Files:**
- Create: `src/modules/hr/pages/PerformanceManagementPage.test.tsx`
- Create: `src/modules/hr/pages/PerformanceManagementPage.tsx`
- Create: `src/modules/portal/pages/MyPerformancePage.test.tsx`
- Create: `src/modules/portal/pages/MyPerformancePage.tsx`
- Modify: HR and portal route/navigation files from Task 3

1. Write failing tests for cycle management, KPI/rating entry, approvals, employee release/acknowledgment, and Excel template import/export.
2. Port the legacy screens into the OneHub shell, reusing existing identity, notification, and audit patterns.
3. Run focused tests, type checking, lint, and build; commit the Performance slice.

## Task 6: Training and Certifications database and typed contract

**Files:**
- Create: `supabase/tests/training_certifications.sql`
- Create: `supabase/migrations/0092_training_certifications.sql`
- Create: `src/modules/hr/schemas/training.test.ts`
- Create: `src/modules/hr/schemas/training.ts`
- Create: `src/modules/hr/api/training.test.ts`
- Create: `src/modules/hr/api/training.ts`

1. Write failing tests for record lifecycle, employee isolation, certificate metadata, private evidence, expiry alerts, permissions, audit, and notifications.
2. Implement tables/RPCs and typed adapters using the existing private upload contract.
3. Re-run focused database/unit tests and type checking.

## Task 7: Training HR and employee journeys

**Files:**
- Create: `src/modules/hr/pages/TrainingManagementPage.test.tsx`
- Create: `src/modules/hr/pages/TrainingManagementPage.tsx`
- Create: `src/modules/portal/pages/MyTrainingPage.test.tsx`
- Create: `src/modules/portal/pages/MyTrainingPage.tsx`
- Modify: HR and portal route/navigation files from Task 3

1. Write failing tests for HR logging/editing, certificate upload, expiry visibility, and employee self-history.
2. Port the legacy screens and reuse the OneHub upload, modal, badge, notification, identity, and audit components.
3. Run focused tests, type checking, lint, and build; commit the Training slice.

## Task 8: Consolidated acceptance and release checkpoint

**Files:**
- Modify: acceptance documentation only where evidence requires it

1. Apply migrations to the linked database only after local/focused contracts pass.
2. Run all new database suites, the existing database suites, unit tests, type checking, lint, production build, and focused browser journeys for employee and HR roles.
3. Review migration count separately: retain immutable deployed migrations for the live project, and create a tested baseline only for fresh future environments rather than rewriting live history.
4. Record evidence, inspect the diff, and create the final batch checkpoint commit.
