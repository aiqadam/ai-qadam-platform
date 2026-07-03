# Step 1 — Issue Lookup

**Issue:** ISS-UAT-009-2
**Workflow:** wf-20260704-fix-075
**Date:** 2026-07-04

## Existing registry entries

Searched `.copilot/issues/registry.md` and `.copilot/issues/*.md` for issues
matching keywords: `/me`, `AnonView`, `auth gate`, `protected page`, `window.location.replace`, `sign-in CTA`, `BP-UAT-009`, `step 005`, `auth-gating`, `redirect`,
`/workspace`.

**Results:**

| ID | Status | Summary | Relationship |
|---|---|---|---|
| [ISS-UAT-009-2](../issues/ISS-UAT-009-2.md) | open | (this issue) | primary |
| [ISS-UAT-009-1](../issues/ISS-UAT-009-1.md) | resolved | logout-interstitial (sibling) | independent — Step 004 mechanism, not Step 005 |
| [ISS-UAT-009-3](../issues/ISS-UAT-009-3.md) | open | leaderboard self-row concatenation (visual) | independent |
| [ISS-UAT-009-4](../issues/ISS-UAT-009-4.md) | open | AnonView layout empty region (visual) | independent |
| [ISS-UAT-013-10](../issues/ISS-UAT-013-10.md) | resolved | spec/seed misalignment for Step 005 assertions | **related class** — establishes the "spec/seed misalignment" classification precedent (spec update, not code change) |
| [ISS-UAT-013-6](../issues/ISS-UAT-013-6.md) | resolved | negative-scenario assertion rule | independent |

No previously-resolved issue exists for this exact symptom (the `/me` vs
`/workspace` divergent anon-gating mechanism). The current Playwright spec
at `apps/e2e/tests/uat/BP-UAT-009.spec.ts` **already implements** the
correct behaviour for Step 005 (HTTP 200 + AnonView CTA + no authed-only
content visible) and the smoke test at `apps/e2e/tests/smoke-auth-gates.spec.ts`
(`/me dashboard renders for anon (client island shows sign-in CTA)`)
codifies this as the **intended** UI. So the only mismatch is in the
business-process BP-UAT-009.md doc itself.

## Decision

ISS-UAT-009-2 is the unique open issue for this symptom. **Path B** (from
the issue's "Proposed resolution"): update `BP-UAT-009.md` Step 005 expected
state and AC-4 wording to match the already-intended behaviour (`/me`
returns HTTP 200 with in-page `AnonView` CTA; `/workspace` does the hard
redirect, as Neg 001 already asserts). The product/UX consistency question
(in-page CTA vs redirect — same module, two mechanisms) is logged separately
as a backlog item; not blocking.

## Pre-existing precedent this workflow mirrors

- `wf-20260704-fix-073` (ISS-UAT-009-1, resolved 2026-07-04): spec/comment
  update for the sister Step 004 mechanism — same pattern (BP-UAT-009 spec
  wording is wrong vs reality; fix the spec, do not force a code change).
- `wf-20260702-fix-049` (ISS-UAT-013-10, resolved 2026-07-02): spec/seed
  misalignment fixed by updating the spec, not the seed.

Both confirm that "spec says X, product does Y, Y is also the intended
behaviour in the test suite" is the canonical BP-UAT-009 / UAT-runbook
triage call → **fix the spec**.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "ISS-UAT-009-2 confirmed as the unique open issue for the /me-vs-/workspace anon-gating mechanism mismatch; Path B (spec-only fix) chosen mirroring fix-073 precedent."
  findings:
    - "No prior issue exists with this exact symptom"
    - "apps/e2e/tests/smoke-auth-gates.spec.ts already codifies HTTP 200 + AnonView CTA as intended behaviour"
    - "apps/e2e/tests/uat/BP-UAT-009.spec.ts Step 005 already implements the correct assertion (200 + CTA + no authed-only content) with soft asserts on the spec/actual mismatch — flagged for BusinessAnalyst at the top of the file"
    - "/workspace divergence is in apps/web (legacy Astro app) via Workspace.tsx useEffect + window.location.replace"
    - "AC-4's wording conflates /me (CTA) and /workspace (redirect) into a single 'redirects to sign-in' assertion — both /workspace-style surfaces and /me-style surfaces satisfy AC-4's security intent"
```
