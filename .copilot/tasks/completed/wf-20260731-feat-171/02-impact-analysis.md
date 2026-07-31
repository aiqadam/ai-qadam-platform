# Impact Analysis — FR-BOT-001 (FEAT-BOT-1)

workflow: wf-20260731-feat-171
agent: ImpactAnalyzer

---

## Validated Requirement

**FEAT-BOT-1** — Ship the Telegram bot inbound-command scaffold end-to-end:

(a) new internal-only API endpoint `POST /v1/internal/telegram/lookup` on
`apps/api`, guarded by the existing `InternalAuthGuard` (`x-internal-auth`
header / `INTERNAL_API_TOKEN` secret), resolving a raw `telegram_id` to
`{ directusUserId: string | null, isTemp: boolean, country: string | null }`;
and

(b) the Python/aiogram 3 bot scaffold in `apps/bot/` (submodule,
`aiqadam/aiqadam-telegram-bot`) implementing the middleware stack (rate-limit,
auth, tenant, logging), a `/start` smoke-test handler, and Coolify deployment,
calling the new endpoint from its auth middleware on every inbound update.

11 draft ACs (AC-1..AC-11) per Step 1 output. Full text:
`.copilot/tasks/active/wf-20260731-feat-171/01-requirement-validation.md`.

**Sequencing dependency carried forward from Step 1 (not re-litigated here,
but binding on Test Scope and Risk Flags below):** PR #194
(`fix/BOT-001-bot-repo-bootstrap`) adds the actual `.gitmodules` gitlink for
`apps/bot/`. It is open/unmerged, and this workflow's branch forked before it.
The API-side endpoint (item a) has no dependency on #194 and can be built and
tested independently. The bot-side scaffold (item b) cannot land real
submodule content until #194 merges and this branch rebases, or #194's
changes are folded in first — this is an Orchestrator-level sequencing call,
noted here so CodeDeveloper doesn't rediscover it mid-task.

---

## Affected Layers

### API (NestJS) — `apps/api`

| Module | Files touched | Nature of change |
|---|---|---|
| `modules/auth` | `auth.controller.ts` (`TelegramInternalController`) | Add new route `POST lookup` alongside existing `upsert-temp-user`, same class, same `@UseGuards(InternalAuthGuard)`. |
| `modules/auth` | `telegram-auth.service.ts` | Add new method (e.g. `lookupUser(telegramId): Promise<LookupResult>`) on `TelegramAuthService`, or a small sibling service if CodeDeveloper judges the file is getting overloaded. Needs `AuthentikClient.getUserByTelegramId` (already injected) + `DirectusClient` (NOT currently injected into this service — see below) or `DirectusUsersBridgeService.ensureLinkedByEmail` (already used elsewhere in this same module — see Cross-Module Calls). |
| `modules/auth` | `auth.module.ts` | Only needs a wiring change if the new logic requires `DirectusUsersBridgeService` directly injected into `TelegramAuthService` — `DirectusModule` is already imported at module level, so this is additive DI, not a new module import. No import list changes anticipated beyond possibly adding `DirectusUsersBridgeService` to `TelegramAuthService`'s constructor. |
| `modules/internal` | none (informational) | Considered and rejected as the home for the new route — see "Module placement decision" below. `internal.controller.ts` / `internal.module.ts` are read for pattern-matching only, not modified. |

**Module placement decision (required by role definition step 3): `modules/auth`, not `modules/internal`.**

Investigated both candidates directly, per the task brief's instruction:

- `apps/api/src/modules/internal/` (`InternalController`, prefix
  `v1/internal`, guard `InternalAuthGuard`) already hosts one structurally
  identical precedent: `POST /v1/internal/users/ensure-linked`, which also
  takes an identity key, calls `DirectusUsersBridgeService`, and returns
  `{ directusUserId: string | null }`. `InternalModule` already imports
  `DirectusModule`. This is a viable, low-friction home too.
