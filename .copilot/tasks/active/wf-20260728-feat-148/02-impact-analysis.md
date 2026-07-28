# ImpactAnalyzer — Impact Analysis for FR-ADM-010

**Workflow:** wf-20260728-feat-148
**Agent:** ImpactAnalyzer
**Input:** `.copilot/tasks/active/wf-20260728-feat-148/01-requirement-validation.md` (gate: passed)

---

## Validated Requirement

**FEAT-ADM-010** — Platform admin bootstrap (no manual scripts). On API
boot, if the `aiqadam-super-admin` Authentik group has zero members,
create exactly one seeded admin user (`admin@aiqadam.org` /
`ADMIN_BOOTSTRAP_DEFAULT_PASSWORD`) directly in Authentik via the existing
`AuthentikClient`, assign it to `aiqadam-super-admin`, and force a
password change on next login via an Authentik-native mechanism. Idempotent
on every subsequent boot once ≥1 super-admin exists. No Postgres writes —
the seeded identity lives only in Authentik (ADR-0021 §1). Replaces the
manual procedure at ADR-0021 §9 step 3 (already marked superseded there).

Five ACs carried forward unchanged from the FR (AC-1..AC-5); RequirementAnalyst's
optional AC-6 (partial-failure idempotency) is a recommended strengthening,
not mandatory — addressed under Risk Flags below.

---

## Affected Layers

### API (NestJS)

| Component | Change | Notes |
|---|---|---|
| `apps/api/src/modules/admin-invites/` | New service (or new call sites on existing service) | Home module — already owns `AuthentikClient`, `AuthentikModule`, and the `aiqadam-super-admin` group constant (currently duplicated as `SUPER_ADMIN_GROUP` in `super-admin.guard.ts`). Recommend extracting that constant to a shared location (e.g. `authentik.client.ts` or a small `constants.ts`) so the new bootstrap code and `SuperAdminGuard` both reference one source, rather than a second hardcoded `'aiqadam-super-admin'` string — a natural place for the FR-ADM-011 forward-compat note (shared cap-check groundwork) RequirementAnalyst flagged. |
| New: `AdminBootstrapService` (suggested name) | New file, e.g. `apps/api/src/modules/admin-invites/admin-bootstrap.service.ts` | Implements `OnModuleInit`. Precedent: `OutboxRelayService` (`apps/api/src/modules/telegram/outbox-relay.service.ts`) already uses `OnModuleInit`/`OnModuleDestroy` for a boot-time background concern — same idiom applies here, just without the destroy/interval-loop half (this runs once, not on a timer). |
| `admin-invites.module.ts` | Add `AdminBootstrapService` to `providers` | No new `imports` needed — `AuthentikModule` (which exports `AuthentikClient`) is already imported by `AdminInvitesModule`. No new module needed; a sibling `admin-bootstrap` module is possible but adds indirection with no boundary benefit since this is a single-file concern using an already-local dependency. Recommend keeping it inside `admin-invites`, not a new top-level module — contra the handoff prompt's "or possibly a new small admin-bootstrap concern" framing, a new *module* is unnecessary; a new *file/service* inside the existing module is sufficient and matches the "modules expose a service interface" boundary rule without adding a module for a single OnModuleInit hook. |
| `apps/api/src/config/env.ts` | Add 2 new env vars to `envSchema` | `ADMIN_BOOTSTRAP_EMAIL` (or hardcode `admin@aiqadam.org` as a code constant per AC-5's "identical across configs" wording — CodeDeveloper's call; env var is more flexible and consistent with how other fixed identifiers in this file are handled, e.g. `EMAIL_FROM` defaults) and `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` (required in prod, no safe default — see Risk Flags). Both should be **optional with a dev-friendly default** for `EMAIL`-shaped constant, but `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` should almost certainly follow the `AUTHENTIK_ADMIN_TOKEN`-style "optional, degrade gracefully" pattern already used for other admin-adjacent secrets in this file — if unset, the bootstrap step should log a warning and skip (not crash the boot), consistent with `main-bootstrap.spec.ts`'s existing expectation that the process must reach `NestFactory.create`/listen even when optional integrations are unconfigured. |
| `apps/api/.env.example` | Document both new vars | Per AC-5. Follow the existing comment-block convention (see `AUTHENTIK_ADMIN_TOKEN` block) — explain purpose, note the value must match `auth-architecture.md`, and do NOT commit a real password value (empty `=` like every other secret in this file). |
| No new routes | — | Confirmed: `OnModuleInit` requires zero new HTTP surface. RequirementAnalyst's recommended default (OnModuleInit over an internal endpoint) is adopted here as the impact baseline — it is the simpler, already-precedented pattern in this codebase and avoids needing a new guard/route to protect an internal bootstrap trigger. If CodeDeveloper instead picks the internal-endpoint alternative, add one row to API Surface Changes below (`POST /v1/internal/admin/bootstrap`) and confirm it sits behind the existing `INTERNAL_API_TOKEN` guard pattern already used by `apps/api/src/modules/internal/internal.controller.ts` — but this is not the recommended path and shifts idempotency-on-every-boot to idempotency-on-every-invocation-by-whatever-calls-it (deploy script), which is a weaker guarantee for AC-2's "on redeploy" wording. |

