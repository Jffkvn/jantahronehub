# Egypro OneHub 2.0 — Projects Workspace Design

**Date:** 15 July 2026
**Status:** Approved during role-by-role product review
**Implementation folder:** `/Users/jeffadhaya/Documents/Codex Projects/Egypro Onehub 2.0 Stabilized`

## Problem

Projects are currently presented inside Daily Tracker even though a project is the parent operational record for assignments, daily updates, project cash, inventory requests, equipment custody and reporting. This makes project creation hard to find and forces users to assemble a project's operational position across several disconnected modules.

The corrected design gives Projects its own top-level workspace. Daily Tracker remains a focused field-update workflow, while every project exposes one canonical summary of its team, progress, cash and inventory.

## Approved product structure

Add **Projects** as a top-level OneHub module, separate from **Daily Tracker**.

The main navigation order should make the operational relationship clear:

1. Projects.
2. Daily Tracker.
3. Inventory Operations.
4. Project Cash.
5. Reports & Audits.

Projects owns the project directory, project creation, project master data, team assignments and the integrated project workspace. Daily Tracker owns the coordinator submission queue, PM review queue and missing-update monitoring.

## Roles and authority

| Role | Project authority |
| --- | --- |
| `super_admin` | Create, update, assign, close, reopen and support all projects. |
| `cfo` | Create projects, assign or replace the PM, assign coordinators, and view company-wide operational, cash and inventory summaries. |
| `project_manager` | Create projects and manage operational details, status, health, dates, notes and team assignments for projects they manage. |
| `coordinator` | View assigned projects and create or revise daily updates only for those projects. |
| `managing_director` | Read-only company-wide project oversight and drill-down. |
| `warehouse_manager` | View the project identity and assignment information required to process project inventory requests, issues, custody and returns. |

A project may be created before a Project Manager is available. The CFO may assign one or more coordinators first and assign the PM later.

Each project has:

- Zero or one active primary Project Manager.
- Zero or more active coordinators.
- Historical assignments with start and end timestamps.
- The actor and reason for each assignment, reassignment or removal.

Duplicate active assignments for the same person, project and project role are rejected.

## Project data

The project master record should support:

- Project code.
- Project name.
- Client.
- Site or location.
- Planned start date.
- Expected end date.
- Actual completion date where applicable.
- Status: planned, active, on hold, completed, cancelled or archived.
- Health: on track, needs attention or at risk.
- Budget or contract reference information where applicable.
- Operational notes.
- Attachments.
- Creator and creation timestamp.
- Last updater and update timestamp.

Projects are not hard-deleted after operational activity exists. Incorrect, cancelled or obsolete projects are closed or archived with a reason so their cash, inventory, updates, documents and assignments remain auditable.

## Projects landing page

The Projects page should answer:

1. Which projects are ongoing?
2. Which projects need attention?
3. Who is responsible for each project?
4. What is the current cash and inventory exposure?
5. Which projects are missing operational updates?

The page provides:

- Search by code, name, client or site.
- Filters for status, health, PM, coordinator and date.
- Sort by recent activity, status, expected end date or risk.
- Counts for active, at-risk, on-hold and completed projects.
- A responsive list or table showing project, site/client, status, health, PM, coordinators, latest update, cash exposure and inventory exposure.
- A Create Project action only for `super_admin`, CFO and Project Manager.

Every project row or card opens the same canonical project workspace.

## Project workspace

Use stable, directly linkable routes:

- `/projects/:projectId/summary`
- `/projects/:projectId/team`
- `/projects/:projectId/updates`
- `/projects/:projectId/cash`
- `/projects/:projectId/inventory`
- `/projects/:projectId/documents`
- `/projects/:projectId/history`

### Summary

Show:

- Project identity, client/site, status, health and dates.
- Primary PM and coordinators.
- Latest endorsed update and recent activity.
- Missing or overdue daily updates.
- Cash requested, approved, disbursed, accepted, returned and outstanding.
- Inventory/material requests by status.
- Equipment currently issued, current custody and expected return.
- Damage, overdue return and accountability warnings.
- Quick links into the relevant project tab or operational record.

### Team

Show the primary PM, multiple coordinators and assignment history. CFO, `super_admin` and authorized PMs can assign or unassign team members according to the role rules above. Every change requires a reason and preserves the former assignment.

### Daily Updates

Show daily updates for this project, including author, date, status, evidence, PM feedback and revision history. Assigned coordinators can create and revise their own permitted updates. The assigned PM can endorse or request revision.

### Cash

Show only cash advances linked to this project, including request, approval, disbursement, accountability, accepted expenses, returned cash and outstanding balance. The project page does not copy or independently calculate cash transactions; it reads the canonical Project Cash ledger.

### Inventory & Equipment

Show project-linked material and equipment requests, approvals, issued quantities, current custody, expected returns, damage and movement history. The project page reads the canonical inventory ledger and asset-custody records.

### Documents and history

Show project attachments and a chronological audit timeline covering creation, edits, assignments, daily updates, cash events, inventory events, closure and reopening.

