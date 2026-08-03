# Impact Analysis: FEAT-AUTH-007 — Linked Accounts Management

**Workflow:** wf-20260804-feat-208-linked-accounts-management  
**Agent:** ImpactAnalyzer  
**Date:** 2026-08-04  
**Validated Requirement:** [01-requirement-validation.md](01-requirement-validation.md)

---

## Validated Requirement

**FEAT-AUTH-007** — Identity surface: linked accounts management

Members can view all authentication methods linked to their Authentik account from `/me` — Email/password, Google, GitHub, and Telegram — and manage them subject to the rule that at least one sign-in method must remain at all times. The NestJS API mediates all reads and writes against Authentik's admin API and the Directus `directus_users` table; the web never calls Authentik directly.

**PR sequence (4 natural vertical slices):**
- PR 1/4: API — `GET /v1/auth/linked-accounts` + `DELETE /v1/auth/linked-accounts/:provider` + AuthentikClient read/delete methods
- PR 2/4: API — `GET /v1/auth/link?provider=` + callback link-mode branch
- PR 3/4: Web — `LinkedAccountsPanel` component (replaces `TelegramLinkStatus`)
- PR 4/4: Bot — update `/me` command for specific Telegram linked state + create BP-UAT-022

---

## Affected Layers

### API (NestJS — apps/api)

**Primary surface:** `apps/api/src/modules/auth/` — AUTH module. All 3 new public endpoints live under `@Controller('v1/auth')` and require `@UseGuards(AuthGuard)` (authenticated member only).

`AuthentikModule` is already imported in `AuthModule` and already exports `AuthentikClient` — no new module import needed.  
`DirectusModule` is already imported in `AuthModule` — `DirectusClient` is injectable in `LinkedAccountsService` without any new module graph edge.

### DB Changes Required: **NO**

No new Drizzle schema tables, columns, or migration files.

- Authentik manages OAuth source connections natively via `/api/v3/core/user_source_connections/`.
- `directus_users.telegram_user_id` and `directus_users.telegram_username` already exist (consumed by `TelegramLinkStatus` via `useMyFullProfile()` and the FR-AUTH-005 bot `/link` flow).
- Telegram unlink writes `{ telegram_user_id: null, telegram_username: null, telegram_linked_at: null }` via `PATCH /directus/users/{id}` — no schema change.

### Shared Types (packages/shared-types)

No changes. `packages/shared-types/` is an empty placeholder. All DTOs are defined inline per established convention.

### Frontend (apps/web-next)

`LinkedAccountsPanel` React island replaces `TelegramLinkStatus`. Calls `GET /v1/auth/linked-accounts` via a new `use-linked-accounts.ts` hook (React Query, `use-registrations.ts` pattern). DELETE mutation calls `DELETE /v1/auth/linked-accounts/:provider`. "Link Google/GitHub" navigates the browser to `GET /v1/auth/link?provider=` (top-level navigation, same pattern as `GET /v1/auth/login`).

### Bot (apps/bot)

Bot `/me` command gains conditional Telegram link state (AC-10). The existing `/v1/internal/telegram/me` response is extended with `telegramLinked` and `telegramUsername` fields — the bot reads these from the same API call without a new endpoint. Two new locale keys per language.

### Workers (apps/workers)

