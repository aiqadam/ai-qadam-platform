# 01 — Requirement Validation
**Workflow:** wf-20260625-feat-027
**Agent:** RequirementAnalyst
**Date:** 2026-06-25

---

## Raw Input

**Source:** `docs/03-requirements/FR-AUTH-002.md`
**Requirement text (from handoff):**
> "Telegram authentication — users can sign in or register using their Telegram identity
> via the Login Widget on the web sign-in page and via the bot /start command. Authentik
> remains the single session authority."

**Status in registry:** Planned — implementation position #9, depends on FR-AUTH-001 (Shipped).

**Workflow scope constraint (from Orchestrator):**
This PR delivers **only the API layer** (NestJS endpoints + service + unit/integration tests).
The web widget UI (Astro/React island) and bot scaffold (FR-BOT-001) are explicitly deferred
to subsequent PRs to stay within the 5-file code limit (AGENTS.md §4).

---

## Analysis

### 1. Completeness

The requirement in FR-AUTH-002.md is unusually detailed. Scoring against the five criteria:

| Criterion | Score | Note |
|---|---|---|
| Specific | PASS | Two entry points, two endpoint signatures, exact HMAC scheme named, redirect sequence described. |
| Testable | PASS | Seven AC in FR-AUTH-002.md each map to a discrete test. |
| Non-conflicting | PASS — with one scoping caveat (see §3) | |
| Scoped to one module layer | CONDITIONAL | The requirement spans two entry points (web widget → API; bot → API internal endpoint). The deferred-to-PR constraint narrows this PR to the API-only layer, which fits cleanly in `modules/auth` + a new `modules/auth/telegram/` sub-folder. |
| Referenced | PASS | Cross-refs to ADR-0015, FR-AUTH-005, FR-AUTH-006, and the HMAC scheme note. |

**Completeness issue — HMAC scheme precision:**
FR-AUTH-002 §Notes states: *"Two HMAC schemes exist in Telegram's docs (Login Widget vs
WebApp `initData`) — implementation must use the correct one for each entry point."*
The spec says to use `HMAC-SHA256(SHA256(BOT_TOKEN), data_check_string)` for the Login
Widget endpoint but does not specify the scheme for the bot's temp-user endpoint. The bot's
internal endpoint (`POST /v1/internal/telegram/upsert-temp-user`) is called by the bot
service, not directly from Telegram, so it does NOT need its own Telegram HMAC verification
— the bot authenticates via `X-Internal-Auth` (same pattern as `InternalAuthGuard`). This
is a clarifying interpretation, logged below as an assumption.

**Completeness issue — country assignment scope:**
Functional scope item 6 (bot `/start` country assignment: `directus_users.country_preference`)
references a Directus write. Per the data ownership table in architecture.md, Directus data
is written only via Directus admin API. The internal endpoint returns `{ directusUserId, country }`
but the *write* of `country_preference` is handled by the bot after receiving the response,
not by this endpoint. This PR need not touch Directus write paths; the endpoint returns the
data the bot needs to drive the country prompt. Logged as assumption.

**Completeness issue — "existing user matched by email":**
AC item 5 states: *"A user who has previously signed in via email and then uses the Telegram
Login Widget with the same email is matched to the existing account (not duplicated)."*
The Login Widget can return an email field (Telegram users with verified emails). The lookup
sequence must be: (a) query Authentik by `telegram_id` attribute, (b) if not found and email
present, query Authentik by email, (c) if found by email, patch `attributes.telegram_id`
onto the existing user, (d) if neither, create new user. This is inferrable from the
requirement but the sequence is unspecified — documented as a formalized decision below.

### 2. Conflicts with Existing Features

| Check | Finding |
|---|---|
| Duplicates FR-AUTH-001 | No — FR-AUTH-001 owns email/password OIDC flow; this is a parallel Telegram identity path layered on the same Authentik back-end. |
| Conflicts with FR-AUTH-003 (Google/GitHub OAuth) | No — same Authentik-admin-API provisioning pattern; parallel implementation. |
| Conflicts with FR-AUTH-005 (account linking) | No conflict — FR-AUTH-005 covers linking from an *existing* web session, FR-AUTH-002 covers the *initial* Telegram sign-in. The two touch different endpoints and share the Authentik `telegram_id` attribute as a link key. |
| Conflicts with FR-AUTH-006 (temp account upgrade) | No conflict — FR-AUTH-006 is explicitly downstream of this FR. |
| Conflicts with FR-BOT-001 (bot scaffold) | No conflict — FR-BOT-001 is explicitly downstream. This PR exposes the internal endpoint the future bot will call. |
| Conflicts with existing `InternalController` | No conflict — the new endpoint is in the auth module's internal surface, distinct from `v1/internal/email`. Recommend namespacing under `v1/internal/telegram/` to separate concerns. |
| BOT_TOKEN secret isolation | The requirement states `TELEGRAM_BOT_TOKEN` must never appear in the web frontend bundle. Architecture satisfies this: the token is only accessed in the API process (`env.ts`). Web never receives it. |

