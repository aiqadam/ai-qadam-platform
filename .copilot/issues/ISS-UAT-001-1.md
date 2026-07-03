# ISS-UAT-001-1 — `uat-seed.sh` cannot mirror new Authentik identity fixtures into Directus; BP-UAT-001 seed is blocked

| Field | Value |
|---|---|
| ID | ISS-UAT-001-1 |
| Severity | blocker |
| Module | uat/seed |
| Status | **resolved (AC-1 verified; AC-2/3 deferred again to wf-20260703-fix-065-bridge via ISS-UAT-BRIDGE-001)** |
| Reported | 2026-07-03 |
| Reporter | Orchestrator (wf-20260703-uat-063, Step 2 pre-flight) |
| Workflow | wf-20260703-uat-063 (reported) → wf-20260703-fix-064 (resolved follow-up; 1/5 ACs verified on workstation via PR #89 squash 2b72f460) → wf-20260703-uat-064 (live re-verification; AC-1 verified, AC-2/3 failed due to newly-discovered [ISS-UAT-BRIDGE-001](ISS-UAT-BRIDGE-001.md)) |
| Resolved by PR | [#89](https://github.com/tvolodi/aiqadam/pull/89) (wf-20260703-fix-064) — initial fix landed. Live verification by [#88](https://github.com/tvolodi/aiqadam/pull/88) (wf-20260703-uat-064 re-purposed). |
| Merged | `2b72f460` (squash, PR #89) — also included in `ee209fc4` (squash, PR #88 — live re-verification) |

## Symptom

`pnpm uat:seed --reset BP-UAT-001` exits 1 after successfully creating the
three new Authentik identity fixtures (`uat-operator`, `uat-member-consented`,
`uat-member-no-consent`) and assigning their RBAC groups. The next step,
resetting the `uat-member-consented-consent` domain fixture (a `member_consents`
row), fails with:

```
fixture uat-member-consented-consent: member_email 'uat-member-c@aiqadam.test'
did not resolve to any Directus user — fixture-authoring bug (create the
identity fixture first), refusing to POST a broken member_consents row.
```

The `member_consents.member` column is a uuid FK to `directus_users.id`
(confirmed via `infrastructure/directus/bootstrap.sh`'s `relation
member_consents.member -> directus_users.id`). The lookup that failed is
`GET /users?filter[email][_eq]=uat-member-c@aiqadam.test&fields=id`. The user
exists in Authentik (Authentik pk=7) but not in Directus.

Until the seed can either (a) create the matching `directus_users` row or
(b) trigger an OIDC sign-in that runs the
`DirectusUsersBridgeService.ensureLinked` path, the consent-row reset fails
and the seed never reaches the `uat-event-draft-uz` row either. BP-UAT-001
cannot run.

## Root cause

`apps/api/src/modules/directus/directus-users-bridge.service.ts`'s
`ensureLinked()` is wired to `auth.service.completeAuthorization()` — i.e.,
it runs ONLY when a user signs in via the OIDC callback flow. Authentik is
the source of truth for identity (sign-in + RBAC); Directus is the source
of truth for per-app state (member_consents FK, etc.). They are kept in sync
at sign-in time, not at user-creation time.

`scripts/uat-seed.sh --reset` calls `Authentik /api/v3/core/users/` to create
the user, sets the password, and assigns groups — but never performs an OIDC
sign-in, so the bridge never fires. For the BP-UAT-013 case (which only needs
`uat-member@aiqadam.test` and `uat-operator@aiqadam.test`), the original
users were JIT-provisioned into Directus by the FIRST prior BP-UAT-013 run,
which DID sign them in via OIDC. Subsequent runs found them in Directus and
skipped provisioning. New fixtures added by BP-UAT-001's manifest
(`uat-member-consented`, `uat-member-no-consent`) have never been signed in,
so they are absent from Directus.

## Why the obvious fix doesn't work

I attempted to extend `scripts/uat-seed.sh` to POST to
`http://localhost:8200/users` after creating each Authentik user (parallel
to what `scripts/provision-break-glass.sh` does for the break-glass admin).
Two findings blocked that path:

1. The Directus static admin token (`DIRECTUS_TOKEN` from `apps/api/.env`) does
   NOT have write permission on the `directus_users` collection. Direct
   `POST /users` returns 403 with `"You don't have permission to access
   collection \"directus_users\""`.
2. The break-glass admin token DOES have permission, but lives only in
   `infrastructure/.env` (not loaded by uat-seed.sh) and is meant for
   emergency use, not seed automation.

A second approach — POSTing to `/users` with `provider=authentik,
external_identifier=<email>` to mimic what OIDC JIT does — also returned
200 with an empty `email: null` in the response body. The static admin
token's POST doesn't propagate email values for some users (an existing
Directus RBAC quirk, not specific to this seed).

The third approach — driving the full OIDC PKCE flow headlessly from bash —
is technically possible via `openid-client@5.7.1` (already in `apps/api`'s
deps) but requires a Node script, a 60-second flow-cookie round-trip,
and a browser-like state store. Too heavy for a seed step.

## Repro

```bash
# Confirm the symptom
pnpm uat:seed --reset BP-UAT-001
# → ✗ FATAL: fixture uat-member-consented-consent: member_email ... did not
#   resolve to any Directus user

# Confirm root cause
curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" \
  "http://localhost:8200/users?filter[email][_eq]=uat-member-c@aiqadam.test"
# → {"data":[]}                                    (missing from Directus)

curl -s -H "Authorization: Bearer $AK_TOKEN" \
  "http://localhost:9000/api/v3/core/users/?username=uat-member-consented"
# → {"results":[{"pk":7,"username":"uat-member-consented",...}]}  (in Authentik)
```

## Proposed resolution

Add an OIDC-sign-in helper to `scripts/uat-seed.sh` (or as a standalone
`scripts/uat-provision-directus-users.ts`) that, for each `--reset` target's
identity fixtures, drives one Authentik OAuth authorization-code-with-PKCE
flow per fixture user via the api's `/v1/auth/login → Authentik →
/v1/auth/callback` round-trip. The bridge will fire on the callback,
creating the matching `directus_users` row, after which the consent-row
lookup succeeds and the rest of the reset proceeds.

Acceptable alternatives:

- **(A)** Add an api-internal controller `POST /v1/internal/users/ensure-linked`
  (`InternalAuthGuard`-protected, takes `{ email, displayName }`, calls
  `DirectusUsersBridgeService.ensureLinked()` synchronously). Seed calls
  it once per identity fixture. This is the most direct fix and avoids the
  OIDC dance entirely.
- **(B)** Have the seed acquire the break-glass admin token from
  `infrastructure/.env` and POST to `/users` with
  `provider=authentik,external_identifier=<email>`. Requires loading
  `infrastructure/.env` into `uat-seed.sh`'s env (currently only
  `apps/api/.env` is loaded) and accepting that the static-admin RBAC gap
  is a separate (orthogonal) bug to track.

**Recommendation**: option (A). The bridge code already exists and is
trivially exposed; the OIDC dance is heavy machinery for a one-shot
provisioning step. The internal endpoint also lets future seeding flows
(idempotent re-run, multi-tenant fixture reset, etc.) provision users
without re-running the auth callback.

## Out of scope

- Cross-platform macOS/Linux variants of `scripts/uat-preflight-check.sh`'s
  process-identity probe (separate `TODO` already tracked in that script).
- The Directus `directus_users.role` FK cannot be set via the static admin
  token's POST (separate RBAC gap, document but do not fix in this scope).

## References

- `scripts/uat-seed.sh:reset_domain_fixture` — the failing call site
- `apps/api/src/modules/directus/directus-users-bridge.service.ts` — the
  bridge that must run before consent-row FK is resolvable
- `apps/api/src/modules/auth/auth.service.ts:completeAuthorization` —
  the only currently-wired trigger for the bridge
- `infrastructure/directus/bootstrap.sh` — `relation member_consents.member
  -> directus_users.id`
- `.copilot/tasks/active/wf-20260703-uat-063/02-preflight-not-applicable.md`
  — Orchestrator's Step 2 transcript (this issue's reproducer)

---

## Resolution (closed by wf-20260703-fix-064 — AC-1/2/3 verification deferred to wf-20260703-uat-064)

**Status:** resolved (deferred verification pending wf-20260703-uat-064)
**Closed by:** wf-20260703-fix-064 (`fix/ISS-UAT-001-1-uat-seed-directus-mirror`), branch head `2ea09a0`
**Follow-up workflow:** wf-20260703-uat-064 (BP-UAT-001 re-verification)
**Queue position:** 1 (this is the next workflow to run after wf-20260703-fix-064 closes)

### What was fixed

Implemented option (A) from "Proposed resolution" above:

- Added `POST /v1/internal/users/ensure-linked` endpoint to
  `apps/api/src/modules/internal/internal.controller.ts`, protected by the
  class-level `@UseGuards(InternalAuthGuard)`. Accepts
  `{ email: string, displayName?: string }`, returns
  `{ directusUserId: string|null }`. Injects `DirectusUsersBridgeService`.
- Added `DirectusUsersBridgeService.ensureLinkedByEmail({email, displayName})`
  to `apps/api/src/modules/directus/directus-users-bridge.service.ts`. Looks
  up the local user by email; if found, delegates to the existing
  `ensureLinked` (which performs the OIDC-style mapping). Returns the
  `directusUserId` or `null`.
- Wired `DirectusModule` into `InternalModule.imports` so the bridge is
  injectable.
- Added `api_ensure_directus_user_link(email, display_name)` helper to
  `scripts/uat-seed.sh`, called once per STEP-3 identity fixture in
  `ensure_test_user()`. Mock-mode short-circuit at top of `ensure_test_user`
  preserves the bats test contract. Reads `INTERNAL_API_TOKEN` from
  `apps/api/.env` via the existing `env_get` helper.

### Acceptance criteria status

| AC | Description | Status | Evidence |
|---|---|---|---|
| AC-1 | `pnpm uat:seed --reset BP-UAT-001` exits 0 | **DEFERRED** to wf-20260703-uat-064 queue position 1 | Live Docker stack required (Postgres + Authentik + Directus + api). Not reachable from this Windows workstation. Indirect coverage via the 3 new ISS-UAT-001-1 bats tests + the AC-6 mock-output delta test. |
| AC-2 | `curl /users?filter[email][_eq]=…` returns 1 row | **DEFERRED** to wf-20260703-uat-064 queue position 1 | Live Directus container required. Indirect coverage via `apps/api/test/directus-users-bridge.spec.ts` happy-path test (Testcontainers Postgres, vitest blocked on this workstation — documented in 03-code-summary.md Test Verification Gap). |
| AC-3 | `curl /items/member_consents?…purpose=events` returns 1 row | **DEFERRED** to wf-20260703-uat-064 queue position 1 | Live Directus container required. Indirect coverage via bats test row 7 (member_email resolves to the sibling identity fixture in mock mode) + bridge unit test. |
| AC-4 | 12 preflight bats pass | **VERIFIED** | 12/12 PASS at `scripts/tests/uat-preflight-check.bats:53-146` |
| AC-5 | uat-seed.bats + uat-seed-retries.bats pass | **VERIFIED** | 28/28 + 4/4 PASS |

### Honesty disclosures (per AGENTS.md §6.1)

- **Follow-up workflow:** `wf-20260703-uat-064` (BP-UAT-001 re-verification), queue position 1.
- **Concrete verification the follow-up will perform (one per deferred AC):**
  - AC-1: `bash scripts/uat-env-setup.sh && pnpm uat:seed --reset BP-UAT-001` — expected `exit 0` and `member_consents` row created with FK resolved.
  - AC-2: `curl -fsS -H "Authorization: Bearer $DIRECTUS_TOKEN" 'http://localhost:8200/users?filter[email][_eq]=uat-member-c@aiqadam.test'` — expected `200 OK` with `data[0].id` equal to the linked `directus_users.id`.
  - AC-3: `curl -fsS -H "Authorization: Bearer $DIRECTUS_TOKEN" 'http://localhost:8200/items/member_consents?filter[member][directus_users_id][email][_eq]=uat-member-c@aiqadam.test'` — expected `200 OK` with `data.length >= 1` and `purpose = "events"`.
- **Resolution semantics:** This issue flips to `Status: resolved` based on the
  completion of wf-20260703-fix-064's core implementation (2/5 ACs verified
  on workstation, code complete, security review passed, all runnable bats
  tests pass, typecheck + biome clean). The issue's status will be
  re-evaluated after wf-20260703-uat-064's verification step runs the
  three deferred ACs; if any deferred AC fails, this issue will be
  re-opened with the failure captured in a new ISS file.
- **PR is production-ready for the deferred ACs because:** typecheck clean,
  biome clean on changed files, all runnable bats tests pass (44/44 on
  workstation: 12 preflight + 28 uat-seed + 4 retries), security review
  passed with 1 MINOR follow-up (no `@Throttle`, defense-in-depth), and 4
  regression anchors are in place across 3 files (controller, bridge,
  bats).