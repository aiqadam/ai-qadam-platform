# Step 1: Issue Lookup — wf-20260703-fix-065-onboarding-copy

**Issue:** [ISS-UAT-013-13](../issues/ISS-UAT-013-13.md)
**Severity:** minor (UI copy-smell, non-blocking)
**Module:** web/onboarding
**Status before this workflow:** open

## Registry Search

Searched `.copilot/issues/registry.md` for the same module/symptom.

| Keyword | Hits |
|---|---|
| `OnboardingForm` | 0 prior |
| `role_groups` | 0 prior |
| `web/onboarding` | 0 prior |

ISS-UAT-013-13 is the **first** registered issue against `web/onboarding` UI
copy. No similar issue exists to merge with. Standalone resolution is the
correct path.

## Prior Resolution Attempts on This Issue

None. This is the first workflow to address ISS-UAT-013-13.

The issue was opened on 2026-07-02 by `wf-20260702-uat-059` during the
BP-UAT-013 visual review pass (`02b-visual-review.md`, screenshot
`neg-005-no-authentik-user-409.png`). The finding was triaged as
**non-blocking** because it does not affect the AC-5 Neg 005 DOM assertion
(`invite_missing_authentik_user` inline error code renders correctly).
The seeded `UAT Operator (no-user)` row is intentionally constructed
with `role_groups: []` to exercise the api's error path.

## Required Pre-Flight for This Workflow

The issue's Acceptance Criteria do not require live infrastructure to
verify. The regression test is a **unit test** over the React component
(no Playwright, no api call). Step 8 does not need a `docker ps` pre-flight.

The optional E2E re-run (AC-4) requires the seeded Authentik user and
operator_invites row, which is set up by `pnpm uat:seed`. That re-run
is explicitly marked *optional* in the issue's "Tests to add" section,
so AC verification will rely on the unit test, with the visual fix
audited manually against the existing `neg-005-no-authentik-user-409.png`
screenshot after merge.

## Set

`issue_ref` = `ISS-UAT-013-13` in `handoff.yaml`.

## Gate

`passed` — Step 1 complete, advance to Step 2.