# 01-issue-lookup — Issue search and registration

**Recorded:** 2026-07-01T20:15:00Z (UTC)

## Similar-issue search

Searched `.copilot/issues/registry.md` for prior issues with the same module
(`web`) or symptom (lead form / signup / discoverability).

| Issue | Decision |
|---|---|
| `ISS-UAT-013-3` (apps/web-next had no `<LeadCaptureForm />` — fixed by PR #67) | **Different surface** (`apps/web-next`, not `apps/web`), **different symptom** (form missing entirely vs. form present-but-unreachable). New issue, not a duplicate. |
| `ISS-UAT-013-7` (RESEND_API_KEY missing → Mailpit-empty emails) | **Different layer** (transport / not rendering). New issue. |
| `ISS-UAT-013-9` (`email_verified` guard for idempotency) | **Different layer** (api-side idempotency). New issue. |
| `ISS-LEAD-DISC-001` | **New issue**, created 2026-07-01 by Orchestrator during autonomous triage. |

## New issue registration

- File: `.copilot/issues/ISS-LEAD-DISC-001.md` — created during Step 0.
- Registry row: appended to `.copilot/issues/registry.md`.
- Severity: **minor** (UX / acquisition).
- Workflow: **wf-20260701-fix-044** (this workflow).

## Gate

`gate_result.status: passed` — issue registered with conflict check complete.
