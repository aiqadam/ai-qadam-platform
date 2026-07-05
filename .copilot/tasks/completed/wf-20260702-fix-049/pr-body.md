## What

Add `aiqadam-staff` to the valid `operator_invites` row in
`scripts/uat-seed.sh` so Step 005 of BP-UAT-013 can assert the role
group is visible on the onboarding page.

## Why

Step 005 of BP-UAT-013 fails because the spec asserts
`expect(getByText(/aiqadam-staff/i)).toBeVisible()` but the seed
created the valid invite row with `role_groups:[]` (empty). This is
**spec/seed misalignment — NOT a product bug** (the UI correctly
renders what is in the invite). See
`.copilot/issues/ISS-UAT-013-10.md` for the full classification.

## How

- Added optional 7th positional parameter `role_groups` (JSON array
  string, default `'[]'`) to `ensure_operator_invite()` in
  `scripts/uat-seed.sh`.
- Updated the jq body to use `--argjson rg "$role_groups"` and
  `role_groups:$rg` (so the value round-trips through jq as JSON, not
  a string).
- Valid-invite call now passes `'["aiqadam-staff"]'`; the other three
  rows pass `'[]'` (used/expired/no-user — the spec asserts GonePanel
  or 409, not the role label).
- Mock-mode output line extended to print `role_groups=<json>` so the
  regression test is hermetic.

## Risks

**Operational caveat — not a code risk:** The Directus idempotency
guard (`filter[token_hash][_eq]=...` GET before POST) short-circuits
on existing rows. Operators who previously seeded with empty
`role_groups` must delete the old row first
(`DELETE /items/operator_invites?filter[token_prefix][_eq]=uat-onbo`)
before re-running `pnpm uat:seed`. Documented in the issue's Resolution
section.

## Testing

- `bash scripts/run-bats.sh scripts/tests/uat-seed.bats` — **9 / 9
  pass**, including the new AC-5 regression test.
- AC-5 was written to **fail before this PR** (the valid-invite row
  carried `role_groups=[]`, so the `valid` count would have been 0)
  and **passes after** (verified manually by inspecting the mock-mode
  output: 1 line with `role_groups=["aiqadam-staff"]`, 3 lines with
  `role_groups=[]`).
- `pnpm arch:check` — passed (full repo, 249 files).

## Live UAT re-run (deferred)

AC-2 (Step 005 live Playwright PASS) and AC-3 (Step 006 live
Playwright PASS) require the full local stack and a UATRunner run.
Those verifications are deferred to the next UATRunner workflow
(`wf-20260702-uat-XXX`, id assigned when that workflow starts after
this PR merges). The issue's Resolution section names the follow-up
and queue position explicitly per AGENTS.md §6.1.

## CI status (PR #76)

3 pre-existing repo-wide checks are failing on PR #76 (`ci`,
`pnpm audit`, `storybook`). These are not caused by this change —
they fail on every recent PR (#78, #79, etc.) and are independent of
the seed-script edit. Merge acceptable with documented CI caveat.

## Honesty disclosures

- The fix code is not novel under the current workflow id. It was
  first authored on 2026-06-30 by the abandoned `wf-20260630-fix-044`
  workflow, which opened PR #76 but never reached Step 12.5. This
  workflow (`wf-20260702-fix-049`) re-applies the same code change
  via `git reset --hard origin/main` + rebase so the audit trail
  under the new counter is coherent while the actual fix is
  preserved.
- Live UAT re-run deferred — see above.
- Git remote is HTTPS (`https://github.com/tvolodi/aiqadam.git`).
  This is a regression vs ISS-WF-GIT-AUTH-1 (which documented an
  SSH-key migration). Pushing may prompt for credentials. See
  `.claude/CLAUDE.md` §Git credentials.

## Checklist

- [x] Tests added / updated (new AC-5 bats regression)
- [x] Docs updated if behavior changed (Step 005 spec is correct;
      no doc change needed)
- [x] No new dependencies
- [x] Manually tested locally (bats + arch-check)