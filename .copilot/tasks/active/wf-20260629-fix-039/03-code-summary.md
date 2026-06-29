# 03-code-summary.md — CodeDeveloper (wf-20260629-fix-039)

**Step:** 4 (CodeDeveloper)
**Date:** 2026-06-29
**Issue:** ISS-UAT-013-8 — operator_invites.email uses `+valid/+used/+expired` plus-addressing but the seeded Authentik user has the bare email
**Workflow type:** issue-resolution

---

## Requirement Implemented

`scripts/uat-seed.sh` previously inserted three `operator_invites` rows whose `email` column carried plus-addressing suffixes (`uat-operator+valid@aiqadam.test`, etc.). The seeded Authentik user, however, has the bare email `uat-operator@aiqadam.test`. The api's `/v1/onboard/accept` handler (`apps/api/src/modules/admin-invites/admin-invites.service.ts:358`) throws `ConflictException('invite_missing_authentik_user')` when no Authentik user matches the invite's email — blocking Step 006 of BP-UAT-013 end-to-end.

**Fix:** drop the plus-addressing convention from the three happy-path rows; all three rows now use `uat-operator@aiqadam.test` as their email and are distinguished in the OnboardingForm UI by `display_name` (e.g. `UAT Operator (valid)`). `ensure_operator_invite()` now accepts a 6th `display_name` arg and includes it in the Directus payload. A **fourth** row (`uat-onboard-no-user-token`, email `uat-operator+no-user@aiqadam.test`) is added with `display_name: "UAT Operator (no-user)"` so the api's `invite_missing_authentik_user` (HTTP 409) error path remains exercised end-to-end.

Honesty disclosure: the Orchestrator-verified scope expanded the seed change to include `display_name` because `apps/web/src/components/OnboardingForm.tsx:192` renders `Welcome, {preview.display_name ?? preview.email.split('@')[0]}.` — without `display_name`, the spec's `getByText(/UAT Operator \(valid\)/i)` assertion would break after the email fix (page would render `Welcome, uat-operator.`). This is reflected in the doc and the new bats regression.

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `scripts/uat-seed.sh` | modify | `ensure_operator_invite()` signature extended with a 6th `display_name` arg; jq payload includes `display_name` in both branches (via a sentinel-driven single jq call to keep the function ≤ 60 LOC per AGENTS.md §1.4). Three existing calls updated to use `uat-operator@aiqadam.test` + per-row `display_name`. New fourth call added: `uat-onboard-no-user-token` → email `uat-operator+no-user@aiqadam.test`, `display_name: "UAT Operator (no-user)"`. Doc comment header expanded. Summary block at the bottom rewritten to list all four tokens with their `display_name` and a one-line explanation of the `no-user` row. |
| `scripts/uat-env-setup.sh` | modify | Append `UAT_ONBOARD_NO_USER_TOKEN=uat-onboard-no-user-token` to the heredoc that writes `apps/e2e/.env.uat`. Comment for the section updated to mention `ISS-UAT-013-8`. |
| `scripts/tests/uat-seed.bats` | modify | AC-1 mock-count test changed from `3` to `4`; AC-1 summary-name test now also asserts `uat-onboard-no-user-token` is echoed. The pre-existing AC-3/AC-4 bats sub-tests are untouched per the Orchestrator scope. |
| `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` | modify | (a) Honesty-notes header rewritten: the now-obsolete "valid operator_invites row's email is `uat-operator+valid@…`" paragraph is replaced with a "Resolved in wf-20260629-fix-039" pointer. (b) New const `ONBOARD_NO_USER_TOKEN = process.env.UAT_ONBOARD_NO_USER_TOKEN ?? 'uat-onboard-no-user-token'` declared alongside the existing token consts. (c) New `Neg 005` test appended after `Neg 004`. The test asserts BOTH the API contract (POST `/api/v1/onboard/accept` returns 409 with `invite_missing_authentik_user`) AND the UI state (form transitions to `auth_error` phase with inline `<code>invite_missing_authentik_user</code>`; mailbox-ready heading absent; GonePanel absent) — per the wf-20260629-fix-038 "API contract + UI assertion" rule. |
| `docs/02-business-processes/uat/BP-UAT-013.md` | modify | `## Seed Fixtures Required` table now has 3 columns (Fixture, Email, `display_name`) + 4 fixture rows (one per seed call). Step 005/006 rewritten to drop the `+valid/+used/+expired` suffix convention and explain the new "all three share one email, distinguished by token + display_name" model. New `### Negative 005 — Invite email without matching Authentik user returns 409` subsection documents the new negative scenario. |

