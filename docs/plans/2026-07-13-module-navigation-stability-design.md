# Module Navigation Stability Design

**Date:** 13 July 2026

## Decision

Keep OneHub's two-level navigation model:

- The left sidebar switches between major modules.
- A horizontal, permission-aware tab strip switches between peer pages inside a module.
- Record-level tabs are reserved for sections of one record, such as equipment custody or maintenance history.

Inventory remains a tabbed module with Overview, Consumables, Equipment, Requests, Ledger History and Bulk Tools. Project Cash and Daily Tracker retain the same interaction pattern where applicable.

## Problem

Inventory tab links and fallback redirects currently use relative destinations inside a component-level wildcard route. After an unmatched URL, `Navigate to="overview"` resolves from the already-invalid location and repeatedly appends `/overview`. The page becomes blank and the URL grows indefinitely.

Project Cash and Daily Tracker contain the same relative-navigation pattern and must be covered by the regression audit.

## Approved Behaviour

- Every module tab uses a canonical absolute URL.
- Every module index and wildcard fallback redirects to a canonical absolute landing page.
- The active tab remains correct on detail routes, such as an inventory request or project detail.
- Clicking any global sidebar destination always escapes the current module.
- Invalid module URLs recover once, without recursive path growth.
- Icons are decorative and hidden from assistive technology.
- Tabs remain horizontal on desktop and scroll safely on narrow screens; the global sidebar does not gain nested module links.

## Validation

- Component tests reproduce invalid-route recovery and stable tab URLs.
- Tests cover Inventory, Project Cash and Daily Tracker.
- Playwright exercises repeated tab switching and confirms the URL never accumulates route fragments.
- A visual audit checks active states, overflow, blank states, missing back links and navigation traps before Task 10 begins.

