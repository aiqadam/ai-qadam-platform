# Step 2 — Impact Analysis

**Workflow:** wf-20260723-fix-127
**Issue:** ISS-USR-REG-002 (blocker, api/auth registration)
**Agent:** ImpactAnalyzer

---

## Root Cause Findings

### Summary of method

1. Read `registration.service.ts` in full and traced every external call in
   `register()`, noting which are wrapped in try/catch and which are not.
2. Read `authentik.client.ts`, `directus-users-bridge.service.ts`,
   `directus.client.ts`, `interactions.service.ts` for exact throw conditions,
   and cross-checked the error classes against what NestJS's default
   exception filter does with them.
3. Ran the existing unit suite (`apps/api/test/registration-service.spec.ts`)
   — 8/8 pass, but this is fully mocked and could never reproduce a live
   wire-protocol failure.
4. Started the API locally (`pnpm --filter api dev`) against the real local
   Docker stack (postgres, authentik-server, authentik-worker, redis,
   directus, mailpit — confirmed healthy via `docker ps`) and issued the
   **exact same POST body** the QA Playwright repro sent:
   `displayName=...&email=local-repro-<ts>%40example.com&password=Reproduce-This-Bug-123&country=kz&company=`.
5. Searched the repo for QA's own compose/env config
   (`deploy/docker-compose.qa.yml`) and infra runbooks for how QA's
   `AUTHENTIK_ADMIN_TOKEN`/`DIRECTUS_TOKEN` were provisioned, since QA's
   actual `deploy/.env` values are not committed to this repo and the host
   is not reachable from this environment.

### Uncaught-throw inventory in `RegistrationService.register()`

Walking `apps/api/src/modules/auth/registration.service.ts` top to bottom:

| Step | Call | Wrapped? | What throws | NestJS result if uncaught |
|---|---|---|---|---|
| 2 (`:131`) | `authentik.getUserByEmail(input.email)` | **No try/catch at all** | `AuthentikError` (any non-2xx from Authentik, e.g. 401/403/5xx) | **500** (see below) |
| 3 (`:142-157`) | `authentik.createUser(...)` | `.catch()` — but only converts `AuthentikError` with `status` in `[400,500)` to `BadRequestException`; anything else (network error, 401, 5xx) **rethrows unhandled** | `AuthentikError` (5xx/401) or raw `TypeError`/`fetch` failure | **500** |
| 4 (`:162-181`) | `authentik.setPassword(...)` | try/catch, converts to `BadRequestException('registration_failed')` unconditionally | fully handled | n/a |
| 5 (`:185-189`) | `authentik.resolveGroupNames([...])` then `authentik.setUserGroups(pk, ...)` | **No try/catch** | `AuthentikError` from either call | **500** |
| 6 (`:194-197`) | `directusBridge.ensureLinkedByEmail(...)` | Internally try/caught inside the bridge service itself (returns `null` on failure, logs a warn) | n/a — cannot throw | n/a |
| 7 (`:207-221`) | `directus.patch(...)` | `.catch()` inline, logs+swallows | n/a — cannot throw | n/a |
| 8 (`:234`) | `authentik.createRecoveryLink(akUser.pk)` | **No try/catch** | `AuthentikError` | **500** |
| 8 (`:235-240`) | `interactions.dispatch(...)` (inside `dispatchWelcomeEmail`) | `.catch()` inline inside `dispatchWelcomeEmail`, logs+swallows | n/a — cannot throw past this point | n/a |

**Confirmed via source read:** `AuthentikError` (`authentik.client.ts:17-26`)
and `DirectusError` (`directus.client.ts:10-19`) both `extends Error` —
**neither extends `HttpException`** — so any of these three uncaught call
sites (Step 2, Step 3's non-4xx branch, Step 5, Step 8's recovery-link mint)
produces exactly the reported symptom: NestJS's default global exception
filter renders any non-`HttpException` as a bare
`500 {"statusCode":500,"message":"Internal server error"}`, with no
distinguishing detail — matching the live repro byte-for-byte.

