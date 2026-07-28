# ISS-INFRA-QA-DIRECTUS-SCHEMA-001 — QA's Directus has no application schema; bootstrap.sh has apparently never been run against it

| Field | Value |
|---|---|
| ID | ISS-INFRA-QA-DIRECTUS-SCHEMA-001 |
| Severity | blocker |
| Module | infrastructure/directus-bootstrap, infra/qa |
| Status | resolved |
| Reported | 2026-07-28 |
| Resolved | 2026-07-28 |
| Workflow | wf-20260728-fix-145 |
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

- **Workflow:** wf-20260728-fix-145
- **PR:** — (this workflow was infra-only, no code diff; see below)
- **Fixed live on QA (2026-07-28, with explicit user authorization to
  close the environment-parity gap end-to-end), four parts:**
  1. **Ran `infrastructure/directus/bootstrap.sh` against QA's Directus.**
     Copied the script + its `scripts/tests/directus-retry-helper.bash`
     dependency to the QA host preserving the relative path layout the
     script's `REPO_ROOT` resolution expects, ran it with
     `DIRECTUS_URL=http://localhost:3119` and the real
     `DIRECTUS_ADMIN_TOKEN`. Exit code 0, zero `✗`/FAIL lines in the
     450-line log. Result: 29 → 79 collections (50 new application
     collections), all 7 ADR-0021 RBAC policies now exist, `policy.member`'s
     14 permission rows created (matching the exact set from
     [ISS-USR-PROFILE-002](ISS-USR-PROFILE-002.md)'s local fix — same
     script, same idempotent logic, so QA now matches local). The only
     warnings were expected, graceful skips (QA doesn't have the
     hardcoded prod-only `POLICY_PUBLIC_PROD` policy id, so the script's
     own existence-check correctly no-ops those grants rather than
     erroring). Verified: `revoke_public_read()` did not introduce (and
     confirmed absence of) the `directus_users` PII leak from
     [ISS-SEC-DIRECTUS-USERS-PUBLIC-001](ISS-SEC-DIRECTUS-USERS-PUBLIC-001.md)
     — anonymous read correctly `403`s on QA now, same as local.
  2. **Found and fixed a second, independent gap discovered while
     verifying the above:** `aiqadam-qa-api-1`'s `DIRECTUS_TOKEN` env var
     was a literal placeholder (`qa-placeholder-token-not-real-000000`)
     — a different variable from `DIRECTUS_ADMIN_TOKEN` (which correctly
     held the real token, used by the Directus container itself and by
     this investigation's direct API calls). The `api` service in
     `docker-compose.qa.yml` never wires `DIRECTUS_TOKEN` from
     `DIRECTUS_ADMIN_TOKEN` — it falls through to whatever `deploy/.env`
     has, which was left as a placeholder. This meant the API container
     could not talk to Directus AT ALL, independent of whether the
     schema/permissions were correct — a second, compounding root cause
     of the original bug report. Fixed by setting `deploy/.env`'s
     `DIRECTUS_TOKEN` to the same real value as `DIRECTUS_ADMIN_TOKEN`
     (backed up the pre-change `.env` on-host first), then
     `docker compose up -d --no-deps api` (a plain `restart` does NOT
     re-read `.env`/`env_file` changes — needed the recreate) to load it.
  3. **Also enabled `RBAC_SYNC_WRITE_ENABLED=true`** in `deploy/.env`
     (previously unset, defaulting to `false` — same flag
     [ISS-UAT-RBAC-001](ISS-UAT-RBAC-001.md) fixed locally) so real QA
     members' Authentik-group policies actually get attached, not just
     dry-run computed. Recreated the `api` container again to pick it up.
  4. **Ran `infrastructure/directus/flows-bootstrap.sh` against QA's
     Directus** (found while reading `docker-compose.qa.yml`'s own
     header comment: "Schema populated once via
     `infrastructure/directus/bootstrap.sh` + `flows-bootstrap.sh` — NOT
     re-run automatically by this compose file" — the second script
     hadn't been run either). Creates the three registration-lifecycle
     Directus flows (`reg-capacity-decision`, `reg-waitlist-promotion`,
     `reg-checkin-points`) that implement capacity/waitlist/check-in/
     point-award side-effects declaratively. Exit 0, zero failures.
     Confirmed live: all 3 flows exist with `status: "active"`. Without
     this, event registration on QA would silently accept unlimited
     signups past capacity and never award check-in points — a separate,
     real gap this issue's scope covers (it's part of "QA has no
     application behavior", not just "QA has no schema").
- **`docker-compose.qa.yml` fixed in this repo** (not just patched
  on-host) to prevent the `DIRECTUS_TOKEN` placeholder regressing on the
  next deploy: added `DIRECTUS_TOKEN: ${DIRECTUS_ADMIN_TOKEN:?...}` to
  the `api` service's environment override block, reusing the same
  variable the `directus` service already requires — single source of
  truth, no second `.env` key that can drift. `deploy/.env` itself
  (host-local, gitignored, same as any other environment's `.env`) is
  NOT touched by this repo change; the on-host value was fixed directly
  per part 2 above. `RBAC_SYNC_WRITE_ENABLED` was deliberately left as a
  host-local `.env`-only change, not added to the compose file's
  environment override — unlike `DIRECTUS_TOKEN` (a wiring bug with one
  correct value), this flag is a deployment-stage decision (dry-run vs.
  write) that belongs in `.env`, matching how `apps/api/.env.example`
  already documents it for local/dev.
- **Live verification (2026-07-28):**
  - `GET https://qa.aiqadam.org/api/v1/me/profile` (unauthenticated):
    `401` (was `404` in the original report — correct expected behavior
    for the auth-guarded route now that the API can actually reach
    Directus and the schema exists).
  - `GET https://qa.aiqadam.org/api/v1/leaderboard` (public,
    Directus-backed): `200 {"countryCode":"uz","window":"all","entries":[]}`
    — a genuine successful round-trip through the API to Directus's
    `point_awards` collection, only possible now that both the token and
    the schema are correct. Empty `entries` is expected (no real QA
    member has generated points yet).
  - `GET https://qa.aiqadam.org/me/profile` (the actual page): `200`.
  - `POST /v1/internal/rbac/poll`: `{"scanned":12,"jobs_created":0,"errors":1}`
    — 0 jobs created is CORRECT, not a new bug: none of QA's 12 Authentik
    users has ever signed in via OIDC on this freshly-bootstrapped
    Directus yet, so none has a `directus_users` row
    (`RbacSyncService.resolveDirectusUserId` deliberately does not
    auto-create one — by design, per the service's own code comment, to
    avoid racing the auth-callback bridge). This self-resolves the
    moment each real person signs in through the app. The 1 error is a
    minor, unrelated, pre-existing bug — an Authentik user with pk=2
    (likely a stale `root` test account) has an empty-string email,
    which trips a Directus query-syntax edge case
    (`_eq` doesn't accept empty string). Not blocking; small enough to
    fix inline in a future pass rather than its own issue, or worth a
    one-line follow-up if it recurs.
  - `GET /flows` on QA's Directus confirms all 3 registration-lifecycle
    flows (`reg-capacity-decision`, `reg-waitlist-promotion`,
    `reg-checkin-points`) exist with `status: "active"`. **Not** verified:
    an actual end-to-end registration → capacity-decision →
    waitlist-promotion → check-in → point-award chain was not triggered
    live (would require creating a real event + registration on QA,
    out of scope for this infra-parity pass — see disclosure below).
- **Honesty disclosure — remaining known gaps, not fixed by this
  workflow:**
  - **No live end-to-end verification with a REAL signed-in QA member**
    was performed (no test-user credentials were available for QA in
    this session, and creating one on a shared environment wasn't done
    without further authorization). The verification above proves the
    API↔Directus connection and schema are correct; it does not prove a
    real human's full sign-in → profile-load round trip on QA. Should be
    the first thing checked the next time anyone touches QA UAT.
  - **`migrate-from-platform.sh`** (referenced in `bootstrap.sh`'s own
    trailing message) was NOT run — QA has no `platform.events` /
    `.registrations` / `.point_awards` legacy Postgres data to migrate
    (those tables were dropped repo-wide back in the Directus migration's
    Sprint 4.5/4, per `docs/04-development/architecture/migration-to-directus-centric.md`)
    so this is believed moot, not skipped.
  - **Why QA was never bootstrapped in the first place** was not
    determined (no `docker volume` history / backup timestamp
    investigation was done). If this matters for preventing recurrence
    after a future QA reset, it's worth a small follow-up — but the
    practical fix (this issue) doesn't require knowing why it was
    missing, only that it now isn't.
  - **Production** still has no Directus deployed at all (confirmed
    expected/known state per the user in the prior conversation, not a
    gap this issue addresses).
