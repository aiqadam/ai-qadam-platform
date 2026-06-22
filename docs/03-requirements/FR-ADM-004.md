---
code: FR-ADM-004
name: Approvals queue
status: Shipped
module: Admin / Operator (ADM)
phase: Phase 1 (V1) / Rebuild Phase 2 (V2, Shipped)
---

## Description

Operators review and act on pending approval requests: speaker confirmations, sponsor applications, invite-only event registration requests, and similar review workflows. The approvals queue is the single inbox for all pending operator actions.

## Users

Organizers, Country Admins.

## Functional scope

1. **Route** — `/workspace/approvals` (`ApprovalsQueue` island, operator auth required).
2. **Approval types** — Categories of pending approvals:
   - **Speaker confirmation** — A proposed speaker awaiting acceptance for an event.
   - **Registration approval** — Registration for an `invite_only` event (requires explicit operator approval before `confirmed` status).
   - **Sponsor application** — A company has expressed interest in sponsoring; needs operator action to create a Partner record.
3. **Queue display** — Rows grouped by type. Each row shows: applicant name/email, event name (if applicable), date submitted, and action buttons (Approve / Decline). Empty state per category.
4. **Actions** — Approve: transitions the item to confirmed/accepted state and triggers relevant notifications (e.g., registration approval sends a confirmation email). Decline: transitions to declined, optionally triggers a decline notification.
5. **API** — `GET /v1/workspace/approvals` (lists pending items, country-scoped). `POST /v1/workspace/approvals/:type/:id/approve` and `.../decline`.

## Acceptance criteria

- [ ] A pending speaker confirmation appears in the queue; clicking "Approve" sets `event_speakers.status=confirmed` and notifies the speaker.
- [ ] A registration approval for an `invite_only` event appears; clicking "Approve" sets `registrations.status=confirmed` and sends a confirmation email.
- [ ] Declining an item removes it from the queue and triggers any configured decline notification.
- [ ] An empty queue shows a "No pending approvals" state per category.
- [ ] Only items for the operator's country appear in the queue.

## Notes

- V2 (web-next): `ApprovalsQueue` block shipped in RB-P2 (currently shows the category shells; per `web-v1-feature-surface.md`, it's "pending-approvals queue with per-source roadmap empty state").
- The speaker CFP (Call For Papers) system is out of scope for Phase 1. Speaker approvals in this queue are from organizer-initiated proposals only.
