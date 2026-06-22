---
code: FR-ADM-009
name: Internal cron health monitor
status: Shipped
module: Admin / Operator (ADM)
phase: Phase 1 (V1) / Rebuild M2.9 (V2, Not Started)
---

## Description

Operators can monitor the health of internal scheduled jobs (cron tasks): last fire time, duration, outcome (success/error), and error details. This provides visibility into background process reliability without requiring access to Grafana or server logs.

## Users

Organizers, Country Admins, Super Admin.

## Functional scope

1. **Route** — `/workspace/admin/cron` (`InternalCronStatusTable` island, operator auth required).
2. **Cron job registry** — The NestJS API registers all `@Cron`-decorated jobs in an in-process registry at startup. The registry tracks: job name, cron expression, last fire timestamp, last duration (ms), last outcome (success/error), last error message.
3. **Status table** — Columns: job name, schedule (human-readable), last run time, duration, status chip (OK / error / never). Rows sorted by last run time descending.
4. **API** — `GET /v1/workspace/internal-cron/status` — returns the current state of all registered crons from the in-process registry.
5. **No persistence** — The registry is in-memory; it resets on API restart. This is sufficient for Phase 1 visibility. For persistent cron history, use Grafana/Loki logs.

## Acceptance criteria

- [ ] The cron status table shows all registered `@Cron` jobs with their last run time and outcome.
- [ ] A job that errored on its last run shows an "error" status chip and the error message.
- [ ] After an API restart, the table shows "never" for all jobs until they fire again.
- [ ] Accessing the endpoint as a non-authenticated user returns `401`.
- [ ] The page loads within 1 second (in-memory data, no DB query).

## Notes

- V2 (web-next): `InternalCronStatusTable` is M2.9 — not started.
- For deeper monitoring (job history, alerting on consecutive failures), wire the cron job outcomes to Gatus probes (already deployed for backup freshness in FR-OPS-001).