- `apps/api/src/modules/auth/` (`TelegramInternalController`, prefix
  `v1/internal/telegram`, same `InternalAuthGuard`) already hosts the
  sibling endpoint `POST /v1/internal/telegram/upsert-temp-user`, on the
  **exact same URL prefix** (`v1/internal/telegram/*`) the new route needs.
  `AuthModule` already imports `DirectusModule` (via `AuthController`'s own
  use of `DirectusUsersBridgeService` for the OIDC callback path) and
  `AuthentikModule`, and `TelegramAuthService` already has `AuthentikClient`
  injected.

**Decision: `modules/auth`, as a new `@Post('lookup')` route on
`TelegramInternalController`.** Rationale: the URL path itself
(`v1/internal/telegram/lookup`) is a sibling route under the same
controller/prefix as `upsert-temp-user`, not a sibling of
`ensure-linked` under the generic `v1/internal` prefix — placing it in
`modules/internal` would fragment one logical URL family
(`v1/internal/telegram/*`) across two NestJS modules for no benefit, and
would require re-injecting `AuthentikClient` into a new/different service
that `internal.controller.ts` doesn't currently have. All required
dependencies (`AuthentikClient`, `DirectusUsersBridgeService` via
`DirectusModule`) are reachable from `AuthModule` with at most one
additional constructor injection. No new NestJS module needed either way.

### DB Changes Required: **No.**

Confirmed, correcting/validating the task brief's own framing:

- The API-side lookup is a **read/compose** over already-existing
  Authentik (`attributes.telegram_id`, `attributes.is_temporary`) and
  Directus (`/users/:id` → `country` field — **not** `country_preference`;
  `registration.service.ts` line 252-253 has an explicit code comment
  confirming `country_preference` "doesn't exist in code," and
  `telegram-preferences.service.ts` line 178 confirms the real field name
  is `country`) data. No new Postgres table, column, or Drizzle schema
  migration is implied by AC-1 through AC-5.
