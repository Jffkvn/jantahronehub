# Stabilized Workspace Consolidation Design

**Date:** 15 July 2026  
**Canonical target:** `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0 Stabilized`  
**Feature source:** `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0 User Administration`

## Objective

Make the Stabilized folder the single active OneHub development and testing workspace by incorporating the verified User Administration branch, then validate the consolidated application locally.

## Selected approach

Use a Git fast-forward merge from `codex/user-role-administration` into `codex/stabilize-tasks-15-22`. The stabilized branch is an ancestor of the feature branch and has no divergent commits, so the merge must not create a merge commit or resolve conflicting code.

## Safety boundaries

- Do not modify `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0`.
- Do not push to GitHub or configure Vercel/Netlify.
- Do not apply or alter Supabase migrations; hosted Antigravity already contains migrations `0062` and `0063`.
- Do not remove the User Administration worktree until the consolidated Stabilized folder passes all local checks.
- Abort instead of using a non-fast-forward merge.

## Verification

Run from the Stabilized folder:

- `npm run verify`
- `npm run test:e2e`
- `git diff --check`
- Confirm the Stabilized branch points at the User Administration commit.
- Confirm the working tree is clean.

Database behavior was already verified against Antigravity with 34 pgTAP checks and clean linked database lint. This consolidation performs no database write.

## Final workspace model

After successful verification:

- `Egypro Onehub 2.0 Stabilized` is the sole active workspace.
- The User Administration worktree may be removed because its commit and branch remain recoverable in Git.
- The original `Egypro Onehub 2.0` folder remains an untouched recovery/reference workspace until final product handover.
