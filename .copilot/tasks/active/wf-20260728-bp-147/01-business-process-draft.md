## Business Process Draft

**Workflow:** wf-20260728-bp-147
**Source concept:** see `handoff.yaml.requirement_text` (corrected scope,
per `00b-scope-correction.md`) — replace the current script-driven,
unreliable admin/RBAC bootstrap with a proper in-product admin subsystem.

## Concept

Originated from GitHub issue #107 ("There is no admin panel"). Initial
investigation (`00a-investigation-issue-107.md`) found the literal ask
already shipped as `/workspace/admin/*`, but the underlying access-control
mechanism — Authentik groups as source of truth, synced via a
sometimes-broken `RbacSyncService` into Directus policies, with the
*only* admin bootstrap path being a manual Authentik-console procedure
(ADR-0021 §9) or ad hoc scripts — has proven unreliable in practice (a
script meant to grant the reporting user super-admin silently did not
work; three separate RBAC-sync bugs were found and fixed on QA the same
day per `ISS-UAT-RBAC-001`, `ISS-RBAC-PERMS-001`,
`ISS-INFRA-QA-DIRECTUS-SCHEMA-001`). User corrected the ask to: seed a
first-admin account with a forced password change, build a standard
understandable roles/permissions GUI, and let admins manage users/access
entirely through the product — no more scripts.

## Processes Identified

Two distinct processes, split per BusinessAnalyst's own guidance
(different actors/triggers, don't merge for convenience):

1. **Admin bootstrap** (`admin-bootstrap.md`) — a one-time, per-environment
   process: system seeds a first admin account, forces a password change
   on first login. Actor: the system + the first human with deploy access.
   Trigger: fresh environment with zero admins.
2. **Admin user/role management** (`admin-user-management.md`) — an
   ongoing, repeatable process: admins grant/revoke roles for other users
   through an in-product screen. Actor: any super-admin (or scoped admin,
   TBD). Trigger: any time access needs to change.

These are related (process 1 produces the first actor who can perform
process 2) but are not the same process — bootstrap happens once per
environment; user management happens continuously.

## Overlap Check

- `docs/02-business-processes/operations/country-lead-activation.md` —
  adjacent (RBAC-bind is step A of that runbook) but distinct: that
  process is about onboarding a *country lead* specifically (gated on
  ADR-0022 compensation, deliberately deferred per
  `business-process-gaps.md` G-1) using the *existing* manual mechanism.
  This draft is about replacing the mechanism itself and is orthogonal to
  the compensation gate — no conflict, but `admin-user-management.md`'s
  eventual implementation will very likely become the tool
  `country-lead-activation.md` step A references once it ships (noted as
  a future cross-reference, not resolved in this draft).
- `docs/02-business-processes/operations/member-password-reset.md` —
  adjacent (password-change UX precedent) but that process is
  Authentik-hosted self-service *forgot password*, not a forced
  first-login change on a platform-seeded credential. Referenced for house
  style, not merged.
- `FR-ADM-005/006/007/008` (all Shipped) — `admin-user-management.md`
  explicitly builds on top of `FR-ADM-005` (invites) and `FR-ADM-007`
  (RBAC sync) rather than duplicating them; flagged in the draft itself
  as "generalizes the existing `/workspace/admin/users` screen," not a
  new screen from scratch.
- `docs/02-business-processes/business-process-gaps.md` — checked, no
  existing gap entry covers this (the three gaps on file are G-1
  country-lead compensation, G-2 paid marketing spend, G-3 paid
  Russian-language editor — unrelated). No re-litigation risk.

## Draft Files

- `docs/02-business-processes/operator-playbook/admin-bootstrap.md`
- `docs/02-business-processes/operator-playbook/admin-user-management.md`
- `docs/02-business-processes/README.md` (index updated)

## Revision 2 (retry after Step 2 failed-retry)

BusinessProcessAuditor's first pass (`02-business-process-audit.md`,
attempt 1) returned `failed-retry`: 1 BLOCKER (bootstrap password vs.
Authentik-only architecture, unresolved) + 3 MAJOR findings (≤3-super-admin
cap unaddressed; sync-mechanism scope left open; scoped-admin access left
open). Per the workflow's `failed-escalate`/`failed-retry` split, the
BLOCKER was an architectural call for the user, not something to resolve
unilaterally — surfaced via AskUserQuestion. Both questions answered:

1. **Bootstrap credential:** lives in Authentik itself (option (a)) — the
   platform's bootstrap job calls Authentik's own user/password/group APIs
   rather than owning a credential directly. `admin-bootstrap.md` §"Process"
   and §"Architectural resolution" rewritten accordingly — no exception to
   `auth-architecture.md` §2 needed, so the BLOCKER is resolved, not
   overridden.
2. **≤3-super-admin cap:** enforced in the UI (blocking, not advisory).
   Both `admin-bootstrap.md` (new §"Super-admin cap") and
   `admin-user-management.md` (step 4 sub-bullet) now share one
   enforcement rule: check current `aiqadam-super-admin` count before any
   grant (bootstrap or ongoing), block at ≥ 3.

Additionally, without a further question (judgment call within the
already-answered scope), the sync-mechanism-scope finding was resolved as:
require live re-read-and-display of actually-applied Authentik state as a
hard AC on every role change (closes the silent-failure gap that caused
this whole workflow), without taking on the full `ISS-RBAC-PERMS-001`
Directus-permission-row remediation as part of this process — that stays
its own separately-tracked issue. The scoped-admin-access question remains
explicitly deferred to RequirementAnalyst (as originally drafted) — the
audit listed it as MAJOR-advisory, not BLOCKER, and did not require a
user decision to proceed.

## Flagged for BusinessProcessAuditor (retry pass)

- `admin-bootstrap.md`'s architectural resolution (Authentik-hosted
  bootstrap) should be re-checked against `FR-ADM-007`'s existing
  `RbacSyncService`/Authentik-API integration for feasibility — this
  draft assumes that API surface is reusable for user+password creation,
  not just group sync, which BusinessAnalyst has not independently
  verified against the actual API client code.

## Gate Result

gate_result:
  status: passed
  summary: "Revised both drafts per user's answers to the two AskUserQuestion items raised by Step 2's failed-retry: bootstrap now Authentik-hosted (no ADR exception needed), super-admin cap enforced (blocking) in both processes, sync-mechanism scope resolved as 'verify applied state' AC rather than full remediation."
  findings:
    - "admin-bootstrap.md: BLOCKER resolved — bootstrap credential now lives in Authentik, no local password storage"
    - "Both drafts: MAJOR resolved — ≤3-super-admin cap now a blocking UI check, shared rule across bootstrap + ongoing management"
    - "admin-user-management.md: MAJOR resolved — scope is 'verify applied state' as hard AC, not full RBAC-sync hardening (that stays ISS-RBAC-PERMS-001's own track)"
    - "admin-user-management.md: MAJOR still open by design — scoped-admin (country_lead) access explicitly deferred to RequirementAnalyst, not a blocker"
    - "New for auditor to check: Authentik-hosted bootstrap assumes FR-ADM-007's existing API client can also create users+passwords, not just sync groups — unverified by BusinessAnalyst"
