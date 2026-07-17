# Inline Inventory Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let authorized warehouse users select an existing category or create a missing category without leaving the receiving form, while automatically assigning every receipt to the company’s single headquarters warehouse.

**Architecture:** Extend the singular receiving RPCs so category creation occurs inside the same database transaction as the item/asset receipt. The UI uses an existing-or-new category choice. A seeded canonical `Egypro HQ Warehouse` is resolved automatically and displayed as read-only context rather than a user choice. The database retains warehouse-resolution support for future expansion, but the current UI exposes no warehouse setup or selection.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase/PostgreSQL, pgTAP, Vitest.

---

### Task 1: Specify atomic database behavior

**Files:**
- Modify: `supabase/tests/inventory_workflow.sql`
- Create: `supabase/migrations/0077_inline_inventory_setup.sql`

1. Add failing pgTAP assertions for category creation, warehouse resolution, duplicate protection, and atomic new-item receipt.
2. Run the inventory suite and confirm the missing functions/arguments fail.
3. Add secure RPC helpers and extend singular receiving functions.
4. Re-run the inventory suite and require every assertion to pass.

### Task 2: Add existing-or-new form controls

**Files:**
- Modify: `src/modules/warehouse/api/inventory.ts`
- Modify: `src/modules/warehouse/pages/ConsumablesPage.tsx`
- Modify: `src/modules/warehouse/pages/EquipmentPage.tsx`
- Modify: `src/styles/global.css`

1. Add failing UI/API tests for selecting existing records and revealing inline new-record fields.
2. Extend API types to send either an existing category identifier or new category details.
3. Add accessible existing/new category controls to consumable item-master, new receipt, and equipment receipt forms.
4. Seed and automatically use the single headquarters warehouse; show it read-only on receiving and adjustment forms.
5. Invalidate category queries after creation.
6. Run focused UI tests and type checking.

### Task 3: Verify and apply

**Files:**
- Verify: `supabase/tests/inventory_workflow.sql`
- Verify: warehouse unit tests and production build

1. Push migrations `0077`–`0079` to the linked project.
2. Run linked schema lint and the inventory workflow suite.
3. Run focused unit tests, typecheck, lint, and production build.
4. Do not push Git changes.
