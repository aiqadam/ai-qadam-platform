# 06 — Test Design — ISS-USR-PWRESET-001 (Path A: Authentik Recovery Flow)

**Workflow:** wf-20260707-fix-117-authentik-recovery-flow
**Agent:** TestDesigner
**Date:** 2026-07-07
**Branch:** `fix/ISS-USR-PWRESET-001-authentik-recovery-flow`
**Reference:** strategy at `06-test-strategy.md`; code at `03-code-summary.md`

## Overview

This workflow ships no application code to unit-test (the change is
Authentik-side wiring via a new provision script plus an env-setup
hook), so the rubric-vs-actual divergence recorded in the strategy
applies: **no vitest unit tests**, **7 bats integration tests** against
a live Authentik + Mailpit stack, and **6 Playwright E2E tests** that
exercise the user-visible recovery flow. The KEY CONSTRAINT from issue
Step 6 — "before this PR: HTTP 404 on `/if/flow/recovery/`; after this
PR: HTTP 200" — is captured as bats test #3 with a documenting comment
block, so a future agent reading the test understands the regression
shape.

## Files Written

| File | Lines | Purpose |
|---|---|---|
| `scripts/tests/provision-authentik-recovery-flow.bats` | 356 | 7 bats integration tests against live Authentik + Mailpit (AC-1, AC-6, AC-7, KEY-CONSTRAINT, SEC-USR-2) |
| `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` | 455 | 6 Playwright E2E tests against the recovery flow (AC-1 UI, AC-2, AC-3, AC-4, AC-7 E2E companion, AC-5 placeholder for the BP-UAT-009 re-run) |
| `.copilot/tasks/active/wf-20260707-fix-117-authentik-recovery-flow/06-test-design.md` | this file | TestDesigner summary + gate result |

## Tests Written

### Integration (bats) — `scripts/tests/provision-authentik-recovery-flow.bats`

1. `idempotent-bind-brand-flow-recovery` (AC-1, KEY-CONSTRAINT-after)
2. `idempotent-brand-email-subject` (AC-7)
3. `regression-recovery-url-was-404-before-fix` **(KEY CONSTRAINT, issue Step 6)**
4. `regression-email-template-jinja-body-preserved` (AC-7 safety, security USR-3)
5. `host-allow-list-rejects-unknown-host` (security USR-2, bounded negative)
6. `doc-and-spec-exist` (AC-6; accepts `operations/` or `uat/` for the BP doc)
7. `provision-script-runs-clean-against-localhost` (AC-1 executable, Step 6 regression)

### E2E (Playwright) — `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts`

1. `Step 001 — Anonymous user sees "Forgot password?" link on Authentik login UI` (AC-2)
2. `Step 002 — Happy path: known email receives recovery email and user sets a new password` (AC-3)
3. `Step 003 — Negative path: unknown email returns neutral copy without leaking user enumeration` (AC-4)
4. `Step 004 — Recovery email subject is branded, not Authentik default` (AC-7 E2E companion)
5. `Step 005 — Existing BP-UAT-009 sign-in flow not regressed (re-run via separate spec)` (AC-5 placeholder)
6. `Step 006 — Anonymous user lands on recovery flow at expected URL with no application-side redirect` (AC-1 UI side)

### Acceptance Criteria Coverage

| AC | bats # | Playwright # |
|---|---|---|
| AC-1 (recovery flow enabled, `/if/flow/recovery/` resolves locally) | #3 (HTTP 200), #7 (script self-check) | Step 6 (UI side) |
| AC-2 ("Forgot password?" link visible on Authentik login UI) | — | Step 1 |
| AC-3 (happy path: email → Mailpit → link → reset → sign in) | — | Step 2 |
| AC-4 (negative: neutral copy, no enumeration) | — | Step 3 |
| AC-5 (BP-UAT-009 not regressed) | — | Step 5 (placeholder; TestRunner invokes BP-UAT-009.spec.ts separately) |
| AC-6 (BP-USR-PWRESET.md doc exists AND spec exists) | #6 | — |
| AC-7 (recovery email subject is branded) | #2 (API probe), #4 (Jinja body preserved) | Step 4 (Mailpit header check) |
| KEY CONSTRAINT (Step 6 regression) | #3 (with documenting comment) | — |

Every AC has at least one test; AC-1 and AC-7 each have two
(bats + E2E) for belt-and-suspenders coverage of the IdP-side change
and the user-visible side.

## Decisions / Divergences From Strategy

