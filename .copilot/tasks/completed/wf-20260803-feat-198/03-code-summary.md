# 03 — Code Summary: FR-AUTH-005 Telegram Account Linking

Agent: CodeDeveloper
Workflow: wf-20260803-feat-198
Branch: feature/AUTH-005-telegram-account-linking

## Gate result: passed

---

## Changes implemented

### Surface A — API 409 guard (1 file modified)

**`apps/api/src/modules/telegram/telegram.service.ts`**
- Added `ConflictException` to the `@nestjs/common` import.
- In `confirmLink()`, after `resolveMemberOrThrow()` resolves the member, added guard:
  if `member.telegram_user_id` is non-null AND `!= input.tgUserId.toString()` →
  throws `ConflictException('already_linked_to_different_account')`.
  Same TG account = idempotent (proceeds normally).

---

### Surface B — Bot `/link` command (5 files created/modified)

**`apps/bot/src/states/link.py`** — NEW
- `LinkStates(StatesGroup)` with `awaiting_email = State()` and `awaiting_code = State()`.
  Mirrors `states/upgrade.py` with one extra state for the two-collection-step flow.

**`apps/bot/src/handlers/link.py`** — NEW
- `Router(name="link")` with three handlers:
  1. `Command("link")` entry: prompts for email (available to all known users).
  2. `LinkStates.awaiting_email` reply: validates email format, calls
     `request_link_start`, stores `challenge_id` in FSM data, transitions to
     `LinkStates.awaiting_code`.
  3. `LinkStates.awaiting_code` reply: calls `request_link_confirm`, clears state.
- All error cases handled: `LinkRateLimitedError`, `LinkMemberNotFoundError`,
  `LinkInvalidCodeError`, `LinkAlreadyLinkedOtherError`, `ApiUnavailableError`.
- FSM state always cleared after every outcome (success or error).

**`apps/bot/src/services/api_client.py`** — MODIFIED
- Added path constants: `LINK_START_PATH`, `LINK_CONFIRM_PATH`.
- Added dataclasses: `LinkStartResult(challenge_id, sent_to_email_masked)`,
  `LinkConfirmResult(member_id, tenant)`.
- Added exception classes: `LinkMemberNotFoundError`, `LinkInvalidCodeError`,
  `LinkExhaustedError`, `LinkAlreadyLinkedOtherError`, `LinkRateLimitedError`.
- Added async methods `request_link_start()` and `request_link_confirm()` to
  `ApiClient`, using the same `x-internal-auth` header pattern as all other methods.

**`apps/bot/src/main.py`** — MODIFIED
- Added `link` to the `from src.handlers import (...)` block.
- Registered `link.router` after `upgrade.router` (before fallback).
- Added `BotCommand(command="link", description="Привязать Telegram к веб-аккаунту")`.

**`apps/bot/src/locales/en.py`** — MODIFIED
- Added keys: `link.prompt_email`, `link.invalid_email`, `link.code_sent`,
  `link.success`, `link.wrong_code`, `link.no_account`, `link.already_linked_other`,
  `link.rate_limited`, `link.unavailable`.

**`apps/bot/src/locales/ru.py`** — already contained the link keys from a prior session;
no change needed.

---

### Surface C — Web `/me` Telegram status (4 files modified, 1 created)

**`apps/api/src/modules/me-profile/me-profile.service.ts`** — MODIFIED
- Extended `PROFILE_FIELDS` constant with `,telegram_user_id,telegram_username`.
- Added `telegram_user_id: string | null` and `telegram_username: string | null`
  to `DirectusUserRow` (private interface).
- Added same fields to exported `MemberProfile` interface.
- Mapped both in `toProfile()` with `?? null` fallback.

**`apps/web-next/src/lib/types.ts`** — MODIFIED
- Added `telegram_user_id: string | null; telegram_username: string | null;`
  to `MeProfileCore` interface.

**`apps/web-next/src/blocks/customer/TelegramLinkStatus.tsx`** — NEW
- Read-only island following the `ConsentList`/`SkillTagger` pattern.
- Uses `IslandRoot` + `useMyFullProfile()`.
- Shows `@{username} — linked` when `telegram_user_id` is non-null;
  shows "Not linked — type /link in @aiqadam_bot" otherwise.
- Design-system compliant: `var(--token-name)` colors, Lucide `MessageSquare`
  icon (20px in section header), no emoji in product copy, sentence case.

**`apps/web-next/src/blocks/customer/index.ts`** — MODIFIED
- Added `export { TelegramLinkStatus } from './TelegramLinkStatus';`.

**`apps/web-next/src/pages/me/index.astro`** — MODIFIED
- Added `import { TelegramLinkStatus } from '../../blocks/customer';`.
- Added `<TelegramLinkStatus client:load />` between the membership summary
  card and the nav links section.

---

## Validation

| Check | Result |
|---|---|
| `pnpm biome check` (5 TS/TSX files) | 0 errors, 0 warnings |
| `pnpm --filter api typecheck` | 0 errors |
| `pnpm --filter web-next typecheck` | 0 errors |
| `python -m ruff check` (bot files) | All checks passed |

---

## Architecture self-check

- [x] Service methods: typed I/O, no `any`, all inputs validated (Zod at controller, existing)
- [x] Custom typed errors: `ConflictException` (NestJS standard), Python exception classes
- [x] All promises awaited; all `async/await` chains intact
- [x] No raw SQL; no N+1 introduced
- [x] Cross-module: `ConflictException` from `@nestjs/common`, no circular imports
- [x] 409 guard is additive (no breaking change to existing callers)
- [x] New React component: functional, no `dangerouslySetInnerHTML`, explicit prop types (none needed — reads from hook)
- [x] Bot handler: FSM state always cleared, no persistent session state
