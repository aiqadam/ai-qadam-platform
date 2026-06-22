---
code: FR-REG-002
name: Waitlist management
status: Shipped
module: Registrations (REG)
phase: Phase 1 (V1)
---

## Description

When an event reaches capacity, new registrations go to a waitlist. When a confirmed registrant cancels, the first person on the waitlist is automatically promoted to confirmed. Promotees receive a notification and their points are updated accordingly.

## Users

Members (on waitlist); system (auto-promotion).

## Functional scope

1. **Waitlist status** — A registration with `status=waitlist` is created when `confirmed_count >= capacity` at the time of registration.
2. **Waitlist position** — Sorted by `created_at` ascending (FIFO). Position is not exposed directly to the member (shown as "You're on the waitlist", no numbered position).
3. **Auto-promotion trigger** — When a confirmed registration transitions to `cancelled`, the system checks if `confirmed_count < capacity`. If so, the oldest `waitlist` registration for the same event is promoted.
4. **Promotion flow** —
   - Update `registrations.status` from `waitlist` to `confirmed`.
   - Generate a `qr_token` if not already set.
   - Send a "You've been promoted from the waitlist" notification (email + Telegram if linked, via FR-NTF-001 dispatcher).
   - Award `+5` points (same as initial registration award; note: the user already got `0` points for waitlist entry).
   - Log `promoted` activity to CRM (FR-CRM-003).
5. **Leave waitlist** — `DELETE /v1/events/:id/register` with `status=waitlist` removes the waitlist registration. Does not trigger promotion (the spot never opened).

## Acceptance criteria

- [ ] Registering for a fully-booked event creates a `waitlist` registration.
- [ ] When a confirmed registrant cancels, the oldest waitlist member is automatically promoted to `confirmed`.
- [ ] The promoted member receives an email notification within 60 seconds of promotion.
- [ ] After promotion, `+5` points are awarded to the promoted member.
- [ ] Leaving the waitlist removes the registration and does not trigger any promotion or notification.
- [ ] `confirmed_count` in the registration sidebar decrements immediately when a member cancels.
- [ ] If multiple members cancel simultaneously and capacity opens for only one, exactly one promotion occurs.

## Notes

- Promotion is triggered synchronously on the cancel endpoint, not via a BullMQ job. This keeps the logic simple for Phase 1. Consider moving to a worker job if there are concurrency issues at scale.
- The `notifications_sent` table deduplicate to avoid duplicate "you've been promoted" DMs if the flow fires twice.
