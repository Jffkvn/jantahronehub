# Remaining HR Domains Consolidation Design

## Goal

Consolidate the already-working legacy Staff Advances, Performance, and Training & Certifications workflows into Egypro OneHub without redesigning their proven behavior.

## Source of truth

- HR workflows and screens: `/Users/jeffadhaya/Documents/Anti gravity Projects/egypro`
- Employee self-service workflows: `/Users/jeffadhaya/Documents/Anti gravity Projects/egypro-portal`
- OneHub identity, permissions, audit, notifications, uploads, navigation, and payroll patterns: the current consolidated workspace.

The legacy fields, calculations, statuses, and user journeys remain the product contract. Changes are limited to correcting clear defects, fitting the OneHub design system, and enforcing OneHub security.

## Chosen approach

Port the three domains as one HR batch with a shared integration layer. Reuse the legacy workflow logic and reproduce its visible behavior in OneHub components. Replace direct browser table mutations with permission-checked RPCs, stable typed APIs, audit events, and role-scoped reads.

This is preferred over either importing the legacy applications wholesale, which would preserve incompatible authentication and styles, or rebuilding the features from requirements, which would waste proven work and risk parity regressions.

## Domain behavior

### Staff Advances

- Employees request salary advances and see only their own requests, balances, repayment progress, and decisions.
- HR records an advance directly for an employee or reviews an employee request.
- HR can approve, reject, correct, record repayments, flag an employee who is leaving, settle, or write off an advance with a mandatory reason.
- Approved repayment schedules feed payroll salary-advance deductions without mixing with Project Cash.
- Every financial transition is append-only in the event history; destructive legacy deletion is replaced by correction or voiding.

### Performance

- HR creates review cycles, includes employees, manages goals/KPIs, and tracks completion.
- Managers enter ratings, comments, and promotion/increment recommendations.
- Reviews move through draft, submitted, approved, acknowledged, and reopened states.
- Employees see and acknowledge only their own released reviews.
- Existing Excel template import/export behavior is retained behind permission checks.

### Training & Certifications

- HR logs and edits employee training records with topic, provider, date, duration, cost, result, certificate reference, issue date, and expiry date.
- Supporting certificates use OneHub private-file uploads rather than public links.
- Employees see only their own training and certification history.
- Expiring and expired certificates generate role-appropriate alerts and reporting.

## Shared architecture

Each domain receives a schema module, typed API adapter, focused HR page, employee page where applicable, and database acceptance suite. Database tables are not directly writable by browser roles. Security-definer RPCs resolve the current profile and employee identity, enforce permissions, validate transitions, create audit entries, and send notifications.

Existing OneHub components are reused for modals, forms, errors, status badges, employee selection, private uploads, notification paths, audit identities, and payroll line items. No parallel design system or duplicate authentication model is introduced.

## Error handling and testing

Expected validation conflicts return safe, specific messages; internal database errors remain generic in the UI. Every state-changing RPC is covered by database tests for allowed and denied roles. UI behavior is developed test-first with focused unit tests, followed by employee-to-HR acceptance journeys and one consolidated build/type/database verification after the batch.

## Delivery order

1. Staff Advances establishes the shared request, decision, notification, audit, and payroll pattern.
2. Performance reuses identity, notifications, and audit.
3. Training reuses identity, notifications, audit, and private-file storage.
4. The batch closes with consolidated acceptance evidence and a single coherent commit series.