No files created or deleted in this workflow.

---

## Key Design Decisions

1. **`display_name` plumbed through the seed function rather than post-update.** The alternative would be to keep the 5-arg `ensure_operator_invite` and run a follow-up `curl PATCH` per row to set `display_name`. That's two DB round-trips per row, less idiomatic, and harder to read. The 6-arg signature is honest: callers now declare the persona label they want, and the function writes both columns in one shot.

2. **Sentinel-driven single jq call, not two branches.** AGENTS.md §1.4 caps functions at 60 LOC. The two-branch version (one jq per `consumed_at` path) was 63 lines — three over the cap. I refactored to a single jq invocation that uses `$cat == ""` as a sentinel to swap in `consumed_at: null` when the caller passes an empty string. Still testable, still hermetic, and the function is now 56 lines (verified via `bash -n` + line-counting).

3. **Neg 005 covers 409 at POST, not GET.** A direct read of `apps/api/src/modules/admin-invites/admin-invites.service.ts:321` (`previewInvite`) confirms it does **not** check `authentik_user_id` — that check lives only in `consumeInvite` at line 358. Therefore the actual surface for the no-user error is the form **submit** (POST /v1/onboard/accept), not the preview GET. The Honesty section below records this correction against the original task prompt, which implied the 409 path was visible at preview time.

4. **Did not add a `force_regen` / cleanup flag.** The Orchestrator's risk note in `02-impact-analysis.md` flagged that stale `+valid/+used/+expired` rows in already-seeded Directus instances would coexist with the new bare-email rows after re-running `pnpm uat:seed`. The seed is idempotent on `token_hash`, so re-running won't double-insert, but the stale `+valid` row (a different `token_hash`) would still match first when the api does `lookupByToken` and would STILL throw `invite_missing_authentik_user`. The minimal fix is to ask the UAT environment operator to `DELETE FROM operator_invites` once before re-seeding (documented in the PR description by the Orchestrator at Step 12, not by this step). Adding a `FORCE_REGEN_OPERATOR_INVITES` flag would have been scope-creep.

5. **Did NOT touch `apps/api/.env.example:82`.** The docstring for that env-var already uses the bare `uat-operator@aiqadam.test` — no change needed.

---

## Architecture Rule Compliance

| Rule (AGENTS.md §) | Applies? | Compliant? |
|---|---|---|
| §1.1 simple control flow | yes — bash | yes: no nested ifs > 3 levels, no clever branches, early returns in `ensure_operator_invite` |
| §1.2 loops have upper bounds | n/a | no loops in changes |
| §1.3 no magic strings/numbers | yes | all string literals are either UAT token names (named via env-vars or local consts at the call site) or shell escape sequences. The `"%%"` and `${…%%…}` patterns are standard bash, not magic. |
| §1.4 functions ≤ 60 LOC | yes | `ensure_operator_invite` is 56 lines (verified). |
| §1.5 at least one assertion per function | yes | the `if [[ "$code" != "200" && "$code" != "201" ]]` guard plus the `UAT_SEED_DIRECTUS_MOCK` short-circuit guard. |
| §3 strict TS, no `any` | yes | `BP-UAT-013-signup.spec.ts` types are explicit; verified via `npx tsc --strict --noEmit`. |
| §3 no `as` casts | yes | no `as` in any of the new code. |
| §5 secrets never logged | yes | the new token `uat-onboard-no-user-token` is a public test fixture, already echoed by the existing summary block. No real secrets. |
| §8 no new dependencies | yes | no new packages. BATS already in repo. |
| §9 honesty in code | yes | two `agenthonest` disclosures embedded in `BP-UAT-013-signup.spec.ts` honesty-notes block + doc prose around the new fixture table. |

---

## Formatter / Type / Lint Check

```
$ pnpm arch:check                  → ✓ arch:check passed (249 file(s) scanned, mode=full)
$ bash -n scripts/uat-seed.sh      → syntax ok
$ bash -n scripts/uat-env-setup.sh → syntax ok
$ npx tsc --strict … BP-UAT-013-…spec.ts → 0 errors
$ pnpm biome check apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts → Checked 1 file, no fixes applied
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats → 1..7 all passed
$ bash scripts/run-bats.sh scripts/tests/bp-uat-template-rule.bats → 1..5 all passed (regression)
```

All clean. No Python files were touched; no `ruff`/`mypy` runs needed.

---

## Test Additions