## Daily Tracker relationship

Daily Tracker remains a separate action-oriented workspace:

- Coordinators see assigned projects requiring today's update, their draft/revision work and recent submissions.
- Project Managers see submitted updates awaiting review, revision responses and missing updates for projects they manage.
- Authorized oversight roles see monitoring information without receiving coordinator submission controls.

Daily Tracker does not own the project directory or project creation. Clicking a project always opens the canonical Projects workspace.

## Canonical data and summaries

Project summaries must be derived from the existing canonical records:

- `projects` for project identity and status.
- Project assignments for PM/coordinator responsibility and history.
- Daily updates and revisions for field progress.
- Cash advance, expense and return ledgers for cash exposure.
- Stock requests, movements, receipts and custody for inventory exposure.
- Audit events for the activity timeline.

Do not duplicate cash or inventory totals on the project master record. Use small authorized aggregate database functions or queries so the summary remains consistent with the underlying ledgers and RLS rules.

## Creation and editing experience

Project creation uses a dedicated `/projects/new` page rather than a modal. The form is divided into clear sections:

1. Project identity.
2. Client and site.
3. Dates and status.
4. Primary PM and coordinators.
5. Budget/reference information.
6. Notes and attachments.

Submission failures preserve entered values. Long forms warn before destructive navigation, refresh or sign-out. Routine browser-tab switching or silent token refresh must not discard the form.

## Dropdown and form standard

Adopt the useful visual language from the legacy Egypro HR application without copying its architecture or business logic:

- Restrained uppercase labels.
- Consistent input and select height.
- Soft surface background and border.
- Rounded corners.
- Clear hover state.
- Navy/emerald focus ring.
- Right-aligned chevron.
- Smooth 120–180 ms transitions.
- Clear placeholder, error and disabled states.

Use styled native selects for short, fixed choices where native behaviour is sufficient. Use accessible OneHub comboboxes for searchable or large datasets. Project assignment requires:

- A searchable single-select for the primary PM.
- A searchable multi-select for coordinators.
- Selected coordinator chips with clear removal controls.
- Keyboard navigation, visible focus and screen-reader announcements.

The macOS-native open select menu shown in the approved reference screenshot cannot be made identical across every browser. The reusable OneHub combobox should provide a consistent open-menu treatment for searchable and multi-select fields while preserving the reference's clean closed-field appearance.

## Loading, errors and safeguards

- Use skeletons for the project list and summary panels.
- Load summary domains independently so one Cash or Inventory error does not blank the entire project page.
- Preserve existing data while refreshing.
- Show retry actions within the failed panel.
- Hide unauthorized actions and enforce the same rule in database policies/functions.
- Reject coordinator updates for unassigned projects.
- Reject unauthorized project creation or assignment even when requests bypass the UI.
- Require reasons for reassignment, status reversal, closure and reopening.
- Warn when completion is attempted with outstanding cash, missing accountability, issued equipment or overdue returns.
- Allow only the appropriate authorized domain owner to resolve or override an outstanding exception, with a permanent audit reason.

## Performance

- Lazy-load the Projects module and specialist attachments/import code.
- Use small project-summary aggregate queries rather than loading entire cash or inventory ledgers.
- Paginate long project lists and activity histories.
- Cache stable summaries and invalidate only affected project/domain queries after mutations.
- Prefetch the summary for an intentionally opened project where practical.
- Avoid full-page remounts and white flashes during tab changes or background session refresh.

## Verification and acceptance

Automated and manual verification must prove:

- CFO, Project Manager and `super_admin` can create projects.
- Unauthorized roles cannot create projects through UI or direct database calls.
- A CFO can create a project with coordinators and no PM, then assign the PM later.
- One project supports one active primary PM and multiple active coordinators.
- Assignment history remains intact after reassignment.
- Coordinators can submit only against assigned projects.
- PM review, endorsement, revision request and resubmission work correctly.
- Cash totals reconcile with the canonical cash ledger.
- Inventory/equipment totals and custody reconcile with the canonical inventory ledger.
- Project completion warnings identify outstanding cash and equipment correctly.
- MD oversight remains read-only.
- Project routes survive direct loading, repeated navigation and browser back/forward.
- Unsaved creation/edit values survive validation failures and safe background session refresh.
- Dropdowns work with mouse, keyboard, touch and screen readers.
- Desktop, tablet and mobile layouts preserve hierarchy and actions.

## Non-goals for this slice

- Replacing the canonical Cash or Inventory modules.
- Building advanced portfolio forecasting.
- Adding attendance or biometric integration.
- Broad redesign of unrelated HR or payroll screens.
- Configuring Resend email delivery.

## Recommended implementation boundary

Before starting this product slice, complete and commit the already-deployed HR Setup checkpoint and repair the two populated-database test-fixture failures identified during the read-only review. Then implement Projects as a vertical slice: permissions and schema, project creation and assignments, standalone navigation and list, project summary, Daily Tracker connection, Cash/Inventory summaries, and full role-based verification.
