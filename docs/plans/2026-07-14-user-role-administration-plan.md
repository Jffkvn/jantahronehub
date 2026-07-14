# OneHub User and Role Administration Implementation Plan

> **Execution rule:** Implement each task test-first and stop if its focused verification does not pass. Work only in the `codex/user-role-administration` worktree. Do not modify the original or stabilized worktrees.

**Goal:** Replace the placeholder System Administration page with a secure, audited workflow where `super_admin` can manage every role and HR administrators can manage every non-super-admin account.

**Architecture:** The browser uses typed Supabase RPC adapters. PostgreSQL security-definer functions remain the authorization boundary, derive the actor from `auth.uid()`, apply access changes atomically, and append audit events. During the no-domain test phase, OneHub links Auth users already created in Supabase by exact normalized email; it never handles passwords.

**Tech stack:** React, TypeScript, React Hook Form, Zod, TanStack Query, Supabase PostgreSQL/RLS/RPC, Vitest, Testing Library, pgTAP, Playwright.

---

## Task 1: Database authorization contract

**Files:**

- Create: `supabase/tests/user_administration.sql`
- Create: `supabase/migrations/0062_user_administration.sql`

### Step 1: Write failing database tests

Cover the following contracts before the migration exists:

- `users.read` and `users.manage` permissions exist.
- `super_admin` and `hr_admin` receive those permissions.
- ordinary roles do not receive them.
- sanitized list, connect, update, status and audit RPCs exist with the intended grants.
- super admin can connect an HR administrator.
- HR can connect every non-super-admin role, including another HR administrator.
- HR cannot assign, edit or deactivate a super administrator.
- ordinary roles cannot list or mutate accounts.
- an empty role set and unknown role key fail.
- one employee cannot be linked to two accounts.
- the last active super administrator cannot be demoted or deactivated.
- successful mutations append access audit events.
- failed mutations leave no partial records.

### Step 2: Confirm the red state

Run the database test against the designated test Supabase project and confirm it fails because the new migration objects do not exist. Do not run it against the original production-linked project.

### Step 3: Implement the migration

Add:

- `users.read` and `users.manage` permission rows and grants.
- internal actor, role-validation and last-super-admin guard helpers.
- a sanitized user-account listing RPC.
- an available-role listing RPC that omits `super_admin` for HR.
- an employee-link candidate listing RPC.
- an atomic connect-existing-Auth-user RPC.
- an atomic access-update RPC.
- an atomic activate/deactivate RPC.
- an access-audit listing RPC.

All public RPCs must:

- use `security definer` with an empty search path;
- derive the actor from `auth.uid()`;
- require an active profile and the correct effective permission;
- reject HR operations involving `super_admin`;
- require a trimmed reason on mutations;
- preserve at least one active super administrator;
- revoke execution from `public` and `anon`;
- expose no Auth secrets or session metadata.

### Step 4: Verify the database task

