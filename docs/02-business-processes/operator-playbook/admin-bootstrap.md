---
type: engineering-runbook
status: Draft
---

# Process: Platform admin bootstrap (first super-admin, no manual scripts)

**Audience:** engineer/operator setting up a new environment (local, QA,
prod), and — once shipped — the first admin using the product for the very
first time.
**Pre-reading:** [ADR-0021 — RBAC manifest](../../adr/0021-rbac-manifest.md)
§9 "Bootstrap procedure", [auth-architecture.md](../../04-development/architecture/auth-architecture.md).
**Replaces:** the current manual procedure (ADR-0021 §9: an operator
manually creates Authentik groups via the Authentik console, then manually
assigns one human to `aiqadam-super-admin`, with no seeded account, no
forced first-login flow, and no verification step beyond "sign in and see
if it worked").

## Why this process exists

The current bootstrap is a one-time, human-operated console procedure with
no self-service path and no built-in verification. In practice this has
proven unreliable: a live incident (2026-07-28, tracked in
[ISS-RBAC-PERMS-001](../../../.copilot/issues/ISS-RBAC-PERMS-001.md) and
related same-day issues) showed the underlying Authentik-groups →
RBAC-sync → Directus-policies chain silently failing in more than one way,
and a QA user (reporting via GitHub issue #107) ran a script intended to
grant them super-admin that did not actually work — with no error, no
audit trail, and no way for the user to self-diagnose why. "Run a script
and hope" is not an acceptable bootstrap process for a security-sensitive
role.

## Trigger

A fresh environment (new local dev checkout, new QA instance, new
production deploy) has zero admin users — nobody can reach
`/workspace/admin/*` yet.

## Actors

- **The system**, at first boot / first migration.
- **The first admin** — a human who has physical/deploy access to the
  environment (e.g. the engineer standing up QA, or Viktor in production).

## Process

**Resolved (see "Architectural resolution" below): the seeded account
lives in Authentik, not in the platform's own database.** The platform
never stores or validates this password directly — Authentik does, exactly
as it does for every other user, preserving `auth-architecture.md` §2's
"only Authentik sees a password" guarantee with no exception carved out.

1. **Seed step (system, automatic, via Authentik's API).** On first boot
   against a fresh environment with no `aiqadam-super-admin` group members
   yet, a bootstrap job calls Authentik's own user-creation API (the same
   API the RBAC-sync service already uses — see
   [FR-ADM-007](../../03-requirements/FR-ADM-007.md)) to create exactly one
   admin user directly in Authentik:
   - Username/email: a fixed, documented value (exact value TBD by
     RequirementAnalyst, e.g. `admin@aiqadam.org`; must be
     environment-agnostic and never silently differ between
     local/QA/prod).
   - A known, documented default password, set via Authentik's own
     password-set API.
   - The bootstrap job immediately assigns this Authentik user to the
     `aiqadam-super-admin` group (same mechanism ADR-0021 §9 step 2
     currently does by hand).
   - The bootstrap job triggers Authentik's own "require password change
     on next login" flag on this user (Authentik natively supports this
     per-user recovery-flow setting — this is not a platform-built
     feature, it's configuring an existing Authentik capability
     programmatically instead of by hand).
2. **First login (human).** The first admin signs in through the normal
   OIDC sign-in flow (`auth-architecture.md` §1) with the seeded
   credentials — no special "bootstrap sign-in" path; it is the same
   sign-in every user uses.
3. **Forced password change (Authentik, blocking).** Authentik's own
   recovery flow intercepts the login (its native behavior for any user
   flagged "must change password") and forces a password change before
   issuing the OIDC authorization code back to the platform. The platform
   never sees or validates the old or new password at any point.
4. **From here on, this account is a normal super-admin** — no different
   from any other role-holder in the new roles/groups/permissions model
   (see [admin-user-management.md](./admin-user-management.md)). Any
   *additional* admins are created via that process's invite/role-grant
   flow, not by repeating this bootstrap.

## Architectural resolution

**Chosen: bootstrap lives entirely in Authentik (option (a) from the
original draft).** The platform's bootstrap job is a thin orchestration
step that calls Authentik's existing user/group/password APIs — the same
category of call `RbacSyncService` already makes — rather than the
platform owning a credential itself. This requires no exception to
`auth-architecture.md` §2 and no re-acceptance of that ADR's rationale;
it is a direct extension of the existing "Authentik is the identity
source of truth" design, just automating a step (ADR-0021 §9 step 2:
"Operator assigns Viktor to `aiqadam-super-admin`. Validates by signing
in.") that is manual today.

## Negative / edge cases to design for (RequirementAnalyst to formalize as ACs)

- What happens if bootstrap runs twice (e.g. a redeploy) — must be
  idempotent; must NOT reset an already-configured admin's password.
- What happens if the seeded account's password is never changed (should
  the system nag, lock, or just persist the forced-change gate forever)?
- Environment separation: the same fixed default credentials existing in
  local, QA, and prod is a real risk if prod bootstrap isn't immediately
  followed by the forced change — this needs an explicit "no unchanged
  seeded admin can reach prod traffic" guarantee, not just a UI nudge.

## Super-admin cap (ADR-0021 line 38)

ADR-0021 caps `super_admin` at **≤ 3 humans**, with MFA mandatory once it
ships (Sprint 5 follow-up, not yet built). The bootstrap account counts
against this cap from the moment it's created — it is not a "free" or
exempt admin. RequirementAnalyst MUST include an explicit AC that the
bootstrap job checks current `aiqadam-super-admin` membership count before
creating the seeded account (skip/no-op if a super-admin already exists —
this is also the natural idempotency guard for re-running bootstrap on a
redeploy, see "Negative / edge cases" above). This is the same cap
[admin-user-management.md](./admin-user-management.md) enforces going
forward for every *subsequent* grant — bootstrap and ongoing management
share one enforcement rule, not two separate ones.

## References

- [ADR-0021 — RBAC manifest](../../adr/0021-rbac-manifest.md)
- [auth-architecture.md](../../04-development/architecture/auth-architecture.md)
- [ISS-RBAC-PERMS-001](../../../.copilot/issues/ISS-RBAC-PERMS-001.md)
- [ISS-UAT-RBAC-001](../../../.copilot/issues/ISS-UAT-RBAC-001.md)
- GitHub issue [#107](https://github.com/aiqadam/ai-qadam-platform/issues/107)

## System requirements

| FR | Capability | Status |
|---|---|---|
| [FR-ADM-010](../../03-requirements/FR-ADM-010.md) | Platform admin bootstrap (no manual scripts) | Proposed |
