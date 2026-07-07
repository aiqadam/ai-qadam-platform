# Test Strategy: ISS-USR-PWRESET-001 (Path A — Authentik Recovery Flow)

## Requirement

**ID:** ISS-USR-PWRESET-001
**Severity:** blocker
**Statement:** Members cannot recover a forgotten password. `auth-architecture.md` §6.6 deferred forgot-password to Authentik's Recovery Flow, but the flow was never enabled, no UI link was added, and the recovery email template was never branded. Path A (user-approved 2026-07-07): thin Authentik wiring — bind `Brand.flow_recovery`, brand the recovery-email subject, hook the provision into UAT env-setup. Zero changes to `apps/api`, `apps/web`, `apps/web-next`, or Drizzle schema (impact-analysis Step 2 critical refinement: Authentik's own login UI renders the "Forgot password?" link automatically once `Brand.flow_recovery` is bound — no Astro-side edit needed).

---

## Rubric Score

| Criterion | Points | Justification |
|---|---|---|
| Touches tenant-scoped data | 0 | No DB write, no apps/api surface. Default-brand filter is server-side. |
| New API endpoint | 0 | No new endpoint in our codebase. |
| Business rule with edge cases | 0 | All edge cases (rate limit, copy, token validity) are owned by Authentik's `default-recovery-flow`. |
| Cross-module service call | 0 | No apps/api module touched. |
| New database query | 0 | No Drizzle change. |
| Pure function / utility | 0 | The new file is an IdP provisioning shell script. |
| UI-only change (no logic) | 0 | IdP wiring + brand subject string — not our UI code. |

**Total Score: 0** → Rubric says "Unit tests sufficient."

### Score-vs-actual divergence (explicit, per test-strategist.md §0)

The rubric score says unit-only; **this is wrong for this change.** The PR ships no application logic to unit-test — it's a live-IdP binding change. Pure unit tests have zero signal here. The test levels must be driven by the **what** (provisioning a live IdP feature, asserting against a running Authentik and Mailpit), not the rubric. Required levels:

