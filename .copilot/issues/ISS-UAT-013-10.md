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
- [ ] Step 005 in BP-UAT-013 passes on re-run (deferred to follow-up live UATRunner run — see Resolution)
- [ ] Step 006 (onboarding accept) remains passing (deferred to follow-up live UATRunner run — see Resolution)

## Resolution

- **Workflow:** wf-20260702-fix-049
- **PR:** [https://github.com/tvolodi/aiqadam/pull/76](https://github.com/tvolodi/aiqadam/pull/76)
- **Root cause:** `ensure_operator_invite()` hardcoded `role_groups:[]` for all four fixture rows. The valid-invite row needed `["aiqadam-staff"]` so the BP-UAT-013 Step 005 spec assertion `getByText(/aiqadam-staff/i)` could find the role label rendered by `apps/web/src/components/OnboardingForm.tsx` (`preview.role_groups.join(', ')`).
- **Fix:** Added an optional 7th positional parameter `role_groups` (JSON array string, default `'[]'`) to `ensure_operator_invite()`. Updated the jq body to use `--argjson rg "$role_groups"` and `role_groups:$rg`. The valid-invite call now passes `'["aiqadam-staff"]'`; the other three rows pass `'[]'`. Mock-mode output line extended to print `role_groups=<json>` so the regression test is hermetic.
- **Regression test:** New AC-5 in `scripts/tests/uat-seed.bats` asserts exactly one mock-mode line carries `role_groups=["aiqadam-staff"]` (valid-invite) and exactly three carry `role_groups=[]` (used, expired, no-user). 9 / 9 bats tests pass. arch-check (full repo, 249 files) clean.
- **Merged:** `<pending>` (filled in by Step 12.5 back-fill)
- **Honesty disclosures:**
  - The fix code is not novel under this workflow id. It was first authored on 2026-06-30 by the abandoned `wf-20260630-fix-044` workflow, which opened PR #76 but never reached Step 12.5. This workflow re-applies the same code change via `git reset --hard origin/main` + rebase so the audit trail under the new counter is coherent while the actual fix is preserved.
  - Live BP-UAT-013 Steps 005 / 006 re-run (the gold-standard end-to-end verification of this fix) is **deferred**. It requires the full local stack (apps/api + apps/web + mailpit + Directus + Authentik + Postgres) and a UATRunner run. The follow-up workflow is `wf-20260702-uat-XXX` (id to be assigned by the next UATRunner workflow that runs BP-UAT-013 end-to-end after this PR merges). AC-2 and AC-3 of this issue flip to `verified` only after that follow-up workflow's Playwright run reports `Step 005 PASS` and `Step 006 PASS`. Until then, the issue is `resolved` (the seed is fixed) but those two specific verification steps remain `deferred-with-followup-workflow-ID-and-queue-position` per AGENTS.md §6.1.
  - Git remote is HTTPS (`https://github.com/tvolodi/aiqadam.git`). This is a regression vs ISS-WF-GIT-AUTH-1 (which documented an SSH-key migration). Pushing this PR may prompt for credentials. If a prompt appears, refer to `.claude/CLAUDE.md` §Git credentials.
