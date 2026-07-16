# Project Assignment Acceptance Corrections — Design

## Outcome

Project assignments must behave consistently across Projects, notifications, Project Cash, and Inventory. Assigned people must be identified by name without gaining general profile-directory access, and the Projects workspace must present operational information with deliberate visual hierarchy.

## Functional design

- Add a guarded project-assignment read function that returns assignment metadata plus the assigned person's display name. It may be used only by people who can read the project.
- Create an in-app notification in the same transaction whenever a PM or coordinator is newly assigned, including assignments created with the project. Use stable event keys so retries cannot create duplicates.
- Treat `planned`, `active`, and `on_hold` projects as requestable operational projects in both Cash and Inventory. Existing assignment scoping remains the database security boundary for non-CFO users.
- Preserve the existing rule that a coordinator may only submit requests and updates for an assigned project.

## Presentation design

- Keep the three project-creation sections but make their boundaries explicit with contained headers, explanatory copy, consistent internal padding, and stable spacing between sections.
- Keep the canonical project workspace tabs. Improve information cards, team rows, history rows, empty states, and date/status formatting so they read as a product interface rather than raw HTML blocks.
- Apply this focused Projects polish now. The broader role-dashboard and reporting redesign remains a later approved phase.

## Verification

- Database tests prove safe name visibility, notification creation/deduplication, and assignment scope.
- Unit tests prove Cash includes all operational project statuses and the Team UI renders returned names.
- Browser acceptance covers: Julie assigns Olivia; Olivia sees the notification and her project; Olivia can select that project for both cash and inventory.
- Run the complete application verification, affected hosted SQL suites, database lint, and a production build before completion is claimed.

