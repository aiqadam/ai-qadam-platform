# Scope Correction — Workflow Resumed

**Workflow:** wf-20260728-bp-147 (business-process-development)

## What changed

`00a-investigation-issue-107.md` found issue #107's literal ask
("there is no admin panel") already shipped
(`/workspace/admin/{countries,users,rbac-sync,audit}`), and concluded the
real problem was a missing Authentik group grant for the reporting user
(`vladimir.titenko`, QA) — a support action, not a product gap. The
workflow was marked `abandoned` on that basis.

## Why it was wrong to stop there

The user (Viktor) confirmed a script was run to grant super-admin and it
**did not work** — the account is still not recognized as super-admin.
Combined with today's (2026-07-28) issue history
(`ISS-UAT-RBAC-001`, `ISS-RBAC-PERMS-001`, `ISS-INFRA-QA-DIRECTUS-SCHEMA-001`
— three separate live RBAC-sync bugs found and fixed on QA the same day),
the pattern is clear: **the admin-bootstrap mechanism itself
(Authentik-groups + Directus-policies + one-off scripts, no UI, no
self-service, no verification) is unreliable enough that a real fix
requires replacing the mechanism, not granting one more manual exception.**

## Corrected scope (per user, verbatim intent)

1. Seeded initial admin account (`admin` / known default password),
   mandatory password change on first login.
2. A standard, understandable roles/groups/permissions model — replacing
   the current fragmented Authentik-groups / Postgres `users.role` enum /
   Directus-policies split with one coherent, GUI-visible model.
3. Admins manage users and access entirely through an in-product admin
   screen — no scripts, no direct Authentik/Directus console access for
   routine role changes.

`handoff.yaml.requirement_text` has been updated to this corrected scope.
`workflow_status` reverted from `abandoned` to `running`; resuming at Step 1
(BusinessAnalyst draft) against the corrected concept.

This is a considerably larger and more architecturally significant business
process than the original literal reading of #107 — it touches the
authentication/authorization model described in
`docs/adr/0021-rbac-manifest.md` (Accepted) and
`docs/04-development/architecture/auth-architecture.md`, not just an admin
screen. BusinessProcessAuditor's architectural-feasibility check
(Step 2) is expected to weigh in heavily here.
