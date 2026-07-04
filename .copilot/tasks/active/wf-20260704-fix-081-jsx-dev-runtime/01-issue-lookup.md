# Step 1 — Issue Lookup

**Workflow:** wf-20260704-fix-081-jsx-dev-runtime
**Issue ref:** ISS-UAT-009-6
**Date:** 2026-07-04
**Agent:** Orchestrator (direct)

---

## Result

Issue **already exists** in `.copilot/issues/ISS-UAT-009-6.md` and is registered in `.copilot/issues/registry.md` row 31 (severity: blocker; module: web/astro-react-runtime; status: open; owner: queued: wf-20260704-fix-081).

No new issue file is required. `handoff.yaml.issue_ref = "ISS-UAT-009-6"`.

## Search for duplicates

Searched the registry for the module (`web/astro-react-runtime`) and the symptom (`_jsxDEV`, `jsx-dev-runtime`, `TypeError`, `client:load`, `React island`):

| Existing issue | Module | Reason not a duplicate |
|---|---|---|
| ISS-UAT-009-5 | e2e/tests/uat | Different surface: test idiom only, not the runtime bug. This issue's Resolution explicitly states ISS-UAT-009-5 was a *symptom* of THIS bug, but they are distinct work items. |
| ISS-TEST-WEB-001 | web/test-infrastructure | Different root cause: vitest+vite 8 SSR-transform skew, not Astro/React runtime. |

No duplicates.

## Relevant spec/script files

- `docs/02-business-processes/uat/BP-UAT-009.md` — the BP-UAT whose entire suite is blocked by this issue.
- `apps/web/.astro/dev.log` — file with the 100+ occurrence stack traces already captured.
- `apps/web/astro.config.mjs` — Astro+React adapter config (candidate for the fix).
- `apps/web/tsconfig.json` (extends `@aiqadam/tsconfig/astro.json`) — JSX settings.

## Gate Result

gate_result:
  status: passed
  summary: "ISS-UAT-009-6 already exists in registry; no new file needed; all related issues identified."
  findings:
    - "ISS-UAT-009-5 (test-only flakiness) flips to symptom-of-THIS once fixed"
    - "ISS-TEST-WEB-001 is unrelated (vitest, not astro)"
  retry_target: ""
  deferred_to_feature: ""
  deferred_reason: ""
