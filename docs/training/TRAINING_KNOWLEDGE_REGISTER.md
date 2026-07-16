# OneHub Training Knowledge Register

## Purpose and ownership

This register captures verified product concepts, operating procedures and cautions while OneHub is being tested. It is the source material for the detailed administrator and end-user training manuals.

- **Owner:** JantaHR product support during implementation; Egypro's designated system owner after handover.
- **Contributors:** `super_admin`, HR and approved process owners.
- **Rule:** An entry becomes **Verified** only after the relevant application and database workflow has passed its required tests.
- **Review:** Recheck affected entries whenever roles, navigation or business workflows change.

### Status definitions

- **Draft:** Observed or designed, but not fully verified.
- **Verified:** Confirmed in the working product and supported by completed tests.
- **Needs update:** Product behaviour changed and the training explanation must be revised.
- **Retired:** The workflow is no longer used; retained only for historical context.

## Training entries

### TRN-001 — Account, role and employee record are separate concepts

**Status:** Verified
**Audience:** `super_admin`, HR administrators and trainers

OneHub deliberately separates three records:

1. A **user account** is the person's login identity and authentication record.
2. A **role** is a collection of permissions that controls which work the account can perform.
3. An **employee record** stores the person's employment, payroll and self-service information.

These records are related, but they are not interchangeable. A support account can exist without being an employee, while an employee record can exist before the person is invited to sign in.

**Real-world example:** HR may create a new employee before their company account is ready. Their employment record exists immediately, but they cannot log in until a user account is created and linked.

### TRN-002 — Role controls actions; employee link controls personal identity

**Status:** Verified
**Audience:** All administrators

> A role determines what a user can do. An employee link determines whose personal employment information they can access.

Giving someone the HR Administrator role allows authorized HR operations. It does not tell OneHub which employee profile belongs to that person. Linking the account to an employee record enables their own My Workspace profile, documents and payslips.

**Control:** Never use an employee link as a substitute for assigning the correct role, and never assign a privileged role merely to make My Workspace visible.

### TRN-003 — The `super_admin` account normally remains unlinked

**Status:** Verified
**Audience:** System owner and JantaHR support

The `super_admin` account is an owner/support identity rather than an employee identity. It normally remains unlinked so support access is not confused with an employee's HR or payroll history.

An unlinked `super_admin` will not have a personal employee profile in My Workspace. This is expected, not an error.

**Control:** Use a separate, ordinary employee account when testing employee self-service. Do not link the owner/support account simply to remove the unlinked indicator.

### TRN-004 — Real HR staff should be linked to their employee record

**Status:** Verified
**Audience:** `super_admin` and HR administrators

A real HR staff member normally needs both:

- the **HR Administrator role** to perform HR work; and
- an **employee link** to access their own My Workspace profile, documents and payslips.

Without the link, HR Management can still be available because the role is correct, but My Workspace displays that no employee profile is linked.

### TRN-005 — Safely create, invite, link and authorize a user

**Status:** Verified
**Audience:** `super_admin` and HR administrators

Use this order for a normal staff member:

1. Create or confirm the employee record in **HR Management → Employees**.
2. Confirm the employee number, name and email before linking identities.
3. Create/invite the user account in **System Administration** using the intended login email.
4. Link the account to the matching employee record.
5. Assign only the roles required for the person's responsibilities.
6. Record a clear reason for privileged access changes.
7. Ask the user to sign in and confirm both their work modules and My Workspace.

**Controls:**

- Do not link by name alone when two people could be confused; confirm employee number and email.
- Do not share accounts.
- Do not give `super_admin` merely for convenience.
- Deactivation removes login access; offboarding and archiving preserve employment history.

### TRN-006 — HR Setup supplies employee dropdowns

**Status:** Verified
**Audience:** HR administrators and trainers

HR owns the active **Departments**, **Job Titles** and **Pay Grades** through **HR Management → Setup**. These records are the controlled source for employee assignments.

If a Department, Position/Job Title or Pay Grade dropdown is empty, HR Setup is incomplete; it does not mean the employee form should accept arbitrary text.

**Normal operating sequence:**

1. Create the department.
2. Create the job title and make it company-wide or associate it with the correct department.
3. Create the pay grade where payroll classification is required.
4. Return to the employee form and select the approved setup records.

Department-specific titles appear only for their department. Company-wide titles can be used across departments. Archived setup records cannot be assigned to new or updated employment records, but historical employee relationships remain preserved.

**Resolved product gap:** The former empty Department and Position/Job Title dropdowns were caused by the absence of a user-facing HR Setup workspace. The Setup workspace, employee-form integration, Excel-import mapping, audit controls and database assignment validation have now passed the complete application, browser and hosted-database closing gate.
