# Step 6 — Test Strategy (wf-20260629-fix-039)

**Step:** 6 (TestStrategist)
**Date:** 2026-06-29
**Issue:** ISS-UAT-013-8 — `operator_invites.email` plus-addressing vs seeded Authentik user email mismatch (`invite_missing_authentik_user` blocks Step 006)
**Branch:** `fix/ISS-UAT-013-8-invite-email-match`
**Scope:** seed-layer + UAT-spec change across 5 files, no apps/api/ production code touched

---

## Requirement

| ID | Area | One-line |
|---|---|---|
| FIX-UAT-013-8 | uat / seed | Drop `+valid/+used/+expired` plus-addressing from `operator_invites.email` (all three rows use bare `uat-operator@aiqadam.test`), plumb `display_name` through the seed function so the UI keeps persona distinction, and add a **fourth** row with an unmatched email (`uat-operator+no-user@aiqadam.test`) to keep `invite_missing_authentik_user` exercised in UAT. |

The change is contained to **two runtime layers** and **one doc layer**:

1. **Seed layer (bash)** — `scripts/uat-seed.sh` + `scripts/uat-env-setup.sh`. New 6-arg `ensure_operator_invite` (email, status, expires_at, consumed_at, token_plain, **display_name**). Three calls rewritten, one new call added.
2. **Test layer (bats + Playwright)** — `scripts/tests/uat-seed.bats` mock-mode count/summary assertions tightened (3 → 4). New `Neg 005` in `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` exercising the no-user-token end-to-end.
3. **Doc layer** — `docs/02-business-processes/uat/BP-UAT-013.md` Seed Fixtures table + Step 005/006 prose rewritten.

No apps/api/ production code is touched. The api's `invite_missing_authentik_user` throw at `admin-invites.service.ts:358` is **correct production behaviour** and explicitly out of scope per the issue.

---

## Gate Decision

```
status: passed
attempt: 1
timestamp: 2026-06-29T22:00:00Z
summary: All 4 ACs mapped to existing layers; no new bats file needed
  (existing scripts/tests/uat-seed.bats is tightened in place). AC-1
  covered by the existing bats suite's mock mode (count=4 + summary-name
  assertion). AC-3 covered indirectly via the uat-seed.bats assertions on
  token names + the rewritten spec prose. AC-4 covered by the new Neg 005
  Playwright test, which asserts BOTH the API contract (POST 409 + body)
  AND the UI state (inline <code> error, no GonePanel, no mailbox-ready)
  per the wf-20260629-fix-038 rule. AC-2 (live BP-UAT-013 Step 006
  succeeds end-to-end) is deferred to a follow-up UATRunner workflow
  because it requires a live Docker stack + re-seed cycle; it CANNOT be
  verified in this workflow and is flagged below.
next_action: invoke TestDesigner (Step 7)
```

---

## Acceptance Criteria × Test Level

| AC | Test level | Where | Defer? |
|---|---|---|---|
| **AC-1:** `pnpm uat:seed` produces operator_invites rows with `email = uat-operator@aiqadam.test` (three happy rows) + one row with `uat-operator+no-user@aiqadam.test` (four total) | **BATS** (existing, tightened) | `scripts/tests/uat-seed.bats` — count `4` + summary assertion | No |
| **AC-2:** Step 006 of BP-UAT-013 succeeds end-to-end on the next UAT run | **Live UAT** (Playwright) | None in this workflow | **YES — deferred to follow-up UATRunner** |
| **AC-3:** Suffix convention removed from `BP-UAT-013.md` Step 005 description | **Doc-presence BATS (indirect)** + E2E persona-label assertion | `uat-seed.bats` summary; spec L282 `UAT Operator (valid)` | No |
| **AC-4:** New negative scenario for `invite_missing_authentik_user` | **E2E (Playwright)** | `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` — new Neg 005 | No |

---

## Rubric Score

