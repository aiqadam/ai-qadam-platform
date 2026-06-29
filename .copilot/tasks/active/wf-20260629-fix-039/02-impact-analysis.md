# Step 2 — Impact Analysis (wf-20260629-fix-039)

**Date:** 2026-06-29
**Issue:** ISS-UAT-013-8
**Agent:** ImpactAnalyzer

---

## Validated Requirement

**ISS-UAT-013-8** — `operator_invites.email` field uses `+valid`/`+used`/`+expired` plus-addressing suffixes, but the seeded Authentik user has the bare `uat-operator@aiqadam.test` email. The api's `/v1/onboard/accept` handler (`admin-invites.service.ts:358`) throws `invite_missing_authentik_user` (HTTP 409) because no Authentik user matches the invite email. Fix scope: change all three seeded `operator_invites.email` values to `uat-operator@aiqadam.test`, and add a new negative-scenario row whose email has no matching Authentik user to keep the error path exercised in UAT.

---

## Gate Decision

```
status: passed
attempt: 1
timestamp: 2026-06-29T21:15:00Z
summary: ISS-UAT-013-8 is a tight seed-layer bug with no DB schema change, no
  api contract change, no shared-types change, and no frontend code change.
  The change touches 4 source files (uat-seed.sh, BP-UAT-013.md,
  BP-UAT-013-signup.spec.ts, uat-seed.bats) plus optional uat-env-setup.sh.
  Live re-run of BP-UAT-013 against the local stack is deferred to a
  follow-up workflow because it requires running the full Docker compose
  stack + re-seed cycle, which is out of scope per the issue. All blast
  radius is contained to UAT test fixtures and the UAT business-process
  doc. No production code path is affected.
next_action: invoke CodeDeveloper (Step 4) with the file/line targets
  below. TestDesigner (Step 7) will tighten the existing bats regression
  for the new 4-row count.
```

---

## Required Changes (table)

| File | Lines | Reason | Risk if missed |
|---|---|---|---|
| [scripts/uat-seed.sh](../../../scripts/uat-seed.sh) | 410, 413, 416 | The three `ensure_operator_invite` calls hard-code the `+valid`/`+used`/`+expired` plus-addressed emails. Must be changed to bare `uat-operator@aiqadam.test` for all three rows. **AND** each call must pass a `display_name` arg (`UAT Operator (valid)`, `(used)`, `(expired)`) so the UI keeps its persona distinction (see Items Flagged below). This requires extending `ensure_operator_invite`'s signature to accept a 6th arg `display_name` and include it in the jq body. | **Seed re-run keeps the bug:** Step 006 of BP-UAT-013 will continue to fail with `invite_missing_authentik_user` (409) every time the UAT stack is rebuilt from scratch. Without display_name, the spec assertion `UAT Operator (valid)` breaks. |
| [scripts/uat-seed.sh](../../../scripts/uat-seed.sh) | append after L416 (new line ~419) | Add a **fourth** `ensure_operator_invite` call with email `uat-operator+no-user@aiqadam.test`, status `pending`, expires_at `+7d`, token_plain `uat-onboard-no-user-token`. This is the new negative-scenario row required by AC-4. | **Loss of negative-scenario coverage:** The api's `invite_missing_authentik_user` code path is no longer exercised in UAT once the three happy-row emails all match. A future refactor that breaks that error path would ship undetected. |
| [docs/02-business-processes/uat/BP-UAT-013.md](../../../docs/02-business-processes/uat/BP-UAT-013.md) | Step 005 (≈L82-95) and Seed Fixtures table (≈L33-43) | Spec doc currently describes the three tokens; AC-3 requires removing any mention of the suffix convention and replacing with a one-sentence note: "all three rows point to the seeded `uat-operator@aiqadam.test` user; the token itself distinguishes them." Also add a `uat-onboard-no-user-token` row to the fixtures table to mirror the new negative scenario. | **Doc drift:** Future UAT runs / operators reading the spec will be confused about why the seeded rows all share an email. Also, the new negative scenario's existence is undocumented. |
| [apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts](../../../apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts) | 57-63 (header comment block) | The honesty-notes comment block at lines 57-63 currently documents the +valid mismatch as a known env/seed gap. After the fix, this is no longer accurate — the honesty note must be rewritten (NOT deleted — replace with a "now resolved via wf-20260629-fix-039" pointer). Leaving it as-is would propagate stale context. | **Stale test-doc contradiction:** Next UATRunner reads the spec, sees the note, and either ignores it (confusing) or flags it as a regression (false positive). |
| [apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts](../../../apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts) | append after Neg 004 (new Neg 005) | Add a new negative test that drives `/onboard?token=uat-onboard-no-user-token`, asserts the api responds 409 with `invite_missing_authentik_user`, and asserts the UI renders an error banner rather than the `GonePanel` (which is for 410). Also requires `const ONBOARD_NO_USER_TOKEN = process.env.UAT_ONBOARD_NO_USER_TOKEN ?? 'uat-onboard-no-user-token'` at lines 80-84. | **Lost coverage of the `invite_missing_authentik_user` api contract.** |
| [scripts/uat-env-setup.sh](../../../scripts/uat-env-setup.sh) | after L474 (append in heredoc) | Add `UAT_ONBOARD_NO_USER_TOKEN=uat-onboard-no-user-token` to the `write_file "$E2E_DIR/.env.uat"` heredoc, so re-running `pnpm uat:env` writes the new env var into `apps/e2e/.env.uat` and the spec picks it up. | **Test depends on `??` fallback only** — works, but couples the test to the spec's hardcoded string. Low risk. |
| [scripts/uat-seed.sh](../../../scripts/uat-seed.sh) | 258-322 (`ensure_operator_invite` body) | The function body currently takes 5 args and builds a jq payload without `display_name`. Must be extended to accept a 6th `display_name` arg and include `display_name: $dn` in the jq payload (and in the `exists` log). | UI loses persona distinction after the email fix; spec assertion at L282 breaks. |
| [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats) | existing AC-1 test (lines 25-37) + AC-1 summary test (lines 39-50) | The existing assertion `count=3` for `operator_invite .*(mock)` lines must be updated to `4`. The summary-name test must also include `uat-onboard-no-user-token`. | **Test failure on first run** — the existing bats suite would fail because it expects exactly 3 mock lines. (Required change, not optional.) |