This also matches the module doc's own framing (comment above `register()`):
the code deliberately handles the two *documented* partial-failure risks
(`createUser`'s 4xx, `setPassword`'s any-failure) with an explicit orphan-
account mitigation, but Steps 2, 5, and 8 were never given the same
treatment — they were evidently assumed to be "can't realistically fail"
paths (duplicate check, group assignment, recovery-link mint), which is
true only if Authentik is reachable and authorized.

### Local reproduction: SUCCEEDS end-to-end (does not reproduce the 500)

With the API started locally (`pnpm --filter api dev`, port 3000) against
the local docker-compose stack, and `apps/api/.env`'s
`AUTHENTIK_ADMIN_TOKEN` (60 chars) and `DIRECTUS_TOKEN` (35 chars) both
present and valid for the local Authentik/Directus instances:

```
$ curl -s -i -X POST http://localhost:3000/v1/auth/register \
  -H "content-type: application/x-www-form-urlencoded" \
  --data "displayName=Local+Repro+User&email=local-repro-<ts>%40example.com&password=Reproduce-This-Bug-123&country=kz&company="

HTTP/1.1 302 Found
Location: /v1/auth/login
```

Server log confirms the full happy path executed — Authentik user created
(`authentik_user_id: 10`), Directus link/country write, and the welcome
email actually delivered via SMTP (local Mailpit):

```
[RegistrationService] { event: 'registration.created', authentik_user_id: 10, email: 'local-repro-<ts>@example.com', country: 'kz' }
[EmailService] [email sent via smtp] to=local-repro-<ts>@example.com subject=Welcome to AI Qadam — finish signing in
```

**No exception anywhere in the chain locally.** This is the single most
important data point: the code path is not intrinsically broken — with
correctly-configured Authentik/Directus credentials it runs clean end to
end. This points decisively at **environment/config drift on QA**, not a
logic bug that a code change alone would need to fix (though the missing
try/catch coverage at Steps 2/5/8 is still a real robustness gap worth
fixing regardless — see Risk Flags).

### Why QA's environment is structurally the prime suspect (static evidence)

1. **`AUTHENTIK_ADMIN_TOKEN` is optional in the env schema**
   (`apps/api/src/config/env.ts:151-152`, `.min(20).optional()`) —
   specifically so the API can boot without it in a "degraded mode." The
   schema comment says admin-only routes should return
   `503 authentik_admin_not_configured` in that mode, and indeed
   `AuthentikClient.isConfigured()` exists for exactly that purpose
   (`authentik.client.ts:76-78`).

2. **Every other caller of `AuthentikClient`'s admin methods checks
   `isConfigured()` first** — confirmed by grep:
   `apps/api/src/modules/admin-invites/super-admin.guard.ts:33` and
   `apps/api/src/modules/country-provisioning/country-provisioning.service.ts:108`
   both gate on it. **`RegistrationService.register()` is the only caller
   of `AuthentikClient` methods that never calls `isConfigured()`** —
   it goes straight to `getUserByEmail()`/`createUser()`/etc. If
   `AUTHENTIK_ADMIN_TOKEN` were unset or empty on QA, every one of those
   calls would still fire (with `Authorization: Bearer ` — an empty
   token), Authentik would reject with 401, and `getUserByEmail` (Step 2,
   completely unguarded) would be the very first thing to throw an
   uncaught `AuthentikError` — before `createUser` is ever reached.

