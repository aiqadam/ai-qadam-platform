# 01 — Issue Lookup (wf-20260701-uat-045-mailpit-resend)

**Step:** 1
**Agent:** Orchestrator (direct)
**Date:** 2026-07-01

---

## Search performed

```bash
grep -nE 'RESEND_API_KEY|email skipped|Mailpit|smtp|nodemailer' .copilot/issues/*.md
```

Returned the canonical match: **[ISS-UAT-013-7](.copilot/issues/ISS-UAT-013-7.md)**.

## Why this issue is being re-opened

The issue was **declared resolved** by `wf-20260629-fix-034` on 2026-06-29 (PR #66), but the resolution **did not actually close the gap**:

1. The `EmailService` still hard-checks `env.RESEND_API_KEY` and only constructs
   a `Resend` client when it is truthy. With `RESEND_API_KEY=""` (default in
   `apps/api/.env`), every call still goes through the `if (this.resend)`
   branch and logs `[email skipped: RESEND_API_KEY not set]`.

2. PR #66 added a `SEND_EMAILS=false` knob but no **SMTP transport**. So
   `SEND_EMAILS=false` still drops the email on the floor; it does NOT
   route to Mailpit.

3. The recommended **Option A.2** from the original issue — "add a
   nodemailer + Mailpit SMTP transport for the UAT/dev profile" — was
   **never implemented**.

As a result, **BP-UAT-013 Steps 002 and 003 still fail on `main`** at the
Mailpit boundary. This was confirmed during `wf-20260701-fix-044`'s
TestRunner retry: Steps 001 + 002-screenshot + 004 pass; 002/003 fail.

## Action

Per `.copilot/agents/orchestrator.md` §Issue Registration, the existing
issue is being **appended to** (not duplicated). The "current occurrence"
section is being added below the existing content of
`.copilot/issues/ISS-UAT-013-7.md` and the registry row's status will
flip from `resolved` to `resolved` only after this workflow's verification
passes end-to-end.

## Honesty disclosure

The issue's `Status: resolved` row in `.copilot/issues/registry.md` is
**factually wrong as of `main@b3dbba0`**. The symbol-level fix landed, the
behaviour-level fix did not. This workflow will:

1. Add a nodemailer SMTP transport to `EmailService` that activates when
   `SMTP_HOST` is set (independent of `RESEND_API_KEY`).
2. Add a `GET /v1/health/email` endpoint returning
   `{ configured, provider, mode }` so pre-flight can fail fast.
3. Wire the UAT pre-flight to call that endpoint before BP-UAT-013 runs.
4. Re-run BP-UAT-013 Steps 002/003 against the live stack and verify
   ≥1 message in Mailpit.

Only after Step 4 passes will the issue's `Status` flip back to `resolved`
without the `+ reopened AC-2/AC-3` qualifier.

---

## Gate Result

gate_result:
  status: passed
  summary: >-
    Existing issue ISS-UAT-013-7 located in .copilot/issues/registry.md;
    appended a "current occurrence (2026-07-01)" section to its file.
    Workflow scope: implement nodemailer SMTP transport + health endpoint
    + re-run BP-UAT-013 Steps 002/003 to close the gap that PR #66
    left open. No new issue created.
  findings:
    - "ISS-UAT-013-7 is the canonical, registered issue for this gap."
    - "Registry status currently reads 'resolved' but symbol-fix landed while behaviour-fix did not; will be re-opened in this workflow's Step 9 atomic flip."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
