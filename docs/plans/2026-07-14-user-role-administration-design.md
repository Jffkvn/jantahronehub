# OneHub User and Role Administration Design

**Date:** 14 July 2026
**Branch:** `codex/user-role-administration`
**Parent checkpoint:** `codex/stabilize-tasks-15-22` at `2c5434f`

## Objective

Add the missing user-access administration workflow required for acceptance testing and production operation:

1. `super_admin` establishes the first HR administrator.
2. HR administrators create or connect all other non-super-admin users.
3. `super_admin` retains the ability to manage every role for support, recovery and testing.
4. Every access change is authorized in PostgreSQL and recorded in the append-only audit ledger.

The stabilized checkpoint remains unchanged in its separate worktree.

## Current Gap

The current `/admin` route is a placeholder. Only `super_admin` can see it, HR has no user-administration permission, and OneHub has no user list, account linking, role editor, activation/deactivation workflow or audited account-administration functions.

The existing `profiles.manage` and `roles.manage` permissions are too broad for HR because direct table policies cannot safely express the rule that HR may manage every role except `super_admin`.

## Selected Approach

Add dedicated user-administration permissions and security-definer database functions. The React interface calls those functions, but it is not a security boundary.

During the no-domain testing phase, Auth users are created manually in the Supabase dashboard with test passwords. OneHub connects an existing Auth user by exact normalized email and creates its public profile, employee link and role assignments atomically. OneHub never receives, stores or displays the user's password.

Once a verified Resend domain is available, an invitation Edge Function can be added on top of the same profile, role and audit functions. Email delivery is explicitly outside this feature.

## Authorization Matrix

| Action | `super_admin` | `hr_admin` | Other roles |
|---|---|---|---|
| List user accounts and roles | Allowed | Allowed | Denied |
| Connect existing Auth user | Any role | Any role except `super_admin` | Denied |
| Assign or remove `super_admin` | Allowed, subject to last-admin guard | Denied | Denied |
| Assign non-super-admin roles | Allowed | Allowed | Denied |
| Update display name or employee link | Allowed | Allowed unless target is `super_admin` | Denied |
| Deactivate/reactivate user | Allowed, subject to last-admin guard | Allowed unless target is `super_admin` | Denied |
| Manage own access | Allowed only through the same guarded functions | Allowed only through the same guarded functions | Denied |

HR may assign `hr_admin`, `employee`, `coordinator`, `project_manager`, `warehouse_manager`, `cfo` and `managing_director`. This follows the approved operating rule that HR creates all remaining roles.

## Database Design

Migration `0062_user_administration.sql` will:

- Add `users.read` and `users.manage` permissions.
- Grant both permissions to `super_admin` and `hr_admin`.
- Keep direct `profiles.manage` and `roles.manage` table access exclusive to `super_admin`.
- Add a normalized, permission-checked user-account listing function that returns only the fields required by the administration UI.
- Add an atomic function to connect an existing `auth.users` record by exact email.
- Add an atomic function to update a user's display name, employee link and complete role set.
- Add an atomic activation/deactivation function.
- Add an access-audit listing function for authorized administrators.
- Revoke function execution from `public` and `anon`; grant only to `authenticated` where appropriate.

Every mutation will:

1. Derive the actor from `auth.uid()`.
2. Verify the actor is active and has `users.manage`.
3. Reject HR operations involving a target or requested role of `super_admin`.
4. Validate every role key and reject an empty role set.
5. Enforce one employee-to-profile link.
6. Prevent removal or deactivation of the last active `super_admin`.
7. Require a non-empty audit reason.
8. Apply profile, employee-link and role changes in one transaction.
9. Append an audit event containing previous and new access state.

The listing functions will not expose password hashes, tokens, MFA secrets, session data or other fields from `auth.users`.

## React Experience

`/admin` becomes a real administration workspace visible to `super_admin` and `hr_admin` when `users.read` is effective.

The initial interface contains:

- Summary counts: active, deactivated, unlinked and privileged users.
- Search and filters for name, email, role, status and employee-link state.
- A user table/card layout with name, email, roles, employee link, status and last access-change time.
- `Connect existing Auth user`, which explains the temporary Supabase-first testing flow.
- `Edit access`, allowing display name, employee link and role changes.
- `Deactivate` and `Reactivate` actions with mandatory reasons.
- A recent access-audit panel.

HR never sees `super_admin` as an assignable role. A super-admin target remains visible for awareness but HR receives no edit or status controls for that account. The database independently enforces the same restriction.

All user-provided strings render through normal React interpolation. No raw HTML, dynamic code, client-side secrets or untrusted redirect targets are introduced.

## Employee Linking

An account may initially be unlinked so privileged JantaHR support accounts remain separate from employees and test accounts can be staged before employee data exists.

When an employee link is selected:

- The employee must exist and not already be linked to another profile.
- Replacing or removing a link requires an audit reason.
- Employee self-service becomes available only when the authenticated profile is linked to that employee.

The UI clearly flags unlinked accounts rather than silently treating them as employees.

## Testing Strategy

### Database

pgTAP/procedural tests prove:

- HR can connect and manage every non-super-admin role.
- HR cannot create, edit, deactivate or assign `super_admin`.
- `super_admin` can create HR and manage every role.
- Other roles cannot list or mutate user access.
- The last active `super_admin` cannot be demoted or deactivated.
- Duplicate email/profile and employee-link conflicts fail atomically.
- Every successful mutation produces the expected audit event.
- Failed mutations leave no partial profile, role or employee-link changes.

### React

Vitest and Testing Library prove:

- Super admin sees all role choices.
- HR sees every role except `super_admin`.
- HR cannot open edit/status actions for a super-admin target.
- Forms require exact email, at least one role and a reason.
- Loading, empty, success and error states are usable.
- Search, filtering and responsive user cards work.

### Acceptance

A role-by-role manual checklist will be added under `docs/acceptance/`. It starts with the manually created Supabase Auth accounts, then validates the real chain:

`super_admin → HR administrator → all remaining roles`

Invitation-email delivery remains marked `PENDING DOMAIN` rather than falsely passed.

## Deferred Work

- Resend SMTP configuration.
- Sending invitations to arbitrary recipient addresses.
- Password reset delivery through Resend.
- Bulk user invitation.
- Custom roles and custom permission editing.
- Administrator impersonation.

None of these deferred items weaken the database authorization required for the current feature.
