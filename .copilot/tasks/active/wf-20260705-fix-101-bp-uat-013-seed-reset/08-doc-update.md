# Step 10 — Documentation Update

**Workflow:** wf-20260705-fix-101-bp-uat-013-seed-reset
**Agent:** DocWriter (per `.copilot/workflows/issue-resolution.md`, reused from `requirement-development.md`)
**Date:** 2026-07-05
**Decision:** Minimal doc surface for this fix.

---

## What changed

This is a UAT-environment-script bug fix (3-28 lines, one helper file). Per
`AGENTS.md §14` and the DocWriter's authority scope, no new narrative docs are
authored. The fix is fully documented by:

1. **The code comment block itself** — `scripts/uat-seed.sh::reset_domain_fixture()`
   has a 10-line in-source comment that explains WHY the derivation block
   exists, which schema constraint it satisfies, which PR (`#108 / 69f2b3f`) was
   the last successful `--reset` run, and which BP-UAT steps it unblocks.
2. **The issue file** — `ISS-UAT-013-14.md` already carries the full repro,
   evidence, proposed fix, and acceptance criteria. (No edit needed.)
3. **The code summary** — `.copilot/tasks/active/wf-20260705-fix-101-bp-uat-013-seed-reset/03-code-summary.md`
   carries every decision rationale (silent-in-mock-mode, gate on
   collection, fail-message wording, conditional pattern).
4. **The bats regression tests** — 3 new `@test` blocks at end of
   `scripts/tests/uat-seed.bats` are the live behavioral spec.

## What was deliberately NOT changed

- **`docs/02-business-processes/uat/BP-UAT-013.md`** — the BP-UAT-013 spec is
  product-facing. The issue is purely about the seed script's `--reset`
  path; the spec's expectations (Steps 005/006 + Neg 002/003/005) are
  correct. No spec edit needed.
- **`scripts/uat-fixtures/BP-UAT-013.json`** — the manifest already declares
  `token_plain` at the top level of every fixture row (added by
  `wf-20260629-fix-036` and never removed). No manifest change.
- **`infrastructure/directus/bootstrap.sh`** — the schema is correct; the
  constraint it enforces is already documented there.
- **workspace-state.md and registry.md** — the Orchestrator updates these
  at workflow close per the Finish Protocol (handoff.yaml schema's
  `expects_registry_update: false` flag is set, indicating no registry
  mutation is owned by this workflow — the issue is at the worker-side
  registry, not the agent registry; the user-visible registry update is
  done by DocWriter at close).

## Context sync (per workflow finish protocol)

The `context_update:` block at workflow close will update:

- `.copilot/context/workspace-state.md` — add an entry summarising the
  wf-20260705-fix-101-bp-uat-013-seed-reset close + the cascade effect
  on the wf-20260705-fix-103-uat-013-verify follow-up.
- `.copilot/issues/registry.md` — set `ISS-UAT-013-14`'s `Status` to
  `resolved` and the `Workflow` column to "wf-20260705-fix-101 (PR #<TBD>)".
- The Issue file itself — append a `## Resolution` section with the
  Honesty disclosure: live re-verification of AC-1/AC-2/AC-3 is queued
  in `wf-20260705-fix-103-uat-013-verify` (position 3 of the cascade),
  not in this workflow.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Documentation work is in-code (comment block) + in the issue file + in the bats regression; no new narrative docs are authored for a 28-line bash fix. workspace-state.md + registry.md updates happen at close."
```