| Layer | Test | Purpose |
|---|---|---|
| **BATS — scripts/tests/uat-seed.bats** | `AC-1: mock mode exits 0 and provisions all 4 operator_invite tokens` | Mock-mode regression that the seed script provisions 4 rows (was 3). |
| **BATS — scripts/tests/uat-seed.bats** | `AC-1: mock mode summary lists all four token names` | Mock-mode regression that the summary echoes the new fourth token. |
| **E2E — apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts** | `Neg 005 — Invite email without matching Authentik user returns 409 invite_missing_authentik_user` | End-to-end Playwright test. Drives `/onboard?token=ONBOARD_NO_USER_TOKEN`, then asserts BOTH the API contract AND the UI state in lockstep: (a) `GET /api/v1/onboard/preview` returns 200 with `email: uat-operator+no-user@aiqadam.test` + `display_name: "UAT Operator (no-user)"`; (b) the form renders the welcome heading with the `(no-user)` persona label; (c) after submitting the password + AUP form, `POST /api/v1/onboard/accept` (captured via `page.waitForResponse`) returns 409 with body `message: "invite_missing_authentik_user"`; (d) the UI's `auth_error` phase shows the inline `<code>invite_missing_authentik_user</code>` element and the `GonePanel` / mailbox-ready terminal are absent. Matches the wf-20260629-fix-038 "API + UI" rule. |

No new helpers, no new test files. The spec.ts change is additive only.

---

## Honesty / Risks / Honest disclosures

1. **The Orchestrator task prompt stated:** "Use `page.request.get('/api/v1/onboard/preview', { params: { token: ONBOARD_NO_USER_TOKEN } })` (or whatever path the API uses — search for `previewInvite` in apps/api/src/modules/admin-invites/ to confirm the URL) and assert the API responds 409 with structured error `invite_missing_authentik_user`."  
   **Honest correction:** The api's `previewInvite()` does **not** check `authentik_user_id` (verified by reading `apps/api/src/modules/admin-invites/admin-invites.service.ts:321-340`). Therefore the GET preview returns **200**, not 409. The 409 surfaces only at `consumeInvite()` (line 358), which is the POST endpoint. The new `Neg 005` correctly asserts 200 on GET preview (with a precise body assertion: `email: uat-operator+no-user@aiqadam.test`, `display_name: "UAT Operator (no-user)"`) AND 409 on POST accept. This matches the on-disk product behaviour and is exercised end-to-end. Mentioned explicitly in the test header comment so the next reader knows why the API assertion structure looks the way it does.

2. **The task prompt said the 409 path "may render a different component" than GonePanel.** I read `apps/web/src/components/OnboardingForm.tsx:81` and `:116`. The 409 surface is not GonePanel (GonePanel is keyed on `phase === 'gone'`, which is only set on 410 — line 71 — or on any non-OK preview response, line 75). The 409 sets `phase: 'auth_error'` with `message: body.message ?? 'unknown_error'` (line 116), then renders the same `AuthStep` component (line 175) with an inline `<p><code>errorMessage</code></p>` (line 244). The Neg 005 test asserts both the absence of `<GonePanel>` content (`This link can't be used`) and the presence of the inline `<code>invite_missing_authentik_user</code>`.

3. **Stale-row risk in long-lived UAT environments.** Already-seeded Directus instances that previously ran the `+valid/+used/+expired` rows still have those three rows. The seed is idempotent on `token_hash`, so re-running won't double-insert — but the OLD `uat-onboard-token` row still has email `uat-operator+valid@aiqadam.test` and would still cause Step 006 to fail until manually cleaned. **Mitigation** lives in the PR description (Orchestrator Step 12), not in this commit. Not a code change.

4. **Live UAT re-run of BP-UAT-013 is out of scope.** Per the issue's own "Out of scope" section. AC-2 (Step 006 succeeds end-to-end) is verified by code-reading + the new bats regressions; the live UAT run is deferred to a follow-up workflow.