Run:

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/user_administration.sql
npx supabase db lint --linked --level warning
```

Expected: pgTAP passes and the linked database lint introduces no new warning.

### Step 5: Commit the database task

```bash
git add supabase/migrations/0062_user_administration.sql supabase/tests/user_administration.sql
git commit -m "feat: add guarded user administration functions"
```

## Task 2: Typed administration API

**Files:**

- Create: `src/modules/admin/api/users.ts`
- Create: `src/modules/admin/api/users.test.ts`

### Step 1: Write failing API tests

Test:

- snake-case RPC payloads are parsed into safe camel-case application models;
- invalid UUIDs, emails, statuses and role keys are rejected by Zod;
- mutation payloads normalize email and trim names/reasons;
- an empty role selection is rejected before an RPC call;
- Supabase errors become safe user-facing errors without leaking payloads.

### Step 2: Implement the minimum adapter

Provide typed operations for:

- list users;
- list assignable roles;
- list employee-link candidates;
- connect existing Auth user;
- update user access;
- set account status;
- list access audits.

### Step 3: Verify and commit

```bash
npm run test:unit -- src/modules/admin/api/users.test.ts
npm run typecheck
git add src/modules/admin/api/users.ts src/modules/admin/api/users.test.ts
git commit -m "feat: add typed user administration API"
```

## Task 3: User administration interface

**Files:**

- Replace: `src/modules/admin/AdminPage.tsx`
- Create: `src/modules/admin/AdminPage.test.tsx`
- Create: `src/modules/admin/components/UserAccessForm.tsx`
- Create: `src/modules/admin/components/UserAccessForm.test.tsx`
- Create: `src/modules/admin/components/UserAccountsList.tsx`
- Create: `src/modules/admin/components/AccessAuditPanel.tsx`
- Modify only if reusable styles are insufficient: `src/styles/global.css`

### Step 1: Write failing interface tests

Test:

- summary counts, loading, empty and error states;
- search and role/status/link filters;
- super admin receives all assignable role choices;
- HR never receives `super_admin` as an assignable role;
- HR sees a super-admin record but no edit or status controls;
- connect requires exact email, display name, at least one role and a reason;
- edit and deactivate/reactivate require confirmation and a reason;
- successful mutations refresh both account and audit data;
- unlinked accounts and deactivated accounts are clearly identified;
- sensitive error details are not rendered.

### Step 2: Implement the responsive workspace

Build:

- a restrained page heading and explanation of the temporary Supabase-first flow;
- active, deactivated, unlinked and privileged summary cards;
- search and filters;
- a desktop table that becomes readable user cards on narrow screens;
- connect, edit, deactivate and reactivate dialogs;
- a recent access-audit panel;
- accessible keyboard focus, labels, busy states and confirmations.

Use existing OneHub tokens and primitives. Render all user values through normal React interpolation.

### Step 3: Verify and commit

```bash
npm run test:unit -- src/modules/admin/AdminPage.test.tsx src/modules/admin/components/UserAccessForm.test.tsx
npm run typecheck
npm run lint
git add src/modules/admin src/styles/global.css
git commit -m "feat: add user administration workspace"
```

## Task 4: Route and navigation authorization

**Files:**

- Modify: `src/config/modules.ts`
- Modify: `src/layout/AppShell.test.tsx`
- Modify: `src/app/router.tsx`
- Create or modify: `src/app/router.test.tsx`

### Step 1: Write failing navigation tests

Prove:

- HR with `users.read` can see and open System Administration;
- other roles cannot see it;
- entering `/admin` without `users.read` renders the unavailable-access state even if a client-side route is typed manually;
- super admin retains access.

### Step 2: Implement permission-aware access

- Add `hr_admin` to the module's visible role set.
- Add a route-level permission guard using the current access context.
- Keep database authorization as the final boundary.

### Step 3: Verify and commit

```bash
npm run test:unit -- src/layout/AppShell.test.tsx src/app/router.test.tsx
npm run typecheck
git add src/config/modules.ts src/layout/AppShell.test.tsx src/app/router.tsx src/app/router.test.tsx
git commit -m "feat: authorize HR user administration access"
```

## Task 5: Role-by-role acceptance guide

**Files:**

- Create: `docs/acceptance/ROLE_ACCEPTANCE_TESTS.md`

### Step 1: Document the setup chain

Record the manual no-domain testing process:

1. create Auth users in the designated test Supabase dashboard;
2. sign in as `super_admin`;
3. connect and assign the first HR administrator in OneHub;
4. sign in as HR;
5. connect all remaining roles in OneHub;
6. validate each role's permitted and denied journeys.

Do not include real passwords or secrets in the document.

### Step 2: Add evidence-oriented cases

For each role, include expected navigation, positive actions, denied actions, audit evidence and result columns. Mark invitation-email delivery `PENDING DOMAIN`.

### Step 3: Commit

```bash
git add docs/acceptance/ROLE_ACCEPTANCE_TESTS.md
git commit -m "docs: add role acceptance test guide"
```

## Task 6: Full verification and local security review

### Step 1: Run the complete suite

```bash
npm run verify
npm run test:e2e
npm audit
git diff --check
```

### Step 2: Run hosted database verification

Against the designated Antigravity test Supabase project only:

```bash
psql "$(cat supabase/.temp/pooler-url)" -v ON_ERROR_STOP=1 -f supabase/tests/user_administration.sql
npx supabase db lint --linked --level warning
```

### Step 3: Review security invariants

Inspect the final diff and verify:

- no service-role key or password entered the client bundle or Git history;
- HR cannot influence `super_admin` through any mutation input;
- last-super-admin guards cover status and role changes;
- every mutation is atomic and audited;
- no direct table policy accidentally broadens HR access;
- UI role hiding is not relied on for authorization;
- Auth data returned to the browser is minimal.

### Step 4: Final checkpoint commit

Commit only if all required checks pass and the worktree contains no unrelated changes. Report the exact test evidence and any explicitly deferred domain-dependent email test before role-by-role manual UAT begins.
