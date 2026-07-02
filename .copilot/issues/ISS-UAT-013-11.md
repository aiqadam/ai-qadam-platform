# ISS-UAT-013-11 — BP-UAT-013 Steps 004/005/006 lack a live post-fix re-run

| Field | Value |
|---|---|
| ID | ISS-UAT-013-11 |
| Severity | minor |
| Module | uat/verification |
| Status | resolved |
| Reported | 2026-07-02 |
| Resolved | 2026-07-02 |
| Reporter | BusinessAnalyst (UAT coverage audit) |
| Workflow | wf-20260702-uat-059 |
| Related | ISS-UAT-013-9, ISS-UAT-013-10 |

## Symptom

Two prior issues fixed BP-UAT-013 defects in code and unit tests, but both explicitly
deferred the live Playwright re-run that would confirm the fix against the actual step:

- **ISS-UAT-013-9** (re-submit of verified email sending a duplicate verification email):
  code fix + unit regression test landed (PR #75), but the AC-3 live check — "Step 004 in
  BP-UAT-013 passes on re-run" — is still unchecked in that issue's acceptance criteria.
- **ISS-UAT-013-10** (Step 005 `role_groups` seed/spec misalignment): seed fix landed
  (PR #76, merged as `7b04c4c`), but "Step 005 in BP-UAT-013 passes on re-run" and "Step 006
  (onboarding accept) remains passing" are both still unchecked.

Both issues are marked `resolved` on the strength of the code fix and unit tests alone, per
the honesty-disclosure convention — but no workflow currently owns the follow-up live run
that would flip those specific ACs to verified.

## Impact

BP-UAT-013 is the only BP-UAT script that has ever been executed, and its registry row
(`Run Status: partial`) has not been updated since the 2026-06-30 run. Without a fresh
end-to-end pass, the platform's one demonstrated UAT success is running on unverified
assumptions for 3 of its 12 steps.

## Proposed resolution

Run a `uat-verification` workflow scoped to BP-UAT-013 only, against a freshly seeded
local stack (post `ISS-UAT-SEED-001` fix), and confirm:

- [x] Step 004 (re-submit idempotency) passes — Mailpit receives exactly 1 message
- [x] Step 005 (operator invite shows `aiqadam-staff` role) passes
- [x] Step 006 (onboarding accept) passes
- [x] Registry row for BP-UAT-013 updated with new `Last Run` date and `Run Status`
- [x] ISS-UAT-013-9 AC-3 and ISS-UAT-013-10's two remaining ACs flipped to checked, citing this workflow's run

## Acceptance criteria

- [x] BP-UAT-013 re-run reports 12/12 (or documents any new failure as a fresh issue)
  — **11/12 pass**; the 1 failure (Neg 004) is a test-spec React-18 state-commit race
  (registered as ISS-UAT-013-12); product behaviour empirically verified by direct API
  probe (`POST /v1/leads` returns 400 with `fieldErrors.email: ["Plus-addressed emails …"]`).
- [x] `docs/02-business-processes/uat/registry.md` and `BP-UAT-013.md` frontmatter both reflect the new run

## Resolution

- **Workflow:** wf-20260702-uat-059 (uat-verification, BP-UAT-013 scope)
- **PR:** https://github.com/tvolodi/aiqadam/pull/85 (squash 1f075c6 on main, 2026-07-02)
- **Live re-run result:** 11/12 Playwright tests pass. The 1 failure is a test-spec race
  in `Neg 004` (setReactInputValue + form.requestSubmit doesn't wait for React 18 state
  commit) — registered as ISS-UAT-013-12 for spec rewrite. Product code is correct.
- **Side issues surfaced:** ISS-UAT-013-12 (test-spec race in Neg 004) and
  ISS-UAT-013-13 (cosmetic "being added as ." copy when role_groups is empty).
- **Related flips:** ISS-UAT-013-9 AC-3 verified (Step 004 passed; Mailpit count = 1
  after re-submit). ISS-UAT-013-10 ACs verified (Step 005 shows "aiqadam-staff" role;
  Step 006 onboarding completes end-to-end).
- **Registry updates:** `docs/02-business-processes/uat/registry.md` BP-UAT-013 row
  `last_run: 2026-06-30` → `2026-07-02`; Run Status `partial` retained (Neg 004 still
  fails in the test runner, not in product). `docs/02-business-processes/uat/BP-UAT-013.md`
  frontmatter `last_run: "2026-07-02"`. Open Issues appended with ISS-UAT-013-12 + -13.
- **Honesty disclosures:** None outstanding. All 5 ACs verified; both related
  issues (ISS-UAT-013-9, ISS-UAT-013-10) fully verified. The Neg 004 test-spec
  defect is tracked as a separate open issue (ISS-UAT-013-12) — it does not block
  this issue's resolution because the product code is correct and a direct API
  probe was the gold-standard verification of the underlying contract.
