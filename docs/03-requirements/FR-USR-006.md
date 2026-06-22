---
code: FR-USR-006
name: Member access log (/me/access-log)
status: Shipped
module: Users (USR)
phase: Phase 1 (V1) / Rebuild Phase 3 (V2, Not Started)
---

## Description

Members can view a log of security-relevant events related to their own account: sign-ins, sign-outs, profile changes, role changes, and any operator access to their data. This gives members transparency and lets them detect unauthorized activity.

## Users

Members.

## Functional scope

1. **Audit event log** — `GET /v1/me/access-log` returns a paginated list of `audit_events` where `actor_id = me` or `target_id = me`. Fields: event code, severity (info/warning/critical), target kind, timestamp, optional payload summary.
2. **Display** — Rows shown as a table with severity color chip, event code, target kind, and timestamp. Empty state shown when no events. Probe-error state shown when API is unavailable.
3. **Severity coloring** — `info` = neutral, `warning` = amber, `critical` = red.
4. **Authentication guard** — Unsigned users are redirected to `/api/v1/auth/login` rather than seeing a 401 error.

## Acceptance criteria

- [ ] After signing in for the first time, at least one `sign_in` event appears in the access log.
- [ ] After a profile update, a `profile_updated` event appears.
- [ ] An unsigned request to `/v1/me/access-log` returns `401`.
- [ ] The log shows at minimum the last 30 events; older events are paginated.
- [ ] The severity color chips render correctly for all three severity levels.
- [ ] No other user's audit events are visible in a user's own access log.

## Notes

- V2 (web-next): not started (M3.2 milestone).
- Operators see a full audit log at `/workspace/admin/audit` (FR-ADM-008), scoped by their country.
