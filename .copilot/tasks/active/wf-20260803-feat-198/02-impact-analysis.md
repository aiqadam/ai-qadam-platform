# 02 — Impact Analysis: FEAT-AUTH-005

Agent: ImpactAnalyzer
Workflow: wf-20260803-feat-198
Date: 2026-08-03

## Validated Requirement

**FEAT-AUTH-005** — Telegram account linking (existing web-account member → Telegram bot)

Three surfaces per requirement validation:
- **A** — API `confirmLink()` 409-guard fix (minor, endpoints already live)
- **B** — Bot `/link` FSM command (new files)
- **C** — Web `/me` Telegram status section (new block + API extension)

---

## DB Changes Required: **no**

Both storage concerns are already live:

| Store | Table / Field | Evidence |
|---|---|---|
| API Postgres (Drizzle) | `tg_link_challenges` | `apps/api/src/modules/telegram/schema.ts` defines it; `telegram-link-service.spec.ts` `beforeEach` deletes from it — table exists in the DB |
| Directus (`directus_users`) | `telegram_user_id`, `telegram_username`, `telegram_linked_at`, `telegram_opted_out_at` | `writeLinkToDirectus()` PATCHes these fields; `findDirectusUserByEmail()` requests them in `&fields=` — columns are live |

No Drizzle migration author needed. No Directus data-model change needed.

---

## Affected Layers

### API (NestJS — `apps/api/`)

**Surface A — modify, small:**

| File | Change |
|---|---|
| `apps/api/src/modules/telegram/telegram.service.ts` | Import `ConflictException` from `@nestjs/common`. In `confirmLink()`, after resolving the member, add guard: if `member.telegram_user_id` is non-null AND != `input.tgUserId.toString()` → throw `ConflictException('already_linked_to_different_account')`. Same TG account → proceed (idempotent). |
| `apps/api/test/telegram-link-service.spec.ts` | Add 2 `it()` cases: (1) throws 409 when already linked to a different TG account; (2) succeeds idempotently when same TG account re-links. |

**Surface C — API side, modify small:**

| File | Change |
|---|---|
| `apps/api/src/modules/me-profile/me-profile.service.ts` | Extend `PROFILE_FIELDS` with `,telegram_user_id,telegram_username`. Add to `DirectusUserRow` interface. Add to `MemberProfile` interface. Map both in `toProfile()`. |

### Shared Types

| File | Change |
|---|---|
| `apps/web-next/src/lib/types.ts` | Add `telegram_user_id: string | null; telegram_username: string | null;` to `MeProfileCore`. |

### Frontend (`apps/web-next/src/`)

| File | Change |
|---|---|
| `apps/web-next/src/blocks/customer/TelegramLinkStatus.tsx` | **NEW.** L3 React island. Uses `IslandRoot`/`withRuntime` + `useMyFullProfile()`. Read-only status display. |
| `apps/web-next/src/blocks/customer/index.ts` | Add export for `TelegramLinkStatus`. |
| `apps/web-next/src/pages/me/index.astro` | Import and render `<TelegramLinkStatus client:load />` in `<AuthGate>` below membership summary. |

### Bot (`apps/bot/src/`)

| File | Change |
|---|---|
| `apps/bot/src/handlers/link.py` | **NEW.** `Router(name="link")`. FSM: `Command("link")` → prompt email → call `link/start` → prompt code → call `link/confirm`. Handles all error cases. |
| `apps/bot/src/states/link.py` | **NEW.** `LinkStates(StatesGroup)` with `awaiting_email` and `awaiting_code`. |
| `apps/bot/src/services/api_client.py` | Add `LINK_START_PATH`, `LINK_CONFIRM_PATH`, dataclasses `LinkStartResult`, `LinkConfirmResult`, exception classes for each error case, async methods `request_link_start()` and `request_link_confirm()`. |
| `apps/bot/src/main.py` | Include `link.router`, add `BotCommand(command="link", ...)` to `BOT_COMMANDS`. |
| `apps/bot/src/locales/en.py` | Add keys: `link.prompt_email`, `link.code_sent`, `link.invalid_email`, `link.success`, `link.wrong_code`, `link.exhausted`, `link.no_account`, `link.already_linked_other`, `link.already_linked_same`, `link.unavailable`. |
| `apps/bot/src/locales/ru.py` | Same keys in Russian. |

### Bot Tests (`apps/bot/tests/`)

| File | Change |
|---|---|
| `apps/bot/tests/test_api_client_link.py` | **NEW.** `httpx.MockTransport` tests for both new methods. |
| `apps/bot/tests/test_link_handler.py` | **NEW.** FSM handler tests covering all 9 ACs. |
| `apps/bot/tests/test_main_wiring.py` | **MODIFY.** Add `"link"` to expected router and command sets. |

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `POST /v1/telegram/link/confirm` | POST | New 409 for `already_linked_to_different_account` | Additive |
| `GET /v1/me/profile` | GET | Two new nullable fields: `telegram_user_id`, `telegram_username` | Additive |

---

## Risk Flags

1. **409 guard is a security improvement** — prevents silent identity overwrite of an already-linked account.
2. **`telegram_user_id` in `/v1/me/profile`** — returned only to the authenticated member (AuthGuard scopes to `req.user.sub`). No tenant-isolation concern.
3. All bot changes are additive; existing handlers unaffected.
4. `TelegramLinkStatus` island is read-only; reuses existing `useMyFullProfile()` query.

---

## File Summary

**5 new files:**
1. `apps/bot/src/handlers/link.py`
2. `apps/bot/src/states/link.py`
3. `apps/web-next/src/blocks/customer/TelegramLinkStatus.tsx`
4. `apps/bot/tests/test_api_client_link.py`
5. `apps/bot/tests/test_link_handler.py`

**11 modified files:**
6. `apps/api/src/modules/telegram/telegram.service.ts`
7. `apps/api/test/telegram-link-service.spec.ts`
8. `apps/api/src/modules/me-profile/me-profile.service.ts`
9. `apps/web-next/src/lib/types.ts`
10. `apps/web-next/src/blocks/customer/index.ts`
11. `apps/web-next/src/pages/me/index.astro`
12. `apps/bot/src/services/api_client.py`
13. `apps/bot/src/main.py`
14. `apps/bot/src/locales/en.py`
15. `apps/bot/src/locales/ru.py`
16. `apps/bot/tests/test_main_wiring.py`

---

## Gate Result

```yaml
status: passed
db_changes_required: no
files_to_create: 5
files_to_modify: 11
next_step: 4 (CodeDeveloper — no DBMigrationAuthor step needed)
```