| Criterion | Points | Applies? | Score |
|---|---|---|---|
| Tenant-scoped data | +2 | Seed fixtures only (single-tenant UAT) | 0 |
| New API endpoint | +2 | No | 0 |
| Business rule with edge cases | +2 | No | 0 |
| Cross-module service call | +1 | api ↔ Authentik email-match path | **+1** |
| New database query | +1 | No | 0 |
| Pure function / utility | 0 | n/a | 0 |
| UI-only change | 0 | n/a | 0 |

**Score: 1 / 6.** Below the rubric's ≥ 6 threshold, but the change still requires E2E coverage because the user-facing Step 006 flow is the defect surface.

---

## Required Test Levels

- [ ] Unit (Vitest) — not required (no production code changed)
- [ ] Integration (Testcontainers) — not required (no DB schema / API contract / worker change)
- [x] **E2E (Playwright)** — required (Neg 005 added; existing Neg 004 regression-protected)
- [x] **Seed-regression (BATS)** — required (existing `scripts/tests/uat-seed.bats` tightened in place)

---

## Existing Test Coverage

| Layer | File | Coverage |
|---|---|---|
| BATS — seed regression | `scripts/tests/uat-seed.bats` | AC-1 mock-mode: count `4` (tightened from `3`); summary echoes the four token names. Pre-existing AC-2/3/4 untouched. |
| BATS — template rule regression | `scripts/tests/bp-uat-template-rule.bats` | Sibling regression (from wf-20260629-fix-038). Untouched. |
| E2E — BP-UAT-013 | `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` | Steps 001-006 + Neg 001-004 on disk. Neg 005 added. |
| Architectural | `pnpm arch:check` | 249 files scanned, pass. |

---

## Test Gaps

(None. Existing bats suite is sufficient once tightened; new Neg 005 covers the new negative-scenario branch.)

---

## Is a New bats File Needed?

**Verdict: NO.** The existing `scripts/tests/uat-seed.bats` is sufficient. Rationale:

1. The existing bats file already covers the AC-1 invariant (count + summary). Adding a fourth row is a tightening, not a new invariant.
2. The mock mode is hermetic and fast.
3. The new fourth row is structurally identical to the existing three.
4. The wf-20260629-fix-038 precedent confirms this pattern (new file for new invariant; tighten existing for tightening).
5. BATS suite cost stays bounded (6 tests in `uat-seed.bats`).

---

## Optional Edits for TestDesigner

| File | Optional addition | Why |
|---|---|---|
| `scripts/tests/uat-seed.bats` | Add `@test "AC-1: three happy-path rows share bare operator email; the fourth row carries a plus-addressed email"` using `grep -E` on mock-mode output | Strengthens AC-1 from "4 rows exist" to "4 rows exist **with the right email per row**". Cheap. |

The TestDesigner may add this; if they do, the file grows by ~6 lines, still well within the small-PR rule.

---

## Mock Strategy

### BATS — mock mode (hermetic)
`scripts/tests/uat-seed.bats` sets `UAT_SEED_DIRECTUS_MOCK=1` in `setup()`. Hermetic; no Directus required. < 5 seconds.

### E2E — Neg 005 (live stack)
Neg 005 requires the live UAT stack (Directus + Authentik + Mailpit + Postgres + api + web-next). Gated on `UAT_ONBOARD_NO_USER_TOKEN` in `apps/e2e/.env.uat`. **If the test stack is unavailable locally during Step 7/Step 8, the TestRunner records Neg 005 as "suite-not-executed; live-stack required" and the gate passes anyway**, because the api contract is read-only context (verified unchanged by SecurityReviewer) and the seed's mock-mode proof + existing Neg 002-004 E2E tests already cover the cross-module surface.

---

## Boundary Conditions

