# 08 — Doc Update (Step 8)

**Workflow:** wf-20260704-fix-080
**Issue:** [ISS-UAT-009-5](.copilot/issues/ISS-UAT-009-5.md)
**Branch:** fix/ISS-UAT-009-5-bp-uat-009-neg-001-redirect-spec
**Date:** 2026-07-04
**Agent:** DocWriter

---

## Decision: no doc updates required

The change is **test-only**. No user-facing behaviour changes. No architecture changes. No new APIs. No new config.

## Doc inventory cross-check

| Doc | Touched? | Reason |
|---|---|---|
| `docs/02-business-processes/uat/BP-UAT-009.md` | No | The doc's Neg 001 contract ("Browser redirects to /auth/sign-in. The workspace is NOT visible.") already matches what the test now asserts more explicitly. |
| `docs/02-business-processes/uat/BP-UAT-009-uat-results/` | No | Out-of-scope — the workflow does not claim AC-1 verified; no result file produced. |
| `docs/04-development/architecture/architecture.md` | No | No architecture touched. |
| `docs/04-development/standards.md` | No | No standard touched. |
| `docs/04-development/testing/*` | No | The test pattern adopted (Step 004 idiom) is already documented implicitly by its presence in the file. If a future DocWriter pass wants to extract it into a section, that's a separate workflow. |
| `docs/04-development/design-system/*` | No | No UI changes. |
| `AGENTS.md` | No | No policy change. |
| `docs/01-business/glossary.md` | No | No new terms. |
| `apps/e2e/README.md` | No | No new tooling. |
| `.copilot/registry.md` | Yes (separate file — see 09-registry-update.md) | Mechanical update: ISS-UAT-009-5 row gets the workflow pointer. |

## Honesty note

A new **follow-up workflow** ([wf-20260704-fix-081](../queued/wf-20260704-fix-081/handoff.yaml)) will own the React/JSX-runtime infra fix. When that lands and BP-UAT-009 is re-run cleanly, the doc surface may need an addendum describing the JSX-runtime issue and its resolution — but that belongs to wf-20260704-fix-081's DocWriter step, not this one.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "No doc updates required for this test-only change. The doc contract for Neg 001 already matches what the new test asserts; no behaviour change. Registry update is the only doc-system artifact (handled in 09-registry-update.md)."
  findings:
    - "Test-only diff (+24 / −6 LOC, contained to one block) — no user-facing surface."
    - "Doc contract in BP-UAT-009.md unchanged; the test now states it more explicitly."
    - "Follow-up workflow (wf-20260704-fix-081) owns the React/JSX-runtime infra fix; its DocWriter step may update testing docs at that point."
```