- The bot's own `(telegram_id → directusUserId)` SQLite cache (FR-BOT-001
  §2) is **bot-local storage inside the `aiqadam-telegram-bot` submodule**,
  a different language/repo/deploy unit entirely. It is explicitly
  reinforced by ADR-0034 §Q3 ("Bot owns NO business state... They do NOT
  own: Postgres (zero direct connections)... Member graph (Directus
  canonical per ADR-0033)") — the bot's SQLite is a local, disposable,
  restart-safe cache the bot rebuilds by calling the lookup endpoint, not
  a system-of-record. It requires no Drizzle migration and does not touch
  `apps/api`'s DB layer at all. **The task brief's reasoning is correct.**
- No DBMigrationAuthor engagement needed for this workflow.

### Shared Types — `packages/shared-types`

**Not applicable / no reuse possible for the bot side.** Confirmed via
`Glob` — no existing `packages/shared-types/**/*telegram*` files. Two
sub-findings:

1. The bot is Python (aiogram); `packages/shared-types` is a
   TypeScript/Zod package consumed by `apps/web` and `apps/api`. There is
   no cross-language type-sharing mechanism in this repo — the bot's
   request/response contract with the new endpoint must be independently
   defined on the Python side (e.g. a pydantic model in
   `aiqadam_telegram_bot/shared/` or similar, per FR-BOT-001 §"Project
   structure" `services/` layer) and kept in sync **by convention/tests
   only**, mirroring how ADR-0034's own async envelope contract is
   duplicated (pydantic + Zod, "Both repos' CI parses the AsyncAPI yaml;
   failing build catches mismatch" — no such automated mirror-check exists
   yet for this sync-surface endpoint; flagged under Risk Flags below).
2. On the TypeScript side, the new endpoint's request/response Zod schema
   should live alongside the existing `upsertTempUserBodySchema` pattern in
   `telegram-auth.service.ts` (module-local, not `packages/shared-types`,
   matching the existing precedent — `upsertTempUserBodySchema` is not in
   `shared-types` either, since this is an internal bot-facing contract,
   not a web-client-facing one). **No `packages/shared-types` changes in
   scope.**

### Frontend — `apps/web`

**None.** No Astro pages, React islands, or `apps/web/src/lib/api.ts`
client calls are implied by this FR. The new endpoint is bot-internal only
(`InternalAuthGuard`, shared-secret auth, not user-session auth) and is
never called from the browser. Confirmed no web-side ACs exist in the
Step 1 output.

### Bot — `apps/bot/` (submodule: `aiqadam/aiqadam-telegram-bot`)

Full scaffold, new project, per FR-BOT-001 §"Project structure" (already
quoted in the requirement) and ADR-0034's component layout:

```
apps/bot/                              (submodule mount point in THIS repo)
└── (real content lives in aiqadam/aiqadam-telegram-bot, vendored here)
    src/
    ├── handlers/        # /start smoke-test handler (AC-6, AC-8)
    ├── services/        # HTTP client wrapping POST /v1/internal/telegram/lookup (AC-7)
    ├── middlewares/      # rate-limit (AC-9), auth (AC-7), tenant (country), logging (AC-11)
    ├── keyboards/        # not exercised by this FR's ACs (no interactive keyboards yet — static welcome only)
    ├── states/           # aiogram FSM scaffolding, unused by /start smoke test but part of required structure
    ├── locales/          # ru primary, en secondary — at minimum the /start and "unknown command" strings (AC-6, AC-8)
    └── main.py
    pyproject.toml         # aiogram 3, httpx (or similar) for the API client, pytest, ruff config
    tests/                 # pytest suite — mocked API client per AC-7's own test note
```

Key impact notes:

- **Different language/toolchain from the rest of the monorepo.** No
  `pnpm`, no shared ESLint/TS config, no `packages/shared-types` reuse
  (see above). `ruff` + `pytest` + `uv` are this project's own lint/test
  stack, independent of `apps/api`/`apps/web` tooling. CI for the bot repo
  is `aiqadam/aiqadam-telegram-bot`'s **own** `.github/workflows/ci.yml`
  (per ADR-0034 component layout), not this repo's root CI — a
  submodule-pointer-bump commit in *this* repo is the only footprint here.
- **Local SQLite cache** (`telegram_id → directusUserId`) is bot-owned,
  disposable, rebuildable from the lookup endpoint — confirmed not a
  cross-repo DB concern (see DB Changes Required above).
- **Thin-bot guarantee (AC-10):** `DIRECTUS_TOKEN`, `AUTHENTIK_API_TOKEN`,
  `TWENTY_API_TOKEN` must be absent from the bot's runtime env — this is a
  **deployment/Coolify-config** assertion, not code the bot needs to write;
  worth a CI/deploy-config checklist item for whoever configures the
  Coolify `aiqadam-bot` service, not a code change per se.
- **Submodule-pointer bump**: after CodeDeveloper commits real content
  inside the `aiqadam-telegram-bot` submodule's own git history, a small
  follow-up commit in **this** repo (`ai-qadam-platform`) updates the
  gitlink SHA under `apps/bot/` so the mount point tracks the new commit —
  this is a required, easy-to-forget second commit per ADR-0034's own
  "Consequences" section ("Submodule pointer bumps are an extra small
  commit in this repo after every bot-repo change").
- **Coolify service definition** (`aiqadam-bot`, no public FQDN,
  long-polling) — infra/deploy config, likely outside version-controlled
  application code; flagged for whichever agent/step owns
  infra-provisioning artifacts (this workflow's `context_refs` don't name
  a Coolify-config file in this repo, so this may be a manual operator
  step or a docs artifact — TestDesigner/DocWriter should confirm scope
  with Orchestrator rather than assume it's silently out of scope).

### Workers — `apps/workers`

**Not applicable.** ADR-0034 explicitly separates `apps/workers/` (a
distinct TypeScript-hosted concern, unrelated to the bot/notifier split)
from this FR's scope, and marks it as "an unused stub to be removed... or
kept as `.gitkeep`." FR-BOT-001's own scope (inbound command handling only,
outbound explicitly deferred to FR-NTF-004) never touches BullMQ queues or
`apps/workers` processors. No worker-side changes.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/internal/telegram/lookup` | POST | **New** route on existing `TelegramInternalController`. Body: `{ telegramId: string }` (reuse `telegramIdSchema` from `telegram-auth.service.ts`). Response `200`: `{ directusUserId: string \| null, isTemp: boolean, country: string \| null }`. Response `404` (AC-3): structured error body, no Authentik user found for `telegramId`. Response `401` (AC-4): missing/incorrect `x-internal-auth`, via existing `InternalAuthGuard` — no new auth logic to write. Guard: `InternalAuthGuard` (reused, not reimplemented). | No — purely additive new route; no existing contract touched. |
| `/v1/internal/telegram/upsert-temp-user` | POST | **Unchanged**, but its `UpsertTempUserResult.directusUserId` remains a hardcoded `null` stub — the new lookup endpoint does NOT delegate to or reuse this method's return value, it needs independent real resolution logic (per Step 1's explicit note). Worth flagging so CodeDeveloper doesn't assume upsert's `null` stub is now "fixed" as a side effect. | No. |

No other existing endpoints are modified. No DTOs on existing routes
change shape.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `TelegramInternalController.lookup` (new, `modules/auth`) | `TelegramAuthService.lookupUser` (new method, `modules/auth`) | Direct NestJS DI (same module) |
| `TelegramAuthService.lookupUser` | `AuthentikClient.getUserByTelegramId` (existing, `modules/admin-invites/authentik.client.ts`) | Already-injected constructor dependency (`AuthentikModule` imported by `AuthModule`) |
| `TelegramAuthService.lookupUser` | `DirectusUsersBridgeService.ensureLinkedByEmail` **or** direct `DirectusClient.get('/users/:id?fields=...')` (existing, `modules/directus/`) | **New** constructor injection needed — `DirectusModule` is already imported at `AuthModule` level (confirmed in `auth.module.ts` imports list) but `TelegramAuthService` itself does not currently receive `DirectusUsersBridgeService`/`DirectusClient` — CodeDeveloper adds this DI wire, not a new module import |
| `TelegramAuthService.lookupUser` | Directus `country` field read (existing pattern, `modules/telegram/telegram-preferences.service.ts` line 178 for reference) | HTTP via `DirectusClient.get()`, same pattern already used in `registration.service.ts` (`this.directus.patch(...)`) and `telegram-preferences.service.ts` |
| Bot auth middleware (new, Python, `aiqadam-telegram-bot` submodule) | `POST /v1/internal/telegram/lookup` (new, `apps/api`) | HTTPS, `x-internal-auth` header, per-update (AC-7) — this is the one cross-repo/cross-language call this FR introduces |

No cross-schema Postgres joins. No new BullMQ/Redis-Streams calls (those
belong to ADR-0034's async/outbound surface, explicitly out of scope —
FR-NTF-004).

---

## Risk Flags

### Security Review Required: **Yes — flagging explicitly for SecurityReviewer.**

`POST /v1/internal/telegram/lookup` is a **new trust boundary**:

1. **Shared-secret auth, not session auth.** It relies entirely on
   `InternalAuthGuard`'s `x-internal-auth` / `INTERNAL_API_TOKEN`
   `timingSafeEqual` check (reused, not reimplemented — AC-4 explicitly
   requires reuse over reimplementation, which is good practice, but
   SecurityReviewer should still confirm no code path allows the guard to
   be bypassed, e.g. accidental omission of `@UseGuards` on the new route
   specifically, since NestJS applies guards at controller-class level
   here and a misplaced route outside `TelegramInternalController` would
   silently lose protection).
2. **Returns PII-adjacent data**: `directusUserId`, `isTemp`, `country`
   are member-identifying/profiling data. A leaked or brute-forced
   `INTERNAL_API_TOKEN`, or a `telegram_id`-enumeration attack against this
   endpoint (no rate limiting is specified for the API side itself — only
   the bot-side rate-limit middleware in AC-9 is scoped, which does not
   protect the API endpoint from a different/malicious caller entirely),
   would let a caller enumerate `telegram_id → directusUserId` mappings
   for the whole member base. Recommend SecurityReviewer explicitly assess
   whether API-side rate limiting or anomaly detection is warranted on
   this route, distinct from the bot's own client-side throttling.
3. **404 vs 401 distinction (AC-3 vs AC-4)** is deliberately
   information-revealing by design (bot needs to distinguish "unknown
   user" from "API down") — confirm this is an acceptable information
   disclosure given the endpoint is already gated by a shared secret (i.e.
   only a caller who already has `INTERNAL_API_TOKEN` can enumerate
   `telegram_id` existence), not exposed to unauthenticated callers.
4. **Read-path idempotency / no side effects (AC-5)** — SecurityReviewer
   should confirm the implementation genuinely never creates or mutates an
   Authentik/Directus record on this path (unlike its sibling
   `upsert-temp-user`), since an accidental upsert-on-read would be a
   silent behavior/security regression.
5. **Country field surfaced without tenant-scoping check** — the endpoint
   returns `country` unconditionally once a Directus user is resolved;
   confirm this doesn't need to be gated by anything beyond "the shared
   secret is valid" (likely fine, since the calling bot process is
   inherently multi-tenant per ADR-0034 §Q4 — "Tenant is resolved
   per-update" — but worth an explicit SecurityReviewer sign-off rather
   than an assumption).

### Architecture Rule Risks

1. **Two incompatible internal-auth conventions for bot↔API calls remain
   unresolved beyond this FR's scope** (`InternalAuthGuard` vs.
   `TelegramAuthGuard`) — already flagged at length in Step 1's
   Completeness Issue #5 and resolved *for this FR only*. Not re-litigated
   here, but the impact is real: if FR-BOT-002 later decides the full
   command surface should use `TelegramAuthGuard` instead, the bot ends up
   calling two different auth conventions for different endpoints
   long-term (lookup via `x-internal-auth`, everything else via `Bearer
   <service-token>`), which is architecturally awkward but not a blocker
   for this workflow. No action for CodeDeveloper here beyond being aware.
2. **Submodule sequencing (PR #194)** — bot-side implementation cannot
   proceed against a real `apps/bot/` submodule mount until #194 merges or
   its changes are folded in. This is a landing-order risk, not a design
   risk; Orchestrator must resolve before CodeDeveloper's bot-side step
   (API-side work has no such blocker and can proceed independently, so
   splitting CodeDeveloper's work into an API-first sub-step is a
   reasonable mitigation).
3. **No automated Python/TypeScript contract-mirror check for this sync
   endpoint** — unlike the async `tg.dispatch.v1` envelope (which ADR-0034
   says both repos' CI parses against a shared AsyncAPI yaml), the new
   sync `lookup` endpoint's request/response shape has no equivalent
   automated drift check between the pydantic model on the bot side and
   the Zod schema on the API side. Low severity (this is a small, stable,
   two-field contract), but worth a TestDesigner note — an integration
   test asserting the exact response shape is the practical mitigation
   given no schema-mirror tooling exists for this surface.
4. **`architecture.md` staleness** (Step 1 Completeness Issue #3) —
   already flagged as non-blocking and owned by PR #194; CodeDeveloper and
   DocWriter should treat ADR-0034 as authoritative for bot layout, not
   `architecture.md` §256-297, while both PRs are in flight.

---

## Test Scope

### Unit (apps/api, Vitest/Jest per existing convention)

- `TelegramAuthService.lookupUser` — new method:
  - Resolves a linked, non-temp Authentik user → correct `{directusUserId, isTemp: false, country}`.
  - Resolves a temp-only Authentik user (`is_temporary: true`, no full registration) → `isTemp: true`, `country` from Directus if set else `null` (AC-2 — flagged by Step 1 as needing a CodeDeveloper decision on the exact `directusUserId` value in this case; TestDesigner should not guess ahead of that decision).
  - No Authentik user found for `telegramId` → throws/returns 404 shape (AC-3).
  - Confirms no Authentik/Directus write occurs on any path (AC-5, idempotency — mock assertions on `createUser`/`patchAttributes`/`patch` never being called).
- `InternalAuthGuard` reuse — no new unit tests needed (already covered elsewhere), but a route-level test confirming the guard is actually applied to the new route (AC-4) is warranted (see Security Review Required #1 above — this is the same concern from a test-coverage angle).

### Integration (Testcontainers — apps/api)

- `POST /v1/internal/telegram/lookup` end-to-end against a real
  Postgres + mocked/stubbed Authentik + Directus HTTP layer (matching
  existing integration-test conventions for `auth.controller.ts` routes),
  covering AC-1 through AC-5 as black-box HTTP assertions (status codes +
  response shape), not just service-level unit mocks.
- Confirm `x-internal-auth` guard integration (401 case, AC-4) at the HTTP
  layer, not just guard-unit level.

### Bot-side (Python, pytest — `aiqadam-telegram-bot` submodule)

- Mocked-API-client tests for the auth middleware (AC-7): confirms exactly
  one call to the lookup endpoint per update, and that the resolved
  `{directusUserId, isTemp, country}` is attached to handler context.
- `/start` handler test (AC-6): static welcome message, timing not
  realistically assertable in unit tests — treat the "3 seconds" bound as
  a deploy/smoke-test concern (UATRunner), not a unit-test assertion.
- Unknown-command fallback test (AC-8).
- Rate-limit middleware test (AC-9): 10+ req/min per `telegram_id` triggers
  "slow down" response, no downstream handler invocation.
- Env-var absence check (AC-10) — likely a deploy-config/CI lint check
  (grep the Coolify env definition or a startup assertion) rather than a
  pytest unit test; TestDesigner to decide exact mechanism.
- Structured logging test (AC-11) — assert JSON log shape at the
  logging-middleware unit level; actual Loki delivery is a deploy/ops
  concern for UATRunner, not a unit test.

### E2E (Playwright)

**Not applicable.** This FR has no browser-facing surface (confirmed under
Frontend above) — no Playwright flows are implied. UAT verification for
this FR will instead be a manual/scripted Telegram-bot smoke test against
a deployed Coolify instance (AC-6, AC-9, AC-11's Grafana/Loki check), which
is UATRunner's concern at a later workflow step, not TestDesigner's
Playwright scope.

---

## Gate Result

```yaml
gate: impact-analyzer
workflow: wf-20260731-feat-171
status: passed
timestamp: 2026-07-31T00:00:00Z
summary: >
  Full impact analysis complete for FEAT-BOT-1. API-side change is scoped to
  one new route (POST /v1/internal/telegram/lookup) + one new service method
  on TelegramAuthService, placed in modules/auth (TelegramInternalController)
  rather than modules/internal — both were investigated directly; auth wins
  on URL-prefix cohesion with the existing sibling upsert-temp-user route and
  requires only one new constructor injection (DirectusUsersBridgeService),
  no new NestJS module. DB Changes Required: No — confirmed the bot's SQLite
  cache is bot-local per ADR-0034 §Q3 (bot owns no Postgres/business state);
  the API-side lookup is a pure read/compose over existing Authentik
  attributes + Directus `country` field (corrected from a hypothesized
  `country_preference`, which registration.service.ts's own code comment
  confirms does not exist). No packages/shared-types changes (cross-language
  boundary, no shared-types mechanism exists for Python). No frontend, no
  workers impact. Security review explicitly flagged: new shared-secret
  trust boundary returning PII-adjacent data, no endpoint-side rate
  limiting specified, 404-vs-401 enumeration surface to sign off on.
  Sequencing risk (PR #194, submodule not yet live) carried forward from
  Step 1 as a landing-order constraint on the bot-side half of
  implementation only — API-side work is unblocked and can proceed first.
affected_layers:
  api: true
  db: false
  shared_types: false
  frontend: false
  bot: true
  workers: false
security_review_required: true
architecture_rule_risks:
  - description: >
      InternalAuthGuard vs TelegramAuthGuard convention split remains
      unresolved beyond this FR's own scope (resolved locally: lookup uses
      InternalAuthGuard, matching its sibling upsert-temp-user).
    severity: low
    blocking: false
  - description: >
      Bot-side implementation blocked on PR #194 (submodule bootstrap)
      merging or being folded in; API-side implementation is unblocked.
    severity: medium
    blocking: true
    blocking_scope: bot-side only
next_agent: db-migration-author-or-code-developer
next_agent_note: >
  DB Changes Required is No, so DBMigrationAuthor can be skipped per
  workflow routing — proceed directly to CodeDeveloper. Recommend
  CodeDeveloper split into two sub-steps: (1) API-side lookup endpoint
  (unblocked, can start immediately), (2) bot-side scaffold (blocked on
  PR #194 sequencing per Risk Flags above) — Orchestrator to confirm
  sequencing decision before step 2 starts.
```