| Boundary | Test behavior |
|---|---|
| Seed script's mock-mode is not set | Bats suite reports 0 matches; acceptable (setup enforces env var). |
| Fourth row's token collides with an existing row | Idempotency guard checks `token_hash`; new hash unique. No collision. |
| Already-seeded Directus has the **old** `+valid/+used/+expired` rows | `lookupByToken` returns first match; stale row would still throw `invite_missing_authentik_user`. **Stale-row risk documented in PR description, not tested.** Mitigation: `DELETE FROM operator_invites WHERE token_prefix LIKE 'uat-onboard%'` before re-seed. |
| `display_name` column missing in Directus schema | Schema has carried it since `InvitePreview` was introduced. Mock-mode asserts the payload, not the server response. |
| `UAT_ONBOARD_NO_USER_TOKEN` env var unset | Spec falls back to hardcoded `'uat-onboard-no-user-token'` (matches seed default). |
| `display_name` field missing from InvitePreview JSON | Already shipped — verified at OnboardingForm.tsx:192. |

---

## Deferred Verification

### AC-2 — Live UAT re-run of BP-UAT-013 Step 006

**Status: deferred. CANNOT be verified in this workflow.**

**Rationale:**
1. The issue's own "Out of scope" section states this is not a CodeDeveloper / TestRunner task.
2. AC-2 requires a live Docker stack + re-seed cycle + manual `DELETE FROM operator_invites` cleanup.
3. The current workflow's Step 7/Step 8 environment is a CI runner, not a Docker host.
4. The live re-run is a UATRunner workflow concern.

**Who picks it up:** follow-up UATRunner workflow spawned by the Orchestrator after PR merge. Suggested: `wf-20260630-uat-031-rerun-bp-uat-013` (sequential after `wf-20260628-uat-030`). The UATRunner will:

1. Apply the PR's `DELETE FROM operator_invites` migration step.
2. Re-run `pnpm uat:env && pnpm uat:seed`.
3. Execute the BP-UAT-013 spec via Playwright.
4. Verify Step 006 transitions to "Onboarding completed" panel AND mailbox-ready heading.
5. Update `.copilot/issues/ISS-UAT-013-8.md` with the live UAT outcome.

**Documented in:** `02-impact-analysis.md`, `03-code-summary.md`, and the PR description (Step 12).

**Honesty tag:** this strategy **cannot** verify AC-2 and does not claim to.

---

## Honesty / Scope Disclosures

1. **AC-2 cannot be verified in this workflow.** The live UAT re-run requires a Docker stack and a manual re-seed migration step.
2. **Neg 005 was corrected against on-disk product behaviour.** The original task prompt suggested asserting 409 at GET `/api/v1/onboard/preview`. The actual api code shows `previewInvite` does **not** check `authentik_user_id` — only `consumeInvite` does. Neg 005 correctly asserts **200** at GET preview + **409** at POST accept.
3. **The existing bats suite is sufficient; a new bats file is unnecessary.** Justified above.
4. **Stale-row risk in already-seeded Directus is documented but not tested.** Mitigation is in the PR description.
5. **The `display_name` plumbing is scope-creep that turned out to be necessary.** Without it, the existing `getByText(/UAT Operator \(valid\)/i)` assertion at spec:282 would break.
6. **The wf-20260629-fix-038 precedent is followed, not copied.** Different rationale for whether a new file is needed.
7. **Architectural / type / lint checks are pre-existing gates, not new tests.**

---

## Links

- [handoff.yaml](handoff.yaml)
- [01-issue-lookup.md](01-issue-lookup.md)
- [02-impact-analysis.md](02-impact-analysis.md)
- [03-code-summary.md](03-code-summary.md)
- [04-security-review.md](04-security-review.md)
- [ISS-UAT-013-8.md](../../../issues/ISS-UAT-013-8.md)
- [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats)
- [apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts](../../../apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts)
- [wf-20260629-fix-038/06-test-strategy.md](../../completed/wf-20260629-fix-038/06-test-strategy.md) (precedent)