### 3. Architectural Feasibility

| Concern | Assessment |
|---|---|
| New endpoint in existing `modules/auth` module | Feasible. The module already imports `AuthentikClient` (indirectly via `admin-invites`); the Telegram service needs it too. Cleanest shape: new `telegram-auth.service.ts` inside `modules/auth` that gets `AuthentikClient` injected. |
| Authentik admin API availability | `AuthentikClient` already implements `getUserByEmail`, `createUser`, and `patchAttributes` — all operations needed for this feature. No new Authentik API surface. |
| Module boundary: `AuthentikClient` lives in `admin-invites` module | The `AuthentikClient` is decorated `@Injectable()` and exported from `AuthentikModule`. The `AuthModule` will need to import `AuthentikModule`. This is a clean module dependency, not a boundary violation. |
| New env var: `TELEGRAM_BOT_TOKEN` | Must be added to `apps/api/src/config/env.ts` as optional (same degraded-mode pattern as `AUTHENTIK_ADMIN_TOKEN`). When absent, the telegram auth endpoints return `503 telegram_not_configured`. |
| Session hand-off via Authentik admin login token | Authentik's admin API exposes `POST /api/v3/core/users/{pk}/impersonate/` and recovery-token flows. The correct mechanism for "mint a one-time login token" that drives OIDC without a password is Authentik's **recovery link** API (`POST /api/v3/core/users/{pk}/recovery/`), which returns a URL the browser visits to begin a token-less OIDC session. This is technically feasible with the existing `AuthentikClient` — a new method `createRecoveryLink(pk)` suffices. |
| 5-file code limit (AGENTS.md §4) | With the deferred scope (no web UI, no bot), the implementation fits: (1) `telegram-auth.service.ts`, (2) `telegram-auth.service.spec.ts`, (3) `auth.module.ts` (import AuthentikModule), (4) `auth.controller.ts` (new routes), (5) `env.ts` (new env var). This is exactly 5 code files. Tests live in the same file as spec. |
| No cross-schema queries | Authentik is accessed via its REST API, not direct SQL. Correct. |
| No new DB schema needed in this PR | The feature stores identity on Authentik's `attributes` object, not in the platform Postgres schema. `platform.users` already has `authentik_subject`; no migration required for the API-layer PR. |

---

## Formalized Requirement

**Feature identifier:** `FEAT-AUTH-7`
(Registry module code: `AUTH`. Next available N: existing FEAT-AUTH identifiers in registry
are 1–6 implied by FR-AUTH-001 through FR-AUTH-006; assigning 7 for this workflow.)

### Statement

> The NestJS API MUST expose two new endpoints and one new service (`TelegramAuthService`)
> that together allow:
>
> (a) **Web widget path** — `POST /v1/auth/telegram/exchange` accepts Telegram Login Widget
> fields, verifies the HMAC-SHA256 hash using `SHA256(TELEGRAM_BOT_TOKEN)` as the key and
> the sorted `data_check_string` as the message (per Telegram Login Widget docs), looks up
> or provisions an Authentik user with `attributes.telegram_id`, mints an Authentik
> recovery link to complete the OIDC session, and 302-redirects through the existing
> `/v1/auth/callback` flow to land the browser at `/me`.
>
> (b) **Bot internal path** — `POST /v1/internal/telegram/upsert-temp-user` is guarded by
> `InternalAuthGuard` (`X-Internal-Auth` header) and accepts `{ telegramId, username?,
> firstName?, lastName? }`. It looks up or creates an Authentik user with
> `attributes.telegram_id = telegramId`, `attributes.is_temporary = true`, and synthetic
> email `tg<telegramId>@telegram.local`. Returns `{ authentikUserPk, directusUserId | null,
> country | null }`.
>
> Both paths MUST be guarded by rate limiting (auth-class limits: 5 req/15 min/IP for the
> public endpoint, service-account limit for the internal endpoint). `TELEGRAM_BOT_TOKEN`
> MUST be added to `env.ts` as optional; when absent both endpoints return `503`.

### Deferred items (not in this PR)

| Deferred item | Future FR |
|---|---|
| Telegram Login Widget JS snippet on `/auth/sign-in` page | Web follow-up PR (no FR code yet) |
| Bot `/start` command handler that calls `upsert-temp-user` | FR-BOT-001 |
| Country assignment prompt + `country_preference` write | FR-BOT-001 |
| Account linking from `/me` page | FR-AUTH-005 |
| Temp account upgrade flow | FR-AUTH-006 |

### Assumptions made (needs-clarification items)

