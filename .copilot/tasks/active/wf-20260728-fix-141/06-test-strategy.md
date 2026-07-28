# Step 6: Test Strategy — wf-20260728-fix-141

## Required regression test

Must fail before the fix (demonstrating the bug) and pass after. Design:
use deliberately **distinct** platform-id and Directus-id fixture strings
(not the pre-existing suite's same-space `'u-1'`-for-both pattern, which
is exactly why this bug shipped undetected) so:

1. Any assertion that the Directus-facing URL/filter contains the
   Directus id and NOT the platform id fails pre-fix (methods used the
   platform id directly) and passes post-fix.
2. A bridge-resolution-failure case (`ensureLinked` returns `null`)
   asserts a `NotFoundException`, proving the new failure mode is handled
   gracefully rather than silently querying with `null`/`undefined`.

## Coverage plan

- `MeProfileService.getProfile` — asserts `bridge.ensureLinked` is called
  with the right args, and the resulting Directus GET URL contains the
  Directus id, not the platform id.
- `MeProfileService.listConsents` / `listSkills` — same shape, covering
  the `filter[member][_eq]=...` query-building path (a different call
  shape than `getProfile`'s `/users/{id}` path).
- `MeProfileService.setOnboardedAt` — same assertion on the PATCH call,
  using arbitrary non-overlapping fixture strings to rule out any
  string-substring false pass (the actual mistake caught and fixed during
  this workflow's own test-writing, see `03-code-summary.md`).
- Bridge-failure path — `NotFoundException` thrown, Directus never
  queried (`dx.get` not called).

## Existing suite update strategy

All pre-existing tests in `me-profile-service.spec.ts`,
`members-onboarding.service.spec.ts`, and
`members-onboarding.integration.spec.ts` needed mechanical signature
updates (new `email` parameter, bridge mock in constructor) — these are
not new regression coverage, just keeping the suite compiling/passing
against the new signatures. No behavior assertions in these pre-existing
tests changed except where the argument-position shift required updating
`mock.calls[n]` index access.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Regression test targets the exact defect (id-space confusion) using non-overlapping fixture ids to avoid a substring false-pass; covers both URL-path and filter-query call shapes plus the bridge-failure path."
```
