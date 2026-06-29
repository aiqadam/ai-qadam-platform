## What

Three happy-path `operator_invites` rows now carry the bare
`uat-operator@aiqadam.test` (matching the single seeded Authentik user)
instead of the `+valid/+used/+expired` plus-addressing suffix. The api's
`/v1/onboard/accept` handler was rejecting accept with
`invite_missing_authentik_user` because the row email did not match the
seeded Authentik user email. Added a **fourth** row
(`uat-onboard-no-user-token`) with a plus-addressed email so the api
`invite_missing_authentik_user` error path remains exercised in UAT.

## Why

Step 006 of `BP-UAT-013` (Complete operator onboarding) failed during
attempt-2 on 2026-06-28 with the API's structured error code
`invite_missing_authentik_user`. Without this fix, the UAT cannot
validate Step 006 (and therefore cannot certify the BP-UAT-013 customer
signup business process).

## How

- `scripts/uat-seed.sh`: `ensure_operator_invite` extended to take a 6th
  `display_name` argument; four call sites pass
  `UAT Operator (valid|used|expired|no-user)`. The `display_name`
  plumbing preserves the existing OnboardingForm persona-label
  assertion at `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts:282` which
  would otherwise have broken when the email changed from `+valid` to
  bare.
- `scripts/uat-env-setup.sh`: `.env.uat` heredoc gains
  `UAT_ONBOARD_NO_USER_TOKEN=uat-onboard-no-user-token` so the new Neg
  005 spec can resolve the no-user token.
- `scripts/tests/uat-seed.bats`: AC-1 mock-count `3`→`4`; summary
  assertion now includes `uat-onboard-no-user-token`; **NEW** AC-1
  email-distribution `@test` added (asserts 3 bare + 1 plus-addressed
  in mock-mode output, not just row counts).
- `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`: new **Neg 005** test
  (`ONBOARD_NO_USER_TOKEN`) — asserts BOTH the API contract (`POST
  /v1/onboard/accept` returns 409 + structured error) AND the UI state
  (inline error code rendered, no `GonePanel`, no mailbox-ready).
  Honesty-notes header rewritten to declare the spec only blocks on
  the API contract assertion, not the UI coincidence (per the
  wf-20260629-fix-038 rule).
- `docs/02-business-processes/uat/BP-UAT-013.md`: Seed Fixtures table
  rewritten with Email + display_name columns; Step 005/006 prose
  updated; new Negative 005 subsection added.
- `apps/api` production code **UNCHANGED**. The api's
  `invite_missing_authentik_user` throw at
  `apps/api/src/modules/admin-invites/admin-invites.service.ts:358` is
  correct production behaviour and was confirmed by SecurityReviewer
  (read-only).

## Risks

- **Stale-row risk in already-seeded Directus:** pre-existing
  `+valid/+used/+expired` rows will still throw
  `invite_missing_authentik_user`. **Mitigation:** before re-running
  `pnpm uat:seed`, execute
  `DELETE FROM operator_invites WHERE token_prefix LIKE 'uat-onboard%'`.
  Idempotency is keyed on `token_hash` (full SHA-256), not
  `token_prefix`, so fresh rows with the same `token_prefix` would
  not collide but would coexist. (M-1 from security review.)
- **AC-2 (live BP-UAT-013 Step 006 end-to-end re-run) deferred** to
  follow-up UATRunner workflow
  `wf-20260630-uat-031-rerun-bp-uat-013`. This PR verifies the
  seed-layer correctness and the bats regression; it does NOT re-run
  the live BP-UAT-013 spec end-to-end because that requires a live
  Docker stack.

## Testing

- `bash scripts/run-bats.sh scripts/tests/uat-seed.bats` →
  **8/8 pass** with the fix, **3/8 fail** with the seed reverted
  (proves the three new AC-1 assertions are non-vacuous).
- `bash scripts/run-bats.sh scripts/tests/bp-uat-template-rule.bats` →
  **5/5 green** (sibling regression from wf-20260629-fix-038 unchanged).
- `pnpm arch:check` → **249 files scanned, pass**.
- Security review: **0 MAJOR / 0 MINOR / 0 BLOCKER**; all applicable
  `AGENTS.md §5` invariants pass; documented at
  `.copilot/tasks/active/wf-20260629-fix-039/04-security-review.md`.

## Files changed

8 files modified, 0 created. Net +328 / -58 = **+270** (within
small-PR 400 cap), 5 code files (at 5-file cap):

```
 .copilot/issues/ISS-UAT-013-8.md             | 110 ++++++++++++++++++++++++++-
 .copilot/issues/registry.md                  |   2 +-
 .copilot/meta/next-workflow-id               |   2 +-
 apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts | 100 ++++++++++++++++++++++--
 docs/02-business-processes/uat/BP-UAT-013.md |  38 +++++++--
 scripts/tests/uat-seed.bats                  |  33 ++++++--
 scripts/uat-env-setup.sh                     |   3 +-
 scripts/uat-seed.sh                          |  98 +++++++++++++++--------
 8 files changed, 328 insertions(+), 58 deletions(-)
```

## Checklist

- [x] Tests added / updated (3 new bats assertions, 1 new E2E Neg 005,
      regression-proof via stash-and-revert)
- [x] Docs updated if behaviour changed (`BP-UAT-013.md` prose + table,
      `registry.md` row 16, `ISS-UAT-013-8.md` Resolution section)
- [x] No new dependencies
- [x] Manually tested locally (8/8 bats + 5/5 sibling + 249 arch:check)