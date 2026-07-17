# Phone Photo Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Accept common iPhone and Android photo formats as private daily-update evidence.

**Architecture:** Extend the shared private-file policy first, then align the picker, path validation, storage bucket and daily-update RPC in one migration. Preserve originals and use signed private downloads for formats the browser cannot preview.

**Tech Stack:** React, TypeScript, Vitest, PostgreSQL/Supabase Storage, pgTAP

---

### Task 1: Express the desired file policy

**Files:**
- Modify: `src/lib/security/filePolicy.test.ts`
- Modify: `src/lib/security/privateFiles.test.ts`

1. Add failing metadata and ISO-BMFF signature tests for HEIC, HEIF and AVIF.
2. Add failing safe-path tests for the new extensions.
3. Run the focused unit tests and confirm the failures are caused by unsupported formats.

### Task 2: Implement the shared client policy

**Files:**
- Modify: `src/lib/security/filePolicy.ts`
- Modify: `src/lib/security/privateFiles.ts`
- Modify: `src/modules/projects/components/DailyEvidenceInput.tsx`
- Modify: `src/modules/projects/api/projects.ts`

1. Add the extensions, MIME types and ISO-BMFF brand checks.
2. Increase the signature prefix read enough to inspect the file-type box.
3. Align the picker and user-facing validation message.
4. Rerun focused unit tests until green.

### Task 3: Align hosted private storage and database validation

**Files:**
- Create: `supabase/migrations/0084_phone_photo_evidence_formats.sql`
- Modify: `supabase/tests/projects_workflow.sql`

1. Add a failing pgTAP case that submits a private HEIC evidence object.
2. Verify it fails against the current linked database.
3. Extend the private bucket MIME list, safe path function, storage policies and daily-update RPC path validation.
4. Apply migration 0084 and verify the project workflow suite passes.

### Task 4: Final verification

1. Run focused unit tests, type-check, lint, production build and database lint.
2. Confirm migration 0084 is live.
3. Do not commit, push or deploy the repository.
