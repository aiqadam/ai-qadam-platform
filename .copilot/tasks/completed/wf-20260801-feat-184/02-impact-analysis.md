# Step 2 — Impact Analysis: FR-BOT-003 Bot Operator Runtime Commands

**Gate: passed**
**DB Changes Required: no** (no new Drizzle schema or migrations — all queries go via Directus)

---

## Files to create

| File | Reason |
|---|---|
| `apps/bot/src/handlers/attendance.py` | New `/attendance <event_id>` handler |
| `apps/bot/src/handlers/scan.py` | New `/scan` FSM handler with QR decode |
| `apps/bot/src/handlers/approvals.py` | New `/approvals` handler (shell) |
| `apps/bot/src/handlers/announce.py` | New `/announce <event_id>` FSM handler |
| `apps/bot/src/states/scan.py` | FSM states for /scan |
| `apps/bot/src/states/announce.py` | FSM states for /announce |
| `apps/bot/src/keyboards/approvals.py` | Inline keyboard for approve/decline buttons |
| `.copilot/tasks/active/wf-20260801-feat-184/01-requirement-validation.md` | Step 1 artifact |
| `.copilot/tasks/active/wf-20260801-feat-184/02-impact-analysis.md` | This file |
| `.copilot/tasks/active/wf-20260801-feat-184/03-code-summary.md` | Step 4 artifact |

## Files to modify

| File | What changes |
|---|---|
| `apps/api/src/modules/auth/telegram-auth.service.ts` | Add `role` to `LookupUserResult`; new service methods: `getAttendanceCounts`, `operatorCheckin`, `listPendingApprovals`, `pushAnnouncement`, `getOperatorStats` |
| `apps/api/src/modules/auth/auth.controller.ts` | 7 new endpoints in `TelegramInternalController` |
| `apps/bot/src/middlewares/auth.py` | Add `role: str | None` to `UserContext` |
| `apps/bot/src/services/api_client.py` | New API paths, dataclasses, async methods |
| `apps/bot/src/handlers/me.py` | Add operator stats card when `user_context.role` is operator |
| `apps/bot/src/handlers/help.py` | Show operator commands section for operators |
| `apps/bot/src/main.py` | Import + register new handlers; add BotCommands |
| `apps/bot/src/locales/ru.py` | ~40 new locale strings for operator commands |
| `apps/bot/src/locales/en.py` | ~40 new locale strings |
| `apps/bot/pyproject.toml` | Add `pyzbar` dependency |
| `docs/03-requirements/FR-BOT-003.md` | Flip `status: Planned → Implemented`; add `business_process` frontmatter |

## New API endpoints

| Path | Method | Guard | Description |
|---|---|---|---|
| `/v1/internal/telegram/attendance/:eventId` | GET | InternalAuthGuard | Attendance counts |
| `/v1/internal/telegram/operator/checkin` | POST | InternalAuthGuard | QR code check-in |
| `/v1/internal/telegram/operator/pending-approvals` | GET | InternalAuthGuard | Pending approvals (empty) |
| `/v1/internal/telegram/operator/approve-registration` | POST | InternalAuthGuard | Approve (shell) |
| `/v1/internal/telegram/operator/decline-registration` | POST | InternalAuthGuard | Decline (shell) |
| `/v1/internal/telegram/push-announcement` | POST | InternalAuthGuard | Fan-out announcement |
| `/v1/internal/telegram/operator/stats` | GET | InternalAuthGuard | Operator stats card |

## Risk assessment

- **Low risk**: Bot-side changes are additive handler files; existing handlers unchanged.
- **Low risk**: API-side changes add new methods + endpoints; no existing method signatures change.
- **Medium risk**: Adding `role` to `LookupUserResult` is a backward-compatible addition
  (new field, not a rename). Bot's `UserContext` gains new optional field — all existing
  handlers that don't use `role` are unaffected.
- **Low risk**: Lookup response change: the `role` field is derived from existing
  `authentikUser.groups_obj` data — no extra network call, no latency impact.
- **Low risk**: Push announcement via `OutboxPublisher` — reuses existing, battle-tested
  broadcast infrastructure; only operator-scope, not bulk platform-wide.
- **pyzbar dependency**: Well-maintained QR library; requires `libzbar0` system library
  in the Docker image. Dockerfile must be updated to install `libzbar0`.
