# Multiple Daily Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Allow an assigned coordinator or primary PM to submit multiple distinct field updates for the same project and calendar date.

**Architecture:** Remove the database uniqueness rule and the RPC duplicate guard. Keep every submission as a separate `daily_updates` row identified by its UUID and `created_at` timestamp, preserving independent review and audit history.

**Tech Stack:** PostgreSQL/Supabase migrations and pgTAP.

---

### Task 1: Permit multiple same-day updates

**Files:**
- Modify: `supabase/tests/projects_workflow.sql`
- Create: `supabase/migrations/0083_multiple_daily_updates_per_day.sql`

1. Change the acceptance test to submit two updates for the same actor, project and date and assert both rows remain.
2. Run the project workflow test and confirm the second submission fails under the current uniqueness rule.
3. Add a migration that drops `unique_project_user_date` and removes the duplicate guard from `rpc_save_daily_update` while retaining assignment, evidence and audit checks.
4. Apply the migration and rerun the project workflow test.
5. Run schema lint and the production build. Do not commit or push the repository.