1. **Bot internal endpoint does not re-verify Telegram HMAC** — the bot service is trusted
   (authenticated via `InternalAuthGuard`). The bot verifies the Telegram-origin message
   before calling this endpoint. This is the existing pattern for all `/v1/internal/*` routes.

2. **Email-matching sequence for Login Widget** — if Telegram Widget provides an email and no
   user has the matching `telegram_id`, the service queries Authentik by email before creating
   a new user. If matched by email, it patches `telegram_id` onto the existing user and
   proceeds with session hand-off. This prevents duplicates for users who signed in via
   email first.

3. **Session hand-off uses Authentik recovery link** — `POST /api/v3/core/users/{pk}/recovery/`
   returns a one-use login URL. The exchange endpoint 302-redirects the browser to this URL;
   Authentik's internal session engine then drives the OIDC callback naturally. This avoids
   any need to know the user's password or issue an artificial code flow.

4. **`TELEGRAM_BOT_TOKEN` env var name** — using `TELEGRAM_BOT_TOKEN` (not
   `TELEGRAM_BOT_SERVICE_TOKEN` which is the existing bearer auth for Telegram service-to-API
   calls). These are distinct credentials with different purposes.

---

## Acceptance Criteria (draft)

**For TestDesigner to formalize with test fixtures.**

AC-1: Given a valid Telegram Login Widget POST with correct `hash`, `id`, `auth_date` within
the past 86 400 seconds, when `POST /v1/auth/telegram/exchange` is called, then the response
is a `302` redirect that completes the OIDC flow and the browser lands at `/me`.

AC-2: Given a POST to `/v1/auth/telegram/exchange` with an invalid `hash` (tampered or
wrong key), then the response is `401 Unauthorized` with a body matching
`{ "status": 401, "title": "telegram_hmac_invalid" }`.

AC-3: Given a POST to `/v1/auth/telegram/exchange` with a valid `hash` but `auth_date` older
than 86 400 seconds, then the response is `401 Unauthorized` with
`{ "title": "telegram_auth_date_expired" }`.

AC-4: Given a first-time Telegram user calling `POST /v1/internal/telegram/upsert-temp-user`
with `{ telegramId: "123456" }`, then an Authentik user is created with
`attributes.telegram_id = "123456"`, `attributes.is_temporary = true`, and
`email = "tg123456@telegram.local"`, and the response is `{ authentikUserPk: <pk> }`.

AC-5: Given the same `telegramId` calling `upsert-temp-user` a second time, then no new
Authentik user is created and the existing `authentikUserPk` is returned.

AC-6: Given a Telegram Widget exchange where the `id` already exists as `attributes.telegram_id`
on an Authentik user, then no new user is created and the existing user's session is
established.

AC-7: Given a Telegram Widget exchange where the `id` does NOT match any Authentik user but
the `email` field from the widget matches an existing Authentik user by email, then
`attributes.telegram_id` is patched onto the existing user and a session is established
(no duplicate account created).

AC-8: Given `TELEGRAM_BOT_TOKEN` is absent from env, when either Telegram auth endpoint is
called, then the response is `503 Service Unavailable` with body
`{ "title": "telegram_not_configured" }`.

AC-9: Given `POST /v1/internal/telegram/upsert-temp-user` called without `X-Internal-Auth`
header or with an incorrect value, then the response is `401 Unauthorized`.

AC-10: Given more than 5 requests to `POST /v1/auth/telegram/exchange` from the same IP
within 15 minutes, when `RATE_LIMIT_ENFORCE=true`, then subsequent requests return `429`.

---

## Gate Result

```
gate_result:
  status: passed
  summary: "FR-AUTH-002 is specific, testable, non-conflicting, and architecturally feasible for the API-only scope of this PR; three clarifying assumptions were recorded but none block implementation."
  findings:
    - "FR-AUTH-002 is well-specified; all seven ACs in the source doc are actionable."
    - "Scope correctly bounded: web widget UI and bot scaffold deferred; API layer (2 endpoints + service) fits the 5-file limit exactly."
    - "No new DB migration required: identity stored on Authentik user attributes, not platform Postgres."
    - "AuthentikClient already has all required API methods (getUserByEmail, createUser, patchAttributes); one new method (createRecoveryLink) needed."
    - "AuthModule must import AuthentikModule — clean module dependency, not a boundary violation."
    - "TELEGRAM_BOT_TOKEN must be added to env.ts as optional; distinct from existing TELEGRAM_BOT_SERVICE_TOKEN."
    - "Assumption: bot internal endpoint trusts InternalAuthGuard; no Telegram HMAC re-verification at that layer."
    - "Assumption: email-match fallback on Login Widget exchange prevents duplicates for prior email-signup users."
    - "Assumption: Authentik recovery link API (/api/v3/core/users/{pk}/recovery/) is the correct session hand-off mechanism — must be verified against Authentik instance version before implementation."
```
