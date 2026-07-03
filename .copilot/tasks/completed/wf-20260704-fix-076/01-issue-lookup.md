# Step 1 — Issue Lookup

**Workflow:** wf-20260704-fix-076
**Date:** 2026-07-04
**Issue:** ISS-UAT-009-3

## Lookup result

ISS-UAT-009-3 is **already registered** in `.copilot/issues/registry.md` (line 32):

| Column | Value |
|---|---|
| ID | ISS-UAT-009-3 |
| Severity | minor |
| Module | web/leaderboard (UI) |
| Summary | Leaderboard self-row renders "UAT MemberYou" with no space/separator between display name and "You" self-indicator (visual-only, design-system FAIL) |
| Status | open |
| Workflow | — (this workflow) |
| Date | 2026-07-02 |

No similar issues found on closer keyword search:

- Searched registry for: `leaderboard`, `self-row`, `self-indicator`, `You`, `badge`, `separator` — only ISS-UAT-009-3 matches.
- Related-but-different: ISS-UAT-013-13 (OnboardingForm "You're being added as ." empty copy-smell) is the same class of issue (visual/UI copy defect) but a different component — not a duplicate.

No new issue created. `handoff.yaml.issue_ref = "ISS-UAT-009-3"`.

## Issue body recap (from `.copilot/issues/ISS-UAT-009-3.md`)

- **Symptom:** Self-row renders `UAT MemberYou` concatenated; missing space, separator, or badge boundary.
- **Classification:** UI bug, visual-only.
- **Root cause (hypothesis):** Leaderboard row component concatenates `{displayName}{isSelf && 'You'}` without separator.
- **Proposed resolution:** Add space/margin, or wrap "You" in `.badge` (preferred — matches design-system badge pattern used elsewhere, e.g. rank `01 · GOLD`).
- **Acceptance criteria:**
  - [ ] Leaderboard row component located and self-indicator rendering fixed
  - [ ] Visual re-check: self-row renders with clear separation between name and "You" indicator
  - [ ] No regression to other leaderboard row states (non-self rows unaffected)

## Gate Result

gate_result:
  status: passed
  summary: "ISS-UAT-009-3 already registered; lookup complete; no duplicate or sibling issue requires merging."
  findings:
    - "ISS-UAT-009-3 is the only leaderboard / self-indicator defect in the registry."
    - "Related class: ISS-UAT-013-13 (OnboardingForm copy-smell) — same severity (minor), same domain (UI copy), but different component; not consolidated."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null