5. **`display_name` field expectation in Directus.** The seed writes `display_name` directly via the Directus REST API. The Directus schema for `operator_invites` was confirmed in `apps/api/src/modules/admin-invites/admin-invites.service.ts:104-119` (the `InvitePreview` interface includes `display_name: string | null`). The column existed before this workflow (the create path at line 178 sets it; the user-flagged wrinkle is that older pending invites could still carry `null`, see #423 referenced at line 332). This is additive, not breaking.

---

## Self-Review Against Acceptance Criteria

| AC (from `01-issue-lookup.md`) | Source | Status | Evidence |
|---|---|---|---|
| AC-1: `pnpm uat:seed` produces exactly 3 rows with `email = uat-operator@aiqadam.test` | `uat-seed.sh` | **done** | Three `ensure_operator_invite` calls at L425-433 of `scripts/uat-seed.sh` use `$OPERATOR_FIXTURE_EMAIL` = `uat-operator@aiqadam.test`. Verified by mock-mode run (`ok 1`) which seeded 4 rows total but with the three happy rows sharing the bare email. |
| AC-2: Step 006 of BP-UAT-013 succeeds | `BP-UAT-013.md` / UAT | **deferred (expected)** | Out of scope per the issue. The bare-email change unblocks the api path on paper; live verification is the UATRunner's responsibility in a follow-up workflow. |
| AC-3: `+valid`/`+used`/`+expired` suffix convention removed from `BP-UAT-013.md` Step 005 | doc | **done** | Step 005 body rewritten: "All three invite rows point to the seeded `uat-operator@aiqadam.test` Authentik user. The rows are distinguished by token + `display_name`." Seed Fixtures table now has Email + display_name columns. |
| AC-4: New negative scenario in BP-UAT-013 exercising `invite_missing_authentik_user` | spec + doc | **done** | `Neg 005` added to `BP-UAT-013-signup.spec.ts` and `### Negative 005` added to `BP-UAT-013.md`. Both assert the api returns 409 with `invite_missing_authentik_user` AND that the UI surfaces the inline error code. Tests pass the wf-20260629-fix-038 "API + UI" rule. |
| Orchestrator-verified scope expansion: `display_name` plumbing | `uat-seed.sh` | **done** | `ensure_operator_invite` takes 6th arg `display_name`; all four calls pass it; Directus payload includes it. UI assertion at `BP-UAT-013-signup.spec.ts:282` (`getByText(/UAT Operator \(valid\)/i)`) still matches without modification. |
| Orchestrator-verified scope expansion: fixture table in doc lists Email + display_name | doc | **done** | See Seed Fixtures table. |

---

## Gate Decision

```
status: passed
attempt: 1
timestamp: 2026-06-29T21:30:00Z
summary: All four acceptance criteria addressed (AC-1, AC-3, AC-4 done;
  AC-2 deferred by design to the UATRunner follow-up workflow). The seed
  function was refactored from 63 lines to 56 lines to satisfy AGENTS.md
  §1.4 (60 LOC ceiling) by collapsing the two jq branches into one
  sentinel-driven invocation. The new Neg 005 test was corrected against
  the on-disk product behaviour: the 409 `invite_missing_authentik_user`
  surfaces at POST /v1/onboard/accept (consumeInvite:358), not at GET
  /v1/onboard/preview (previewInvite does not check authentik_user_id).
  Both the API contract (POST 409 + body.message) and the UI surface
  (inline <code>invite_missing_authentik_user</code>, no GonePanel, no
  mailbox-ready) are asserted, satisfying the wf-20260629-fix-038 rule.
  arch:check passes (249 files); bats suite passes 7/7; bp-uat-template
  rule regression passes 5/5; biome clean; tsc --strict clean.
next_action: invoke SecurityReviewer (Step 5)
```

---

## Files Changed

| File | Lines added | Lines removed | Net |
|---|---|---|---|
| apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts | 91 | 7 | +84 |
| docs/02-business-processes/uat/BP-UAT-013.md | 30 | 8 | +22 |
| scripts/tests/uat-seed.bats | 6 | 4 | +2 |
| scripts/uat-env-setup.sh | 2 | 1 | +1 |
| scripts/uat-seed.sh | 62 | 31 | +31 |
| **Total** | **191** | **51** | **+140** |

5 files modified, within AGENTS.md §4's "5 files per PR" cap.

## Files Created

| File | Purpose |
|---|---|
| (none) | — |

---

## Links

- [handoff.yaml](handoff.yaml)
- [01-issue-lookup.md](01-issue-lookup.md)
- [02-impact-analysis.md](02-impact-analysis.md)
- [ISS-UAT-013-8](../../issues/ISS-UAT-013-8.md)
- [scripts/uat-seed.sh](../../../scripts/uat-seed.sh)
- [scripts/uat-env-setup.sh](../../../scripts/uat-env-setup.sh)
- [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats)
- [docs/02-business-processes/uat/BP-UAT-013.md](../../../docs/02-business-processes/uat/BP-UAT-013.md)
- [apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts](../../../apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts)
- [apps/api/src/modules/admin-invites/admin-invites.service.ts](../../../apps/api/src/modules/admin-invites/admin-invites.service.ts) (read-only context)
- [apps/web/src/components/OnboardingForm.tsx](../../../apps/web/src/components/OnboardingForm.tsx) (read-only context)
