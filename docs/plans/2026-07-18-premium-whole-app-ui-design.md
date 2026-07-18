# Egypro OneHub 2.0 — Premium Whole-App UI Design

**Approved:** 18 July 2026  
**Scope:** Every existing OneHub screen, role workspace, operational module, form, table, modal, report and responsive state.  
**Constraint:** Preserve the verified business logic, permissions, database functions, storage rules, audit controls and canonical data sources.

## Objective

Transform the consolidated OneHub application into one cohesive, premium operational product. The result must match the clarity and smoothness of the approved references while remaining recognisably Egypro: navy hierarchy, emerald actions, restrained supporting colours, soft surfaces, compact navigation and honest operational data.

This is not a decorative reskin. The redesign must improve information hierarchy, action discovery, visual reporting, responsive behaviour and the speed with which each role can understand and act on its work.

## Selected approach

Build a shared premium presentation system and use it to retrofit the whole existing application. Reusable primitives will cover page headings, metric cards, charts, progress, activity lists, action panels, tables, filters, forms, modals, empty states, loading states and error states. Role dashboards and reports will compose those primitives from canonical data.

The alternatives were rejected:

- A CSS-only reskin would preserve structural weaknesses and inconsistent information hierarchy.
- A frontend rewrite would unnecessarily risk the workflows, permissions and database integration already verified.

## Visual language

- White and subtly tinted surfaces over a quiet neutral canvas.
- Navy typography for hierarchy and Egypro emerald for primary action and positive state.
- Supporting violet, blue, amber, rose and cyan are reserved for meaningful categories and chart series.
- Fine borders, restrained shadows and generous but operationally efficient spacing.
- Rounded geometry that feels polished without turning dense business screens into oversized cards.
- Compact left navigation, a calm sticky top bar and clear active-route treatment.
- Smooth 150–220 ms transitions for navigation, dropdowns, modal entry, hover, focus and chart reveal.
- No fake analytics, decorative noise or unsupported AI actions.

## Application shell

The shell becomes the stable premium frame for all roles:

- Refined brand block and grouped navigation.
- Sticky top bar with page context, search, numeric unread-notification badge and user identity.
- Role-aware navigation and quick actions continue to use the existing permission model.
- Desktop supports the existing collapsible sidebar; tablet and phone use a deliberate drawer/bottom-navigation treatment.
- Content widths adapt to dense operational pages and visual dashboards without awkward unused space.

## Role-aware dashboards

The generic foundation home page is replaced with a dashboard selected from the signed-in user's permissions and role.

### HR

- Active workforce, leave today, pending HR actions, payroll state and compliance alerts.
- Workforce and department visuals, recent HR activity, upcoming events and quick actions.
- Links to Employees, Leave, Staff Advances, Performance and Training.

### CFO and MD

- Curated executive aggregates only; no new raw employee access.
- Project cash, outstanding accountability, payroll totals, portfolio health, approval queues and operational exceptions.
- Drill-downs respect the existing governance-report security boundary.

### Warehouse Manager

- Stock health, pending requests, active custody, recent movements and low-stock exceptions.
- Quick actions for receiving a new item, receiving an existing item, adding equipment and opening pending requests.

### Project Manager

- Assigned portfolio health, coordinators, daily updates awaiting review, cash position and inventory activity.
- Quick actions for project creation where authorised, assignment, status changes and review.

### Coordinator

- Assigned projects, today's updates, outstanding requests and recent team activity.
- Quick actions for daily updates, project cash and inventory requests.

### Employee

- Personal leave, staff advances, performance actions, training/certifications and recent notifications.
- Private data remains scoped to the signed-in employee.

## Reports and visual summaries

Reports & Audits becomes a role-aware visual workspace rather than a collection of number-only panels:

- Domain overview tabs for workforce, payroll, inventory, projects and cash.
- Trend, distribution, progress and exception visuals built from the existing governance snapshot.
- Clickable visual summaries and exception cards open the relevant filtered destination.
- Existing verified statutory and operational exports remain available and audited.
- Empty domains display useful explanations and next actions rather than blank chart frames.

## Operational module refurbishment

The same hierarchy applies throughout:

- Projects and every project tab: summary, team, updates, cash, inventory/equipment, documents and history.
- Daily Tracker: submitter identity and title, timestamps, evidence gallery, review state and actions.
- Inventory: overview, consumables, equipment, requests, ledger and bulk tools.
- Project Cash: request, approval, disbursement, expense evidence, returns and reconciliation.
- HR: employee records, payroll, leave, staff advances, performance, training and administration.
- Employee portal: dashboard and all self-service records.
- Reports, audit and system administration.

Tables, filters and action bars remain compact. Cards are used for summary and hierarchy, not to wrap every individual field. Mobile layouts favour readable record cards when a wide table cannot remain usable.

## Forms, dropdowns and modals

- Shared field sizing, labels, help text, validation, required markers and error placement.
- Searchable datasets use the established smooth combobox; short fixed choices retain accessible native controls where appropriate.
- Modal titles, sections, footers and destructive actions follow one consistent pattern.
- Long forms use clearly separated sections and responsive columns.
- Evidence uploaders expose selected files, constraints, progress, failure and removal clearly.
- Existing unsaved-state behaviour is preserved; broader draft protection remains part of production hardening where not already implemented.

## Data and navigation flow

- No separate analytics database is introduced.
- Existing React Query APIs and secure database functions remain authoritative.
- Dashboard aggregations reuse existing safe snapshots where possible and add narrowly scoped read functions only when a visual cannot be produced securely from current data.
- Every actionable metric carries a destination and, where possible, an explicit filter in route state or query parameters.
- Empty, loading, stale and failed requests have explicit visual states.

## Accessibility and responsive behaviour

- Keyboard-reachable navigation, menus, tabs, dialogs, filters, charts and action cards.
- Visible focus states and sufficient contrast.
- Charts include text summaries or accessible tabular equivalents.
- Touch targets remain practical on phones and tablets.
- Verify at approximately 1440 px desktop, 1024 px tablet and 390 px phone widths.
- Support long names, large currency values, dense tables and empty accounts without breaking hierarchy.

## Verification

- Unit tests for shared visual primitives and role-dashboard selection.
- Existing module tests remain green.
- Browser journeys for each premium reference role and critical drill-down paths.
- Visual and responsive review of all major route families.
- Accessibility checks for dialogs, navigation, forms, tabs, action cards and charts.
- Database regression suites whenever new safe aggregate functions are required.
- Final type check, lint, complete unit suite, browser suite, linked database suites, schema lint and production build.

## Completion definition

The phase is complete only when every currently reachable OneHub route uses the shared premium system, the six role experiences provide useful canonical dashboards and quick actions, reports are visual and drillable, operational screens are polished across desktop/tablet/phone, and the full verification checkpoint passes.
