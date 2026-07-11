# Egypro payroll migration source notes

The authoritative source workbook for the initial employee and payroll migration is `Egpro Payroll (9).xlsx`.

## Observed structure

- 38 worksheets: monthly payroll history, one PAYE worksheet, `Staff Advance`, and `Staff Details`.
- The latest observed payroll worksheet is `June 2026`.
- Historical payroll values must be imported as recorded, immutable snapshots. They must not be silently recalculated with the current payroll engine.

## Required normalization and review

- `% of month worked` is stored as an Excel fraction (`1` means `100%`). The historical importer must normalize that value before mapping it to OneHub's `0..100` percentage representation.
- Historical monetary cells can contain fractional UGX. Preserve their source values for historical reconciliation; newly calculated OneHub payroll rounds final monetary components to whole UGX.
- The workbook's `Type` and contract/engagement fields do not independently determine statutory treatment. Some consultant rows use WHT even when `Type` is `Local`.
- Some `Global` rows include NSSF. OneHub must therefore keep NSSF applicability independently configurable instead of inferring it only from the local/global label.
- Employee identity matches must follow the protected migration rules: reliable identifiers and reviewed mappings, never automatic fuzzy-name merges.

These rules are migration inputs for Task 15. No personal employee values are reproduced in this note.
