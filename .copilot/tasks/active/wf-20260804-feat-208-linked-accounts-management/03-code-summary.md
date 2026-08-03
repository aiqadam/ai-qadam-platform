# Code Summary — wf-20260804-feat-208-linked-accounts-management

## Files Created

| File | Description |
|------|-------------|
| `apps/api/src/modules/auth/linked-accounts.service.ts` | New NestJS service for FR-AUTH-007 — reads all four linked provider states and handles unlinking |
| `apps/web-next/src/lib/use-linked-accounts.ts` | React Query hooks: `useLinkedAccounts()` query + `useUnlinkProvider()` mutation |
| `apps/web-next/src/blocks/customer/LinkedAccountsPanel.tsx` | New React island — shows 4 provider rows with link/unlink actions, handles ?linked= success toast |

## Files Modified

| File | Description |
|------|-------------|
| `apps/api/src/modules/admin-invites/authentik.client.ts` | Added `AuthentikUserDetail` + `AuthentikSourceConnection` interfaces; added `getUserDetail()`, `getUserSourceConnections()`, `deleteUserSourceConnection()` methods |
| `apps/api/src/modules/auth/auth.service.ts` | Added `LINK_ISSUER`/`LINK_AUDIENCE`/`LINK_COOKIE_TTL_SECONDS` constants; `LinkClaims` interface; `startLinkAuthorization()`, `signLinkCookie()`, `verifyLinkCookie()` methods |
| `apps/api/src/modules/auth/auth.controller.ts` | Added `LinkedAccountsService` import + constructor injection; added `GET /linked-accounts`, `DELETE /linked-accounts/:provider`, `GET /link` routes; modified `callback()` to handle LINK_COOKIE for link flow |
| `apps/api/src/modules/auth/auth.module.ts` | Added `LinkedAccountsService` to providers array |
| `apps/api/src/modules/auth/refresh-token.service.ts` | Added `peekUserId()` method (read-only userId lookup from refresh token, used by `/link` route) |
| `apps/api/src/modules/auth/telegram-auth.service.ts` | Extended `TelegramMeResult` with `telegramLinked: boolean` and `telegramUsername: string | null`; updated `getMeSummary()` to fetch these from Directus |
| `apps/web-next/src/blocks/customer/index.ts` | Replaced `TelegramLinkStatus` export with `LinkedAccountsPanel` |
| `apps/web-next/src/pages/me/index.astro` | Swapped `TelegramLinkStatus` component usage for `LinkedAccountsPanel` |
| `apps/bot/src/services/api_client.py` | Extended `MeSummary` dataclass with `telegram_linked: bool` and `telegram_username: str | None`; updated `get_me_summary()` to parse the new fields |
| `apps/bot/src/handlers/me.py` | Updated `render_me()` to show dynamic Telegram link status instead of generic CTA |
| `docs/03-requirements/FR-AUTH-007.md` | Added `business_process: [BP-UAT-003]` to frontmatter |

## Files Deleted

| File | Description |
|------|-------------|
| `apps/web-next/src/blocks/customer/TelegramLinkStatus.tsx` | Replaced by LinkedAccountsPanel |
| `apps/web-next/src/blocks/customer/TelegramLinkStatus.test.tsx` | Test for deleted component |

## Validation

- `pnpm exec tsc --noEmit` on `apps/api` — passed, 0 errors
- `pnpm exec tsc --noEmit` on `apps/web-next` — pre-existing `.astro` module errors only (not introduced by this PR); 0 errors in new files
- `pnpm biome check` on all modified TS/TSX files — passed, no fixes applied
- `ruff check` on modified Python files — passed, all checks passed

## Architecture notes

- **IDOR protection**: `LinkedAccountsService` resolves the Authentik integer PK server-side via `getUserByEmail(email)` from the JWT claims — never from user input.
- **Last-method guard**: counts all linked methods (email + OAuth connections + Telegram) before unlink; throws 409 when ≤ 1.
- **Link cookie flow**: `/link` route reads the refresh cookie (browser navigation, no Bearer token) to identify the caller, sets LINK_COOKIE + FLOW_COOKIE, redirects to Authentik. `callback()` detects LINK_COOKIE and skips session minting.
- **Mutual exclusion**: LINK_COOKIE + pending upgrade-intent → 409 in `callback()`.
- **Telegram unlink**: PATCHes `directus_users` to null out `telegram_user_id`, `telegram_username`, `telegram_linked_at`.

Gate: passed
