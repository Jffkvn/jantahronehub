# Six-item operational acceptance design

## Approved outcome

This batch closes the remaining functional acceptance gaps without starting the broader visual redesign.

1. Authorized project participants see the requester's or submitter's real display name and operational role. Coordinators and the assigned PM can see requests for their shared project, while unrelated projects remain private.
2. Coordinators request inventory by item and quantity only. The database derives a trusted unit value from recorded receipts or equipment acquisition value; sensitive or above-threshold requests continue to require CFO approval. Missing valuation cannot silently become zero.
3. The notification bell shows a numeric unread badge. Notifications store a safe internal destination and open that destination after being marked read.
4. A daily update accepts up to ten JPG, PNG, or WebP photos, each no larger than 10 MB. Files are stored privately, previewed before submission, and exposed only through short-lived signed URLs to authorized viewers.
5. Warehouse overview metrics are navigable and open their relevant inventory screens, including a filtered pending-request destination.
6. Focused database and UI tests cover the new behavior; the already completed manual operational checkpoint is not repeated.

## Architecture

A single additive migration supplies least-privilege operational read RPCs, server-side inventory valuation, notification destinations, and private daily-evidence storage controls. Existing direct profile joins are replaced only where row-level profile privacy currently produces generic fallback labels. React pages consume the new read models, while existing role and project-membership checks remain the authorization boundary.

Inventory value is calculated inside `rpc_request_stock`: consumables use the latest positive recorded receipt price and equipment uses its recorded acquisition value. If the system cannot determine a value, the request is rejected with a clear Warehouse valuation message rather than routed as zero. This keeps finance data out of the Coordinator form without weakening threshold approval.

Daily evidence uploads use the existing `private-files` bucket and private-path helpers. Uploads complete before the daily update transaction; if submission fails, newly uploaded objects are removed. Stored paths are converted to signed viewing URLs only for an authorized reader.

## Deferred work

Charts, report redesign, role-specific quick-action panels, the full Daily Tracker/project-detail visual refurbishment, remaining HR domains, and production deployment remain outside this batch.
