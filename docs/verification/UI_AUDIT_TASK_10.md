# Task 10 UI Audit

**Date:** 13 July 2026  
**Status:** Approved input for Task 10; not yet implemented

## Product direction

Retain the current Egypro OneHub visual identity. Improve perceived quality through containment, rhythm, alignment and consistent surfaces rather than placing a heavy border around every element.

## Confirmed findings

### 1. Metrics lack visual containment

Cash and Reports render KPI groups with `className="oh-card"`, but `.oh-card` has no shared CSS definition. The content therefore appears to float on the page.

**Task 10 direction:** introduce one restrained shared surface and a compact KPI-band pattern. Use a soft background, consistent padding and subtle separators; reserve individual cards for metrics that need independent interaction or status.

### 2. Semantic design tokens are incomplete

Operational modules reference undefined variables including `--color-primary`, `--color-primary-light`, `--color-warning-surface`, `--color-success-surface` and `--color-background-subtle` while the canonical tokens use names such as `--color-primary-600` and `--color-warning-bg`.

**Task 10 direction:** replace unsupported aliases with canonical tokens or define intentional semantic aliases centrally. Do not allow browser fallback to determine production colors.

### 3. Report tabs retain native button borders

`.oh-portal-tab` styles links correctly but does not reset `border`, `appearance`, `font` or cursor behaviour for buttons. Reports uses buttons, producing heavy black outlines.

**Task 10 direction:** normalize link and button tabs through one component/class contract with a quiet neutral state and clear green active state.

### 4. Page content lacks a shared alignment grid

Headings, KPI values, tables and action buttons often begin on different horizontal lines. Large blank canvas areas amplify the impression that content is detached.

**Task 10 direction:** introduce consistent section headers, content surfaces and vertical rhythm. Use max-width, padding and dividers intentionally rather than adding decorative boxes everywhere.

### 5. Visual implementation is fragmented

Cash, Reports, Tracker and several detail pages contain extensive one-off inline styles. Equivalent concepts therefore use different type sizes, spacing, colors and responsive behaviour.

**Task 10 direction:** extract shared page-header, KPI-band, section-surface and tab patterns. Keep domain components focused on their data and actions.

### 6. Page titles and action hierarchy need restraint

Normal operational pages use a title scale up to `2.6rem`, while some modules use unrelated inline `h2` sizes. Primary and secondary actions sometimes compete, and an empty state may repeat the header's primary action.

**Task 10 direction:** use approximately `2rem` desktop and `1.65rem` mobile for ordinary page titles, retain larger display type only for the home dashboard, and establish one primary action per decision area.

### 7. Responsive module navigation needed a stable contract

Module tabs previously wrapped and route-relative links could recursively append path fragments.

**Resolved before Task 10:** canonical absolute module routes plus a single-line, horizontally scrollable tab strip on narrow screens.

## Required visual validation

- 1440px desktop
- 1024px tablet
- 390px mobile
- HR employee directory and dossier
- Payroll list and run detail
- Inventory overview, equipment, requests and bulk tools
- Project Cash list and advance detail
- Daily Tracker overview and updates
- Reports tabs, metrics, empty states and tables

Review each state for containment, alignment, typography, overflow, focus visibility, action priority and empty/loading/error presentation.