3. **QA's env provisioning history documents exactly this class of gap for
   a sibling variable.** `docs/04-development/infrastructure/runbooks/pro-data-tech-frontend-rollout.md:22-27`
   ("QA is now fully provisioned (2026-07-18)") states QA originally
   booted with a **schema-valid placeholder `DIRECTUS_TOKEN`** (the API
   ran, but Directus-backed features silently didn't work) until that was
   fixed later the same day. That runbook explicitly calls out
   `OIDC_ISSUER_URL` and `DIRECTUS_TOKEN` as having been fixed from
   placeholders to real values — **it never once mentions
   `AUTHENTIK_ADMIN_TOKEN`**, which is a distinct credential from
   `OIDC_CLIENT_SECRET`/`OIDC_ISSUER_URL` (those are for the *login* flow;
   `AUTHENTIK_ADMIN_TOKEN` is for admin-API calls, which registration is
   the first-ever caller of on QA — country-provisioning and super-admin
   routes are operator-only and may never have been exercised on QA).
   No infra doc anywhere in `docs/04-development/infrastructure/` mentions
   provisioning this specific token for QA (grepped exhaustively).

4. **`deploy/docker-compose.qa.yml`'s `api` service** only overrides 4 env
   vars at the compose level (`REDIS_URL`, `DIRECTUS_URL`, `OIDC_ISSUER_URL`,
   `PORT`) — everything else, **including `AUTHENTIK_ADMIN_TOKEN` and
   `DIRECTUS_TOKEN`**, comes from the untracked `deploy/.env` on the host
   (comment at `docker-compose.qa.yml:196-200`: "`.env` keeps the OTHER
   required vars ... as before"). This repo cannot inspect that file's
   actual contents — it is host-only, per
   `pro-data-tech-cicd.md:49` ("**Never committed, never in this repo,
   values are not in this runbook**").

5. **This is the very first live exercise of this endpoint anywhere
   outside unit tests.** `ISS-USR-REG-001` (today, `wf-20260718-fix-122`)
   shipped `POST /v1/auth/register` with only mocked unit-test coverage
   (`registration-service.spec.ts`) — no live/UAT verification step is
   recorded in that issue's resolution. It has never been proven against
   a real Authentik instance until this repro attempt on QA today. A
   config gap that has sat latent since 2026-07-18 (or earlier, if
   `AUTHENTIK_ADMIN_TOKEN` was simply never set on QA at all) would go
   unnoticed until first use — exactly what happened.

### Top-3 hypotheses, ranked (static analysis + local repro; no QA log access)

Because QA's application logs are not reachable from this environment and
`deploy/.env`'s real values are host-only, root cause narrowing stops at
"most likely, with supporting static + empirical evidence" rather than a
verbatim stack trace. Ranked by likelihood:

1. **(Most likely) `AUTHENTIK_ADMIN_TOKEN` unset, empty, or stale/invalid
   on QA's `deploy/.env`.** Every symptom lines up: the token is optional
   (app boots fine either way, so a missing token would not be caught at
   deploy time), the one caller that skips the `isConfigured()` guard is
   exactly the one that just started receiving live traffic, the sibling
   `DIRECTUS_TOKEN` variable is on record as having shipped as a
   placeholder on this exact host, and local repro with a *valid* token
   succeeds cleanly with zero errors anywhere in the chain. First throw
   point would be `authentik.getUserByEmail()` at
   `registration.service.ts:131` (completely unguarded) — Authentik
   returns 401 → `AuthentikError` (not an `HttpException`) → bare 500.

2. **(Plausible) The `aiqadam-member` Authentik group does not exist on
   QA, or Authentik's admin API is reachable but some other admin-scoped
   call in the chain (Step 5's `resolveGroupNames`/`setUserGroups`, or
   Step 8's `createRecoveryLink`) fails for a QA-specific reason** (e.g.
   the group was never created during QA's Authentik bootstrap — the
   rollout runbook notes the OAuth2 Application/Provider was created "via
   its REST API" with **"no idempotent script for this step"**, i.e.
   manually, which is exactly the kind of one-off setup step that could
   have skipped creating baseline groups like `aiqadam-member` that only
   exist in local/prod via a different provisioning path). `resolveGroupNames`
   itself would NOT throw if the group is simply missing (it returns `[]`),
   but `setUserGroups(pk, [])` would still succeed (assigns zero groups) —
   so this specific sub-hypothesis wouldn't 500 on its own. Ranked below
   hypothesis 1 because it requires a second, more specific provisioning
   gap beyond "a token is unset," which is a less generic/likely failure
   mode, but it remains plausible given the runbook's own admission that
   QA's Authentik object graph was hand-created with no idempotent script.

3. **(Less likely, but not excluded) A network/firewall or DNS issue
   between the QA `api` container and QA's `authentik-server`/`directus`
   containers specifically for admin-API paths** (as opposed to the OIDC
   discovery/login paths, which are known-working since CSRF-fixed login
   traffic already flows). All QA services run on `network_mode: host`
   with loopback addresses (`127.0.0.1:3117/3118` for Authentik,
   `127.0.0.1:3119` for Directus per `docker-compose.qa.yml`), so a
   same-host, same-network-namespace connectivity failure specific to only
   the admin REST paths (`/api/v3/core/users/...`) and not the OIDC
   discovery paths would be unusual — but not impossible if, e.g., the
   deploy-qa CI breakage (documented separately, see below) left the `api`
   container running stale code/config from a partial or interrupted
   redeploy. Ranked lowest because there is no positive evidence for it
   (no reachability asymmetry has ever been reported for this host) and
   it would require a more contrived failure mode than "a token is simply
   absent."

### What CodeDeveloper still needs to determine (explicitly unresolved)

- **The actual value of `AUTHENTIK_ADMIN_TOKEN` in QA's `deploy/.env` is
  unknown from this environment.** Confirming/denying hypothesis 1
  requires either: (a) SSH/log access to `deploy@95.46.211.230` to `cat`
  the (redacted) env or tail the `aiqadam-qa-api-1` container's stdout
  during a fresh repro attempt, or (b) a code change that makes the
  failure self-diagnosing (e.g. wrapping Steps 2/5/8 the same way Steps 3
  and 4 already are, converting any `AuthentikError`/`DirectusError` to a
  distinguishable `BadRequestException`/structured 5xx that names which
  admin call failed and why — this alone would turn any future recurrence
  from an opaque 500 into an actionable message, independent of whether
  the underlying token gap is also fixed).
- **Whether `aiqadam-member` group exists in QA's Authentik** is likewise
  unconfirmed — would require a live `GET /api/v3/core/groups/?name=aiqadam-member`
  against `auth.qa.aiqadam.org` with a valid admin token, which this
  environment cannot perform without QA credentials.
- **The separate `deploy-qa` CI breakage** (permission-denied unlinking
  `package.json`/`pnpm-lock.yaml` on the host, tracked as AC-4 of this
  issue per `01-issue-lookup.md`) means **any fix produced by this
  workflow cannot be verified live on QA** until that is separately
  resolved — QA is currently pinned to PR #44 (`af30beb`), not current
  `main`.

---

## Validated Requirement

`ISS-USR-REG-002` — `POST /v1/auth/register` on `qa.aiqadam.org` returns a
bare `500 Internal Server Error` for a well-formed, correctly-encoded
request body. This is a **regression/defect fix**, not a new feature: the
endpoint itself (`ISS-USR-REG-001`, merged today) is intentionally
unchanged in scope — the fix must not alter the registration contract,
only make the existing dependency-chain failure surface correctly (as a
diagnosable, non-500 error) and/or eliminate the underlying config/
provisioning gap once confirmed.

---

## Affected Layers

### API (NestJS)

| Module | File | Role in this bug |
|---|---|---|
| `apps/api/src/modules/auth/` | `registration.service.ts` | Primary suspect — 3 unguarded external call sites (Steps 2, 5, 8) that can propagate a non-`HttpException` straight to NestJS's default filter |
| `apps/api/src/modules/auth/` | `auth.controller.ts` | No change expected — controller-level Zod validation and honeypot handling already confirmed correct by prior investigation; `register()` handler just awaits the service |
| `apps/api/src/modules/admin-invites/` | `authentik.client.ts` | `AuthentikError` class (`extends Error`, not `HttpException`) is the likely raw-500 vehicle; `isConfigured()` guard exists but is unused by this caller |
| `apps/api/src/modules/directus/` | `directus-users-bridge.service.ts`, `directus.client.ts` | Lower suspicion — `ensureLinkedByEmail` and `directus.patch` calls in `register()` are already try/caught or internally swallowed; `DirectusError` also `extends Error` but has no unguarded call site in this flow |
| `apps/api/src/modules/interactions/` | `interactions.service.ts` | Lower suspicion — `dispatch()` is only ever called from inside `dispatchWelcomeEmail`, which wraps the whole call in `.catch()` |

**DB Changes Required:** No. No schema/migration touch anticipated —
this is a call-chain error-handling and/or environment-configuration fix,
not a data-model change.

**Shared Types:** No change anticipated — `packages/shared-types/` is not
a factor in this codebase's established convention (registration uses an
inline Zod schema per `auth.controller.ts`'s own header comment).

**Frontend:** No change anticipated in scope for the 500 itself.
`apps/web-next/src/pages/auth/sign-up.astro` / `SignUpForm.tsx` are
already confirmed correct by prior investigation (this issue's Step 1)
— the known client-side "raw JSON on error" limitation is a
**separate, already-documented** pre-existing issue
(`SignUpForm.tsx:23-28`), out of scope for this fix unless the
Orchestrator explicitly wants it bundled.

**Bot:** No change. `apps/bot/` is unrelated to this endpoint.

**Workers:** No change. `apps/workers/` is unrelated.

**Infra/deploy (possible, pending confirmation):** `deploy/.env` on the
QA host may need `AUTHENTIK_ADMIN_TOKEN` set/corrected — but this repo
cannot make that change itself (host-only file, no repo tracking, no
shell access to `deploy@95.46.211.230`). If hypothesis 1 is confirmed,
the actual remediation step is an infra/ops action outside this repo's
git history, and the code fix here should focus on (a) closing the
missing-try/catch gap so this class of failure degrades to a clear,
non-500 diagnostic instead of an opaque crash, and (b) optionally adding
an `isConfigured()` check consistent with the other two callers so a
missing token produces an immediate, named `503`-style error rather than
reaching Authentik and getting a 401 three calls deep.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/auth/register` | POST | No contract change expected — same request/response shape. Only the *failure-mode* behavior changes (bare 500 → either fixed via config, or converted to a distinguishable, non-500 error class consistent with Steps 3/4's existing pattern) | No |

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `RegistrationService.register()` | `AuthentikClient.getUserByEmail` (unguarded) | direct method call, Step 2 |
| `RegistrationService.register()` | `AuthentikClient.createUser` (partially guarded — only 4xx caught) | direct method call, Step 3 |
| `RegistrationService.register()` | `AuthentikClient.setPassword` (fully guarded) | direct method call, Step 4 |
| `RegistrationService.register()` | `AuthentikClient.resolveGroupNames` + `setUserGroups` (unguarded) | direct method call, Step 5 |
| `RegistrationService.register()` | `DirectusUsersBridgeService.ensureLinkedByEmail` (internally guarded) | direct method call, Step 6 |
| `RegistrationService.register()` | `DirectusClient.patch` (guarded inline) | direct method call, Step 7 |
| `RegistrationService.register()` | `AuthentikClient.createRecoveryLink` (unguarded) | direct method call, Step 8 |
| `RegistrationService.dispatchWelcomeEmail()` | `InteractionsService.dispatch` (guarded inline) | direct method call, Step 8 |
| `InteractionsService.dispatch()` | `DirectusClient.get`/`post`/`patch` | direct method call (recipients + interaction/delivery rows) |
| `AuthentikClient` / `DirectusClient` | External Authentik / Directus REST APIs | `fetch()` over HTTP, base URL + bearer token from `env` |

---

## Risk Flags

### Security Review Required

**Yes, if the code-level fix touches `RegistrationService.register()`.**
Any change to this method must be re-reviewed against the two SecurityReviewer
findings already fixed here (Location-header email-enumeration oracle,
honeypot field naming) — a naive "just wrap everything in try/catch and
return the error" fix must not leak Authentik/Directus internal error
detail (account-existence info, stack traces) to the anonymous caller, and
must preserve the byte-identical `/v1/auth/login` redirect for genuine
success vs. duplicate-email vs. honeypot. The existing pattern (generic
`BadRequestException('registration_failed')`, structured server-side log
only) should be extended to Steps 2/5/8, not replaced with something more
revealing.

### Architecture Rule Risks

**None identified that would require `failed-escalate`.** This is a
bug-fix within existing module boundaries — no new module, no new
cross-schema query, no stack deviation. Adding try/catch coverage and/or
an `isConfigured()` guard to `RegistrationService.register()` is
consistent with the existing pattern used by `super-admin.guard.ts` and
`country-provisioning.service.ts`, not a new architectural concept.

### Other flags

- **Cannot be fully root-caused without QA access.** This report's
  ranking is the strongest evidence obtainable from this environment
  (static analysis + local repro with valid credentials succeeding
  cleanly). CodeDeveloper should treat hypothesis 1
  (`AUTHENTIK_ADMIN_TOKEN` gap) as primary but the actual fix should be
  defensive-first (proper error handling/guarding in code, which helps
  regardless of which hypothesis is true) rather than assuming the infra
  gap can be directly patched by this workflow.
- **QA verification is blocked** by the separate `deploy-qa` CI failure
  (permission-denied unlink on the host) — any fix from this workflow
  cannot be confirmed live on QA until that is resolved. This is already
  tracked as AC-4 of `ISS-USR-REG-002` per Step 1's findings; flagging
  again here so QualityGate/UATRunner do not silently skip this
  dependency.

---

## Test Scope

### Unit (vitest, mocked — existing tier for this service)

`apps/api/test/registration-service.spec.ts` already covers the
happy path, duplicate-email, orphaned-account rollback, Directus-link
failure, and email-dispatch failure cases (8 tests, all passing). New
cases needed for whichever Steps 2/5/8 gain explicit error handling —
e.g. "getUserByEmail throws AuthentikError → converted to a distinguishable
non-500 error, no partial side effects" and equivalent cases for Step 5
and Step 8, mirroring the existing Step 3/4 test shapes
(`register — orphaned-account rollback` describe block is the closest
existing template).

### Integration

Not required for the code-level fix itself (no DB/schema change), but if
an `isConfigured()`-style guard is added, a Testcontainers-free unit test
with `AuthentikClient` mocked to report `isConfigured() === false` is
sufficient — no live infra needed for that case.

### E2E (Playwright)

No new Playwright flow required for the code fix — the existing
`SignUpForm.tsx` flow is unchanged. **Live verification against
QA specifically is a hard dependency on the separate deploy-qa CI fix**
(see Risk Flags) and should be tracked as a deferred AC, not silently
skipped, per `AGENTS.md` §6.1.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >-
    Impact analyzed. Primary suspect confirmed via source-level tracing:
    RegistrationService.register() has three unguarded external-call sites
    (getUserByEmail at :131, resolveGroupNames/setUserGroups at :185-189,
    createRecoveryLink at :234) whose thrown AuthentikError/DirectusError
    classes both extend plain Error (not HttpException), so NestJS's
    default filter renders any of them as the exact reported bare 500.
    Local reproduction against real local infra (Authentik, Directus,
    Redis, Mailpit, Postgres all healthy) with the identical request body
    used in the QA Playwright repro SUCCEEDED end-to-end with zero errors
    — this is strong evidence the bug is QA-environment/config-specific
    rather than a universally-reproducing code defect, though the missing
    try/catch coverage at those three call sites is a real, independently
    worth-fixing robustness gap regardless of which environment hypothesis
    is confirmed. Root cause could not be fully confirmed (no QA log/shell
    access from this environment; deploy/.env is host-only and untracked)
    — ranked top-3 hypotheses provided for CodeDeveloper, with
    AUTHENTIK_ADMIN_TOKEN misconfiguration on QA ranked most likely given
    (a) it is optional in the env schema, (b) every other AuthentikClient
    admin-method caller in this codebase guards on isConfigured() except
    this one, and (c) QA's own provisioning runbook documents an identical
    placeholder-credential gap for the sibling DIRECTUS_TOKEN variable on
    this exact host, with AUTHENTIK_ADMIN_TOKEN never once mentioned as
    having been provisioned.
  findings:
    - "AuthentikError (authentik.client.ts:17-26) and DirectusError (directus.client.ts:10-19) both extend plain Error, not HttpException — any uncaught throw of either becomes NestJS's generic 500, matching the reported symptom exactly."
    - "Three call sites in registration.service.ts have zero try/catch: getUserByEmail (:131, Step 2), resolveGroupNames+setUserGroups (:185-189, Step 5), createRecoveryLink (:234, Step 8). Steps 3 (createUser) and 4 (setPassword) are already correctly guarded — this is the asymmetry CodeDeveloper must close."
    - "AuthentikClient.isConfigured() exists and is used by super-admin.guard.ts:33 and country-provisioning.service.ts:108 but NOT by registration.service.ts — the only caller of AuthentikClient's admin methods that skips this guard is exactly the one now taking public/anonymous traffic for the first time."
    - "Local repro with valid local AUTHENTIK_ADMIN_TOKEN (60 chars) and DIRECTUS_TOKEN (35 chars) against local Docker infra succeeded fully — Authentik user created, Directus linked, welcome email delivered via Mailpit SMTP, HTTP 302 to /v1/auth/login. Zero exceptions anywhere in the log. This rules out a universally-reproducing logic bug and points at QA-specific config/environment."
    - "docs/04-development/infrastructure/runbooks/pro-data-tech-frontend-rollout.md:22-27 documents that QA's DIRECTUS_TOKEN previously shipped as a schema-valid placeholder until fixed on 2026-07-18 — establishing precedent for exactly this failure class on this host. AUTHENTIK_ADMIN_TOKEN is never mentioned as provisioned anywhere in docs/04-development/infrastructure/, despite an exhaustive grep."
    - "deploy/docker-compose.qa.yml's api service only overrides REDIS_URL/DIRECTUS_URL/OIDC_ISSUER_URL/PORT at the compose level; AUTHENTIK_ADMIN_TOKEN and DIRECTUS_TOKEN come from the untracked, host-only deploy/.env — this repo/session has no way to directly inspect or confirm QA's actual values."
    - "apps/api/test/registration-service.spec.ts (8 tests) all pass — but is fully mocked and cannot surface a live wire-protocol/config failure; not useful for root-cause confirmation, only for regression-guarding whatever fix is implemented."
    - "No DB migration, no shared-types change, no frontend/bot/worker surface implicated. Fix is scoped to apps/api/src/modules/auth/registration.service.ts (and possibly a config/infra-side token fix outside this repo's git history)."
    - "QA live verification of any fix is blocked by a separate, already-tracked issue: deploy-qa CI has failed on every push since PR #45 (permission-denied unlinking package.json on the host) — QA currently runs PR #44's code, not current main. This is AC-4 of ISS-USR-REG-002, not folded into this code fix, but must be resolved before this issue can be verified fixed live."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```
