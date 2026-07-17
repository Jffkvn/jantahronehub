# Operational acceptance corrections

## Approved outcome

- Notifications are recipient-safe and refreshed per signed-in profile. Cash requests notify all active CFO and Super Administrator recipients.
- Cash expense evidence is uploaded into private storage; a receipt-unavailable exception remains available with a mandatory explanation.
- Authorized CFOs and Project Managers can move a project between planned, active, on hold, cancelled and completed states with an audited reason.
- Every project workspace tab uses the same padded cards, headings, metric tiles, empty states and responsive hierarchy.
- Warehouse Managers can create an item master, receive an existing item, create-and-receive a first-time item, and register a newly received equipment asset with supplier, GRN, invoice, date, value, condition and location.

## Implementation sequence

1. Isolate notification cache keys by profile and refresh on bell open; retain database fan-out triggers.
2. Add private cash-receipt storage validation and signed downloads, then replace the URL field with a file picker.
3. Generalize the project status dialog and apply the project workspace visual treatment to reconciliation and tab content.
4. Add atomic receiving RPCs and the three explicit Warehouse Manager actions.
5. Apply migrations, run focused UI/SQL tests, then run the full verification suite and build.

## Safety rules

- No public receipt URLs; only validated private object paths and short-lived signed downloads.
- Failed business transactions remove newly uploaded files.
- First-time receipts are atomic so failed receipt validation cannot leave orphan item masters or assets.
- Status and receiving changes remain permission-checked and audit-recorded in the database.
