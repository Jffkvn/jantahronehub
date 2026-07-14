# Tasks 15–22 Stabilization Results

**Date:** 14 July 2026  
**Branch:** `codex/stabilize-tasks-15-22`  
**Original comparison commit:** `e5407cc`  
**Verified application commit before Task 11 hardening:** `b6ec8d2`  
**Linked Supabase project:** `sewbxazwpjbtevckorbl` (stabilization/Antigravity only)

## Outcome

Tasks 15–22 have been consolidated and the application-level stabilization checks pass. Task 11 also removed two browser-side injection risks found during the security review: QR label printing no longer writes operational data as HTML, and evidence/receipt destinations are restricted to safe HTTPS URLs (plus localhost HTTP during development).

Promotion to the original repository or original Supabase project has **not** been performed.

## Application verification

| Check | Result |
|---|---|
| TypeScript | Pass |
| ESLint | Pass |
| Vitest | 52 files, 178 tests passed |
| Production build | Pass |
| Playwright | 12 tests passed |
| Git whitespace check | Pass |
| Public source maps | None emitted |

The verified Playwright journeys cover the login entry point, desktop/mobile shell, safely scrolling module navigation, browser security headers, payroll workflow, and HR UI at desktop, tablet and mobile sizes.

## Production bundle profile

The principal route chunks from the verified build are:

| Chunk | Minified | Gzip |
|---|---:|---:|
| HR | 41.50 kB | 11.53 kB |
| Project cash | 39.15 kB | 7.79 kB |
| Tracker/projects | 61.67 kB | 10.20 kB |
| Warehouse | 82.47 kB | 16.53 kB |
| Reports | 37.52 kB | 7.82 kB |
| Supabase client | 204.21 kB | 52.52 kB |
| Main application | 389.25 kB | 121.23 kB |

Large specialist libraries are isolated from ordinary navigation:

- Spreadsheet parsing/export is dynamically imported at import or export actions.
- Historical payroll and employee workbook parsing run in dedicated workers.
- The spreadsheet library is a separate 493.32 kB chunk (160.67 kB gzip).
- Payslip generation is imported only when a payslip is requested. Its dedicated PDF chunk is 1,429.47 kB (480.97 kB gzip), which triggers Vite's size warning but does not increase initial route loading.

No manual chunk configuration was added because the current action-bound separation is explicit and avoids fragile bundler coupling.

## Database verification

| Check | Result |
|---|---|
| Local/remote migration parity | Match through migration `0061` |
| Linked schema lint | Pass; no schema errors found |
| Hosted pgTAP suites | Pass; all 13 suites completed |

All 13 hosted SQL test files completed against project `sewbxazwpjbtevckorbl`. This includes cash advances, employee imports, historical payroll migration, HR and identity RLS, inventory, notifications, payroll exports and workflow, projects, reports, Storage RLS and warehouse approval routing. Every planned pgTAP assertion reported `ok`, the procedural employee-import suite completed without exception, and every transaction rolled back its fixtures.

The original Supabase project `kgntxnwvnayhjpsoauuj` remains out of scope until explicit promotion approval.

## Security and supply-chain review

| Check | Result |
|---|---|
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Lockfile and reproducible CI install | Present; CI uses `npm ci` |
| Tracked environment files | `.env.example` only |
| Tracked-secret scan | No secret value found |
| Client service-role usage | None |
| Dangerous HTML sinks | None in production code after QR printing fix |
| External evidence/receipt links | HTTPS validated; localhost HTTP allowed only for development |
| Third-party browser scripts | None |
| Service worker/offline sensitive caching | None |
| Security headers | CSP, clickjacking, `nosniff`, referrer, permissions and cross-origin policies configured and covered by Playwright |

The secret-name scan finds `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` only as server-side environment lookups inside the notification Edge Function. No values are present in tracked files.

## Remaining nonblocking items

- Resend email delivery intentionally remains unconfigured until a sending domain is available. In-app notifications remain the launch baseline.
- The payslip PDF chunk is large but action-loaded. Revisit only if real-device export timing becomes unacceptable.
- Runtime production headers must be checked again after choosing the final hosting provider; the current static header configuration and local Playwright check are green.