Not affected.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/auth/linked-accounts` | GET | **New** — returns `LinkedAccountEntry[]` for the authenticated user | No |
| `/v1/auth/linked-accounts/:provider` | DELETE | **New** — unlinks provider; 409 if last method | No |
| `/v1/auth/link` | GET | **New** — initiates add-provider OAuth flow (link-mode); `?provider=google\|github` required; reads active session to resolve userId | No |
| `/v1/auth/callback` | GET | **Modified** — adds link-mode cookie (`LINK_COOKIE`) detection branch: verify JWT, associate OAuth identity with existing user via Authentik admin API, clear cookie, redirect to `/me?linked=<provider>`; all existing sign-in and upgrade paths unchanged | Non-breaking |
| `/v1/internal/telegram/me` | GET | **Modified** — response extended with `telegramLinked: boolean` and `telegramUsername: string \| null`; existing fields unchanged | Non-breaking (additive) |

### Response shape for `GET /v1/auth/linked-accounts`

```typescript
interface LinkedAccountEntry {
  provider: 'email' | 'google' | 'github' | 'telegram';
  linked: boolean;
  handle: string | null; // email addr, GitHub handle, @telegram_username; null when unlinked
  canUnlink: boolean;    // false when this is the last method; always false for 'email'
}
```

### Provider → unlink action mapping (DELETE)

| `provider` param | Linked-state source | Unlink mechanism |
|---|---|---|
| `google` | `getUserSourceConnections(authentikPk)` — slug contains `google` | `deleteUserSourceConnection(connectionPk)` |
| `github` | Same, slug contains `github` | `deleteUserSourceConnection(connectionPk)` |
| `telegram` | `directus_users.telegram_user_id != null` | `PATCH /directus/users/{id}` → `{ telegram_user_id: null, telegram_username: null, telegram_linked_at: null }` |
| `email` | `getUserDetail(authentikPk).has_usable_password` | **409 always** — Authentik has no REST API to remove a local credential without deleting the user; email row is display-only |

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `LinkedAccountsService` | `AuthentikClient.getUserDetail()` | Constructor injection — AuthentikModule already imported and exports AuthentikClient |
| `LinkedAccountsService` | `AuthentikClient.getUserSourceConnections()` | Same |
| `LinkedAccountsService` | `AuthentikClient.deleteUserSourceConnection()` | Same |
| `LinkedAccountsService` | `DirectusClient.get()` — read `telegram_user_id`, `telegram_username` | Constructor injection — DirectusModule already in AuthModule |
| `LinkedAccountsService` | `DirectusClient.patch()` — clear Telegram fields on unlink | Same |
| `AuthController.link()` | `AuthService.startLinkAuthorization()` | Already injected in AuthController |
| `AuthController.callback()` | `LinkedAccountsService.completeLinkCallback()` (private helper) | Newly added to AuthModule providers |
| `TelegramAuthService.getMeSummary()` | `DirectusClient.get()` — read `telegram_user_id`, `telegram_username` | Already injected in TelegramAuthService |

**No new NestJS module imports required.** All new service dependencies resolve within `AuthModule`'s existing module graph.

---

## Files to Create (6)

| # | File | Purpose |
|---|---|---|
| 1 | `apps/api/src/modules/auth/linked-accounts.service.ts` | Core service: `getLinkedAccounts()` aggregates Email/OAuth/Telegram state; `unlinkProvider()` enforces last-method 409 before delegating to Authentik or Directus. Injects `AuthentikClient` + `DirectusClient`. |
| 2 | `apps/api/src/modules/auth/linked-accounts.service.spec.ts` | Unit tests: unlink protection (1 method → 409 per provider type; email → 409 always); response mapping; Telegram unlink clears correct Directus fields; IDOR guard (connection resolved server-side, never from raw path param). |
| 3 | `apps/web-next/src/blocks/customer/LinkedAccountsPanel.tsx` | React island: 4-row provider panel, link/unlink buttons, loading/error states, `?linked=` success toast. Consumes `use-linked-accounts.ts`. |
| 4 | `apps/web-next/src/blocks/customer/LinkedAccountsPanel.test.tsx` | Unit tests for pure render-logic helpers (same pattern as `TelegramLinkStatus.test.tsx` — no RTL, plain input/output assertions). |
| 5 | `apps/web-next/src/lib/use-linked-accounts.ts` | React Query hooks: `useLinkedAccounts()` (query) + `useUnlinkProvider()` (mutation, invalidates query on success). Follows `use-registrations.ts` pattern. |
| 6 | `docs/02-business-processes/uat/BP-UAT-022.md` | New BP-UAT for linked accounts management E2E. Created in PR 4/4 by TestDesigner. |

---

## Files to Modify (12)

| # | File | What changes |
|---|---|---|
| 1 | `apps/api/src/modules/auth/auth.controller.ts` | Add route handlers for `GET /v1/auth/linked-accounts`, `DELETE /v1/auth/linked-accounts/:provider`, `GET /v1/auth/link`. Add `LINK_COOKIE = 'aiqadam-link-mode'` constant. Modify `callback()` to detect `LINK_COOKIE` via a private `completeLinkCallback()` helper (see RF-3). Inject `LinkedAccountsService` in constructor. |
| 2 | `apps/api/src/modules/auth/auth.module.ts` | Add `LinkedAccountsService` to `providers` array. No new module `imports`. |
| 3 | `apps/api/src/modules/auth/auth.service.ts` | Add `startLinkAuthorization(input: { userId: string; provider: 'google' \| 'github'; next: string })` — mints a signed `LINK_COOKIE` JWT (HS256, `jose`, 10-min TTL; carries `userId`, `provider`, `nonce`; same pattern as `FLOW_COOKIE`), returns Authentik authorize URL for the provider. |
| 4 | `apps/api/src/modules/admin-invites/authentik.client.ts` | Add exported interfaces: `AuthentikUserDetail` (`{ pk: number; has_usable_password: boolean }`), `AuthentikSourceConnection` (`{ pk: number; source: { slug: string } }`). Add methods: `getUserDetail(pk)` → `GET /api/v3/core/users/{pk}/`, `getUserSourceConnections(pk)` → `GET /api/v3/core/user_source_connections/?user={pk}`, `deleteUserSourceConnection(connectionPk)` → `DELETE /api/v3/core/user_source_connections/{pk}/`. |
| 5 | `apps/api/src/modules/auth/telegram-auth.service.ts` | Extend `TelegramMeResult`: add `telegramLinked: boolean` and `telegramUsername: string \| null`. Update `getMeSummary()` to fetch `telegram_user_id` and `telegram_username` via `GET /users/{directusUserId}?fields=telegram_user_id,telegram_username` using the already-injected `DirectusClient`. |
| 6 | `apps/web-next/src/blocks/customer/index.ts` | Replace `export { TelegramLinkStatus } from './TelegramLinkStatus'` with `export { LinkedAccountsPanel } from './LinkedAccountsPanel'`. |
| 7 | `apps/web-next/src/pages/me/index.astro` | Replace `import { TelegramLinkStatus }` → `import { LinkedAccountsPanel }`; replace `<TelegramLinkStatus client:load />` → `<LinkedAccountsPanel client:load />`. |
| 8 | `apps/bot/src/handlers/me.py` | Update `render_me()` to accept `telegram_linked: bool` and `telegram_username: str \| None` from `MeSummary`. Replace static `me.link_web_cta` line with conditional: if `telegram_linked` → `me.telegram_linked` formatted with `@{telegram_username}`, else → `me.link_telegram_cta`. |
| 9 | `apps/bot/src/services/api_client.py` | Extend `MeSummary` dataclass: add `telegram_linked: bool = False` and `telegram_username: str \| None = None`. Update `get_me_summary()` parsing: `body.get("telegramLinked", False)` and `body.get("telegramUsername")`. |
| 10 | `apps/bot/src/locales/ru.py` | Add `"me.telegram_linked": "@{telegram_username} — Telegram привязан."` and `"me.link_telegram_cta": "Введите /link в @aiqadam_bot, чтобы привязать Telegram к аккаунту."`. |
| 11 | `apps/bot/src/locales/en.py` | Add `"me.telegram_linked": "@{telegram_username} — Telegram linked."` and `"me.link_telegram_cta": "Type /link in @aiqadam_bot to connect your Telegram."`. |
| 12 | `docs/03-requirements/FR-AUTH-007.md` | Frontmatter: add `business_process: [BP-UAT-003, BP-UAT-022]`; change `status: Planned` → `status: In Progress`. |

---

## Files to Delete (2)

| # | File | Reason |
|---|---|---|
| 1 | `apps/web-next/src/blocks/customer/TelegramLinkStatus.tsx` | Replaced by `LinkedAccountsPanel` (all 4 providers with link/unlink actions). |
| 2 | `apps/web-next/src/blocks/customer/TelegramLinkStatus.test.tsx` | Tests for the deleted component; `LinkedAccountsPanel.test.tsx` replaces them. |

---

## Summary

| Metric | Value |
|---|---|
| DB Changes Required | **No** |
| Migration files needed | **None** |
| Files to create | 6 |
| Files to modify | 12 |
| Files to delete | 2 |
| Total file operations | **20** |

---

## Risk Flags

### Security Review Required: YES (2 flags)

**RF-1 — IDOR on DELETE /v1/auth/linked-accounts/:provider**  
The OAuth `connectionPk` passed to `deleteUserSourceConnection()` MUST be resolved server-side. `LinkedAccountsService.unlinkProvider()` MUST call `getUserSourceConnections(authenticatedUserPk)` first and match by provider slug — the `:provider` path param is a slug name, not a raw Authentik pk. A client-supplied pk belonging to a different user must never reach `deleteUserSourceConnection()`.

**RF-2 — LINK_COOKIE must be a signed JWT**  
`GET /v1/auth/link` sets `LINK_COOKIE` containing `{ userId, provider, nonce }`. This cookie MUST be HS256-signed using the same `jose`/`JWT_SIGNING_SECRET` pattern as `FLOW_COOKIE` (10-min TTL). `callback()` MUST verify the JWT signature and TTL before acting on it. The `LINK_COOKIE` must NOT carry the user's access token, refresh token, or id_token — only the link intent.

### Architecture Rule Risks

**RF-3 — `callback()` line-count ceiling**  
`callback()` in `auth.controller.ts` already has the FR-AUTH-006 upgrade-intent branch and approaches the 60-line ceiling (AGENTS.md §1 rule #4). The link-mode branch MUST be extracted to a private `completeLinkCallback(req, res, flowClaims)` helper. CodeDeveloper must verify the method stays under 60 lines after both branches exist.

**RF-4 — `callback()` three-branch mutual exclusivity**  
`callback()` now handles: (1) normal sign-in, (2) upgrade-intent (FR-AUTH-006), (3) link-mode (FR-AUTH-007). SecurityReviewer must confirm these are mutually exclusive — a request carrying both `LINK_COOKIE` and the upgrade-intent token must be rejected, not silently handled by one branch.

**RF-5 — `TelegramMeResult` wire-format change is additive**  
New fields `telegramLinked` and `telegramUsername` added to `/v1/internal/telegram/me`. Bot parses with `body.get("telegramLinked", False)` — safe for rolling deploy where old API serves new bot or vice versa.

---

## Test Scope

### Unit Tests (Vitest — apps/api)

`linked-accounts.service.spec.ts` (new):
- `getLinkedAccounts()`: email row from `has_usable_password`; Google/GitHub from `getUserSourceConnections()` slug matching; Telegram from Directus field; `canUnlink=false` when 1 method total; `canUnlink=false` for email always.
- `unlinkProvider()`: 409 when 1 method linked (each provider type); 409 always for `email`; Google/GitHub → `deleteUserSourceConnection()` called with server-resolved pk; Telegram → Directus PATCH with null fields; IDOR guard enforced.

### Unit Tests (Vitest — apps/web-next)

`LinkedAccountsPanel.test.tsx` (new): render-variant helpers for each provider row state; `canUnlink` button-state logic; `?linked=` success toast variant detection.  
`TelegramLinkStatus.test.tsx` — **deleted** alongside the component.

### Integration Tests (Testcontainers)

None required. No new Drizzle schema changes. `AuthentikClient` and `DirectusClient` are external services — mocked in unit tests. CodeDeveloper should run `main-bootstrap.spec.ts` after adding `LinkedAccountsService` to `AuthModule` providers to catch any `UndefinedModuleException`.

### E2E (Playwright — BP-UAT-022)

Created by TestDesigner in PR 4/4. Covers all 10 ACs from `01-requirement-validation.md`, specifically:
- Panel display (AC-1), Link Google (AC-2), Link GitHub (AC-3), Telegram CTA (AC-4), Unlink non-last (AC-5), Unlink protection (AC-6), Email display-only (AC-7), Add email for temp account (AC-8), Live Telegram state (AC-9), Bot `/me` parity (AC-10).

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Full impact scope identified across AUTH module API, web-next, and bot. DB Changes: none. 6 files created, 12 modified, 2 deleted. All dependencies resolve within existing AuthModule module graph. Two security risks flagged for SecurityReviewer (IDOR on DELETE, LINK_COOKIE signing). No architecture violations anticipated provided callback() link-mode branch is extracted to a private helper."
  findings:
    - "DB Changes Required: NO — Authentik manages OAuth source connections; directus_users Telegram fields already exist."
    - "Migration files: NONE."
    - "Files to create (6): linked-accounts.service.ts, linked-accounts.service.spec.ts, LinkedAccountsPanel.tsx, LinkedAccountsPanel.test.tsx, use-linked-accounts.ts, BP-UAT-022.md."
    - "Files to modify (12): auth.controller.ts, auth.module.ts, auth.service.ts, authentik.client.ts, telegram-auth.service.ts, customer/index.ts, me/index.astro, me.py, api_client.py, ru.py, en.py, FR-AUTH-007.md."
    - "Files to delete (2): TelegramLinkStatus.tsx, TelegramLinkStatus.test.tsx."
    - "No new NestJS module imports required — AuthentikModule (exports AuthentikClient) and DirectusModule already in AuthModule."
    - "SECURITY RF-1: IDOR risk on DELETE — server-side connection resolution enforced in LinkedAccountsService.unlinkProvider()."
    - "SECURITY RF-2: LINK_COOKIE must be HS256-signed JWT (same jose/FLOW_COOKIE pattern); callback() verifies before acting."
    - "ARCH RF-3: callback() link-mode branch must be extracted to private helper to stay under 60-line ceiling."
    - "ARCH RF-4: callback() three-branch mutual exclusivity requires SecurityReviewer sign-off."
    - "TelegramMeResult extension additive with safe defaults — rolling-deploy safe."
```

Gate: passed
