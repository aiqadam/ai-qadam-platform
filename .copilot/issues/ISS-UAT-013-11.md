# ISS-UAT-013-11 — BP-UAT-013 Steps 004/005/006 lack a live post-fix re-run

| Field | Value |
|---|---|
| ID | ISS-UAT-013-11 |
| Severity | minor |
| Module | uat/verification |
| Status | open |
| Reported | 2026-07-02 |
| Reporter | BusinessAnalyst (UAT coverage audit) |
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

- [ ] Step 004 (re-submit idempotency) passes — Mailpit receives exactly 1 message
- [ ] Step 005 (operator invite shows `aiqadam-staff` role) passes
- [ ] Step 006 (onboarding accept) passes
- [ ] Registry row for BP-UAT-013 updated with new `Last Run` date and `Run Status`
- [ ] ISS-UAT-013-9 AC-3 and ISS-UAT-013-10's two remaining ACs flipped to checked, citing this workflow's run

## Acceptance criteria

- [ ] BP-UAT-013 re-run reports 12/12 (or documents any new failure as a fresh issue)
- [ ] `docs/02-business-processes/uat/registry.md` and `BP-UAT-013.md` frontmatter both reflect the new run