- ✅ **Integration tests via bats** (live Authentik + curl) — required for AC-1, AC-7, AC-6 file-existence, regression-before-fix (issue Step 6 KEY CONSTRAINT).
- ✅ **E2E tests via Playwright** — required for AC-2 (Authentik's login UI), AC-3 (full happy path: Authentik UI → Mailpit → reset link → new password → sign in), AC-4 (user-enumeration probe), AC-5 (BP-UAT-009 non-regression).
- ❌ **Unit tests (vitest)** — **not applicable**. There is no application code to unit-test; the script's logic is exercised end-to-end against the live IdP. Forcing vitest would test mocks, not Authentik.

This divergence is recorded here so the QualityGate reviewer does not flag the absence of `*.spec.ts` under `apps/api` as a miss.

---

## Required Test Levels

- [ ] Unit tests (vitest) — **N/A** for this change (no application code added; rationale above).
- [x] **Integration tests (bats against live Authentik + Mailpit)** — required.
- [x] **E2E tests (Playwright against live Authentik + Mailpit + web)** — required.

---

## Where the tests live

| Layer | File | Rationale |
|---|---|---|
| bats integration | `scripts/tests/provision-authentik-recovery-flow.bats` (**new**) | Matches `scripts/tests/uat-preflight-check.bats` and `scripts/tests/uat-seed.bats` precedent. One concern per file, like `uat-seed.bats`. NOT appended to `uat-env-setup.bats` (that file is the host script — concerns are split by sibling, not by merge). |
| E2E happy + negative + AC-2 | `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` (**new**) | Matches the `BP-UAT-NNN.spec.ts` convention used by the existing sign-in spec (`BP-UAT-009.spec.ts`) and the signup spec (`BP-UAT-013-signup.spec.ts`). Filename uses the BP code (not the issue ID), per the convention. |
| E2E non-regression | Re-run `apps/e2e/tests/uat/BP-UAT-009.spec.ts` | Already exists; this workflow just runs it. No file change. |

The `BP-USR-PWRESET.md` doc-existence assertion (AC-6 second half) lives in the same bats file as the doc-existence assertions for `BP-USR-PWRESET.md` and `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` — keeps the bats file self-contained.

---

## Required Pre-Flight (TestRunner, AGENTS.md §6.1)

Per `handoff.yaml:required_services`, the Orchestrator MUST bring the following up before TestRunner runs any of these tests, AND a pre-flight `curl -fsS` MUST succeed against each healthcheck:

| Service | URL | Healthcheck | Why |
|---|---|---|---|
| authentik | `http://localhost:9000` | `/-/health/live/` | AC-1, AC-2, AC-3, AC-4, AC-7 all depend on a running Authentik. |
| mailpit | `http://localhost:8025` | `/` | AC-3 reads the recovery email from Mailpit's HTTP API (`/api/v1/messages`). |
| api | `http://localhost:3001` | `/health` | Indirectly needed for AC-5 (BP-UAT-009's existing assertions). |
| web | `http://localhost:4321` | `/` | Indirectly needed for AC-5 (BP-UAT-009 visits `BASE_URL`). |
| directus | `http://localhost:8200` | `/server/ping` | Indirectly needed (BP-UAT-009 issues a redirect to the operator's profile). |
| postgres | `localhost:5433` | `pg_isready` | Indirectly needed (sign-in sessions land in the DB). |

The provision script (`scripts/provision-authentik-recovery-flow.sh`) MUST already have been invoked by `scripts/uat-env-setup.sh` STEP 7b/9 before these tests run. TestRunner verifies this with a one-line pre-flight: `curl -fsS http://localhost:9000/if/flow/recovery/ | grep -q "<form"` — if 404, the whole bats suite fails fast and TestRunner reports "auth.provision-not-run — re-run uat-env-setup.sh."

A native-curl binary selection per AGENTS.md §6.1 footnote (the same `command -v curl.exe` idiom used in `scripts/uat-preflight-email.sh:85-90`) MUST be applied in every `bats` test that calls curl.

---

## Unit Test Plan

**N/A.** See "Score-vs-actual divergence" above. No application code added; no function under test in `apps/api/src/**` was touched. The provision script is exercised end-to-end against a live Authentik by the bats + Playwright suites below.

---

## Integration Test Plan — `scripts/tests/provision-authentik-recovery-flow.bats`

Run with: `pnpm bats scripts/tests/provision-authentik-recovery-flow.bats` (matches `scripts/run-bats.sh` invocation pattern).

| # | Test name | AC | Infrastructure | Key assertions |
|---|---|---|---|---|
| 1 | `idempotent-bind-brand-flow-recovery` | AC-1, KEY-CONSTRAINT-after | `curl.exe` against `http://localhost:9000/api/v3/core/brands/` with bearer token from `/tmp/aiqadam-secrets-AK_API_TOKEN` | First run: PATCH succeeds (HTTP 200/204) and sets `flow_recovery` to the `default-recovery-flow` UUID. Second run: PATCH is a no-op (GET returns the same UUID, no PATCH issued). Idempotency check uses `jq -e '.flow_recovery'` after each run. |
| 2 | `idempotent-brand-email-subject` | AC-7 | Same | First run: PATCH on `/api/v3/core/email-templates/<default-email-recovery uuid>/` with `{"subject":"Reset your AI Qadam password"}` returns HTTP 200/204. Second run: GET returns `subject == "Reset your AI Qadam password"`, no PATCH issued. |
| 3 | `regression-recovery-url-was-404-before-fix` | **KEY CONSTRAINT (issue Step 6)** | `curl.exe http://localhost:9000/if/flow/recovery/ -o /dev/null -w '%{http_code}'` | The canonical "before/after" regression assertion. As documented in the issue and the user's brief: before this PR, `GET /if/flow/recovery/` returned 404 (flow not bound). After this PR, it returns 200 (HTML page). The bats test MUST assert HTTP 200 against the live URL — and the comment in the test MUST name the "before" baseline (404) so a future agent reading the test understands the regression shape. This is the test that "would have failed before the fix." |
| 4 | `regression-email-template-jinja-body-preserved` | AC-7 (safety) | GET on the email-template UUID; assert `body` field still contains the canonical reset-link Jinja (`{% if link %}` or equivalent). | PATCH-only-`subject` invariant from security review USR-3. If a future change accidentally switches to PUT, this test catches the body-wipe. |
| 5 | `host-allow-list-rejects-unknown-host` | Security USR-2 | Invoke the script with `AUTHENTIK_URL=https://attacker.example.com`, assert exit code 4 and stderr contains `not in allow-list`. | Bounded negative — confirms the host guard fires. |
| 6 | `doc-and-spec-exist` | AC-6 | `test -f docs/02-business-processes/operations/BP-USR-PWRESET.md` AND `test -f apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` | Doc-existence check; both files must be present at bats run time. DocWriter's deliverable lives in `docs/02-business-processes/operations/`, NOT `docs/02-business-processes/uat/` — the user's brief mentioned `uat/` but the issue body (AC-6) says `operations/`; the impact-analysis does not pin a directory. **Flag for TestDesigner:** if DocWriter drops it in `uat/`, the bats test must accept either path (use `ls docs/02-business-processes/{operations,uat}/BP-USR-PWRESET.md`). |
| 7 | `provision-script-runs-clean-against-localhost` | AC-1 (executable), Step 6 regression | `bash scripts/provision-authentik-recovery-flow.sh` with `AUTHENTIK_URL=http://localhost:9000` and `AK_API_TOKEN` from `/tmp/...` | Script exits 0; stdout contains `✓ Brand.flow_recovery bound` (or `already bound (no-op)` on re-run) AND `✓ AC-1: http://localhost:9000/if/flow/recovery/ returns 200`. |

### bats boilerplate (for TestDesigner to copy verbatim from `scripts/tests/test_helper.bash`)

- `load 'test_helper'` (per `scripts/tests/uat-preflight-check.bats`).
- Each test begins with a `curl -fsS http://localhost:9000/-/health/live/` reachability check; skip with `skip "authentik not up"` if unreachable.
- bearer-token sourcing: `AK_API_TOKEN="$(cat /tmp/aiqadam-secrets-AK_API_TOKEN 2>/dev/null || echo "")"`; `[[ -z "$AK_API_TOKEN" ]] && skip "no AK_API_TOKEN"`.
- curl binary: `if command -v curl.exe &>/dev/null; then CURL_BIN=curl.exe; else CURL_BIN=curl; fi` — per AGENTS.md §6.1 footnote, copy from `scripts/uat-preflight-email.sh:85-90`.

---

## E2E Test Plan — `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts`

Run with: `pnpm --filter e2e playwright test apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` (matches the BP-UAT-NNN spec convention from `playwright.uat.config.ts`).

Conventions inherited from `BP-UAT-009.spec.ts` (the user's "pattern reference, CRITICAL — match this style"):
- Top-of-file honesty-notes block documenting observed-vs-scripted behavior.
- `shot(page, label)` helper writing to `apps/e2e/uat-results/BP-USR-PWRESET/<step>.png`.
- `hideDevToolbar(page)` helper (Astro dev toolbar).
- `UAT_*` env-var names: `UAT_BASE_URL`, `UAT_AUTHENTIK_URL`, `UAT_MEMBER_EMAIL`, `UAT_MEMBER_PASSWORD`. Defaults match BP-UAT-009 (`http://localhost:4321`, `http://localhost:9000`, `uat-member@aiqadam.test`, `UatMember1!`).
- The Authentik form-filler pattern from `submitAuthentikCredentials` (lines 76-115 of `BP-UAT-009.spec.ts`) — `pressSequentially` instead of `fill`, role-based Continue button locator, polling `waitFor` instead of `isVisible()` branching. The recovery flow has TWO input stages (`email` then `new password` then `repeat password`); the same waitFor discipline applies to the new-password field.
- No `assertDesignSystem` fixture (file does not exist — match the honesty note in BP-UAT-009).

| # | Test name | AC | User flow | Entry point | Exit assertion |
|---|---|---|---|---|---|
| 1 | `Step 001 — Anonymous user sees "Forgot password?" link on Authentik login UI` | AC-2 | Open the Authentik login page directly (no app-side navigation needed; the link is rendered by Authentik once `Brand.flow_recovery` is bound) → confirm a `<a href*="/if/flow/recovery/">` element is visible. | `page.goto(${AUTHENTIK_URL}/if/flow/default-authentication-flow/)` | `expect(forgotLink).toBeVisible()` AND its `href` ends with `/if/flow/recovery/`. Screenshot: `step-001-forgot-link-visible.png`. |
| 2 | `Step 002 — Happy path: known email receives recovery email and user sets a new password` | AC-3, KEY-CONSTRAINT-after | Click "Forgot password?" → enter `uat-member@aiqadam.test` → submit → poll Mailpit HTTP API (`GET http://localhost:8025/api/v1/messages`) until a new message arrives (subject == "Reset your AI Qadam password") → extract the reset URL from the email body (regex on `http://localhost:9000/if/flow/recovery/[^"]*`) → `page.goto(resetUrl)` → fill new password (`UatMemberReset2!`) + confirm → submit → expect Authentik's success screen → sign out → sign in again with the new password → land on `/me`. | `${AUTHENTIK_URL}/if/flow/recovery/` via the link from Step 1 | `expect(page.url()).toMatch(/\/me$/)` after the second sign-in. Screenshot: `step-002-happy-reset-complete.png`. **Honesty note for TestDesigner:** post-reset, Authentik's default flow redirects to `/if/user/#/settings` (per `user_decisions.post_reset_redirect: "Authentik default redirect to /me is acceptable for v1"` in handoff.yaml — though the actual default is `/if/user/#/settings`, not `/me`; the user accepted this). The test asserts ONLY that the second sign-in lands on `/me`, not that the post-reset redirect itself lands on `/me`. |
| 3 | `Step 003 — Negative path: unknown email returns neutral copy without leaking user enumeration` | AC-4 | Click "Forgot password?" → enter `nobody-here-${Date.now()}@example.com` → submit → expect the Authentik stage to render the canonical neutral copy (`/if an account exists|you'll receive an email/i`) → assert Mailpit has NOT received any new email addressed to that address (`GET /api/v1/messages` filtered by recipient contains the same set as before). | `${AUTHENTIK_URL}/if/flow/recovery/` via the link from Step 1 | Neutral copy visible AND Mailpit message count for the unknown recipient == 0. Screenshot: `step-003-negative-neutral-copy.png`. **Honesty note:** Authentik's actual neutral wording is "If an account with this email exists, you'll receive an email shortly." Match the regex liberally. |
| 4 | `Step 004 — Recovery email subject is branded, not Authentik default` | AC-7 (E2E companion) | After Step 2 reaches Mailpit, read the email's `Subject` header from `GET /api/v1/messages/<id>` and assert `subject === "Reset your AI Qadam password"`. | Step 2's fetched email | `expect(email.Subject).toBe("Reset your AI Qadam password")`. This complements the bats-level API probe (#2 in the integration table). |
| 5 | `Step 005 — Existing BP-UAT-009 sign-in flow not regressed` | AC-5 | Re-run BP-UAT-009 by importing its test bodies OR by running the spec via `test.step` from this file (TestDesigner picks the lighter one). The honest path: this spec does NOT re-implement BP-UAT-009's assertions; TestRunner invokes `apps/e2e/tests/uat/BP-UAT-009.spec.ts` as a separate Playwright run (gating on its exit code). | `pnpm --filter e2e playwright test apps/e2e/tests/uat/BP-UAT-009.spec.ts` (run in TestRunner's step) | BP-UAT-009 spec exit code == 0. Recorded in `07-test-results.md` as "re-run, 0 failures". |
| 6 | `Step 006 — Anonymous user lands on recovery flow at expected URL with no application-side redirect` | AC-1 (UI side) | `page.goto(${AUTHENTIK_URL}/if/flow/recovery/)` directly; assert page renders the identifier stage (`input[name="uidField"]` or `input[name="email"]`). | `${AUTHENTIK_URL}/if/flow/recovery/` | `expect(identifierField).toBeVisible()` AND page URL is still `${AUTHENTIK_URL}/if/flow/recovery/` (no redirect to default-authentication-flow). Screenshot: `step-006-recovery-direct-url.png`. |

### Authentik form-filler for the recovery flow (pattern for TestDesigner to author)

The recovery flow has 3 input stages, distinct from the sign-in flow's 2:
1. **Identifier stage** — `input[name="uidField"]` + Continue.
2. **New-password stage** — TWO password fields (`input[name="password"]` and a confirm field), labelled by Authentik as "Password" and "Password (repeat)". Use `pressSequentially` for both, then Continue.
3. **Done stage** — Authentik's "Successfully changed password" page with a Continue button.

TestDesigner MUST reuse the `pressSequentially` discipline from `BP-UAT-009.spec.ts:103` because Authentik's web-component form fields patch their own value-change handling and `.fill()` does not register with their controlled-input state (confirmed observation in `BP-UAT-009.spec.ts:64-72`).

### Mailpit reader helper (pattern for TestDesigner to author)

Mirror the curl idiom from `scripts/uat-preflight-email.sh`: GET `http://localhost:8025/api/v1/messages` returns `{"total": N, "messages": [...]}`. Each message has `ID`, `From`, `To: [{Address, ...}]`, `Subject`, `Created`. Then `GET /api/v1/message/<ID>` returns the body (raw MIME — strip quoted-printable + base64 transfer encoding before regexing for the URL).

Polling cadence: 200 ms backoff, max 30 s total — recovery emails arrive in well under 5 s in local UAT (Mailpit captures synchronously).

### Out-of-scope for this workflow (explicit, per AGENTS.md §6.1 honesty disclosure)

- **Prod-host assertion against `https://auth.aiqadam.org/if/flow/recovery/`.** The script's allow-list accepts `auth.aiqadam.org`, but our test infrastructure only has `localhost:9000`. The TestRunner does not have network reach to `auth.aiqadam.org`. Flag in `07-test-results.md` Honesty disclosures as **deferred**, queued against a future prod-bootstrap workflow (`wf-2026XXXX-prod-bootstrap-recovery`).
- **`web-next` parallel surface.** `apps/web-next/src/pages/auth/sign-in.astro` is also redirect-only (mirrors `apps/web` per impact-analysis Step 2 critical refinement). The recovery flow runs on the same Authentik login UI, so once `Brand.flow_recovery` is bound, both surfaces' sign-in renders the link. No additional test needed beyond Step 1. **Do not** create `BP-USR-PWRESET-web-next.spec.ts` — that would be a duplicate.
- **Rate-limit verification.** Authentik owns the rate-limit policy on `default-recovery-flow`; this PR doesn't add rate-limiting code. No test.

---

## Acceptance Criteria → Test Mapping

| AC | Test level | Test description | File | Key constraint satisfied |
|---|---|---|---|---|
| AC-1 (recovery flow enabled, `/if/flow/recovery/` resolves locally) | Integration (bats) | bats #3 — HTTP 200 against the recovery URL | `scripts/tests/provision-authentik-recovery-flow.bats` | ✅ Documents the before-state (404) in the comment; asserts after-state (200) |
| AC-1 (UI side) | E2E (Playwright) | Step 6 — direct navigation to `/if/flow/recovery/` renders the identifier stage | `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` | — |
| AC-2 ("Forgot password?" link visible on Authentik login UI) | E2E (Playwright) | Step 1 — link visible with correct href | `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` | — |
| AC-3 (happy path: email → Mailpit → link → reset → sign in) | E2E (Playwright) | Step 2 — full happy path | `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` | — |
| AC-4 (negative: neutral copy, no enumeration) | E2E (Playwright) + API probe (Mailpit) | Step 3 — neutral copy + zero messages to unknown recipient | `apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts` | — |
| AC-5 (BP-UAT-009 not regressed) | E2E (Playwright, re-run) | Step 5 — `pnpm --filter e2e playwright test apps/e2e/tests/uat/BP-UAT-009.spec.ts` exits 0 | (re-uses existing spec; TestRunner step) | — |
| AC-6 (BP-USR-PWRESET.md doc exists AND spec exists) | Integration (bats) | bats #6 — `test -f` both files | `scripts/tests/provision-authentik-recovery-flow.bats` | — |
| AC-7 (recovery email subject is branded) | Integration (bats) + E2E (Playwright) | bats #2 (API probe on `/api/v3/core/email-templates/`) AND E2E Step 4 (Mailpit header check) | Both files | — |
| **KEY CONSTRAINT (Step 6)** — regression test that would have failed before the fix | Integration (bats) | bats #3 — comments document "before fix: HTTP 404; after fix: HTTP 200"; assertion is on the after-state | `scripts/tests/provision-authentik-recovery-flow.bats` | **✅ explicitly the canonical "before/after" regression assertion** |

Every AC has at least one test. AC-1, AC-7 each have two (bats + E2E) for belt-and-suspenders coverage of the IdP-side change and the user-visible side.

---

## Test execution order (for TestRunner)

Per AGENTS.md §6.1, the Orchestrator brings up the docker stack first. Then:

1. **Pre-flight** (orchestrator responsibility): all 6 services healthy + `curl -fsS http://localhost:9000/if/flow/recovery/` returns 200 (otherwise the whole suite is meaningless — the provision script didn't run).
2. **bats integration suite** (`pnpm bats scripts/tests/provision-authentik-recovery-flow.bats`) — runs first because it's fast (~10 s) and pins the IdP API state.
3. **E2E happy + negative** (`pnpm --filter e2e playwright test apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts`) — depends on bats #3 (URL reachable).
4. **E2E BP-UAT-009 re-run** (`pnpm --filter e2e playwright test apps/e2e/tests/uat/BP-UAT-009.spec.ts`) — depends on the same Authentik state.
5. **QualityGate** (Step 8) writes `09-quality-gate.md` with the AC-by-AC disposition.

If bats #3 fails, E2E suite is skipped — there's no point clicking through a flow whose URL doesn't resolve.

---

## Notes for the next step (TestDesigner)

- **Match `BP-UAT-009.spec.ts` style verbatim.** Top-of-file honesty-notes block, `shot()` helper, `hideDevToolbar()` helper, `UAT_*` env-var naming, `pressSequentially` for Authentik form fields, role-based Continue button, polling `waitFor` for stage transitions.
- **Don't re-implement BP-UAT-009 assertions in Step 5.** Invoke the existing spec as a separate Playwright run; record its exit code.
- **Mailpit helper signature (suggested):** `async function fetchRecoveryEmailFor(page: Page, recipient: string, timeoutMs = 30_000): Promise<{ Subject: string; bodyUrl: string } | null>`. Lives in a private helper inside the spec file (one consumer, no need for `apps/e2e/support/`).
- **Honesty note about `/me` vs `/if/user/#/settings` post-reset redirect.** The user accepted the Authentik default. If you observe a redirect that lands on `/if/user/#/settings` rather than `/me`, that is EXPECTED (per `user_decisions.post_reset_redirect` in handoff.yaml), not a test failure. Record the observation in the honesty notes block.
- **No new dependencies.** Use existing `playwright`, `@playwright/test`, `node:fs/promises`, `node:path`, `node:url` (all already in `apps/e2e/package.json`). bats + curl.exe are already in the toolchain.

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "Strategy complete. 7 bats tests in scripts/tests/provision-authentik-recovery-flow.bats + 6 E2E tests in apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts + 1 re-run of apps/e2e/tests/uat/BP-UAT-009.spec.ts cover all 7 ACs. KEY CONSTRAINT (issue Step 6) satisfied by bats #3 — regression test that documents the original bug (404 before fix, 200 after fix) and asserts the after-state. Rubric score-vs-actual divergence acknowledged: no vitest unit tests (no application code added; the change is IdP wiring against a live Authentik)."
```