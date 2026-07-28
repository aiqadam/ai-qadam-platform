---
type: operator-playbook
status: Draft
---

# Process: Admin manages users, roles, and access via the admin panel

**Audience:** super-admins and (where the future role model allows)
scoped admins (e.g. country leads) managing users within their scope.
**Pre-reading:** [ADR-0021 — RBAC manifest](../../adr/0021-rbac-manifest.md),
[admin-bootstrap.md](./admin-bootstrap.md), existing
[FR-ADM-005](../../03-requirements/FR-ADM-005.md) (operator invites),
[FR-ADM-007](../../03-requirements/FR-ADM-007.md) (RBAC sync).
**Replaces:** direct Authentik-console group edits and any Directus-policy
or Postgres `users.role` console/script edits as the way admins are
managed day to day.

## Why this process exists

Today, changing who has what access requires an operator to either use the
Authentik admin console directly (`aiqadam-super-admin`,
`aiqadam-country-lead-<xx>`, etc. groups) or run a one-off shell script
(`scripts/uat-seed.sh`-style group assignment, or ad hoc SQL against
`users.role`). Neither is a normal admin-facing feature: both require
engineering-level access and tooling, there's no in-product visibility
into "who has what role," and — per the incident that triggered this
workflow — the mechanism has proven unreliable enough that a script
claiming to grant a role can silently fail. Admins should be able to
manage user access the same way they manage anything else on the
platform: through a screen, in the product, with visible confirmation.

## Trigger

An admin needs to change another user's role or access — promoting a
member to organizer, granting/revoking country-lead status, deactivating
an account, or (per issue #107's original ask) reviewing "user settings"
broadly.

## Actors

- **Super-admin** — full scope, per the existing ADR-0021 role table.
- **Scoped admin** (e.g. country lead) — if the role model (see below)
  extends self-service role management below the super-admin tier; TBD by
  RequirementAnalyst, not assumed here.
- **Target user** — the account being modified.

## Process

1. Admin navigates to the admin panel's user/role management screen
   (extends the existing `/workspace/admin/users` invite list — this
   process is about generalizing that screen from "pending invites only"
   to "manage every user's role," not building a new surface from
   scratch).
2. Admin searches/filters for the target user.
3. Admin views the user's current role(s)/group(s) in plain language (not
   raw Authentik group names) — this is the "normal, understandable"
   requirement: the screen must render the role model from
   §"Roles/groups/permissions model" below, not expose internal group
   slugs as the primary UI.
4. Admin changes the role (grant, revoke, or replace) via form controls
   (dropdown/checkboxes), not free text.
   - **If the change would grant `super_admin`:** the system checks the
     current `aiqadam-super-admin` membership count first. At ≥ 3 existing
     members, the grant is **blocked** (not just warned) with a clear
     explanation referencing the ADR-0021 cap — resolved per user decision
     (enforce, not advisory). This is the same check
     [admin-bootstrap.md](./admin-bootstrap.md) performs before creating
     the seeded account — one shared enforcement rule.
5. System applies the change and shows a confirmation that reflects the
   **actually-applied state**, not just "request sent" — the system
   re-reads the target user's live group membership from Authentik after
   applying the change and displays that, rather than optimistically
   showing the requested state. This is a hard AC, not an optional
   nice-to-have: the incident that triggered this whole workflow was a
   script that appeared to succeed but silently didn't apply, with no way
   for the user to tell. A confirmation screen with the same blind spot
   would reproduce the exact failure this process exists to fix.
6. Change is recorded in the existing audit log
   ([FR-ADM-008](../../03-requirements/FR-ADM-008.md)).

## Roles/groups/permissions model (scope resolved)

The user asked for "a normal subsystem of role groups, roles and
permissions with a normal standard, understandable for all, GUI." The
current model already has role semantics defined in ADR-0021 §4
(`member`, `organizer`, `country_lead`, `speaker`, `sponsor_rep`,
`super_admin`, plus two service-account roles) — the gap is not "no roles
exist," it's "no UI exposes them, and the underlying mechanism
(Authentik groups as source of truth, synced into Postgres/Directus via a
sometimes-broken sync service) is not admin-manageable directly, and its
failures are silent."

**Resolved: the "verify actually-applied state" requirement in step 5
above (not a separate hardening project) is the scope commitment.**
Rather than a wholesale rebuild of `RbacSyncService` (out of scope — that
is `ISS-RBAC-PERMS-001`'s own, separately-tracked remediation), this
process requires the admin-panel UI to close the specific silent-failure
gap that caused the triggering incident: every role change must be
followed by a live re-read of Authentik group membership, displayed to
the admin, so "the screen says granted" and "Authentik actually has it"
can never silently diverge the way the script's claimed success did.
`ISS-RBAC-PERMS-001`'s remaining Directus-permission-row work (the
six unimplemented policies) is a related but separately-scheduled
concern — this process depends on Authentik group membership being
correctly readable/writable, which it already is per
`ISS-UAT-RBAC-001`'s fix; it does not depend on the Directus permission
rows landing first.

## Negative / edge cases to design for (RequirementAnalyst to formalize as ACs)

- Admin attempts to revoke their own super-admin access (should this be
  blocked, to prevent an environment ending up with zero admins?).
- Admin attempts to grant a role that doesn't exist / a role the acting
  admin isn't permitted to grant (e.g. a country lead trying to grant
  super-admin, if scoped admins get any access to this screen at all).
- Role change for a user who is currently mid-session — does the change
  apply on next login, or does the platform need to invalidate/refresh
  their live session? (`auth-architecture.md` §1 notes 15-minute JWTs —
  relevant to how fast a revoke must propagate.)

## References

- [ADR-0021 — RBAC manifest](../../adr/0021-rbac-manifest.md)
- [admin-bootstrap.md](./admin-bootstrap.md)
- [FR-ADM-005](../../03-requirements/FR-ADM-005.md), [FR-ADM-007](../../03-requirements/FR-ADM-007.md), [FR-ADM-008](../../03-requirements/FR-ADM-008.md)
- [ISS-RBAC-PERMS-001](../../../.copilot/issues/ISS-RBAC-PERMS-001.md)
- GitHub issue [#107](https://github.com/aiqadam/ai-qadam-platform/issues/107)

## System requirements

| FR | Capability | Status |
|---|---|---|
| [FR-ADM-011](../../03-requirements/FR-ADM-011.md) | Admin user and role management screen | Proposed |
