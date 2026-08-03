# 04 — Security Review: FR-AUTH-005 Telegram Account Linking

Agent: SecurityReviewer
Workflow: wf-20260803-feat-198
Date: 2026-08-03

---

## Code Changes Reviewed

| # | File | Change type |
|---|---|---|
| 1 | `apps/api/src/modules/telegram/telegram.service.ts` | Modified — 409 guard in `confirmLink()` |
| 2 | `apps/api/src/modules/me-profile/me-profile.service.ts` | Modified — `telegram_user_id/username` added to `PROFILE_FIELDS`, `DirectusUserRow`, `MemberProfile`, `toProfile()` |
| 3 | `apps/web-next/src/blocks/customer/TelegramLinkStatus.tsx` | New — read-only island |
| 4 | `apps/web-next/src/lib/types.ts` | Modified — two nullable fields on `MeProfileCore` |
| 5 | `apps/web-next/src/blocks/customer/index.ts` | Modified — new export |
| 6 | `apps/web-next/src/pages/me/index.astro` | Modified — island rendered inside `<AuthGate>` |
| 7 | `apps/bot/src/handlers/link.py` | New — FSM handler |
| 8 | `apps/bot/src/states/link.py` | New — `LinkStates` |
| 9 | `apps/bot/src/services/api_client.py` | Modified — `request_link_start()`, `request_link_confirm()`, dataclasses, exceptions |
| 10 | `apps/bot/src/main.py` | Modified — router + bot command |
| 11 | `apps/bot/src/locales/en.py` | Modified — `link.*` locale keys |

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | Yes | **PASS** | `GET /v1/me/profile` scopes to the authenticated user's own Directus row via `resolveDirectusId(userId, email)` where `userId` is the JWT `sub`. Link endpoints do not operate on tenant-scoped tables (`tgLinkChallenges` has no `countryCode`). `resolveMemberOrThrow()` rejects members with a null `country`, preventing a cross-tenant identity write. No cross-tenant read path. |
| INV-2 Secrets by reference | Yes | **PASS** | No password/token/apiKey/Bearer literals in diff. OTP `code` is never logged — immediately hashed (`sha256Hex`) and compared via `timingSafeEqual`. Email masking (`maskEmail()`) applied before any log line. Bot service token comes from `self._token` injected from env at construction; never hardcoded. |
| INV-3 Auth at controller level | Yes | **PASS** | `POST /v1/telegram/link/start` and `POST /v1/telegram/link/confirm` are methods of `TelegramController`, which carries `@UseGuards(TelegramAuthGuard)` at class level. `GET /v1/me/profile` is a method of `MeProfileController`, which carries `@UseGuards(AuthGuard)` at class level. Auth is enforced before any service call in both cases. |
| INV-4 Validation at boundaries | Yes | **PASS** | `linkStart()`: `linkStartSchema.safeParse(body)` validates `tg_user_id` (positive integer) and `email` (RFC-valid, max 255). `linkConfirm()`: `linkConfirmSchema.safeParse(body)` validates `challenge_id` (UUID), `code` (exactly 6 decimal digits), `tg_user_id` (positive integer), `tg_username` (optional, max 64). `MeProfileController.getAll()`: `userId/email` sourced from JWT via `requireUser(req)` — already boundary-validated by `AuthGuard`. Bot: `user_context.telegram_id` is Aiogram middleware-resolved, not from user text; API carries authoritative Zod validation. |
| INV-5 No cross-schema queries | Yes | **PASS** | Service queries only `tgLinkChallenges` (platform schema, Drizzle ORM). All Directus operations go over HTTP via `DirectusClient.patch()` / `DirectusClient.get()` — no SQL JOIN across platform/directus schemas. |
| INV-6 Rate limiting | Yes | **PASS** | Both link endpoints live inside `TelegramController` gated by `TelegramAuthGuard` (bot service token) — M2M, not public. `link/start` additionally enforces application-level rate limiting: `enforceRateLimit()` checks `activeChallengeCount()` against `MAX_ACTIVE_CHALLENGES_PER_TG_USER = 3`. `link/confirm` has per-challenge attempt ceiling `MAX_CONFIRM_ATTEMPTS = 5`. |
| INV-7 CSRF protection | N/A | **N/A** | `link/start` and `link/confirm` are bot-to-API M2M calls authenticated by `x-internal-auth` — never browser-initiated. `TelegramLinkStatus.tsx` is read-only; no state-changing browser POST. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | **PASS** | `TelegramLinkStatus.tsx` reviewed in full. Zero occurrences. All dynamic content rendered via React text interpolation. |
| INV-9 No N+1 queries | Yes | **PASS** | `MeProfileService.getProfile()` issues one Directus GET with extended `PROFILE_FIELDS` — no additional round trip for the two new fields. `TelegramService.confirmLink()` executes a fixed sequence (select challenge → Directus GET → Directus PATCH → update challenge), not inside any loop. |
| INV-10 Drizzle parameterization | Yes | **PASS** | All Drizzle calls use parameterized forms: `.where(eq(...))`, `.insert().values({...})`, `.update().set({...})`. No user-controlled string interpolation in any `sql\`...\`` usage. |
| INV-11 HttpOnly tokens (web) | N/A | **N/A** | No token storage in the new island. `useMyFullProfile()` is an existing React Query hook. No new auth flows touch the web frontend. |

---

## BLOCKER Findings

None.

## MAJOR Findings

None.

---

## Additional Security Observations (informational)

1. **Identity anchoring:** `loadValidChallenge()` verifies `challenge.tgUserId === tgUserId` — only the exact Telegram identity that initiated the challenge can complete it. A leaked `challenge_id` is useless to a different TG account.
2. **Email enumeration prevention:** `startLink()` always returns the same envelope regardless of whether the email belongs to a member. Email delivery is suppressed silently when no member exists.
3. **Timing-safe OTP comparison:** `codeMatches()` uses `timingSafeEqual()` from Node.js `crypto` on SHA256 hashes.
4. **`tg_user_id` origin in bot handler:** `user_context.telegram_id` is resolved by Aiogram's auth middleware from the Telegram update envelope — never from user-provided message text. A malicious user cannot inject an arbitrary `tg_user_id`.
5. **GDPR re-link recovery write safety:** `writeLinkToDirectus()` clears `gdpr_deleted_at` only on the member's own row.

---

## Gate Result

```yaml
status: passed
summary: "All 11 applicable invariants confirmed; zero BLOCKER or MAJOR findings."
findings: []
```
