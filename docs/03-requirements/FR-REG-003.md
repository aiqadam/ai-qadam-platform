---
code: FR-REG-003
name: Registration cancellation
status: Shipped
module: Registrations (REG)
phase: Phase 1 (V1)
---

## Description

Members can cancel their registration for an upcoming event before it starts. Cancelling a confirmed registration releases a spot and triggers waitlist promotion if applicable. Points awarded at registration are revoked on cancellation. Cancelling a waitlist entry simply removes it.

## Users

Members.

## Functional scope

1. **Cancel endpoint** — `DELETE /v1/events/:id/register`. Sets `registrations.status=cancelled`. Idempotent: calling again on an already-cancelled registration returns `200`.
2. **Points revocation** — If the cancelled registration had status `confirmed` (not waitlist), revoke the `+5` registration points (`GamificationService.revokePoints`). Logged as a debit in the activities audit trail.
3. **Waitlist trigger** — After cancellation of a confirmed registration, trigger FR-REG-002 auto-promotion if capacity permits.
4. **CRM activity** — Log `cancelled` activity to Twenty CRM (FR-CRM-003).
5. **Cancellation window** — Cancellation is allowed up until the event ends (`ends_at`). After the event, registrations are locked and status transitions are blocked (except for `no_show` marking by the system).
6. **Cancellation from bot** — Bot `/cancel N` command (FR-BOT-002) calls the same endpoint via the internal API path.
7. **Notification** — No notification sent to the cancelling user (they initiated it). A notification is sent to the promoted waitlist member (see FR-REG-002).

## Acceptance criteria

- [ ] Clicking "Cancel" on the registration sidebar sets registration to `cancelled` and updates the sidebar to "Register" state.
- [ ] Cancelling a confirmed registration triggers waitlist promotion.
- [ ] Cancelling a waitlist entry does not trigger promotion.
- [ ] Points revoked on confirmed cancellation; the leaderboard reflects the updated total.
- [ ] Cancelling after event end (`ends_at`) returns `409 Conflict`.
- [ ] Calling cancel twice returns `200` on the second call (idempotent).

## Notes

- The bot command path for cancellation is `/cancel N` (FR-BOT-002). Both web and bot routes hit the same API endpoint.
