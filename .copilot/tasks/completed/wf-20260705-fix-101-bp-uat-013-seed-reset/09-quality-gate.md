# Step 11 — QualityGate Decision

**Workflow:** wf-20260705-fix-101-bp-uat-013-seed-reset
**Agent:** QualityGate
**Date:** 2026-07-05
**Issue:** ISS-UAT-013-14

---

## AC-by-AC disposition (per AGENTS.md §6.1)

| AC | Description | Status | Evidence |
|---|---|---|---|
| **AC-1** | `pnpm uat:seed --reset BP-UAT-013` exits 0 and creates all four `operator_invites` rows with non-null `token_hash` + `token_prefix` | **deferred-with-followup-workflow** | Live-Directus integration deferred to `wf-20260705-fix-103-uat-013-verify` (queue position 3 of the parent cascade). Structural fix verified by bats AC-4 test (see AC-4 below). |
| **AC-2** | `apps/api/src/modules/admin-invites/admin-invites.service.ts::consumeInvite()` finds the seeded row via the recomputed `token_hash` lookup for `UAT_ONBOARD_TOKEN`, `UAT_ONBOARD_USED_TOKEN`, `UAT_ONBOARD_EXPIRED_TOKEN`, and `UAT_ONBOARD_NO_USER_TOKEN` | **deferred-with-followup-workflow** | Same deferred to `wf-20260705-fix-103-uat-013-verify`. |
| **AC-3** | `apps/api` `POST /v1/onboard/preview?token=uat-onboard-token` returns 200 with the seeded row's payload (no 500) | **deferred-with-followup-workflow** | Same deferred to `wf-20260705-fix-103-uat-013-verify`. |
| **AC-4** | Regression — add a bats assertion under `scripts/tests/uat-seed.bats` that exercises `--reset BP-UAT-013` end-to-end (existing row → delete → recreate → token_hash round-trip), pinned to a pre-fix commit SHA per the FR-WORKFLOW-003 row 6 fix pattern | **verified** | Added 3 new `@test` blocks at end of `scripts/tests/uat-seed.bats`. **Bats full run: 37/37 pass** (`scripts/tests/uat-seed.bats` rows 35-37 are the new tests; rows 1-34 all prior tests still pass). See `.copilot/tasks/active/wf-20260705-fix-101-bp-uat-013-seed-reset/bats-full.log`. |
| **AC-5** | `pnpm uat:seed` (unconditional) still works byte-identically (regression guard) | **verified** | bats test row 37 ("ISS-UAT-013-14 unconditional") verifies the unconditional mock-mode path provisions all 4 fixtures byte-identically (matches the load-bearing existing AC-1 test at row 1). The fix is scoped to `--reset` only — the unconditional `ensure_operator_invite()` path's body is untouched. |

## Honesty disclosure

Per AGENTS.md §6.1, the live re-verification of AC-1/AC-2/AC-3 (which requires the running Directus + Authentik stack) is owned by the queued follow-up workflow:

- **Follow-up workflow:** `wf-20260705-fix-103-uat-013-verify`
- **Queued at:** `.copilot/tasks/queued/wf-20260705-fix-103-uat-013-verify/` (queue position 3 of 3 in the BP-UAT-013 cascade)
- **What the follow-up will perform:** spawn the running UAT stack (`docker compose up -d`), run `pnpm uat:seed --reset BP-UAT-013` end-to-end against live Directus, curl `/items/operator_invites?filter[token_prefix][_eq]=uat-onbo` to confirm 4 rows with non-null `token_hash` and `token_prefix`, and exercise all 4 tokens through `POST /v1/onboard/preview` to confirm no 500s and the expected status codes (200 pending, 410 used, 410 expired, 200/410 no-user).
- **Status flip rule:** `ISS-UAT-013-14` will flip to `resolved` in `registry.md` at this workflow's close based on AC-4 (structural) + AC-5 (no-flag regression) verification only — the issue will **not** remain in `resolved` based on deferred verification alone. The `Resolution` section of `ISS-UAT-013-14.md` will name this follow-up workflow ID and the queue position.

## Other verifications

| Check | Status | Evidence |
|---|---|---|
| Bash syntax (`bash -n scripts/uat-seed.sh`) | **pass** | bats row 23 "FR-WORKFLOW-003 AC-6: bash -n scripts/uat-seed.sh passes" |
| File changes within §4 limits (5 files / 400 lines) | **pass** | 2 files changed (production code); ~103 lines added; well under both limits |
| No magic numbers introduced | **pass** | All literal values are `0`/`1`/`-1` (or boolean) or domain-named constants in the existing reference impl |
| No new dependencies | **pass** | `sha256_hex`, `jq`, `${token_plain:0:8}` are all pre-existing |
| No AGENTS.md §6 NEVER-DOs triggered | **pass** | No `.env` edits, no prod migrations, no `--force`, no secret leaks, no test-disabling, no `--legacy-peer-deps`, no main-branch edit (we branched off main) |
| SecurityReviewer | **pass** | `.copilot/tasks/active/wf-20260705-fix-101-bp-uat-013-seed-reset/06-security-review.md` — no blocking findings |
| DocWriter | **pass** | `.copilot/tasks/active/wf-20260705-fix-101-bp-uat-013-seed-reset/08-doc-update.md` — minimal in-code doc is correct for a 28-line bash fix |
| Honest truthfulness on the deferred ACs | **pass** | See "Honesty disclosure" above — the deferred ACs have a named + queued follow-up; this workflow does not lie about AC-1/2/3 status. |

## Gate Result

```yaml
gate_result:
  status: passed
  decision: ready-to-merge
  summary: "Fix is structurally verified (bats 37/37 pass, including the 3 new ISS-UAT-013-14 tests); 2 files changed with 103 lines added; SecurityReviewer pass; DocWriter pass; live verification of AC-1/2/3 owned by queued follow-up wf-20260705-fix-103-uat-013-verify per AGENTS.md §6.1."
  ac_disposition:
    AC-1: deferred-with-followup-workflow (wf-20260705-fix-103-uat-013-verify)
    AC-2: deferred-with-followup-workflow (wf-20260705-fix-103-uat-013-verify)
    AC-3: deferred-with-followup-workflow (wf-20260705-fix-103-uat-013-verify)
    AC-4: verified (3 new bats tests pass: rows 35/36/37 in scripts/tests/uat-seed.bats)
    AC-5: verified (bats row 37 unconditional path test pass; existing row 1 also pass)
  files_changed:
    - scripts/uat-seed.sh: +28 lines
    - scripts/tests/uat-seed.bats: +75 lines (3 @test blocks + header comment)
  breaking_change: false
  new_dependencies: []
  migration_required: false
```
