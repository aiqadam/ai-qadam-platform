# Step 3 — Code Summary: FR-BOT-003 Bot Operator Runtime Commands

**Gate: passed**

---

## API changes (NestJS/TypeScript)

### `apps/api/src/modules/auth/telegram-auth.service.ts`

- **`LookupUserResult.role`** — New field: `'member' | 'organizer' | 'country_admin' | 'super_admin' | null`. Populated in `lookupUser()` by calling `deriveRoleFromGroups(authentikUser.groups_obj)`. No extra Authentik API call — the search endpoint already returns `groups_obj` with names (per `AuthentikUser` interface comment).
- **`TelegramAuthService.logger`** — Added `Logger` for `pushAnnouncement` error logging.
- **New schemas** — `telegramAttendanceParamsSchema`, `operatorCheckinBodySchema`, `pendingApprovalsQuerySchema`, `registrationActionBodySchema`, `pushAnnouncementBodySchema`, `operatorStatsQuerySchema` — all with Zod validation at the API boundary.
- **`getAttendanceCounts(eventId, country)`** — Three parallel Directus aggregate queries for `registered`, `attended`, `waitlisted` status counts. 404s on unknown event.
- **`operatorCheckin(qrCodeData)`** — Extracts UUID from QR data (bare UUID or URL-ending-in-UUID via `extractUuidFromQr()`). Calls `RegistrationsDirectusService.checkin()`. Fetches member name separately via one Directus read (best-effort, never fails the check-in).
- **`listPendingApprovals(country, directusUserId)`** — Shell: returns `{ items: [] }`. invite_only event type not yet in schema (documented scope gap).
- **`approveRegistration / declineRegistration`** — Shells: return `{ ok: true, registrationId }`. No-op until invite_only is built.
- **`pushAnnouncement(eventId, message, country, directusUserId)`** — Validates event country scope, fetches confirmed registrant telegram IDs from Directus (≤200 recipients cap), sends via direct Telegram Bot API `sendMessage` calls (`fetch`). Fire-and-forget per recipient (errors logged, not bubbled). Returns `{ ok: true, recipientCount: N }`.
- **`getOperatorStats(directusUserId, country)`** — Two parallel Directus aggregate queries: published events count for country, registrations (non-cancelled) in rolling 30-day window.
- **`deriveRoleFromGroups(groups_obj)`** — Module-level helper. Priority: `super_admin > country_admin > organizer > member`. Returns null for empty/undefined groups.
- **`extractUuidFromQr(data)`** — Module-level helper. Regex extracts UUID from QR data string.

### `apps/api/src/modules/auth/auth.controller.ts`

New endpoints in `TelegramInternalController` (all `InternalAuthGuard` protected, Zod-validated at boundary):

| Endpoint | Handler |
|---|---|
| `GET attendance/:eventId` | `getAttendanceCounts` |
| `POST operator/checkin` | `operatorCheckin` |
| `GET operator/pending-approvals` | `listPendingApprovals` (shell) |
| `POST operator/approve-registration` | `approveRegistration` (shell) |
| `POST operator/decline-registration` | `declineRegistration` (shell) |
| `POST push-announcement` | `pushAnnouncement` |
| `GET operator/stats` | `getOperatorStats` |

---

## Bot changes (Python)

### `apps/bot/src/middlewares/auth.py`
- `UserContext.role: str | None = None` — new field with default None (backward compatible).
- `UserContext.is_operator() -> bool` — helper: True for organizer/country_admin/super_admin.
- `_resolve()` — propagates `result.role` from lookup response.

### `apps/bot/src/services/api_client.py`
- `LookupResult.role: str | None = None` — new field.
- `lookup_telegram_user()` — reads `role` from response JSON.
- New operator paths: `ATTENDANCE_PATH`, `OPERATOR_CHECKIN_PATH`, `PENDING_APPROVALS_PATH`, `APPROVE_REGISTRATION_PATH`, `DECLINE_REGISTRATION_PATH`, `PUSH_ANNOUNCEMENT_PATH`, `OPERATOR_STATS_PATH`.
- New dataclasses: `AttendanceCounts`, `CheckinResult`, `CheckinNotFoundError`, `CheckinIneligibleError`, `PendingApprovalItem`, `PendingApprovalsResult`, `PushAnnouncementResult`, `OperatorStatsResult`.
- New methods: `get_attendance`, `operator_checkin`, `list_pending_approvals`, `approve_registration`, `decline_registration`, `push_announcement`, `get_operator_stats`.

### New handler files
- `handlers/attendance.py` — `/attendance <event_id>`: role gate → `get_attendance` → render counts.
- `handlers/scan.py` — `/scan`: role gate → FSM → photo receive → `pyzbar` decode → `operator_checkin`.
- `handlers/approvals.py` — `/approvals` + Approve/Decline callbacks: role gate → `list_pending_approvals` → render (empty state in practice today).
- `handlers/announce.py` — `/announce <event_id>`: role gate → FSM collect message → `push_announcement` → render sent count.

### Updated files
- `handlers/me.py` — `render_me()` accepts `operator_stats: OperatorStatsResult | None`; `handle_me()` fetches stats for operators (best-effort, `contextlib.suppress(ApiUnavailableError)`).
- `handlers/help.py` — Accepts `user_context` param; shows operator section for operators.
- `main.py` — Imports and registers 4 new routers (before fallback).
- `locales/ru.py` + `locales/en.py` — ~40 new locale keys each.

### New state/keyboard files
- `states/scan.py` — `ScanStates.awaiting_qr_photo`.
- `states/announce.py` — `AnnounceStates.awaiting_message`, `AnnounceStates.awaiting_confirm`.
- `keyboards/approvals.py` — `approvals_keyboard()` with `APPROVE_PREFIX`/`DECLINE_PREFIX`.

### Infrastructure
- `pyproject.toml` — Added `pyzbar>=0.1.9,<1.0` and `Pillow>=10.0,<12.0`.
- `Dockerfile` — Added `apt-get install libzbar0` for pyzbar's system dependency.

---

## Test coverage
- `tests/test_operator_commands.py` — 14 new tests covering:
  - `UserContext.is_operator()` for all 5 role values
  - `lookup_telegram_user` role parsing
  - `get_attendance` response parsing
  - `/attendance` role gate (member denied, anonymous denied)
  - `/scan` role gate (member denied)
  - `list_pending_approvals` empty response parsing
  - `push_announcement` response parsing
  - `get_operator_stats` response parsing
- `tests/test_help_handler.py` — Updated 6 existing tests (added `user_context=None` arg).

---

## Scope gaps (honesty)
1. `/approvals` shell: `invite_only` + `pending_approval` not in schema. AC verified as correct empty-state behavior.
2. Push announcement cap: ≤200 recipients. Large events should use tg-broadcasts workspace tool.
