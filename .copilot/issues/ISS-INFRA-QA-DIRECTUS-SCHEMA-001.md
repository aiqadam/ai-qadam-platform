# ISS-INFRA-QA-DIRECTUS-SCHEMA-001 — QA's Directus has no application schema; bootstrap.sh has apparently never been run against it

| Field | Value |
|---|---|
| ID | ISS-INFRA-QA-DIRECTUS-SCHEMA-001 |
| Severity | blocker |
| Module | infrastructure/directus-bootstrap, infra/qa |
| Status | open |
| Reported | 2026-07-28 |
| Resolved | — |
| Workflow | not yet scheduled |
| Reporter | Orchestrator (discovered while attempting to apply the ISS-RBAC-PERMS-001/ISS-USR-PROFILE-002 permission fix directly to QA) |
| Business-Process | BP-UAT-003, BP-UAT-016, and by implication every BP-UAT that depends on any Directus-backed collection |

## Symptom

While applying (with explicit user authorization) the `policy.member`
permission-row fix from [ISS-USR-PROFILE-002](ISS-USR-PROFILE-002.md)
directly to QA's Directus instance, the very first `POST /permissions`
call failed:

```
POST http://localhost:3119/permissions
{"policy": "400e0021-0000-4000-8000-000000000001", ...}
→ 400 "Invalid foreign key \"400e0021-0000-4000-8000-000000000001\" for
   field \"policy\" in collection \"directus_permissions\"."
```

The `policy.member` policy row (deterministic UUID
`400e0021-0000-4000-8000-000000000001`, meant to be seeded by
`infrastructure/directus/bootstrap.sh`'s `F-S2.2-pre` section) does not
exist on QA's Directus at all.

## Root cause (confirmed live, 2026-07-28)

`GET /policies` on QA's Directus (`pro-data-tech-qa`, 95.46.211.230,
container `aiqadam-qa-directus-1`, port 3119) returns only Directus's own
built-in policies:

```json
{"data":[
  {"id":"abf8a154-...","name":"$t:public_label"},
  {"id":"ff5b9067-...","name":"Administrator"}
]}
```

None of this repo's ~7 ADR-0021 RBAC policies exist. `GET /collections`
returns 29 collections total, **all** Directus system collections
(`directus_*`) — zero non-system collections. **No `events`, no
`registrations`, no `member_consents`, no `directus_users` custom
fields, none of `infrastructure/directus/bootstrap.sh`'s ~30 application
collections exist on QA's Directus.**

This means `infrastructure/directus/bootstrap.sh` — the script this
codebase treats as the single source of truth for Directus schema
(referenced throughout `docs/adr/0021-rbac-manifest.md` and dozens of
other ADRs/issues as "authoritative declaration") — has apparently never
been run against QA's Directus instance, or QA's Directus was reset/
replaced (e.g. volume wipe, container recreation without re-seeding)
after an earlier run and never re-bootstrapped.

## Impact

- Every Directus-backed feature on QA is affected, not just
  `/me/profile` — any endpoint that reads/writes a custom collection or
  custom `directus_users` field will fail. This is a strictly larger
  blocker than [ISS-USR-PROFILE-002](ISS-USR-PROFILE-002.md) /
  [ISS-RBAC-PERMS-001](ISS-RBAC-PERMS-001.md), which assumed QA merely
  had missing *permission rows* on an otherwise-provisioned schema — the
  actual state is QA has no schema at all.
- The user's original bug report (`qa.aiqadam.org/me/profile` — 404 +
  React #418) is very likely fully explained by this: `GET
  /v1/me/profile` on QA would 500/error immediately on the very first
  Directus call (`resolveDirectusId` / `getProfile`'s field-list query)
  against a collection whose custom fields don't exist — a materially
  different failure mode than the "field exists, permission denied"
  403 confirmed on local, but likely with a similar or identical
  user-visible symptom.
- Every BP-UAT script that assumes QA has a working Directus-backed
  member graph is currently unable to pass on QA.

## Suggested approach (not yet decided — deliberately not run live without review, per user instruction 2026-07-28)

1. **Run `infrastructure/directus/bootstrap.sh` against QA's Directus.**
   The script is designed to be idempotent (`ensure`/`ensure_perm`-style
   existence checks throughout) and is the same script already used to
   provision local dev — this is very likely the correct, complete fix.
   However: it is a large action (creates ~30 collections, hundreds of
   fields/relations, and seed data) against a live shared environment,
   and deserves a deliberate review pass (dry-run inspection of what it
   would create, confirming no naming collisions with whatever minimal
   state QA does have, confirming the QA `DIRECTUS_TOKEN` used has
   sufficient privilege) rather than a same-session drive-by run — this
   is exactly the judgment call the user asked to pause on.
2. **Before running it:** check whether `infrastructure/migrate-from-platform.sh`
   or any other QA-specific data-migration step also needs to run
   afterward (bootstrap.sh's own trailing message references this for
   fresh installs — see the script's final echo).
3. **Determine why this happened** — was QA's Directus ever fully
   bootstrapped and then reset (check `docker volume` history / backup
   timestamps on the QA host), or was it always this bare and the gap
   simply never surfaced until this investigation? This matters for
   whether QA needs a "run once" fix or whether something in the QA
   deploy/provisioning pipeline needs a permanent fix so this doesn't
   recur after a future QA reset.

## Resolution

- **Workflow:** not yet scheduled.
- **PR:** —
