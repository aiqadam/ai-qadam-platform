# 01-issue-lookup.md — ISS-PREEX-001

## Issue Search

Searched `.copilot/issues/registry.md` for prior occurrences of:
- `pre-existing lint` (no match — first time)
- `useLiteralKeys` (no match)
- `noExcessiveCognitiveComplexity` (no match)
- `noNonNullAssertion` (no match)
- `web-next lint` (no match)

This is a **new issue** (first occurrence).

## Registration

Created:
- `.copilot/issues/ISS-PREEX-001.md` — full issue body
- Updated `.copilot/issues/registry.md` — added row with status `resolved` (because the fix is already implemented and verified in the working tree; we are now formalizing the resolution)

## Prior Occurrences

The 17 lint errors were first noted in the archived workflow
`.copilot/tasks/archived/wf-20260623-feat-2/07-test-results.md` (FR-MIG-007
Tooltip kit atom) on 2026-06-23. The TestRunner explicitly deferred them to
ISS-PREEX-001. This is the resolution of that deferral.

## Module

`web-next` — frontend Astro app.

## Severity

`minor` — non-blocking, but pollutes the lint signal for every future PR in
this app, masking real regressions.

## Issue Reference

`ISS-PREEX-001` — set in `handoff.yaml.requirement_ref`.

## Gate Result

gate_result:
  status: passed
  summary: "ISS-PREEX-001 created and registered; no prior occurrence."
  findings:
    - "Issue was first flagged by wf-20260623-feat-2 TestRunner on 2026-06-23."
    - "First time formalizing this in the issue registry."
