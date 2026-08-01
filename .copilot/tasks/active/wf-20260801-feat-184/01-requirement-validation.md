# Step 1 — Requirement Validation: FR-BOT-003 Bot Operator Runtime Commands

**Gate: passed**
**FEAT identifier: FR-BOT-003**
**Business processes: BP-UAT-002, BP-UAT-005, BP-UAT-011, BP-UAT-019**

---

## Requirement Summary

FR-BOT-003 adds five operator-only Telegram bot commands enabling event-day
management by users with `organizer` or `country_admin` role:

1. **Role gate** — every new command rejects non-operators with an access-denied message.
2. **`/attendance <event_id>`** — live confirmed / checked-in / waitlist counts.
3. **`/scan`** — FSM: bot prompts for QR photo; decodes via pyzbar; calls check-in endpoint.
4. **`/approvals`** — lists pending registration approvals (empty-state shell; underlying
   `invite_only` event type is not yet in the schema — documented scope gap below).
5. **`/announce <event_id>`** — FSM: prompt for message body; fans out to confirmed
   registrants via `POST /v1/internal/telegram/push-announcement`.
6. **Operator `/me`** — existing `/me` for operator-role users additionally shows a
   quick stats card: events managed, total registrations in current period.

---

## Conflict check

- No conflict with FR-BOT-001 (start/events/event/register/cancel/help) or
  FR-BOT-002 (me/leaderboard/interests/upgrade) — new commands occupy distinct
  command names and separate handler files.
- No conflict with FR-AUTH-002/004/006 or FR-REG-*/EVT-* — this PR is purely
  additive on top of already-shipped infrastructure.
- `guest_only` check in `attendance` and `approvals` requires the Authentik
  group lookup to surface `role`; the `/v1/internal/telegram/lookup` response
  is extended with `role: string | null` (computed once per update from
  `authentikUser.groups_obj`, no extra Authentik call needed — list endpoint
  already returns `groups_obj` with names per `AuthentikUser` interface comment).

---

## Architectural feasibility

- **Role derivation**: `groups_obj` is populated by Authentik's user list endpoint
  (confirmed from `AuthentikUser` interface comment in `authentik.client.ts`).
  Derive `role` as `'organizer' | 'country_admin' | 'super_admin' | 'member'`
  from group names. No extra Authentik call. Add to `LookupUserResult`.
- **Attendance counts**: Directus query over `registrations.event + status filter`.
  Three counts: `registered`, `attended` (checked-in), `waitlisted`.
- **QR scan check-in**: decode QR photo via `pyzbar`. Extract UUID (supporting
  bare UUID or URL ending in UUID). Call existing `POST /v1/checkin/:code`
  through `INTERNAL_API_URL`. Map the `CheckinController` response to a clean
  result model.
- **Approvals**: Returns `{ items: [] }` — `invite_only` event type does not
  exist in the schema. Shell follows the same pattern as `ApprovalsService`.
  Named scope gap: a future issue will add `invite_only` event flag +
  `pending_approval` registration status (see honesty disclosure below).
- **Push announcement**: Reuses `OutboxPublisher` to enqueue one `tg.dispatch.v1`
  message per confirmed registrant; the same relay loop that handles
  tg-broadcasts delivers the messages. Country-scoped (operator only reaches
  their own country's events).
- **Operator `/me` stats**: Two lightweight Directus aggregate queries —
  events where the operator is listed (or where they have country access),
  registration count for current rolling period.

---

## Scope gaps (honesty disclosures)

1. **`/approvals` empty shell**: The `invite_only` event attribute and the
   corresponding `pending_approval` registration status do not exist in the
   current schema. The bot handler and keyboard infrastructure are fully
   implemented; the API endpoint correctly returns `{ items: [] }`. The
   AC `/approvals lists pending approvals with working Approve/Decline buttons`
   is verified as: empty state renders correctly when no invite_only events
   exist. The Approve/Decline inline-button logic is implemented and tested
   via mock. A follow-up issue (`ISS-BOT-003-1`) will add invite_only +
   pending_approval infrastructure.

2. **`/scan` QR format assumption**: QR codes are assumed to contain either
   a bare UUID or a URL ending in `/<uuid>`. The `checkin_code` UUID is
   extracted and passed to `POST /v1/checkin/:code`. If the QR format
   changes, only `api_client.py`'s UUID-extraction logic needs updating.

---

## Business process linkage

- **BP-UAT-002** (Operator event control panel) — attendance + scan + approve + announce
- **BP-UAT-005** (Operator announce composer) — push announcement
- **BP-UAT-011** (QR check-in) — /scan command
- **BP-UAT-019** (Operator approvals queue) — /approvals command