**No changes required** (verified):

- `scripts/uat-env-setup.sh:468` — `UAT_OPERATOR_EMAIL=uat-operator@aiqadam.test` — already correct (bare email, no suffix). Single source of truth.
- `apps/api/.env.example:82` — `UAT_OPERATOR_EMAIL=uat-operator@aiqadam.test` — already correct.
- `apps/api/src/modules/admin-invites/admin-invites.service.ts:358` — api code is **correct production behaviour** per the issue's "Out of scope" section. Do not touch.
- `apps/e2e/playwright.uat.config.ts:18` — config reads env vars from `.env.uat`, no hardcoded email references; will pick up changes automatically once `uat-env-setup.sh` is updated.

---

## Items Flagged for CodeDeveloper / TestDesigner Verification

| Item | File:Line | Concern |
|---|---|---|
| `(valid)` persona label | [BP-UAT-013-signup.spec.ts:282](../../../apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts#L282) `getByText(/UAT Operator \(valid\)/i)` | **VERIFIED by Orchestrator post-subagent (read `apps/web/src/components/OnboardingForm.tsx:192`):** the UI renders `Welcome, {preview.display_name ?? preview.email.split('@')[0]}.`. Since `ensure_operator_invite` never sets `display_name`, the rendered text is currently `Welcome, uat-operator+valid.` — i.e. the email local-part. After the fix (email = `uat-operator@aiqadam.test`) the rendered text becomes `Welcome, uat-operator.` and the `(valid)` assertion **BREAKS**. **Fix scope expanded:** the seed must now set `display_name` per row (`UAT Operator (valid)`, `UAT Operator (used)`, `UAT Operator (expired)`, `UAT Operator (no-user)`), and `ensure_operator_invite` must accept a new `display_name` arg. The spec line 282 assertion stays as-is (still matches `UAT Operator (valid)`). |

---

## Indirect References (historical / read-only — do NOT edit)

| File | Lines | Note |
|---|---|---|
| `.copilot/issues/registry.md` | 16 | Lists ISS-UAT-013-8 with the `+valid` string in its summary. Registry captures history. Will flip to "resolved" in Step 9. |
| `.copilot/issues/ISS-UAT-013-4.md` | 53-55 | Sibling issue tables show `+valid/+used/+expired`. Historical — preserve. |
| `.copilot/tasks/completed/wf-20260628-uat-030/02-preflight.md` | 63-82 | Records the three-row insert. Historical log. |
| `.copilot/tasks/completed/wf-20260628-uat-030/04-uat-triage.md` | 11, 19 | Triage report. Historical. |
| `apps/e2e/test-results/BP-UAT-013-signup-…/error-context.md` | 55 | Playwright-generated artifact. Will be overwritten. |
| `.copilot/tasks/completed/wf-20260629-fix-038/*` | — | Prior workflow's artifacts. Preserve. |

**Verdict:** No additional code/spec files reference the `+valid` convention outside what is in the Required Changes table.

**Token sanity check:** All three current tokens (`uat-onboard-token`, `uat-onboard-used-token`, `uat-onboard-expired-token`) share `token_prefix = uat-onbo` (first 8 chars). The idempotency guard in `ensure_operator_invite` uses `token_hash` (full SHA-256), not `token_prefix` — confirmed safe in [wf-20260629-fix-036/03-code-summary.md](../../completed/wf-20260629-fix-036/03-code-summary.md). The new fourth row's token_hash is unique, so idempotency holds.

---

## Test Impact

| Layer | Change required |
|---|---|
| **Unit / Integration (api)** | None. api code is correct production behaviour. |
| **BATS (existing)** | `scripts/tests/uat-seed.bats`: update mock-count assertion `3` → `4`; add `uat-onboard-no-user-token` to the summary-name assertion. |
| **BATS (new)** | None required — the existing AC-1/AC-2 tests cover all four rows once tightened. A new file is unnecessary. |
| **E2E (Playwright BP-UAT-013)** | (a) Rewrite honesty-notes comment at L57-63. (b) Add new Neg 005 exercising `uat-onboard-no-user-token`. (c) Verify (valid) persona label at L282 — see flag above. |

---

## Risks

- **Stale-row risk in Directus after re-seed.** The seed script is idempotent on `token_hash` but `email` is not part of the idempotency check. If the UAT environment was previously seeded with the `+valid/+used/+expired` rows, re-running `pnpm uat:seed` after this fix will leave those three rows in place AND create the new `+no-user` row — but Step 006 will still hit the `+valid` row first (the api's `lookupByToken` returns the first match). **Mitigation:** the PR description must instruct the UAT environment operator to run a manual cleanup (`DELETE FROM operator_invites` or a `FORCE_REGEN_OPERATOR_INVITES=1` flag) before re-seeding. This is a UAT-runner concern, not a code concern.
- **Live UAT re-run deferred.** Per the issue's "Out of scope" section, AC-2 ("Step 006 of BP-UAT-013 succeeds") cannot be verified in this workflow. Verification happens in a follow-up UATRunner workflow. Flag this in the PR.
- **Doc hygiene.** Searched all `.md` files for `uat-operator+`. The only hit outside this workflow's own artifacts is `docs/02-business-processes/uat/BP-UAT-013.md` (already in the Required Changes table). No user-facing marketing/site docs reference the suffix.

---

## Honesty / Scope Disclosures

- **Did anything contradict the issue's root cause?** No. The code at `admin-invites.service.ts:358` does exactly what the issue says: it throws `ConflictException('invite_missing_authentik_user')` when `row.authentik_user_id == null` after `lookupByToken`.
- **Scope-creep?** Possibly one item: the `(valid)` persona label at L282. CodeDeveloper / TestDesigner must verify before changing.
- **Unsure?** Only the `(valid)` label source. The rest is verified by direct file reading.

---

## Links

- [01-issue-lookup.md](01-issue-lookup.md)
- [handoff.yaml](handoff.yaml)
- [ISS-UAT-013-8.md](../../../issues/ISS-UAT-013-8.md)
- [scripts/uat-seed.sh](../../../scripts/uat-seed.sh)
- [scripts/uat-env-setup.sh](../../../scripts/uat-env-setup.sh)
- [apps/api/.env.example](../../../apps/api/.env.example)
- [apps/api/src/modules/admin-invites/admin-invites.service.ts](../../../apps/api/src/modules/admin-invites/admin-invites.service.ts)
- [apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts](../../../apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts)
- [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats)
- [docs/02-business-processes/uat/BP-UAT-013.md](../../../docs/02-business-processes/uat/BP-UAT-013.md)
- [wf-20260629-fix-036/03-code-summary.md](../../completed/wf-20260629-fix-036/03-code-summary.md)