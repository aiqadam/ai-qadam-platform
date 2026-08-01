---
code: FR-ADM-010
name: Platform admin bootstrap (no manual scripts)
status: Implemented
module: Admin / Operator (ADM)
phase: Not phased
business_process: [BP-UAT-020]
---

## Description

Replaces the current manual, human-operated admin bootstrap (ADR-0021 §9:
an operator manually creates Authentik groups via the Authentik console
and manually assigns one human to `aiqadam-super-admin`, with no seeded
account and no automated verification) with an automated bootstrap job.
On first boot of a fresh environment with zero `aiqadam-super-admin`
members, the platform creates exactly one seeded admin account **directly
in Authentik** (via the existing `AuthentikClient`,
`apps/api/src/modules/admin-invites/authentik.client.ts` — the same client
`FR-ADM-005` already uses for invite acceptance), assigns it to
`aiqadam-super-admin`, and flags it to require a password change on first
login via Authentik's own recovery-flow mechanism. The platform never
stores or validates this password directly, preserving
`auth-architecture.md` §2's "only Authentik sees a password" design — this
requirement introduces no exception to that ADR.

Originated from GitHub issue #107, refined via
`docs/02-business-processes/operator-playbook/admin-bootstrap.md`
(business-process-development workflow `wf-20260728-bp-147`).

## Users

The system (automated, at boot). The first human with deploy access to a
fresh environment (local/QA/prod).

## Functional scope

1. **Bootstrap check** — On API startup (or a dedicated bootstrap
   endpoint/job, implementation detail for CodeDeveloper), check current
   `aiqadam-super-admin` group membership count via `AuthentikClient`.
   - If count is 0: proceed to seed step.
   - If count ≥ 1: no-op (idempotent — safe to run on every boot/redeploy,
     never resets an existing admin's password or overwrites an already
     bootstrapped environment).
2. **Seed step** — Call `AuthentikClient.createUser()` with a fixed,
   documented username/email (exact value: `admin@aiqadam.org` — must be
   identical across local/QA/prod, documented in `.env.example` and
   `docs/04-development/architecture/auth-architecture.md`) and a fixed,
   documented default password (documented alongside the email, e.g. in
   `.env.example` as `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD`).
3. **Group assignment** — Call `AuthentikClient.setUserGroups()` to add the
   seeded user to `aiqadam-super-admin`.
4. **Force password change** — Trigger Authentik's native "require
   password change on next login" behavior for this user (via Authentik's
   user-update API setting the appropriate field — CodeDeveloper to
   confirm exact Authentik API field name; NOT `createRecoveryLink()`,
   which issues a one-time link for out-of-band delivery and is a
   different mechanism than an in-flow forced change — needs its own
   confirmation against Authentik's API docs, flagged for CodeDeveloper).
5. **Cap enforcement** — The bootstrap check in step 1 doubles as the
   ≤3-super-admin cap's first enforcement point: bootstrap never creates a
   2nd+ seeded admin. Ongoing enforcement (blocking further grants once at
   3) is `FR-ADM-011`'s responsibility, not this requirement's.
6. **First login** — Standard OIDC sign-in flow
   (`auth-architecture.md` §1); no bootstrap-specific sign-in path.
7. **Forced change enforcement** — Authentik intercepts the login and
   forces the password change before completing the OIDC handshake; the
   platform receives the authorization code only after this completes,
   same as any other user's normal sign-in.

## Acceptance criteria

- [ ] AC-1: On a fresh environment with zero `aiqadam-super-admin` members,
      the bootstrap job creates exactly one admin user in Authentik,
      assigned to `aiqadam-super-admin`, with password-change required on
      next login.
- [ ] AC-2: Running the bootstrap job a second time (e.g. on redeploy)
      against an environment that already has ≥ 1 `aiqadam-super-admin`
      member is a no-op — no duplicate account created, no existing
      account's password reset.
- [ ] AC-3: Signing in with the seeded credentials for the first time
      forces a password-change screen before any other page is reachable;
      the platform never receives or logs the old or new password value.
- [ ] AC-4: After the forced change completes, the account functions as a
      normal super-admin with no further special-casing (verified via
      `FR-ADM-011`'s screens being reachable).
- [ ] AC-5: The seeded email and default password are documented in
      `.env.example` and `auth-architecture.md`, identical in
      spelling/format across local/QA/prod deployment configs.

## Notes

- Depends on `AuthentikClient` (`apps/api/src/modules/admin-invites/authentik.client.ts`)
  already having `createUser`, `setPassword` or equivalent, and
  `setUserGroups` — confirmed present by BusinessProcessAuditor during
  `wf-20260728-bp-147` Step 2 (attempt 2). CodeDeveloper should still
  verify the exact "force password change on next login" API field, which
  is distinct from the already-used `createRecoveryLink()` one-time-link
  mechanism.
- Relationship to `docs/02-business-processes/operations/country-lead-activation.md`:
  none directly — that runbook's RBAC-bind step is about onboarding
  country leads specifically (gated on ADR-0022, deferred per
  `business-process-gaps.md` G-1) using the existing manual mechanism;
  this requirement replaces the *super-admin* bootstrap only, not the
  country-lead onboarding flow.
- Business-process linkage: `BP-UAT-020` (reserved, authored at Step 4 of
  the originating workflow).
- **Live-verified 2026-08-02 (`wf-20260801-fix-191`, PR #231, squash `11a21f4`,
  closes #164).** The forced-password-change mechanism in
  `AdminBootstrapService.seedAdmin()` now uses an ExpressionPolicy wired
  into `default-authentication-flow`:
  1. `ensureForcePasswordChangeFlow()` provisions two ExpressionPolicies
     (`aiqadam-boot-pwd-change-check` + `aiqadam-boot-pwd-change-clear`)
     and two FlowStageBindings (PromptStage at order 25, UserWriteStage at
     order 26) in the default-authentication-flow, both with
     `re_evaluate_policies=true` (so they are evaluated after the
     identification stage sets `pending_user`). PolicyBindings wired via
     `policybindingmodel_ptr_id` (not the FlowStageBinding's own pk).
  2. `setBootstrapPasswordChangeAttribute(userPk)` PATCHes user attributes
     with `ak_login_password_change_required: true`.
  Unit tests cover the "correct calls made" level (15/15 pass,
  `apps/api/test/admin-bootstrap.service.spec.ts`). Live Authentik
  verification (does the flow actually show the password-change screen?)
  was also confirmed: ExpressionPolicy evaluated to `passing=True` for the
  seeded admin user via `ExpressionPolicy.passes()` inside the running
  container. Two prior failed attempts:
  - Original `ak_login_password_change_required` attribute-set: no built-in
    handler in Authentik 2024.x.
  - `password_change_next_login` user-body field (PR #229): PATCH returns
    HTTP 200 but the field is silently ignored (User model has no such
    attribute in 2024.12.3).