### DB Changes Required

**No.** Confirmed by reading `apps/api/src/modules/admin-invites/*` and
`docs/adr/0021-rbac-manifest.md` §1: Authentik is the sole source of truth
for the seeded identity; `users` table (Postgres) is not written by this
flow. No Drizzle schema file changes, no new migration. DBMigrationAuthor
is **not needed** for this workflow.

One adjacent note for CodeDeveloper, not a DB change: `users.service.ts` /
RBAC-sync (`FR-ADM-007`) already reconciles *existing* Authentik users into
Directus/Plausible on group-change events. The newly-created seeded admin
will presumably flow through that existing sync path on its own (group
assignment triggers the same webhook/poll RBAC-sync already listens to) —
worth CodeDeveloper double-checking in testing (does creating the user via
`AuthentikClient.createUser()` + `setUserGroups()` fire the same Authentik
notification that `RbacSyncService` consumes, or does RBAC-sync only see
this account once it appears in `listActiveUsers()`'s nightly poll?). Not
a blocker — it's the same reconciliation path every other Authentik-created
account already goes through — but flagging so CodeDeveloper doesn't assume
Directus/Plausible parity is instant.

### Shared Types (`packages/shared-types/`)

**No changes.** No new DTOs cross the API/web boundary — this is a
boot-time, server-internal operation with no request/response contract.
Confirmed no existing Zod schema in `packages/shared-types` references
admin bootstrap, seeded users, or `aiqadam-super-admin` membership counts.

### Frontend (`apps/web/`, `apps/web-next/`)

**No changes.** AC-3/AC-6 (forced password change) is entirely an
Authentik-hosted flow intercepting the standard OIDC handshake before the
browser ever reaches the platform's web app — same as any other
Authentik-native flow stage (cf. the existing RP-Initiated Logout
confirmation interstitial documented in `auth-architecture.md`, which is
also Authentik UI, not platform UI). No new Astro page, no new React
island, no new `apps/web/src/lib/api.ts` call.

### Bot (`apps/bot/`)

**No changes.** Bot is a thin client for member-facing and
organizer-runtime flows (per `architecture.md`'s bot-scope section); admin
bootstrap is neither. No aiogram handler references super-admin bootstrap.

### Workers (`apps/workers/`)

**No changes.** This is not a BullMQ job — it runs synchronously (or
fire-and-forget-logged) during API process startup via `OnModuleInit`, not
via a queue. No new queue, no new processor.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| *(none)* | — | No new or modified HTTP endpoint under the recommended `OnModuleInit` implementation. | N/A |

If CodeDeveloper instead chooses the internal-endpoint alternative
(deviating from RequirementAnalyst's recommended default), update this
table with `POST /v1/internal/admin/bootstrap` (internal-auth gated, same
pattern as `internal.controller.ts`) before the code-review gate — that
would be a real, if low-risk, API surface addition and this section would
no longer read "none."

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `AdminBootstrapService` (new, in `admin-invites`) | `AuthentikClient` | Existing exported provider from `AuthentikModule` (already imported into `AdminInvitesModule`) — `createUser()`, `setPassword()` or equivalent, `setUserGroups()`, `resolveGroupNames()`, `patchAttributes()` (tentative, pending the password-change-required mechanism CodeDeveloper confirms) |
| `AdminBootstrapService` | *(none — no other module)* | No calls into `users`, `directus`, `rbac-sync`, or `audit` modules are required by the FR text. Optional strengthening: emitting an `audit_events` row on successful bootstrap (via `AuditEventsService`, already imported into `AdminInvitesModule` via `AuditModule` and already used by `AdminInvitesService` for invite lifecycle events) would be consistent with this module's existing pattern and gives an operator-visible record of "bootstrap ran, created user X at time Y" — not required by any AC, but low-cost and matches house style. Flagging as a recommendation for CodeDeveloper, not a hard requirement. |
| *(existing, unaffected)* `SuperAdminGuard` | `AuthentikClient.getUserByEmail` | Unchanged — the seeded user, once bootstrapped, is authorized through this same existing guard with no special-casing (satisfies AC-4). |

No new cross-module dependency edges. `AdminBootstrapService` sits entirely
within the already-approved `admin-invites` → `AuthentikClient` call
pattern that `FR-ADM-005` and `SuperAdminGuard` already established. No
circular-dependency risk of the kind `main-bootstrap.spec.ts` guards
against, since `admin-invites` gains no new inbound or outbound module
`imports` — only a new provider inside its existing boundary.

---

## Risk Flags

### Security Review Required

1. **Fixed default password in an env var (`ADMIN_BOOTSTRAP_DEFAULT_PASSWORD`).**
   Flagging explicitly for SecurityReviewer at Step 5, per the handoff
   instruction. Not a blocker to proceeding with design/implementation, but
   worth SecurityReviewer's attention because:
   - The value is a genuinely new secret (not a config flag), so it falls
     **outside** the CLAUDE.md dev/test `.env`-edit exception ("toggling
     existing non-secret config flags" only) — CodeDeveloper/Orchestrator
     must not invent and silently commit a real password value anywhere,
     including local `.env` — the user supplies/generates the prod value
     per that rule, and `.env.example` must carry only a blank `=`.
   - Once used to log in, AC-3/AC-6 require the forced password-change
     screen to complete before any other page is reachable — but between
     "user created" and "first login completes," the fixed password is a
     live credential to `aiqadam-super-admin` (unlimited platform access)
     known to anyone with access to the env var across every environment
     that reuses the same value. Worth SecurityReviewer confirming: (a)
     the prod value is NOT the same string as the one in `.env.example`
     defaults or any doc example, (b) there's no window where the
     seeded account is reachable from the public internet with a
     guessable/documented default before an operator completes first
     login, and (c) whether rate-limiting/lockout on the OIDC login form
     (Authentik-native) is sufficient mitigation against automated
     credential-stuffing of a known email+password pair against a
     freshly-deployed environment.
   - Related: AC-5 requires the email/password be "documented identically...
     in `.env.example` and `auth-architecture.md`" — SecurityReviewer should
     confirm `auth-architecture.md` documents the *format/location*, not an
     actual live password value, consistent with how the rest of that file
     handles other secrets (it doesn't appear to inline any real token
     values today, per the files read during this analysis).

2. **Partial-failure / idempotency-check precision (RequirementAnalyst's
   suggested AC-6).** Not primarily a security risk, but has a
   security-adjacent edge case worth SecurityReviewer's awareness: if the
   idempotency check in step 1 is naively "does a user with email
   `admin@aiqadam.org` exist" rather than "is that user actually IN
   `aiqadam-super-admin`," a scenario where `createUser()` succeeds but
   `setUserGroups()` fails leaves a user account that exists in Authentik
   with **no group membership** — which, depending on Authentik's default
   group-less-user permission posture, could be a dangling low-privilege
   account rather than a security hole per se, but the bootstrap job would
   then treat "user exists" as "already bootstrapped" and silently skip
   re-attempting the group assignment on every subsequent boot, leaving
   the environment in a state where `aiqadam-super-admin` legitimately has
   zero members forever (worse than the original zero-admin problem this
   FR solves, because now `AuthentikClient.createUser()` will also start
   throwing "email already taken" on every retry, per the existing
   `authentik-client.spec.ts` 4xx-on-duplicate-email test). **Recommend
   the idempotency check be implemented as "does `aiqadam-super-admin`
   have ≥1 member" (via `resolveGroupNames(['aiqadam-super-admin'])` →
   `AuthentikGroup.users.length`, see Test Scope below), not "does the
   seeded email exist"** — this makes the check robust to the partial-failure
   case without needing AC-6 as a separate acceptance criterion, since the
   next boot's group-count check would still see 0 and retry the full
   sequence. The one remaining edge (retry hits "email already taken" on
   `createUser()` because the user row survived from the failed attempt)
   still needs explicit handling — CodeDeveloper should catch that specific
   `AuthentikError` (status 400, taken-email body shape per the existing
   test) and fall through to "look up the existing user by email, then
   retry `setUserGroups()` on it" rather than crash-looping every boot.

### Architecture Rule Risks

**None identified.** Confirmed against `architecture.md`'s "Rules for
module boundaries": no cross-schema query, no direct reach into another
module's entities, no circular dependency, service-interface-only calls to
`AuthentikClient`. Confirmed against "Data ownership" table: `authentik`
schema is Authentik-owned/Authentik-only-write in the table, and this
FR's calls go through Authentik's own REST API (not direct SQL to the
`authentik` Postgres database), so no violation of "Cross-schema queries
are forbidden."

One soft note, not a rule violation: putting `OnModuleInit` bootstrap logic
directly in a module whose primary job is HTTP request-handling
(`admin-invites`) is a minor mixing of concerns (request-time service +
boot-time service in one module), but it mirrors the existing
`OutboxRelayService`-in-`TelegramModule` precedent exactly, so it is
consistent with established house style rather than a new pattern needing
justification.

---

## Test Scope

### Unit

- **New: `admin-bootstrap.service.spec.ts`** (pattern: `admin-invites-service.spec.ts`,
  which already mocks `AuthentikClient` as a `FakeAuthentik` object with
  `vi.fn()` per method — reuse the same fake shape, extending it with
  `resolveGroupNames` returning `AuthentikGroup[]` with a `.users` array).
  Cases to cover:
  - Zero-member case: `resolveGroupNames(['aiqadam-super-admin'])` resolves
    to a group with `users: []` → `createUser` + `setUserGroups` (+
    password-change mechanism call) are invoked exactly once each, with
    the expected fixed email/password/group.
  - Non-zero case (AC-2): group resolves with `users: [123]` → no client
    methods called at all; no-op confirmed via `expect(...).not.toHaveBeenCalled()`
    on all mutating methods.
  - Duplicate-email retry case (the partial-failure edge from Risk Flags
    above): `createUser()` rejects with `AuthentikError(400, ...)` on an
    already-taken email → service falls back to `getUserByEmail()` +
    retries `setUserGroups()` rather than throwing unhandled.
  - Error propagation: any other `AuthentikError` (e.g. 500) during the
    seed sequence is logged at ERROR (per ADR-0021 §7 precedent cited by
    RequirementAnalyst) and NOT swallowed — assert it either rethrows (if
    `OnModuleInit` is allowed to fail loudly and crash boot — CodeDeveloper's
    call, consistent with how `AuthModule`'s OIDC discovery failure already
    crashes boot per `main-bootstrap.spec.ts`) or is surfaced via a
    dedicated boot-time ERROR log line the test can assert on.
  - `isConfigured()` false / `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` unset case:
    service degrades gracefully (logs + skips), does not crash boot,
    matching the existing degraded-mode pattern for other optional
    Authentik-admin-gated features.

- **Confirm no new `AuthentikClient` method is required.** `resolveGroupNames()`
  already returns `AuthentikGroup[]` with a `.users: number[]` array (see
  `authentik.client.ts` lines 43-48, 141-160) — group-membership count is
  `resolveGroupNames(['aiqadam-super-admin'])[0]?.users.length ?? 0`. No
  new client method, no new `authentik-client.spec.ts` case needed UNLESS
  CodeDeveloper's chosen "force password change" mechanism needs a new
  client call the current surface doesn't cover (e.g. if `patchAttributes()`
  doesn't verify against the live instance and a new method like
  `setPasswordExpired()` / a policy-binding call is needed — then a new
  `authentik-client.spec.ts` describe block follows the existing pattern:
  mock `fetch`, assert method/path/body shape, assert `AuthentikError` on
  non-2xx).

### Integration (Testcontainers)

- **Not required to touch Postgres** — this flow doesn't write to the
  `platform` schema, so a `PostgreSqlContainer`-based integration test
  (the pattern used by `main-bootstrap.spec.ts`) is optional, not
  mandatory, UNLESS CodeDeveloper's implementation ties the `OnModuleInit`
  hook's timing to `runMigrations()` completing first (worth checking:
  does bootstrap need to run after migrations, or is it independent? Likely
  independent since it only calls Authentik, not Postgres — but confirm
  ordering doesn't matter before skipping this).
- **No live-Authentik integration test exists today** — searched the repo
  (`apps/api/test/*.spec.ts`) and confirmed all existing `AuthentikClient`-touching
  specs (`authentik-client.spec.ts`, `admin-invites-service.spec.ts`,
  `admin-invites-onboarding.spec.ts`) mock `fetch`/`AuthentikClient`
  directly — there is **no Testcontainers-style live Authentik double** in
  this codebase (Authentik isn't the kind of service that has a lightweight
  Testcontainers module the way Postgres does; it's normally run via the
  full `infrastructure/docker-compose.yml` stack). This means:
  - **Unit-level mocking (as above) is the correct and only currently-precedented
    automated test approach** for this FR's core logic.
  - **True end-to-end verification (does `patchAttributes()` actually force
    a password change against a real Authentik instance) can only happen
    against the local `docker compose` Authentik service**, manually or via
    a UAT script — this is exactly why `BP-UAT-020` exists and is marked
    "not runnable today" pending this FR shipping. TestDesigner/UATRunner,
    not this workflow's automated test suite, own that verification. Per
    CLAUDE.md's infra-obligation rule, if the live-Authentik verification
    step becomes necessary during this workflow's own QualityGate/UAT
    steps, the Orchestrator should bring up the `authentik` compose service
    and curl/verify rather than deferring — but that is a later-step
    concern, not something ImpactAnalyzer schedules here.

### E2E (Playwright)

- **Not in scope for this workflow.** `BP-UAT-020` (the linked UAT script)
  is explicitly Draft/not-runnable and is a separate, later verification
  artifact (per RequirementAnalyst's read), not a Playwright spec this
  workflow's TestDesigner/TestRunner steps produce. No `apps/e2e/` changes
  anticipated from this FR directly — AC-3's forced-password-change flow
  is Authentik UI, not platform-controlled markup, making it a poor fit
  for a Playwright selector-based test even if one were added later (it
  would need to assert against Authentik's own login flow templates,
  which are out of this codebase's control).

---

## Gate Result

```yaml
gate_result:
  agent: impact-analyzer
  workflow_id: wf-20260728-feat-148
  status: passed
  summary: >
    FR-ADM-010's impact is fully scoped to a single existing module
    (apps/api/src/modules/admin-invites/), adding one new OnModuleInit-based
    service alongside the existing AuthentikClient/AuthentikModule/AdminInvitesService
    trio, with zero new HTTP routes (per RequirementAnalyst's recommended
    default), zero DB/entity/migration changes (confirmed against ADR-0021
    §1 and the Data ownership table), zero shared-types changes, and zero
    frontend/bot/worker surface changes. No new AuthentikClient method is
    required — resolveGroupNames() already exposes group.users[] for the
    membership-count check the idempotency logic needs. No architecture-rule
    violation identified (module boundaries, cross-schema queries, circular
    deps all clear). Two risk flags raised for SecurityReviewer at Step 5:
    the fixed default password's env-var/secret-handling posture, and an
    idempotency-check precision recommendation (check group membership
    count, not "does the seeded email exist") that closes RequirementAnalyst's
    flagged partial-failure gap without requiring a formal AC-6. Test scope
    is unit-only for this workflow (extending the existing
    AuthentikClient-mocking pattern already used by admin-invites-service.spec.ts
    and authentik-client.spec.ts) — no Testcontainers-Authentik double exists
    in this repo and none is needed, since true live-Authentik verification
    of the forced-password-change mechanism is BP-UAT-020's job, not this
    workflow's automated suite.
  affected_modules:
    - apps/api/src/modules/admin-invites/ (new service file; module/providers update)
  db_changes_required: false
  shared_types_changes_required: false
  frontend_changes_required: false
  bot_changes_required: false
  worker_changes_required: false
  new_api_endpoints: 0
  risk_flags_for_security_review:
    - "Fixed default password in ADMIN_BOOTSTRAP_DEFAULT_PASSWORD env var — new secret, not covered by CLAUDE.md's dev/test .env exception; window-of-exposure and rate-limiting questions for SecurityReviewer."
    - "Idempotency check should key on aiqadam-super-admin group membership count (resolveGroupNames(...).users.length), not on seeded-email existence, to avoid a dangling zero-admin state if createUser() succeeds but setUserGroups() fails."
  next_agent: code-developer
```
