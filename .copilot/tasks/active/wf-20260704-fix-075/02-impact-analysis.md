# Step 2 — Impact Analysis

**Workflow:** wf-20260704-fix-075
**Issue:** ISS-UAT-009-2
**Date:** 2026-07-04

## Validated Requirement

ISS-UAT-009-2 — `/me` renders an in-page `AnonView` CTA (HTTP 200) for anon
visitors while `/workspace` hard-redirects; `BP-UAT-009.md` Step 005 spec
asserts the wrong mechanism for `/me` — spec update + inconsistency flagged
for product follow-up.

**Resolution path chosen: Path B** (mirroring `wf-20260704-fix-073`
which shipped the same kind of fix for the sister Step 004 mechanism on
2026-07-04). Accept that the `/me` HTTP 200 + `AnonView` CTA is the
**already-intended** behaviour (codified in `smoke-auth-gates.spec.ts` and
already implemented in `BP-UAT-009.spec.ts` Step 005 with soft asserts
explicitly flagging the discrepancy for BusinessAnalyst). Update
`BP-UAT-009.md` Step 005 expected state + AC-4 wording to match, and log
the `/me`-vs-`/workspace` UX consistency decision (accept-as-is, schedule
backlog) without blocking close.

## Affected Layers

| Layer | Change? | Details |
|---|---|---|
| API (NestJS) | No | Not in scope — no API behaviour change. |
| DB | No | No schema change. |
| Shared Types | No | No new types. |
| Frontend `apps/web-next` | No runtime change | `/me` continues to render `MeDashboard` which returns `<AnonView>` for `state.phase === 'anon'` (apps/web-next → apps/web per `apps/web/src/pages/me.astro` + `apps/web/src/components/MeDashboard.tsx` `AnonView` lines 587–610; the prod runtime is `apps/web`, the migration was completed 2026-06-25 per `wf-20260625-feat-025`). `/workspace` continues to use the redirect via `window.location.replace(signInUrl())`. No code change. |
| Bot | No | Not in scope. |
| Workers | No | Not in scope. |
| Documentation | **Yes (2 files)** | (1) `docs/02-business-processes/uat/BP-UAT-009.md` — Step 005 expected state updated to describe HTTP 200 + in-page `AnonView` CTA instead of 3xx redirect; AC-4 wording re-scoped so it covers both gating mechanisms (CTA **and** redirect) without asserting a single mechanism for both. (2) The product/UX consistency decision is logged in the issue's Resolution section (accept-as-is with rationale — the smoke-test contract in `smoke-auth-gates.spec.ts` already codified the divergent behaviour; the precedent is set). |
| Tests | No new test code | The existing Playwright spec at `apps/e2e/tests/uat/BP-UAT-009.spec.ts` (Step 005, line 337) **already implements the correct assertion** (200 + anon CTA + no authed-only content). Live re-run against the corrected BP-UAT-009.md spec is the AC verification — no new test file needed. |
| Smoke tests | No regression | `apps/e2e/tests/smoke-auth-gates.spec.ts` (`'/me dashboard renders for anon (client island shows sign-in CTA)'`) already green — the divergence this workflow closes is in the UAT business-process spec, not in the smoke contract. |

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| _(none)_ | — | No endpoint contract change. | — |

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| _(none)_ | — | No service call changes. |

## Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| Widening AC-4 to cover both mechanisms could mask a future regression that breaks one mechanism | Low | AC-4's exit assertion (per the live Playwright spec) remains "no authenticated-only content visible to an anon visitor" — the security intent, not a specific mechanism. Independent assertion per mechanism remains in the smoke suite (`smoke-auth-gates.spec.ts`). |
| Live re-run of BP-UAT-009 Step 005 requires full stack (api + web + Authentik) | Medium | Per AGENTS.md §6.1, Orchestrator MUST pre-flight (`docker compose up -d` + per-service `curl`) before declaring verified. Same pattern used by `wf-20260704-fix-073` for Step 004. |
| Changing BP-UAT-009.md AC-4 wording could be perceived as loosening UAT coverage | Low | Add an explicit "scope: AC-4 covers both gating mechanisms" sentence so future triagers see the scope. Re-link to `smoke-auth-gates.spec.ts` and the live Playwright spec as the contract-of-record. |

### Security Review Required?

**No.** This is documentation-only.

- No code paths handling secrets, tokens, cookies, or auth are modified.
- No tenant-isolation boundaries touched.
- The Playwright spec at line 337 (`BP-UAT-009.spec.ts:Step 005`) is
  **already** enforcing the security-critical invariant: an anonymous
  visitor to `/me` sees no authenticated-only content (`Your registrations`
  / `Check-in QR` / `Leaderboard points` widgets all `toHaveCount(0)`).
  The doc change makes the spec wording consistent with that assertion,
  not looser.

### Architecture Review Required?

**No.** No module boundaries crossed. No new endpoints. No new dependencies.

## Test Scope

| Level | What | Where |
|---|---|---|
| Live UAT re-run (verification, not new test design) | `BP-UAT-009.spec.ts` Step 005 against the updated `BP-UAT-009.md` expected state — the Playwright spec already encodes the correct assertion pattern | `apps/e2e/tests/uat/BP-UAT-009.spec.ts` (existing file — no change) |
| Live smoke-test sanity | `/me dashboard renders for anon (client island shows sign-in CTA)` continues green — proves the AnonView path is intact after the doc rewrite | `apps/e2e/tests/smoke-auth-gates.spec.ts` (existing file — no change) |

No new unit tests, no new integration tests, no DB-touching tests.

## Architectural Alignment

- Module boundaries: unaffected.
- Cross-schema queries: unaffected.
- Approved stack: unaffected.
- No new dependencies.

## Gate Result

gate_result:
  status: passed
  summary: "Documentation-only Path B; no runtime behaviour, no DB, no API contract, no test code. Affected: 1 UAT spec doc + 1 product/UX consistency note in ISS-UAT-009-2 Resolution."
  findings:
    - "Live Playwright spec Step 005 (line 337) already implements the corrected assertion pattern — verification is re-running that existing spec against the updated BP-UAT-009.md expected state"
    - "Smoke-auth-gates.spec.ts already codifies /me CTA behavior as the contract-of-record — the doc fix aligns the BP-UAT-009.md wording to that contract"
    - "Pre-existing ISS-UAT-009-3 (leaderboard self-row) and ISS-UAT-009-4 (AnonView empty region) are independent visual-only issues; not in scope"
    - "Live re-run requires full stack; Orchestrator pre-flight per AGENTS.md §6.1"
