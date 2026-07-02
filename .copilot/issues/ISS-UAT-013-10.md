# ISS-UAT-013-10 — Step 005 spec asserts role_groups text but seed has empty role_groups

| Field | Value |
|---|---|
| ID | ISS-UAT-013-10 |
| Severity | minor |
| Module | uat/test-design |
| Status | resolved |
| Reported | 2026-06-30 |
| Resolved | 2026-07-02 |
| Reporter | BusinessAnalyst (wf-20260630-uat-042 / BP-UAT-013-04-triage.md) |
| Workflow | wf-20260702-fix-049 (resolved) |
| AC ref | AC-5 (BP-UAT-013) |

## Symptom

Step 005 of BP-UAT-013 failed with:

```
expect(getByText(/aiqadam-staff/i)).toBeVisible() — timed out
```

## Classification

**Spec/seed misalignment — NOT a product bug.** The UI correctly renders what is in
the invite. The seed creates `operator_invites` with `role_groups: []` (empty), but
the spec expects `aiqadam-staff` to appear.

## Two valid fix paths

### Option A — Update seed (preferred)

Add `aiqadam-staff` to `role_groups` for the valid invite row in `uat-seed.sh`.

### Option B — Update spec assertion

Replace the specific role text check with a check matching the empty-groups state,
or remove if displaying role groups is out of scope for Step 005.

## Acceptance criteria

- [x] Seed updated to include `aiqadam-staff` in valid invite's role_groups OR spec updated to match empty state (wf-20260702-fix-049, scripts/uat-seed.sh)
- [x] Step 005 in BP-UAT-013 passes on re-run (verified 2026-07-02 in wf-20260702-uat-059, PR #85)
- [x] Step 006 (onboarding accept) remains passing (verified 2026-07-02 in wf-20260702-uat-059, PR #85)

## Resolution

- **Workflow:** wf-20260702-fix-049
- **PR:** [https://github.com/tvolodi/aiqadam/pull/76](https://github.com/tvolodi/aiqadam/pull/76)
- **Root cause:** `ensure_operator_invite()` hardcoded `role_groups:[]` for all four fixture rows. The valid-invite row needed `["aiqadam-staff"]` so the BP-UAT-013 Step 005 spec assertion `getByText(/aiqadam-staff/i)` could find the role label rendered by `apps/web/src/components/OnboardingForm.tsx` (`preview.role_groups.join(', ')`).
- **Fix:** Added an optional 7th positional parameter `role_groups` (JSON array string, default `'[]'`) to `ensure_operator_invite()`. Updated the jq body to use `--argjson rg "$role_groups"` and `role_groups:$rg`. The valid-invite call now passes `'["aiqadam-staff"]'`; the other three rows pass `'[]'`. Mock-mode output line extended to print `role_groups=<json>` so the regression test is hermetic.
- **Regression test:** New AC-5 in `scripts/tests/uat-seed.bats` asserts exactly one mock-mode line carries `role_groups=["aiqadam-staff"]` (valid-invite) and exactly three carry `role_groups=[]` (used, expired, no-user). 9 / 9 bats tests pass. arch-check (full repo, 249 files) clean.
- **Merged:** `7b04c4c` (squash-merge of #76 into main on 2026-07-02)
- **Live re-run verification (2026-07-02):** BP-UAT-013 Steps 005 and 006 passed end-to-end against the live local stack in wf-20260702-uat-059 (PR #85 squash 1f075c6 on main). Step 005 verified `OnboardingForm` renders "you are being added as a member of: aiqadam-staff" (the seeded `role_groups=["aiqadam-staff"]` propagates correctly). Step 006 verified full onboarding completion (password set, accept clicked, mailbox-ready heading visible, 302 redirect to `/me`). All 3 acceptance criteria now verified.
- **Honesty disclosures:**
  - The fix code is not novel under this workflow id. It was first authored on 2026-06-30 by the abandoned `wf-20260630-fix-044` workflow, which opened PR #76 but never reached Step 12.5. This workflow re-applied the same code change via `git reset --hard origin/main` + rebase so the audit trail under the new counter is coherent while the actual fix is preserved.
  - All originally-deferred acceptance criteria (Step 005 / Step 006 re-run) have now been verified by the live UATRunner run in wf-20260702-uat-059 (2026-07-02). No outstanding deferrals remain for this issue.
  - Git remote is HTTPS (`https://github.com/tvolodi/aiqadam.git`). This is a regression vs ISS-WF-GIT-AUTH-1 (which documented an SSH-key migration). Pushing this PR may prompt for credentials. If a prompt appears, refer to `.claude/CLAUDE.md` §Git credentials.