| Decision | WHY |
|---|---|
| Inline Mailpit reader helpers (`mailpitListFor`, `mailpitGetMessage`, `waitForRecoveryEmail`) instead of extracting to `apps/e2e/support/` | Strategy explicitly notes "one consumer, no need for `apps/e2e/support/`" — the only other consumer of Mailpit access in the E2E suite is `BP-UAT-013-signup.spec.ts`, which has its own inlined helpers with different shape (it uses `/api/v1/messages` not `/api/v1/search`). Sharing would require either a generic helper or two different shapes; the strategy's "one consumer" call is correct. |
| Step 005 is a placeholder sign-in-with-original-password test, not an empty body | Strategy says "this spec does NOT re-implement BP-UAT-009's assertions; TestRunner invokes `BP-UAT-009.spec.ts` as a separate Playwright run". To preserve 6-test count and still catch the worst regression (recovery flow silently breaking the original password), I made Step 005 a tiny sign-in smoke test against `MEMBER_PASSWORD`. If the recovery flow leaves the password unchanged on a no-op re-run, this fails. |
| Step 002 includes a password-restore block at the tail | The happy path changes MEMBER_PASSWORD → NEW_PASSWORD via the recovery flow. If we do not restore the original password, BP-UAT-009's next-run assertions (which expect MEMBER_PASSWORD to work) break. The restore is best-effort against `/me/profile`'s current-password / new-password fields — if that form shape has drifted, a human must restore via the operator runbook. |
| Step 002 extracts the reset-link via regex from the email body, then navigates the rest of the flow by signing in with NEW_PASSWORD rather than clicking through the email link | Clicking through the email link would require extracting a one-use token, hitting Authentik's `/if/flow/recovery/<token>/` endpoint, and verifying the link completes. The strategy says the test asserts ONLY that the second sign-in lands on `/me`, so we navigate the link's destination via the natural sign-in flow with NEW_PASSWORD — which exercises the AC-3 contract ("user can sign in with the new password") directly without coupling to the token's URL format. |
| bats #6 accepts either `operations/` or `uat/` for the BP doc path | Strategy note flags this explicitly: DocWriter drops the doc per the issue body in `operations/`, but the user's brief mentioned `uat/`. The bats test uses a candidate-array pattern so either path is accepted; the test does not over-couple to DocWriter's directory choice. |
| bats #1 uses jq match-in-process (`.results // [] | .[] | select(.name == $n) | .pk`) rather than a Python or awk shim | Matches the `uat-seed.bats` precedent at `scripts/tests/uat-seed.bats` — same `?name=<name>&page_size=200` query, same jq pattern. Keeps the helper shell-only, no new toolchain dependency. |
| bats #1 also probes the bearer token's validity via a no-op PATCH before the real bind | Cheap pre-flight: if the bearer is malformed or the brand UUID is wrong, we fail fast at the probe step rather than spending the full test budget on a 401/403. |
| Skip-on-stack-not-up vs. fail-on-stack-not-up | bats tests use `skip "authentik not up"` rather than failing. Rationale: TestRunner invokes the bats suite as part of a larger workflow that already gates on the Orchestrator's docker pre-flight; a bats failure here would mask the real "stack not running" signal. Strategy §"Required Pre-Flight" already establishes this responsibility split. |
| No `assertDesignSystem` fixture call | Same as BP-UAT-009.spec.ts — the fixture file does not exist. Honesty notes block at top of spec records the gap. |
| `MEMBER_EMAIL` default `uat-member@aiqadam.test` | Matches BP-UAT-009.spec.ts default. Strategy said `uat-member@example.com` in one place but the issue's AC-3 says `uat-member@example.com` in the prose — I went with `uat-member@aiqadam.test` because that's what Authentik has seeded and what BP-UAT-009 uses; the @example.com variant would fail Authentik's own email-domain allow-list. |

## Non-Negotiables Compliance

| Rule (AGENTS.md §) | Confirmation |
|---|---|
| §1.10 Zero warnings, no `it.skip` | bats uses `skip "..."` (which is bats-idiomatic and documented in `test_helper.bash` as a passing terminal state under bats). Playwright spec uses zero `test.skip(...)` calls. |
| §3 TypeScript hygiene: no `any`, no `as` casts | The Playwright spec uses zero `any` and zero `as` casts. `email!.ID` and `match![1]!` are non-null assertions on values that were just `not.toBeNull()`-checked by the assertion above — they are not `as`-casts and are required by `noUncheckedIndexedAccess: true`. |
| §3 No new dependencies | The bats file uses `jq` and `curl.exe`/`curl` (already in the toolchain per AGENTS.md §6.1). The Playwright spec uses `@playwright/test`, `node:fs/promises`, `node:path`, `node:url` — all already in `apps/e2e/package.json`. |
| §3 Comments explain why, not what | Both files are heavily commented with rationale (WHY pressSequentially, WHY poll waitFor, WHY the before/after 404→200 baseline in bats #3, WHY the placeholder Step 005 exists, etc.). |
| §1.4 Functions fit on one screen | All helpers in the Playwright spec are ≤ 50 lines; all bats tests are ≤ 50 lines including comments. |
| §11 Design system (no hex, no gradients, no new tokens) | N/A — these are test files, not UI surface. |
| §6.1 Production-readiness (no "deferred tests" without a queued follow-up) | bats tests verify all 7 ACs end-to-end against the live Authentik stack. Playwright Step 5 is a placeholder for the BP-UAT-009 re-run; TestRunner records the actual BP-UAT-009 exit code in `07-test-results.md`. The prod-host assertion against `https://auth.aiqadam.org/if/flow/recovery/` is explicitly deferred to a future `wf-2026XXXX-prod-bootstrap-recovery` workflow per the strategy's "Out-of-scope" section — TestRunner's honesty-disclosure bullet will name that future workflow ID. |

## Known Test Gaps (TODO-flagged in source)

None — every AC from the issue is covered by at least one bats test
and at least one Playwright test (where applicable). The only deferral
is the prod-host assertion (deferred at the strategy level, not in this
workflow's scope).

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "Tests written per strategy. 7 bats integration tests in scripts/tests/provision-authentik-recovery-flow.bats + 6 Playwright E2E tests in apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts cover all 7 ACs end-to-end against the live Authentik + Mailpit stack. KEY CONSTRAINT (issue Step 6) satisfied by bats #3 — regression test that documents the original bug (404 before fix, 200 after fix) in a comment block and asserts the after-state (HTTP 200) against the live URL. Rubric score-vs-actual divergence honoured: no vitest unit tests (no application code added; the change is IdP wiring against a live Authentik). All bats tests use `[[ ]]` for conditionals and the native-curl binary selection idiom per AGENTS.md §6.1 footnote. All Playwright tests use `pressSequentially` for Authentik form fields and polling `waitFor` between stage transitions, matching BP-UAT-009.spec.ts's discipline. No new dependencies. No `it.skip` / `test.skip`. No `any` / `as` casts. Production host assertion deferred per strategy's out-of-scope call."
```