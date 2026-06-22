---
code: FR-ADM-008
name: Audit log
status: Shipped
module: Admin / Operator (ADM)
phase: Phase 1 (V1) / Rebuild Phase 2 (V2, Shipped)
---

## Description

Super Admins can view a full audit log of all significant platform events: sign-ins, role changes, invite actions, registration approvals, config changes, and more. Country Admins see a country-scoped subset. Members see only their own events (FR-USR-006).

## Users

Super Admin (all events); Country Admins (country-scoped events).

## Functional scope

1. **Route** — `/workspace/admin/audit` (`AuditEventsList` island, operator auth required).
2. **Audit event schema** — `audit_events` table: `id`, `actor_id` (user who took action), `action_type` (e.g., `invite_created`, `role_changed`, `event_cancelled`), `target_kind` (user/event/registration/invite/country), `target_id`, `severity` (info/warning/critical), `country_code`, `payload_json` (before/after diff or context data), `created_at`.
3. **Filters** — Severity filter (info/warning/critical), action type prefix filter, country filter (super-admin only), date range.
4. **Display** — Table rows: severity chip (color-coded), event code, actor email (anonymized for non-super-admin view), target kind, timestamp. Expandable row shows `payload_json` diff.
5. **Member self-view** — `GET /v1/me/access-log` (FR-USR-006) returns a filtered subset (only rows where `actor_id = me` or `target_id = me`).
6. **Retention** — Audit events are immutable and retained indefinitely. `soft_delete` is never applied.

## Acceptance criteria

- [ ] Creating an operator invite logs an `invite_created` event with severity `info`.
- [ ] A role change logs a `role_changed` event with severity `warning` and a payload showing old and new roles.
- [ ] A country admin can see audit events for their country but not others.
- [ ] A super-admin can filter by severity `critical` to see high-severity events only.
- [ ] Expanding an audit row shows the `payload_json` diff in a readable format.
- [ ] Audit events cannot be deleted (no delete endpoint exists; the API returns `405 Method Not Allowed`).

## Notes

- V2 (web-next): `AuditEventsList` block shipped in RB-P2.
- The `payload_json` diff format uses RFC 6902 JSON Patch or a custom before/after structure — decide during implementation.
