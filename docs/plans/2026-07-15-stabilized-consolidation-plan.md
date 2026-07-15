# Stabilized Workspace Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate the verified User Administration branch into the Stabilized workspace and prove the resulting application passes every local verification gate.

**Architecture:** Git performs a fast-forward-only update of the stabilized branch, preserving an exact linear history and a recoverable feature branch. Verification runs exclusively from the canonical Stabilized folder before the temporary User Administration worktree is removed.

**Tech Stack:** Git worktrees, React, TypeScript, Vite, Vitest, Playwright

---

### Task 1: Record the consolidation design and plan

**Files:**
- Create: `docs/plans/2026-07-15-stabilized-consolidation-design.md`
- Create: `docs/plans/2026-07-15-stabilized-consolidation-plan.md`

**Steps:**

1. Confirm both worktrees are clean.
2. Confirm `codex/stabilize-tasks-15-22` is an ancestor of `codex/user-role-administration`.
3. Commit the two documents on `codex/user-role-administration`.

### Task 2: Fast-forward the canonical Stabilized branch

**Files:** No content edits.

**Steps:**

1. Open `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0 Stabilized`.
2. Run `git merge --ff-only codex/user-role-administration`.
3. Confirm the merge exits successfully without a merge commit.
4. Confirm the working tree remains clean.

### Task 3: Verify the consolidated application locally

**Files:** No content edits expected.

**Steps:**

1. Run `npm run verify` and require typecheck, lint, 197 unit tests, and the production build to pass.
2. Run `npm run test:e2e` and require all 12 Playwright journeys to pass.
3. Run `git diff --check`.
4. Confirm the branch head includes `feat: add audited user role administration`.

### Task 4: Remove the temporary feature worktree

**Files:** Remove the worktree folder only; retain Git history and branch.

**Steps:**

1. Confirm the Stabilized branch is at the same commit as the feature branch.
2. Confirm both worktrees are clean.
3. Remove `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0 User Administration` with `git worktree remove`.
4. Confirm `git worktree list` contains the Stabilized workspace and no User Administration workspace.
5. Do not delete the `codex/user-role-administration` branch; it remains a rollback reference.
